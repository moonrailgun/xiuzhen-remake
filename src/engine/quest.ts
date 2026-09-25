/**
 * 任务引擎：领取 / 进行 / 交付 / 放弃，条件判定与发奖。
 *
 * 【照原版】的部分：
 *  - 任务按链推进，前一步交付了下一步才出现在「可领取的任务」里（`02 §4.1`、`§4.2`）；
 *  - 任务栏每条后面跟一个 **「放弃」** 链接（`03 §1.9`(e) 原文
 *    `斩却三尸-上尸彭踞(1/4)　放弃　目标地点: (60,134)`）；
 *  - 完成了不会自动发奖，要点「领取奖励」（截图 #83 的底部按钮）——
 *    所以状态是四态：可领取 / 进行中 / **可交付** / 已完成；
 *  - 《百妖记》按境界开放（1–5 无门槛，6–20 要出保护期，之后每 20 回一个境界）；
 *  - 斩三尸**只在周六刷新**、满地图随机（`15374`；`DECISIONS.md` §5 #8 取周六）。
 *
 * 【重建】的部分：
 *  - 任务怪的**坐标生成规则**原版没留下（只知道试剑石在「附近的山顶」、三尸「满地图随机」）。
 *    这里用无状态随机按 `worldSeed + 任务 id` 算，保证同一存档任何时候查都是同一个点；
 *  - 「放弃要花仙石」见于文曲星君任务的回帖，但**哪些任务收、收多少** [未知]，这里一律不收。
 *
 * 任务日志保存在 `GameState.quests`；按事件结算的进度由主循环调用 `applyQuestProgress`。
 */

import { DAY, weekdayOf } from './clock.ts'
import { randInt } from './rng.ts'
import { schedule, type GameEvent } from './timeline.ts'
import { capacityOf } from './cultivate.ts'
import { canAcquireArtifacts } from './craft.ts'
import {
  addQi,
  clampQi,
  isOutOfProtection,
  REALMS,
  ZERO_QI,
  type Artifact,
  type FiveQi,
  type GameState,
  type Realm,
} from './state.ts'
import { ELEMENTS, MERIDIANS, groupElement } from '../data/meridian.ts'
import { WORLD_SIZE } from '../data/world.ts'
import {
  SANSHI_SPAWN_WEEKDAY,
  chainsFor,
  qiRewardFor,
  questById,
  type Monster,
  type NewbieLine,
  type Quest,
} from '../data/quests.ts'

// ===========================================================================
// 存档结构
// ===========================================================================

/** 可领取 / 进行中 / 可交付 / 已完成。原版没有「失败」态（放弃就是删掉重来）。 */
export type QuestStatus = 'available' | 'active' | 'ready' | 'done' | 'locked'

export type QuestEntry = {
  readonly id: string
  /** 领取时刻（游戏秒） */
  readonly acceptedAt: number
  /** 奖励已领 */
  readonly done: boolean
  /** 目标坐标（斩妖类领取时定死，免得每次查都跳） */
  readonly at?: readonly [number, number]
  /** 外部事件型条件已满足：怪被打死 / 答完题 / 选完分支 / 金丹已成 */
  readonly cleared?: boolean
  /** 计数型条件的累计值：炼制或淬炼的件数、已交给 NPC 的银两 */
  readonly count?: number
  /** 已汇聚、尚未开始压缩的本命真气。 */
  readonly coreQi?: number
  /** 当前压缩对应事件，防止重复结算。 */
  readonly coreEventId?: string
}

export type QuestLog = {
  readonly entries: readonly QuestEntry[]
  /** 新手任务第 3 步选的线。未选之前两条线前 3 步完全相同，默认 `qi` 不影响正确性。 */
  readonly line: NewbieLine
  /** 已领的境界奖励累计的丹田上限加成（辟谷 +5000、心动 +10000、元婴 160000）。 */
  readonly dantianBonus: number
}

export const emptyQuestLog = (line: NewbieLine = 'qi'): QuestLog => ({
  entries: [],
  line,
  dantianBonus: 0,
})

