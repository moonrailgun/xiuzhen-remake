/**
 * 事件时间线 + 惰性结算。
 *
 * 原版就是"点一下 → 等计时 → 刷新页面"：升一级经脉几十分钟、炼一炉丹 22 小时、
 * 丹田升到 36 级要 1527:46:40。所以不做逐秒模拟，只记录每个事件的**完成时刻**，
 * 打开页面或操作时一次性推进到当前 —— 离线结算与倍速开关因此都是免费的。
 *
 * 关键不变量：
 *  - 事件按 `finishAt`（游戏时间秒）排序结算，不按插入顺序；
 *  - 结算是**纯函数**：同样的 (事件表, 目标时刻) 永远得到同样的结果，不读墙钟、不掷骰子
 *    （需要随机的事件在创建时就把随机结果定好，见 `rng.ts` 的种子随机）；
 *  - 一个事件的完成可能产生新事件（多段移动的下一段），所以要循环推进直到没有可结算的；
 *  - 设上限防止"结算时产生的新事件又立刻到期"造成死循环。
 */

/** 事件种类。对应原版主界面上的四个事件栏。 */
export type EventKind =
  | 'battle' // 战斗事件：斩杀 / 返回
  | 'craft' // 炼器事件：炼制飞剑 / 丹药 / 护身（按类别各自排队，不占修炼队列）
  | 'move' // 移动事件：多段路径，逐段计时
  | 'cultivate' // 修炼事件：经脉 / 本体 / 法术升级（普通 1 个队列，VIP +1）
  | 'market' // 市场：出售真气的上架延迟、购买真气的注入耗时
  | 'raid' // 来袭：NPC 打过来（原版是真人，单机下模拟，见 raid.ts）

export type GameEvent = {
  readonly id: string
  readonly kind: EventKind
  /** 完成时刻（游戏时间秒）。 */
  readonly finishAt: number
  /** 事件载荷，由各系统自己定义。 */
  readonly payload: Readonly<Record<string, unknown>>
}

export type Timeline = {
  readonly events: readonly GameEvent[]
}

export const emptyTimeline = (): Timeline => ({ events: [] })

export function schedule(tl: Timeline, event: GameEvent): Timeline {
  if (tl.events.some((e) => e.id === event.id)) {
    throw new Error(`事件 id 重复：${event.id}`)
  }
  return { events: [...tl.events, event] }
}

export function cancel(tl: Timeline, id: string): Timeline {
  return { events: tl.events.filter((e) => e.id !== id) }
}

/** 某类事件当前有几个在进行中（用于"修炼队列已满"判断）。 */
export const countByKind = (tl: Timeline, kind: EventKind): number =>
  tl.events.filter((e) => e.kind === kind).length

/** 按完成时刻排序后的事件（界面上事件栏就是这个顺序）。 */
export const sorted = (tl: Timeline): readonly GameEvent[] =>
  [...tl.events].sort((a, b) => a.finishAt - b.finishAt || a.id.localeCompare(b.id))

/** 下一个事件的完成时刻，没有事件时返回 null。 */
export function nextFinishAt(tl: Timeline): number | null {
  let min: number | null = null
  for (const e of tl.events) if (min === null || e.finishAt < min) min = e.finishAt
  return min
}

/**
 * 结算一个到期事件，返回新状态。由各系统实现。
 * 返回的 `follow` 是该事件引发的新事件（如多段移动的下一段、炼制完成后的下一炉）。
 */
export type Resolver<S> = (
  state: S,
  event: GameEvent,
) => { readonly state: S; readonly follow?: readonly GameEvent[] }

const MAX_STEPS = 100_000

/**
 * 把时间线推进到 `until`（游戏时间秒），依次结算所有到期事件。
 *
 * @returns 新的状态、新的时间线、以及本次结算掉的事件（用于生成"你离线期间发生了什么"）
 */
export function advanceTo<S>(
  state: S,
  tl: Timeline,
  until: number,
  resolve: Resolver<S>,
): { state: S; timeline: Timeline; resolved: readonly GameEvent[] } {
  let curState = state
  let events = [...tl.events]
  const resolved: GameEvent[] = []

  for (let step = 0; ; step++) {
    if (step > MAX_STEPS) {
      throw new Error(`事件结算超过 ${MAX_STEPS} 步，可能有事件在结算时立刻又到期`)
    }
    // 每轮取"最早到期且 <= until"的那一个。用循环而不是先排序，因为结算会产生新事件。
    let idx = -1
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      if (e.finishAt > until) continue
      const best = idx >= 0 ? events[idx]! : null
      if (!best || e.finishAt < best.finishAt || (e.finishAt === best.finishAt && e.id < best.id)) {
        idx = i
      }
    }
    if (idx < 0) break

    const event = events[idx]!
    events.splice(idx, 1)
    const out = resolve(curState, event)
    curState = out.state
    resolved.push(event)
    if (out.follow?.length) {
      for (const f of out.follow) {
        if (events.some((e) => e.id === f.id)) throw new Error(`后续事件 id 重复：${f.id}`)
        events.push(f)
      }
    }
  }

  return { state: curState, timeline: { events }, resolved }
}
