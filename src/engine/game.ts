/**
 * 游戏主循环：把时钟、事件时间线、存档串起来。
 *
 * 核心是「惰性结算」（`docs/spec/DECISIONS.md` §3.6）：不逐秒模拟，
 * 每次打开页面或做操作时，把时钟推到现在、把到期事件一次性结算掉。
 * 离线一个月和离线一秒走的是同一条代码路径。
 */

import { advance, setRate, DAY, HOUR, WEEK, weekOfServer, type Clock, MAX_RATE } from './clock.ts'
import { cancel, schedule, sorted, emptyTimeline, type GameEvent } from './timeline.ts'
import { resolveCultivate, capacityOf, gainQi } from './cultivate.ts'
import { resolveMove } from './move.ts'
import { resolveBattleEvent } from './battle.ts'
import { artifactUpkeepPerHour, resolveCraft } from './craft.ts'
import { allNpcsAt, generateNpcs } from './npc.ts'
import { applyQuestProgress, emptyQuestLog, expireDailyQuests, resolveQuestBattle } from './quest.ts'
import { resolveEscort, settleTownIncome } from './town.ts'
import { emptyMarket, refillNpcOrders, resolveMarketEvent, nextNpcPurchaseAt, settleNpcPurchases, ctxOf, applyCtx } from './market.ts'
import { scheduleRaid, resolveRaidEvent } from './raid.ts'
import { seedRng } from './rng.ts'
import { save, load, importSave, SaveError, SAVE_VERSION, type Storage, type Migration } from './save.ts'
import { floorQi, isOutOfProtection, PROTECTION_DAYS, PROTECTION_POINTS, type GameState, type Player, type FiveQi } from './state.ts'
import {
  hourlyQi,
  groupElement,
  MERIDIANS,
  ELEMENTS,
  type Element,
  type MeridianGroup,
} from '../data/meridian.ts'
import { dantianCapacity } from '../data/upgrade.ts'
import { qiRewardFor, type QiReward } from '../data/quests.ts'
import { qiAt, terrainAt, WORLD_SIZE } from '../data/world.ts'

import { sanctuaryQi } from './sanctuary.ts'
import { socialOf } from './social.ts'

/** 存档结构改动时在这里追加迁移。**每改一次 state 结构就必须加一条。** */
export const MIGRATIONS: readonly Migration[] = [
  // v8 → v9：本地关系持久化。
  { from: 8, migrate: (old) => {
    const s = old as GameState | null
    // 校验前只读取最小安全形状；坏旧档交给 validateGameState 统一报 SaveError。
    if (!s || !Array.isArray(s.npc?.bases) || !s.npc.bases.every(n => n && typeof n.id === 'number')) return old
    return { ...s, social: s.social ?? socialOf(s) }
  } },

  // v7 → v8：可选寻宝任务、移动掉落快照及御剑飞行载荷。旧档没有寻宝进度。
  { from: 7, migrate: (old) => ({ ...(old as object) }) },
  {
    // v1 → v2：加入 NPC 生态。老存档按它自己的世界种子补一批 NPC，
    // 这样进度不丢、世界也和新档同一套生成规则。
    from: 1,
    migrate: (old) => {
      const s = old as { worldSeed?: number }
      return { ...(old as object), npc: { bases: generateNpcs(s.worldSeed ?? 1, 300), patches: {} } }
    },
  },
  {
    // v2 → v3：加入任务进度。老存档从空任务簿开始，原有等级与真气不受影响。
    from: 2,
    migrate: (old) => ({ ...(old as object), quests: emptyQuestLog() }),
  },
  {
    // v3 → v4：市场挂单进存档。**播种就在这里做完**，不要留给读档时补。
    // 补货只能在整点边界发生（`tick` 末尾那段注释论证了为什么），读档时无条件补
    // 会让存档往返不是恒等：一小时内把 12 张 NPC 单全买走再存盘，读回来又冒出 12 张。
    // `refillNpcOrders` 只用到 clock / worldSeed / timeline / market，v3 的存档全都有。
    from: 3,
    migrate: (old) => refillNpcOrders({ ...(old as object), market: emptyMarket() } as GameState),
  },
  {
    // v4 → v5：城镇投资进存档。城镇是踩上去才生成的，所以空表即可。
    from: 4,
    migrate: (old) => ({ ...(old as object), towns: {} }),
  },
  {
    // v5 → v6：VIP 开关进存档。老档默认关（和原版没充值一样）。
    from: 5,
    migrate: (old) => {
      const s = old as { player?: object }
      return { ...(old as object), player: { ...(s.player ?? {}), vip: false } }
    },
  },
  {
    // v6 → v7：挂单增加上架时间、法宝原物；结丹记录与出击快照均为可选字段。
    // 旧版尚未成交的自己的挂单从存档时刻开始等买家，不能追溯出售。
    // 旧返航已发过奖励，缺少 loot 必须保持缺省，不能迁移补发。
    from: 6,
    migrate: (old) => {
      const s = old as GameState | null
      if (!s?.market || !Array.isArray(s.market.qi) || !Array.isArray(s.market.artifacts)) return old
      return { ...s, market: {
        qi: s.market.qi.map(o => o?.seller === s.player?.name && o.listed && o.listedAt === undefined
          ? { ...o, listedAt: s.clock?.gameT } : o),
        artifacts: s.market.artifacts.map(o => o?.seller === s.player?.name && o.listedAt === undefined
          ? { ...o, listedAt: s.clock?.gameT } : o),
      } }
    },
  },
]