export type QuestResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string }

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })
const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value })

// ===========================================================================
// 查询
// ===========================================================================

export const entryOf = (log: QuestLog, id: string): QuestEntry | undefined =>
  log.entries.find((e) => e.id === id)

export const questOf = (log: QuestLog, id: string): Quest | undefined => questById(id, log.line)

const realmRank = (r: Realm): number => REALMS.indexOf(r)

/** 境界是否到了（含更高境界）。 */
export const realmReached = (player: GameState['player'], need: Realm): boolean =>
  realmRank(player.realm) >= realmRank(need)

/** 一条链里，前面的步骤是否全都交付了。 */
function chainUnlocked(log: QuestLog, chain: readonly Quest[], index: number): boolean {
  for (let i = 0; i < index; i++) {
    const prev = chain[i]
    if (!prev) return false
    if (!entryOf(log, prev.id)?.done) return false
  }
  return true
}

function findChain(log: QuestLog, id: string): { chain: readonly Quest[]; index: number } | null {
  for (const chain of chainsFor(log.line)) {
    const index = chain.findIndex((q) => q.id === id)
    if (index >= 0) return { chain, index }
  }
  return null
}

/**
 * 领取门槛。返回 `null` 表示可以领。
 * 三尸的「只在周六」写在这里而不是数据表里 —— 它是规则不是数值。
 */
export function acceptBlocker(q: Quest, state: GameState): string | null {
  const req = q.require
  if (req?.realm && !realmReached(state.player, req.realm)) return `境界不足，需要${req.realm}`
  if (req?.outOfProtection && !isOutOfProtection(state.player, state.clock.gameT, DAY)) {
    return '尚未离开新手保护期'
  }
  if (q.series === '斩却三尸' && q.goal.kind === 'slay') {
    if (weekdayOf(state.clock) !== SANSHI_SPAWN_WEEKDAY) return '三尸只在每周六现身'
  }
  return null
}

/** 四态 + `locked`（前置未完成或门槛未到）。 */
export function statusOf(log: QuestLog, state: GameState, id: string): QuestStatus {
  const entry = entryOf(log, id)
  if (entry?.done) return 'done'
  const found = findChain(log, id)
  if (!found) return 'locked'
  const q = found.chain[found.index]!
  if (entry) return goalMet(q, entry, state) ? 'ready' : 'active'
  if (!chainUnlocked(log, found.chain, found.index)) return 'locked'
  return acceptBlocker(q, state) === null ? 'available' : 'locked'
}

/** 原版右栏「查看可领取任务」列出的就是这些。 */
export function availableQuests(log: QuestLog, state: GameState): readonly Quest[] {
  const out: Quest[] = []
  for (const chain of chainsFor(log.line)) {
    for (let i = 0; i < chain.length; i++) {
      const q = chain[i]!
      if (entryOf(log, q.id)) continue
      if (!chainUnlocked(log, chain, i)) break
      if (acceptBlocker(q, state) === null) out.push(q)
      // 一条链一次只开放一个任务
      break
    }
  }
  return out
}

/** 任务栏上正在进行的（含可交付的）。 */
export const activeQuests = (log: QuestLog): readonly Quest[] =>
  log.entries.filter((e) => !e.done).flatMap((e) => {
    const q = questOf(log, e.id)
    return q ? [q] : []
  })

// ===========================================================================
// 完成条件判定
// ===========================================================================

/** 12 条经脉各炼化哪种真气（随本命属性变，见 `meridian.ts`）。 */
const meridianElements = (state: GameState) =>
  MERIDIANS.map((m) => groupElement(state.player.element, m.group))

