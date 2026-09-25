/**
 * 游戏主循环：把时钟、事件时间线、存档串起来。
 *
 * 核心是「惰性结算」（`docs/spec/DECISIONS.md` §3.6）：不逐秒模拟，
 * 每次打开页面或做操作时，把时钟推到现在、把到期事件一次性结算掉。
 * 离线一个月和离线一秒走的是同一条代码路径。
 */

import { advance, setRate, DAY, type Clock } from './clock.ts'
import { advanceTo, emptyTimeline, type GameEvent } from './timeline.ts'
import { resolveCultivate, capacityOf, gainQi } from './cultivate.ts'
import { resolveMove } from './move.ts'
import { resolveBattleEvent } from './battle.ts'
import { resolveCraft } from './craft.ts'
import { generateNpcs, type NpcWorld } from './npc.ts'
import { emptyQuestLog } from './quest.ts'
import { emptyMarket, refillNpcOrders, resolveMarketEvent, ctxOf, applyCtx } from './market.ts'
import { seedRng } from './rng.ts'
import { save, load, SAVE_VERSION, type Storage, type Migration } from './save.ts'
import { ZERO_QI, type GameState, type Player, type FiveQi } from './state.ts'
import {
  hourlyQi,
  groupElement,
  MERIDIANS,
  ELEMENTS,
  type Element,
  type MeridianGroup,
} from '../data/meridian.ts'
import { dantianCapacity } from '../data/upgrade.ts'
import { qiAt, terrainAt, WORLD_SIZE } from '../data/world.ts'

/** 存档结构改动时在这里追加迁移。**每改一次 state 结构就必须加一条。** */
export const MIGRATIONS: readonly Migration[] = [
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
    // v3 → v4：市场挂单进存档。空市场即可，下一次 tick 会按世界种子补上 NPC 单。
    from: 3,
    migrate: (old) => ({ ...(old as object), market: emptyMarket() }),
  },
  {
    // v4 → v5：城镇投资进存档。城镇是踩上去才生成的，所以空表即可。
    from: 4,
    migrate: (old) => ({ ...(old as object), towns: {} }),
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

export function newGame(opts: NewGameOptions, nowWall: number): GameState {
  const startT = opts.startGameT ?? 0
  return {
    v: SAVE_VERSION,
    clock: { gameT: startT, wallT: nowWall, rate: 1 },
    timeline: emptyTimeline(),
    rng: seedRng(opts.seed),
    worldSeed: opts.seed,
    npc: { bases: generateNpcs(opts.seed, 300), patches: {} },
    quests: emptyQuestLog(),
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
      qi: ZERO_QI,
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
      createdAt: startT,
    },
  }
}

/** 所在地块的天地元气。 */
export type TerrainProvider = (x: number, y: number) => FiveQi

/** 默认走真实世界生成（种子来自存档，所以离线重放也一致）。 */
export const terrainOf = (state: GameState, weeksOpen = 99): TerrainProvider =>
  (x, y) => qiAt(state.worldSeed, x, y, terrainAt(state.worldSeed, x, y, weeksOpen))

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

  // 身上法宝的每小时耗气（阶段 2 先只算飞剑，护身在阶段 4a 接上）
  const upkeep = state.player.artifacts.filter((a) => a.kind === 'sword').length

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
      itemUpkeep: upkeep,
    })
  }) as unknown as FiveQi
}

/**
 * 推进到当前时刻：先按产量补真气，再结算到期事件。
 *
 * 顺序很重要：先补真气再结算，这样离线期间「攒够真气 → 自动升级」这类链条
 * 才不会因为结算时真气还没到账而断掉。
 */
export function tick(
  state: GameState,
  nowWall: number,
  terrain: TerrainProvider = terrainOf(state),
): { state: GameState; resolved: readonly GameEvent[] } {
  const clock = advance(state.clock, nowWall)
  const elapsed = clock.gameT - state.clock.gameT
  if (elapsed <= 0) return { state: { ...state, clock }, resolved: [] }

  const perHour = currentQiPerHour(state, terrain)
  const withQi = gainQi({ ...state, clock }, perHour, elapsed)

  const out = advanceTo(withQi, withQi.timeline, clock.gameT, (st, ev) => {
    if (ev.kind === 'cultivate') return { state: resolveCultivate(st, ev) }
    if (ev.kind === 'move') return resolveMove(st, ev)
    if (ev.kind === 'battle') return resolveBattleEvent(st, ev)
    if (ev.kind === 'craft') return { state: resolveCraft(st, ev) }
    if (ev.kind === 'market') return { state: applyCtx(resolveMarketEvent(ctxOf(st), ev)) }
    return { state: st }
  })

  // 结算完再补市场，这样刚被买走的单不会当场复活
  const settled = refillNpcOrders({ ...out.state, timeline: out.timeline })
  return { state: settled, resolved: out.resolved }
}

/** 改倍速（先结算到当前再换档，否则游戏时间会跳变）。 */
export const changeRate = (state: GameState, nowWall: number, rate: number): GameState => ({
  ...state,
  clock: setRate(state.clock, nowWall, rate),
})

// —— 存档 ——

/**
 * 存档。写盘前先把时钟推到当前，这样下次读档时 `wallT` 是准的、
 * 不会把「关页面之后的这段时间」重复结算一次。
 * 存档头上的 `savedAt` 记游戏时间，因为整个项目不读墙钟（`DECISIONS.md` §3.6）。
 */
export function saveGame(storage: Storage, state: GameState, nowWall: number): void {
  const settled = { ...state, clock: advance(state.clock, nowWall) }
  save(storage, settled, settled.clock.gameT)
}

export function loadGame(storage: Storage): GameState | null {
  const out = load(storage, MIGRATIONS)
  return out ? (out.state as GameState) : null
}

/** 顶栏要显示的资源条数据。 */
export function resourceBarOf(state: GameState, terrain?: TerrainProvider) {
  return {
    current: state.player.qi.map((v) => Math.floor(v)) as unknown as FiveQi,
    capacity: capacityOf(state),
    perHour: currentQiPerHour(state, terrain),
    coin: state.player.coin,
    bonusCoin: state.player.bonusCoin,
  }
}

export { dantianCapacity, DAY, WORLD_SIZE }
export type { Clock }