const MERIDIAN_GROUPS: readonly MeridianGroup[] = ['手三阴', '手三阳', '足三阴', '足三阳']

export type NewGameOptions = {
  readonly name: string
  readonly gender: 'm' | 'f'
  readonly element: Element
  readonly school: Player['school']
  /** 出生州的坐标 */
  readonly x: number
  readonly y: number
  readonly seed: number
  /** 开服日到建号时刻的秒数；单机版通常是 0（建号即开服） */
  readonly startGameT?: number
}

/**
 * 新号初始真气。原版新号资源条读作「1000/2000」
 * （`reference/text/guides/9947-p1.txt` L30「刚出生是1000/2000的真气」，2009-03）。
 * 克我一行按新手任务奖励同样的「克我减半」规律取 500 [推断]：2010-03 新号截图
 * （`reference/images/sina-live/2010-03-31-1641387364/`：木属性、经脉全 0、金产量 0/小时）
 * 已炼出 1 把桃木剑（金 140），飞剑页可炼数显示 玉虚(2)/乌光(1)/青石(0)，
 * 恰好是金 500 − 140 = 360 的读数；若金也是 1000 会显示 (6)/(2)/(1)。
 */
export const INITIAL_QI: QiReward = { base: 1000, overcomeBy: 500 }

export function newGame(opts: NewGameOptions, nowWall: number): GameState {
  const startT = opts.startGameT ?? 0
  const state: GameState = {
    v: SAVE_VERSION,
    clock: { gameT: startT, wallT: nowWall, rate: 1 },
    timeline: emptyTimeline(),
    rng: seedRng(opts.seed),
    worldSeed: opts.seed,
    npc: { bases: generateNpcs(opts.seed, 300), patches: {} },
    quests: emptyQuestLog(),
    // 先给个空市场，下面用 refillNpcOrders 播第 0 小时那一批 ——
    // 补货只在整点边界做，不播种的话新号头一个游戏小时市场是空的
    market: emptyMarket(),
    towns: {},
    mail: [],
    player: {
      name: opts.name,
      gender: opts.gender,
      element: opts.element,
      school: opts.school,
      realm: '筑基期',
      x: opts.x,
      y: opts.y,
      qi: qiRewardFor(INITIAL_QI, opts.element),
      meridians: Array(12).fill(0),
      body: Array(8).fill(0),
      skills: {},
      daoxing: 0,
      experience: 0,
      silver: 0,
      coin: 0,
      // 进游戏送 100 附加仙石（官方指南原文）
      bonusCoin: 100,
      artifacts: [],
      vip: false,
      createdAt: startT,
    },
  }
  return refillNpcOrders({ ...state, social: socialOf(state) })
}

/** 所在地块的天地元气。 */
export type TerrainProvider = (x: number, y: number) => FiveQi

/** 默认走真实世界生成（种子来自存档，所以离线重放也一致）。 */
export const terrainOf = (state: GameState, weeksOpen = weekOfServer(state.clock)): TerrainProvider =>
  (x, y) => sanctuaryQi(state, x, y, weeksOpen) ?? qiAt(state.worldSeed, x, y, terrainAt(state.worldSeed, x, y, weeksOpen))