export function goalMet(q: Quest, entry: QuestEntry, state: GameState): boolean {
  const g = q.goal
  const p = state.player
  switch (g.kind) {
    case 'meridian': {
      const hit = p.meridians.flatMap((lv, i) => (lv >= g.level ? [i] : []))
      if (hit.length < g.count) return false
      if (g.elements === undefined) return true
      const els = meridianElements(state)
      return new Set(hit.map((i) => els[i])).size >= g.elements
    }
    case 'body':
      return (p.body[g.index] ?? 0) >= g.level
    case 'skill':
      return (p.skills[g.id] ?? 0) >= g.level
    case 'craft':
    case 'refine':
      return (entry.count ?? 0) >= g.count
    case 'silver':
      return (entry.count ?? 0) >= g.amount
    case 'daoxing':
      return p.daoxing >= g.points
    case 'experience':
      return p.experience >= g.points
    case 'slay':
    case 'quiz':
    case 'choice':
    case 'goldenCore':
      return entry.cleared === true
  }
}

// ===========================================================================
// 领取 / 放弃
// ===========================================================================

/**
 * 任务怪的落点。[重建]
 * 原版只说试剑石在「附近的山顶」、三尸「满地图随机」，生成规则没有存档。
 * 这里：新手任务的靶子落在身边 8 格内，其余满地图；**只有三尸**按周变位置（每周六换一处）。
 *
 * 周次自己从 `state.clock` 算，不再由调用方传 —— 以前 `accept` 传当前周、详情页预览
 * 用默认 0，于是「百妖记第一回」详情页显示 (141,120)、领完变成 (1,27)，
 * 玩家照着坐标飞过去目标不在那儿；同一份存档里位置还会每游戏周搬一次家。
 */
export function questLocation(state: GameState, q: Quest): readonly [number, number] {
  if (q.at) return q.at
  const seed = state.worldSeed
  // 三尸「只在周六现身」，所以它每周换一处；其余任务的落点只由 worldSeed + 任务 id 决定。
  const weekKey = q.series === '斩却三尸' ? Math.floor(state.clock.gameT / (7 * DAY)) : 0
  if (q.category === 'newbie') {
    const dx = randInt(17, seed, 'questnear', q.id, 'x') - 8
    const dy = randInt(17, seed, 'questnear', q.id, 'y') - 8
    return [clampToWorld(state.player.x + dx), clampToWorld(state.player.y + dy)]
  }
  return [
    randInt(WORLD_SIZE, seed, 'quest', q.id, weekKey, 'x'),
    randInt(WORLD_SIZE, seed, 'quest', q.id, weekKey, 'y'),
  ]
}

const clampToWorld = (v: number): number => Math.max(0, Math.min(WORLD_SIZE - 1, Math.round(v)))

export function accept(log: QuestLog, state: GameState, id: string): QuestResult<QuestLog> {
  if (entryOf(log, id)) return fail('该任务已经领取过了')
  const found = findChain(log, id)
  if (!found) return fail('没有这个任务')
  const q = found.chain[found.index]!
  if (!chainUnlocked(log, found.chain, found.index)) return fail('前置任务尚未完成')
  const blocker = acceptBlocker(q, state)
  if (blocker) return fail(blocker)

  const entry: QuestEntry = {
    id,
    acceptedAt: state.clock.gameT,
    done: false,
    ...(q.goal.kind === 'slay' ? { at: questLocation(state, q) } : {}),
  }
  return ok({ ...log, entries: [...log.entries, entry] })
}

/** 放弃（任务栏上的「放弃」链接）。已交付的不能放弃。 */
export function abandon(log: QuestLog, id: string): QuestResult<QuestLog> {
  const entry = entryOf(log, id)
  if (!entry) return fail('没有领取这个任务')
  if (entry.done) return fail('任务已经完成，无法放弃')
  return ok({ ...log, entries: log.entries.filter((e) => e.id !== id) })
}

// ===========================================================================
// 进度上报
// ===========================================================================

const patch = (log: QuestLog, id: string, f: (e: QuestEntry) => QuestEntry): QuestLog => ({
  ...log,
  entries: log.entries.map((e) => (e.id === id && !e.done ? f(e) : e)),
})

/** 标记外部条件已完成；实际答题、选分支与结丹规则由对应入口检查。 */
export const markCleared = (log: QuestLog, id: string): QuestLog =>
  patch(log, id, (e) => ({ ...e, cleared: true }))

/** 新手第 3 步：选先炼气还是先炼剑，顺带把这一步标记完成。 */
export function chooseLine(log: QuestLog, id: string, line: NewbieLine): QuestLog {
  const entry = entryOf(log, id)
  if (!entry || entry.done || entry.cleared || questOf(log, id)?.goal.kind !== 'choice' || !['qi', 'sword'].includes(line)) return log
  return markCleared({ ...log, line }, id)
}

/** 原问答没有完整题库留存，以任务明确要求的本命属性完成教学。 */
export function answerQuiz(log: QuestLog, state: GameState, id: string, answer: string): QuestResult<QuestLog> {
  const entry = entryOf(log, id)
  if (!entry || entry.done || questOf(log, id)?.goal.kind !== 'quiz') return fail('没有这个进行中的答题任务')
  if (answer !== state.player.element) return fail('回答不正确，请到人物页面查看自己的本命属性')
  return ok(markCleared(log, id))
}

export const CORE_QI_POINTS = 286000
export const CORE_COMPRESS_SECONDS = 12 * 3600

/** [重建] 最小结丹流程只汇聚本命属性，采用资料中的纯属性压缩时长。 */
export function gatherCoreQi(state: GameState, id: string, amount: number): QuestResult<GameState> {
  const entry = entryOf(state.quests, id)
  if (!entry || entry.done || entry.cleared || questOf(state.quests, id)?.goal.kind !== 'goldenCore') return fail('没有进行中的结丹任务')
  if (!Number.isSafeInteger(amount) || amount <= 0) return fail('请输入正整数真气数量')
  const remaining = CORE_QI_POINTS - (entry.coreQi ?? 0)
  if (amount > remaining) return fail(`本次还可汇聚${remaining}点真气`)
  if ((entry.count ?? 0) + (entry.coreEventId ? 1 : 0) >= 10) return fail('已汇聚足够的真元')
  const index = ELEMENTS.indexOf(state.player.element)
  if (state.player.qi[index]! < amount) return fail('本命真气不足')
  const qi = state.player.qi.map((n, i) => n - (i === index ? amount : 0)) as unknown as FiveQi
  return ok({ ...state, player: { ...state.player, qi, daoxing: state.player.daoxing + amount }, quests: patch(state.quests, id, e => ({ ...e, coreQi: (e.coreQi ?? 0) + amount })) })
}

export function startCoreCompression(state: GameState, id: string): QuestResult<GameState> {
  const entry = entryOf(state.quests, id)
  if (!entry || entry.done || entry.cleared || questOf(state.quests, id)?.goal.kind !== 'goldenCore') return fail('没有进行中的结丹任务')
  if (entry.coreEventId) return fail('真元正在压缩')
  if ((entry.coreQi ?? 0) < CORE_QI_POINTS) return fail(`需要汇聚${CORE_QI_POINTS}点本命真气`)
  const eventId = `quest:core:${id}:${entry.acceptedAt}:${entry.count ?? 0}`
  return ok({ ...state,
    quests: patch(state.quests, id, e => ({ ...e, coreQi: (e.coreQi ?? 0) - CORE_QI_POINTS, coreEventId: eventId })),
    timeline: schedule(state.timeline, { id: eventId, kind: 'cultivate', finishAt: state.clock.gameT + CORE_COMPRESS_SECONDS, payload: { op: 'goldenCore', questId: id } }),
  })
}