/**
 * 当前每小时的五行产量（顶栏资源条显示它）。
 *
 * 公式照原版：`真气增长 = 地块元气 × Σ(该元素三条经脉的倍率) − 法宝耗气`。
 * 哪三条经脉炼化哪种真气，由本命属性决定（见 `meridian.ts` 的 `groupElement`）。
 */
export function currentQiPerHour(
  state: GameState,
  terrain: TerrainProvider = terrainOf(state),
): FiveQi {
  const self = state.player.element
  const terrainQi = terrain(state.player.x, state.player.y)

  const upkeep = state.player.artifacts.map(a => artifactUpkeepPerHour(a, self))

  const sharingPlayers = isOutOfProtection(state.player, state.clock.gameT, DAY) &&
    sanctuaryQi(state, state.player.x, state.player.y) === null
    ? 1 + allNpcsAt(state.npc, state.clock.gameT, state.worldSeed).filter(n =>
      n.x === state.player.x && n.y === state.player.y &&
      (n.daoxing >= PROTECTION_POINTS || state.clock.gameT - n.base.bornAt >= PROTECTION_DAYS * DAY)).length
    : 1

  return ELEMENTS.map((element, i) => {
    // 找出炼化这种真气的那一组经脉；克我的那一种没有对应组，恒为 0
    const group = MERIDIAN_GROUPS.find((g) => groupElement(self, g) === element)
    if (!group) return 0

    const levels = MERIDIANS.reduce<number[]>((acc, m, idx) => {
      if (m.group === group) acc.push(state.player.meridians[idx] ?? 0)
      return acc
    }, [])

    return hourlyQi({
      terrainQi: terrainQi[i] ?? 0,
      meridianLevels: [levels[0] ?? 0, levels[1] ?? 0, levels[2] ?? 0],
      sharingPlayers,
      itemUpkeep: upkeep.reduce((sum, qi) => sum + qi[i]!, 0),
    })
  }) as unknown as FiveQi
}

/**
 * 按事件和小时边界推进。每段先结算收入，再用该时刻的状态处理事件；
 * 突破、移动、被抢之后，余下时间使用新的产量、位置与资源。
 */
export function tick(
  state: GameState,
  nowWall: number,
  terrain?: TerrainProvider,
): { state: GameState; resolved: readonly GameEvent[] } {
  const clock = advance(state.clock, nowWall)
  let current = state
  const resolved: GameEvent[] = []
  let nextHour = (Math.floor(state.clock.gameT / HOUR) + 1) * HOUR

  while (true) {
    const event = sorted(current.timeline)[0]
    const purchaseAt = nextNpcPurchaseAt(current)
    // 建号时刻不一定在整点；出保会改变地气分享，必须在准确边界分段。
    const protectionAt = Math.min(...[current.player.createdAt, ...current.npc.bases.map(n => n.bornAt)]
      .map(t => t + PROTECTION_DAYS * DAY).filter(t => t > current.clock.gameT))
    const at = Math.max(current.clock.gameT, Math.min(clock.gameT, nextHour, protectionAt, event?.finishAt ?? Infinity, purchaseAt ?? Infinity))
    const elapsed = at - current.clock.gameT
    if (elapsed > 0) {
      const weeks = Math.floor(at / WEEK) - Math.floor(current.clock.gameT / WEEK)
      current = gainQi({ ...current, clock: { ...clock, gameT: at } }, currentQiPerHour(current, terrain), elapsed)
      current = settleTownIncome(current, elapsed)
      if (weeks > 0) current = { ...current, player: { ...current.player, bonusCoin: current.player.bonusCoin + 20 * weeks } }
    }

    const quests = expireDailyQuests(current.quests, at)
    if (quests !== current.quests) current = { ...current, quests }

    // 先从真实时间线取走当前事件，取消挂单等副作用就不会被旧的事件数组覆盖。
    // 同时刻事件按 id 稳定排序，事件追加的同刻后续也在离开这个时刻前结算。
    if (event && event.finishAt <= at) {
      if (resolved.length >= 100_000) throw new Error('事件结算超过安全上限')
      current = { ...current, timeline: cancel(current.timeline, event.id) }
      const out = resolveEvent(current, event)
      current = applyQuestProgress(current, out.state, event)
      for (const follow of out.follow ?? []) current = { ...current, timeline: schedule(current.timeline, follow) }
      resolved.push(event)
      continue
    }

    if (purchaseAt !== null && purchaseAt <= at) {
      current = settleNpcPurchases(current)
      continue // 成交可能生成已到期的注入事件，同一时刻继续处理。
    }

    if (at === nextHour) {
      current = scheduleRaid(refillNpcOrders(current))
      nextHour += HOUR
    }
    if (at >= clock.gameT) break
  }

  // **不要在这里再补一次货。** 补货批次按「补货发生在第几个游戏小时」编号
  // （`market.ts` 的 `npc:{hour}:{slot}`），在 tick 末尾用残缺小时补，
  // 批次编号就取决于调用 tick 的节奏：离线一次推 1 小时 → 批次 hour=1，
  // 在线先跳 10 分钟再推 → 批次 hour=0。NPC 单整批 24 小时轮换，
  // 这个相位差会**永久保留**，直接违反「离线一个月 == 在线逐小时」。
  // 补货只在上面的整点边界做（`at === nextHour`），那里是纯粹由 gameT 决定的。
  if (current.clock.wallT !== clock.wallT) current = { ...current, clock }
  return { state: current, resolved }
}