/** 只记录实际炼制事件和成功淬炼的状态变化，购买、任务赠送不会计入炼制。 */
export function applyQuestProgress(before: GameState, after: GameState, event?: GameEvent): GameState {
  let log = after.quests
  if (event?.kind === 'cultivate' && event.payload['op'] === 'goldenCore') {
    const id = String(event.payload['questId'])
    const entry = entryOf(log, id)
    if (entry && !entry.done && entry.coreEventId === event.id) {
      log = patch(log, id, e => ({ ...e, count: (e.count ?? 0) + 1, cleared: (e.count ?? 0) + 1 >= 10, coreEventId: undefined }))
    }
  } else if (event?.kind === 'craft') {
    const made = after.player.artifacts.filter(a => !before.player.artifacts.some(b => b.id === a.id))
    for (const e of log.entries) {
      const goal = questOf(log, e.id)?.goal
      if (e.done || goal?.kind !== 'craft') continue
      const count = made.filter(a => a.name === goal.item || (goal.item === '飞剑' && a.kind === 'sword') || (goal.item === '丹药' && a.kind === 'pill')).reduce((sum, a) => sum + a.count, 0)
      if (count) log = patch(log, e.id, x => ({ ...x, count: (x.count ?? 0) + count }))
    }
  } else if (!event) {
    const removed = before.player.artifacts.filter(a => !after.player.artifacts.some(b => b.id === a.id))
    const refined = after.player.artifacts.filter(a => !before.player.artifacts.some(b => b.id === a.id) && removed.filter(b => b.name === a.name && b.quality === a.quality && b.refine === a.refine - 1).length >= 2)
    if (refined.length) log = recordProgress(log, 'refine', refined.length)
  }
  return log === after.quests ? after : { ...after, quests: log }
}

/** 炼制 / 淬炼完成时调用，把件数记到对应任务上。 */
export function recordProgress(
  log: QuestLog,
  kind: 'craft' | 'refine',
  count: number,
  item?: string,
): QuestLog {
  let next = log
  for (const e of log.entries) {
    if (e.done) continue
    const goal = questOf(log, e.id)?.goal
    if (!goal || goal.kind !== kind) continue
    // 「炼制飞剑」与「炼制一把青龙伏魔剑」是两个任务，炼普通剑不该推进后者
    if (goal.kind === 'craft' && item !== undefined && goal.item !== item) continue
    next = patch(next, e.id, (x) => ({ ...x, count: (x.count ?? 0) + count }))
  }
  return next
}

/** 打死某只怪之后调用：把所有盯着这只怪的任务标成「已斩」。 */
export function recordSlain(log: QuestLog, monsterName: string): QuestLog {
  let next = log
  for (const e of log.entries) {
    if (e.done) continue
    const q = questOf(log, e.id)
    if (q?.goal.kind === 'slay' && q.goal.monster.name === monsterName) {
      next = markCleared(next, e.id)
    }
  }
  return next
}

/** 交银两（千金散尽）。银两不够就交多少算多少，与原版「分批交」一致。 */
export function paySilver(
  state: GameState,
  log: QuestLog,
  id: string,
  amount: number,
): QuestResult<{ state: GameState; log: QuestLog }> {
  const entry = entryOf(log, id)
  const q = questOf(log, id)
  if (!entry || entry.done || !q) return fail('没有这个进行中的任务')
  if (q.goal.kind !== 'silver') return fail('该任务不需要交纳银两')
  if (!Number.isSafeInteger(amount) || amount <= 0) return fail('交纳的银两必须为正整数')
  if (state.player.silver < amount) return fail('银两不足')
  const remaining = q.goal.amount - (entry.count ?? 0)
  if (remaining <= 0) return fail('银两已经交齐，请领取任务奖励')
  const paid = Math.min(amount, remaining)
  return ok({
    state: { ...state, player: { ...state.player, silver: state.player.silver - paid } },
    log: patch(log, id, (e) => ({ ...e, count: (e.count ?? 0) + paid })),
  })
}

// ===========================================================================
// 打怪：与 timeline 配合
// ===========================================================================

/**
 * 出击本身由 `battle.ts` 负责（它管飞行耗时、在外上限、断剑与战报）。
 * 任务这边只出两样东西：**打谁**（`questTarget`）和**打赢了之后**（`recordSlain`）。
 * 刻意不引 `battle.ts`，两边只靠这个结构对上 —— 出击流程改了不会牵动任务表。
 */
export type QuestBattleTarget = {
  readonly kind: 'monster'
  readonly name: string
  readonly x: number
  readonly y: number
  readonly attack: number
  readonly agility: number
  readonly hp: number
  readonly element: Monster['element']
}

export const targetOfMonster = (
  m: Monster,
  at: readonly [number, number],
): QuestBattleTarget => ({
  kind: 'monster',
  name: m.name,
  x: at[0],
  y: at[1],
  attack: m.attack,
  agility: m.agility,
  hp: m.life,
  element: m.element,
})

/** 已领取的斩妖任务的出击目标；不是斩妖任务或没领取时返回 null。 */
export function questTarget(log: QuestLog, id: string): QuestBattleTarget | null {
  const entry = entryOf(log, id)
  const goal = questOf(log, id)?.goal
  if (!entry || entry.done || goal?.kind !== 'slay' || !entry.at) return null
  return targetOfMonster(goal.monster, entry.at)
}

/**
 * 战斗事件结算完之后调一次：赢了就把盯着这只怪的任务标成「已斩」。
 * 按 `payload.target.name` 认怪，与 `battle.ts` 的事件载荷对得上，但不依赖它的类型。
 */
export function resolveQuestBattle(log: QuestLog, event: GameEvent, won: boolean): QuestLog {
  if (event.kind !== 'battle' || !won) return log
  const target = event.payload['target'] as { readonly name?: unknown } | undefined
  return typeof target?.name === 'string' ? recordSlain(log, target.name) : log
}

// ===========================================================================
// 交付发奖
// ===========================================================================

/** 当前丹田容量：本体等级算出来的基础容量 + 境界奖励的固定加成。 */
export const questCapacity = (state: GameState, log: QuestLog): number =>
  capacityOf({ ...state, quests: log })

/**
 * 领取奖励（截图 #83 的「领取奖励」按钮）。
 * 真气按丹田上限截断；「充满丹田」这类文字奖励单独处理。
 */
export function claim(
  log: QuestLog,
  state: GameState,
  id: string,
): QuestResult<{ state: GameState; log: QuestLog }> {
  const entry = entryOf(log, id)
  const q = questOf(log, id)
  if (!entry || !q) return fail('没有这个任务')
  if (entry.done) return fail('奖励已经领过了')
  if (!goalMet(q, entry, state)) return fail('任务尚未完成')
  // 炼制、购买都查袖里乾坤上限，发奖这条路以前没查 —— 满背包领奖会把占用顶到 6/5，
  // 之后任何炼制/购买都被拒，玩家还不知道为什么。挡在领取这一步，奖励留着不丢。
  if (q.reward.items?.length && !canAcquireArtifacts(state, q.reward.items.length)) {
    return fail('法宝携带数量已达上限，请先提升袖里乾坤或腾出空位')
  }

  const r = q.reward
  const nextLog: QuestLog = {
    ...log,
    dantianBonus: log.dantianBonus + (r.dantianBonus ?? 0),
    entries: log.entries.map((e) => (e.id === id ? { ...e, done: true } : e)),
  }

  const cap = questCapacity(state, nextLog)
  let qi: FiveQi = state.player.qi
  if (r.qi) qi = addQi(qi, qiRewardFor(r.qi, state.player.element))
  // 「充满丹田」[原文 c/4317]：筑基→辟谷的奖励，五行一次加满
  if (r.note === '充满丹田') qi = addQi(ZERO_QI, [cap, cap, cap, cap, cap] as unknown as FiveQi)

  const artifacts: readonly Artifact[] = r.items
    ? [
        ...state.player.artifacts,
        ...r.items.map(
          (name): Artifact => ({
            id: `quest:${id}:${name}`,
            kind: 'misc',
            name,
            quality: '凡品',
            refine: 0,
            status: '空闲',
            count: 1,
          }),
        ),
      ]
    : state.player.artifacts

  return ok({
    log: nextLog,
    state: {
      ...state,
      player: {
        ...state.player,
        qi: clampQi(qi, cap),
        realm: r.realm ?? state.player.realm,
        artifacts,
      },
    },
  })
}