function resolveEvent(state: GameState, event: GameEvent): { state: GameState; follow?: readonly GameEvent[] } {
  if (event.kind === 'cultivate') return { state: event.payload.op === 'goldenCore' ? state : resolveCultivate(state, event) }
  if (event.kind === 'move') return event.payload.op === 'escort' ? { state: resolveEscort(state, event) } : resolveMove(state, event)
  if (event.kind === 'battle') {
    const out = resolveBattleEvent(state, event)
    return out.outcome?.won
      ? { ...out, state: { ...out.state, quests: resolveQuestBattle(out.state.quests, event, true) } }
      : out
  }
  if (event.kind === 'craft') return { state: resolveCraft(state, event) }
  if (event.kind === 'market') return { state: applyCtx(resolveMarketEvent(ctxOf(state), event)) }
  if (event.kind === 'raid') return resolveRaidEvent(state, event)
  return { state }
}

/** 改倍速（先结算到当前再换档，否则游戏时间会跳变）。 */
export function changeRate(state: GameState, nowWall: number, rate: number, terrain?: TerrainProvider): GameState {
  // 先验证倍率，非法输入不必重放整段离线时间。
  setRate(state.clock, state.clock.wallT, rate)
  const settled = tick(state, nowWall, terrain).state
  return { ...settled, clock: { ...settled.clock, rate } }
}

// —— 存档 ——

/**
 * 存档。写盘前先把时钟推到当前，这样下次读档时 `wallT` 是准的、
 * 不会把「关页面之后的这段时间」重复结算一次。
 * 存档头上的 `savedAt` 记游戏时间，因为整个项目不读墙钟（`DECISIONS.md` §3.6）。
 */
export function saveGame(storage: Storage, state: GameState, nowWall: number): GameState {
  const settled = tick(state, nowWall).state
  save(storage, settled, settled.clock.gameT, { migrations: MIGRATIONS, validate: validateGameState })
  return settled
}

export function loadGame(storage: Storage): GameState | null {
  const out = load(storage, MIGRATIONS, validateGameState)
  return out ? settleLoaded(out.state as GameState) : null
}

/** 导入与启动读档使用相同的迁移和游戏结构校验。 */
export function importGame(text: string): GameState {
  // 早期界面导出的是裸 GameState；仍须经过版本迁移及同一套结构校验。
  let raw: unknown
  try { raw = JSON.parse(text) } catch { /* importSave 给出统一的错误信息 */ }
  if (typeof raw === 'object' && raw !== null && 'player' in raw && 'clock' in raw && !('state' in raw)) {
    const old = raw as { v?: unknown; clock?: { gameT?: unknown } }
    text = JSON.stringify({ v: old.v, savedAt: old.clock?.gameT, state: raw })
  }
  const state = importSave(text, MIGRATIONS, validateGameState) as GameState
  return settleLoaded(state)
}

/**
 * 读进来的存档统一走这里。
 *
 * 老存档迁移过来时市场是空的（v3→v4 给的是 `emptyMarket`）。补货只在整点边界做，
 * 不在这里播一次，玩家就要等到下一个游戏整点才看得到挂单。
 * 播种时机由存档自己的 `gameT` 决定，不受 tick 节奏影响，所以依然是确定的。
 *
 * `loadGame` 与 `importGame` 必须走同一条路 —— 否则「导入一份存档」和
 * 「读本地存档」会得到不同的市场。
 */
function settleLoaded(state: GameState): GameState {
  // **读档不补货。** 补货只在整点边界做（见 `tick` 末尾那段注释），在这里补会让
  // 存档往返不是恒等 —— 存盘时 0 张、读回来 12 张。老存档的播种交给 v3→v4 迁移。
  return { ...state, quests: expireDailyQuests(state.quests, state.clock.gameT), v: SAVE_VERSION }
}

/** 校验会参与计算的必需字段，合法 JSON 也不能直接被断言成游戏状态。 */
export function validateGameState(value: unknown): asserts value is GameState {
  const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
  const numbers = (v: unknown, length: number): boolean => Array.isArray(v) && v.length === length && v.every(number)
  const string = (v: unknown): boolean => typeof v === 'string'
  const strings = (v: Record<string, unknown>, keys: string[]) => keys.every((key) => string(v[key]))
  const numeric = (v: Record<string, unknown>, keys: string[]) => keys.every((key) => number(v[key]))
  const arrayOf = (v: unknown, valid: (item: Record<string, unknown>) => boolean): boolean =>
    Array.isArray(v) && v.every((item: unknown) => object(item) && valid(item))
  const optionalNumber = (v: unknown) => v === undefined || number(v)
  const integer = (v: unknown) => number(v) && Number.isSafeInteger(v)
  const coordinate = (v: unknown) => integer(v) && (v as number) < WORLD_SIZE
  const xy = (v: Record<string, unknown>) => coordinate(v.x) && coordinate(v.y)
  const ids = (v: unknown) => Array.isArray(v) && v.every(integer)
  const idMap = (v: unknown, valid: (item: unknown) => boolean) => object(v) &&
    Object.entries(v).every(([key, item]) => /^(0|[1-9][0-9]*)$/.test(key) && valid(item))
  const optionalBool = (v: unknown) => v === undefined || typeof v === 'boolean'
  const optionalRatio = (v: unknown) => v === undefined || number(v) && v <= 1
  const quality = (v: unknown) => ['废品', '凡品', '上品', '极品'].includes(v as string)
  const element = (v: unknown) => ELEMENTS.includes(v as Element)
  const combatElement = (v: unknown) => v === null || element(v)
  const artifact = (a: Record<string, unknown>) => strings(a, ['id', 'name', 'status']) &&
    ['sword', 'guard', 'pill', 'book', 'misc'].includes(a.kind as string) &&
    quality(a.quality) && integer(a.refine) && integer(a.count)
  const combatStats = (v: Record<string, unknown>) => numeric(v, ['attack', 'durability', 'agility']) &&
    optionalNumber(v.absorb) && optionalNumber(v.speed) && optionalBool(v.noReturn) &&
    optionalBool(v.defensiveOnly) && optionalRatio(v.instantAttackRatio) && optionalRatio(v.instantDefenseRatio)
  const combatSword = (v: Record<string, unknown>) => strings(v, ['id', 'name']) && combatElement(v.element) && combatStats(v)
  const launchSword = (v: Record<string, unknown>) => strings(v, ['id', 'name']) && quality(v.quality) && integer(v.refine) &&
    numeric(v, ['speed', 'agility']) && numbers(v.attack, 2) && numbers(v.durability, 2) && combatElement(v.element) &&
    (v.launchedStats === undefined || object(v.launchedStats) && combatStats(v.launchedStats) && number(v.launchedStats.speed))
  const aid = (v: unknown) => v === undefined || arrayOf(v, a => integer(a.npcId) &&
    numeric(a, ['arriveAt', 'returnSeconds']) && arrayOf(a.swords, combatSword))
  const eventPayload = (event: Record<string, unknown>): boolean => {
    const data = event.payload
    if (!object(data)) return false
    switch (event.kind) {
      case 'cultivate':
        if (data.op === 'goldenCore') return string(data.questId)
        return number(data.toLevel) && (data.system === 'skill' ? string(data.id)
          : ['meridian', 'body'].includes(data.system as string) && number(data.index) && Number.isInteger(data.index) && data.index < (data.system === 'body' ? 8 : 12))
      case 'move':
        if (data.op === 'escort') return numeric(data, ['x', 'y', 'fee'])
        if (data.op === 'flight') return numeric(data, ['x', 'y']) && string(data.swordId) &&
          [data.x, data.y].every(v => Number.isInteger(v) && (v as number) < WORLD_SIZE)
        return number(data.index) && Number.isInteger(data.index) &&
          (data.treasureDrop === undefined || typeof data.treasureDrop === 'boolean') &&
          arrayOf(data.legs, leg => numeric(leg, ['x', 'y', 'seconds']) && string(leg.terrain)) &&
          data.index < (data.legs as unknown[]).length
      case 'battle':
        return ['outbound', 'fighting', 'returning'].includes(data.phase as string) &&
          object(data.target) && strings(data.target, ['name']) && ['monster', 'player'].includes(data.target.kind as string) &&
          xy(data.target) && numeric(data.target, ['attack', 'agility', 'hp']) && combatElement(data.target.element) && optionalNumber(data.target.npcId) &&
          Array.isArray(data.swordIds) && data.swordIds.every(string) && arrayOf(data.swords, launchSword) &&
          (data.defenders === undefined || arrayOf(data.defenders, combatSword)) && aid(data.aid) &&
          (data.loot === undefined || numbers(data.loot, 5)) &&
          (data.targetQi === undefined || numbers(data.targetQi, 5)) && optionalNumber(data.targetRootLevel)
      case 'craft':
        return ['sword', 'guard', 'pill'].includes(data.kind as string) && strings(data, ['name', 'quality']) && number(data.count) &&
          (data.qualities === undefined || Array.isArray(data.qualities) && data.qualities.length === data.count && data.qualities.every(q => ['废品', '凡品', '上品', '极品'].includes(q))) &&
          (data.op !== 'repair' || string(data.artifactId) && data.count === 0 && data.kind !== 'pill')
      case 'market':
        return data.op === 'list' ? string(data.orderId) : data.op === 'inject' && element(data.element) && number(data.amount)
      case 'raid':
        if (data.phase === 'returning') return integer(data.npcId) && Array.isArray(data.swordIds) && data.swordIds.every(string) && optionalNumber(data.loot)
        return (data.phase === undefined || ['outbound', 'guard', 'fighting'].includes(data.phase as string)) &&
          string(data.attacker) && numeric(data, ['swordPower', 'swords']) && element(data.element) &&
          optionalNumber(data.attackerId) && optionalNumber(data.returnSeconds) &&
          (data.fromX === undefined || coordinate(data.fromX)) && (data.fromY === undefined || coordinate(data.fromY)) &&
          (data.attackers === undefined || arrayOf(data.attackers, combatSword)) && aid(data.aid) &&
          (data.guards === undefined ? data.phase !== 'guard' : arrayOf(data.guards, combatSword)) &&
          (data.defenders === undefined ? data.phase !== 'fighting' : arrayOf(data.defenders, combatSword)) &&
          (data.defending === undefined || arrayOf(data.defending, launchSword))
      default:
        return false
    }
  }
  const fail = (): never => { throw new SaveError('存档的游戏数据结构损坏', 'corrupt') }
  if (!object(value)) fail()
  const s = value as Record<string, unknown>
  const p = s.player, c = s.clock, tl = s.timeline, npc = s.npc, quests = s.quests, market = s.market
  if (!optionalNumber(s.peaceUntil) || !number(s.v) || !number(s.worldSeed) || !numbers(s.rng, 4) ||
      (s.social !== undefined && (!object(s.social) || !ids(s.social.guardians) || !idMap(s.social.npcGuardians, ids) ||
        !Array.isArray(s.social.blacklist) || !s.social.blacklist.every(string) ||
        !arrayOf(s.social.guilds, g => integer(g.id) && string(g.name) && integer(g.founder) && integer(g.leader) && number(g.createdAt) &&
          ids(g.members) && ids(g.allies) && ids(g.enemies) && idMap(g.jobs, string)))) ||
      (s.divination !== undefined && (!object(s.divination) || !idMap(s.divination.located, p => object(p) && xy(p)) ||
        !arrayOf(s.divination.scenes, p => xy(p) && number(p.expiresAt)))) ||
      (s.treasure !== undefined && (!object(s.treasure) || !['藏宝图', '天宫秘箓'].includes(s.treasure.source as string) ||
        !numeric(s.treasure, ['x', 'y']) || ![s.treasure.x, s.treasure.y].every(v => Number.isInteger(v) && (v as number) < WORLD_SIZE) ||
        !object(s.treasure.reward) || !artifact(s.treasure.reward) || s.treasure.reward.count !== 1)) ||
      // rate 必须落在 (0, MAX_RATE]：上限缺失时，一份 rate=1e9 的存档会让首次 tick 冻死标签页
      !object(c) || !numeric(c, ['gameT', 'wallT', 'rate']) ||
      !((c.rate as number) > 0) || (c.rate as number) > MAX_RATE ||
      !object(p) || !strings(p, ['name', 'gender', 'element', 'school', 'realm']) ||
      !['m', 'f'].includes(p.gender as string) || !ELEMENTS.includes(p.element as Element) ||
      !['蜀山', '昆仑', '通天'].includes(p.school as string) ||
      !['筑基期', '辟谷期', '心动期', '金丹期', '元婴期'].includes(p.realm as string) ||
      !numeric(p, ['x', 'y', 'daoxing', 'experience', 'silver', 'coin', 'bonusCoin', 'createdAt']) ||
      !numbers(p.qi, 5) || !numbers(p.meridians, 12) || !numbers(p.body, 8) ||
      !object(p.skills) || !Object.values(p.skills).every(number) || typeof p.vip !== 'boolean' ||
      !arrayOf(p.artifacts, artifact) ||
      !object(tl) || !arrayOf(tl.events, (e) => strings(e, ['id', 'kind']) && number(e.finishAt) && eventPayload(e)) ||
      !object(npc) || !arrayOf(npc.bases, (n) => strings(n, ['name', 'profile', 'school', 'element']) && numeric(n, ['id', 'bornAt', 'homeX', 'homeY'])) ||
      !idMap(npc.patches, patch => object(patch) && ['swordsLost', 'qiLost', 'qiGained'].every(key => optionalNumber(patch[key])) &&
        (patch.x === undefined || coordinate(patch.x)) && (patch.y === undefined || coordinate(patch.y)) &&
        (patch.artifacts === undefined || arrayOf(patch.artifacts, artifact))) ||
      !object(quests) || !['qi', 'sword'].includes(quests.line as string) || !number(quests.dantianBonus) ||
      !arrayOf(quests.entries, (q) => string(q.id) && number(q.acceptedAt) && typeof q.done === 'boolean' &&
        (q.at === undefined || numbers(q.at, 2)) && optionalNumber(q.count) && optionalNumber(q.coreQi) &&
        (q.coreEventId === undefined || string(q.coreEventId)) && (q.cleared === undefined || typeof q.cleared === 'boolean')) ||
      (quests.sanctuaries !== undefined && !arrayOf(quests.sanctuaries, place => xy(place) && ['福地', '洞天'].includes(place.kind as string) && number(place.occupiedAt))) ||
      !object(market) || !arrayOf(market.qi, (o) => strings(o, ['id', 'seller']) && typeof o.listed === 'boolean' &&
        optionalNumber(o.listedAt) &&
        [o.offer, o.want].every((a) => object(a) && ELEMENTS.includes(a.element as Element) && number(a.amount))) ||
      !arrayOf(market.artifacts, (o) => strings(o, ['id', 'seller', 'name']) && numeric(o, ['refine', 'priceCoin']) && optionalNumber(o.listedAt) &&
        (o.artifact === undefined || object(o.artifact) && artifact(o.artifact))) ||
      !object(s.towns) || !Object.values(s.towns).every((t) => object(t) && strings(t, ['id', 'kind', 'name']) && numeric(t, ['x', 'y']) &&
        arrayOf(t.investments, (i) => string(i.owner) && number(i.silver))) ||
      !arrayOf(s.mail, (m) => strings(m, ['id', 'subject', 'from', 'kind']) && number(m.at) && typeof m.read === 'boolean' && object(m.body))) fail()
}

/** 顶栏要显示的资源条数据。 */
export function resourceBarOf(state: GameState, terrain?: TerrainProvider) {
  return {
    current: state.player.qi.map(floorQi) as unknown as FiveQi,
    capacity: capacityOf(state),
    perHour: currentQiPerHour(state, terrain),
    coin: state.player.coin,
    bonusCoin: state.player.bonusCoin,
  }
}

export { dantianCapacity, DAY, WORLD_SIZE }
export type { Clock }
