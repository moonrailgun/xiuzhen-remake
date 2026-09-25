/**
 * 修炼：经脉 / 本体 / 法术的升级，以及炼器队列。
 *
 * 队列规则是【照原版】（官方新手指南原文）：
 *   「普通用户一次只能进行1项修炼事件，购买VIP功能可以增加1个修炼事件队列，
 *     一个用户最多只能同时进行2个修炼事件（不包括炼器事件）」
 * 炼器事件按类别各自排队：**飞剑与护身可以并行**（官方攻略《护身揭密》原文
 * 「护身可以和飞剑一起炼制」），丹药一次一炉。
 *
 * 数值来自 `src/data/upgrade.ts`（大部分是重建的，逐条标了出处）。
 */

import { schedule, countByKind, type GameEvent, type Timeline } from './timeline.ts'
import { addQi, subQi, canAfford, clampQi, totalQi, type FiveQi, type GameState } from './state.ts'
import { upgradeCost, upgradeSeconds, dantianCapacity } from '../data/upgrade.ts'
import type { Element } from '../data/meridian.ts'

export type CultivateTarget =
  | { readonly system: 'meridian'; readonly index: number }
  | { readonly system: 'body'; readonly index: number }
  | { readonly system: 'skill'; readonly id: string }

/** 普通 1 个修炼队列，VIP +1，最多 2 个。炼器事件不计入。 */
export const BASE_CULTIVATE_SLOTS = 1
export const VIP_EXTRA_SLOTS = 1

export const cultivateSlots = (hasVip: boolean): number =>
  BASE_CULTIVATE_SLOTS + (hasVip ? VIP_EXTRA_SLOTS : 0)

/** 本体项的序号，与 `Player.body` 一致。 */
export const BODY_PARTS = [
  '穷千里目', '炼体成钢', '心静通灵', '袖里乾坤',
  '固本培元', '丹田气海', '手熟无他', '行万里路',
] as const
export const BODY_STEEL = 1 // 炼体成钢：提升经脉与本体升级速度
export const BODY_CALM = 2 // 心静通灵：提升法术修炼速度
export const BODY_DANTIAN = 5 // 丹田气海：真气容量

/** 当前等级。 */
export function levelOf(state: GameState, target: CultivateTarget): number {
  if (target.system === 'meridian') return state.player.meridians[target.index] ?? 0
  if (target.system === 'body') return state.player.body[target.index] ?? 0
  return state.player.skills[target.id] ?? 0
}

export type CultivatePlan = {
  readonly cost: FiveQi
  readonly seconds: number
  readonly fromLevel: number
  readonly toLevel: number
}

/** 算一次升级要花多少、要多久。 */
export function planUpgrade(state: GameState, target: CultivateTarget): CultivatePlan {
  const from = levelOf(state, target)
  const to = from + 1
  const cost = upgradeCost(target.system, to, state.player.element)
  const seconds = upgradeSeconds(target.system, to, {
    steelLevel: state.player.body[BODY_STEEL] ?? 0,
    calmLevel: state.player.body[BODY_CALM] ?? 0,
  })
  return { cost, seconds, fromLevel: from, toLevel: to }
}

export type StartResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string }

/**
 * 开始一项修炼。失败时返回原版的提示语。
 * 原版的两句红字：「修炼队列已满」（截图 #3）、「升级所需真气不足」（截图 #92）。
 */
export function startCultivate(
  state: GameState,
  target: CultivateTarget,
  opts: { readonly hasVip?: boolean } = {},
): StartResult {
  const slots = cultivateSlots(opts.hasVip ?? false)
  if (countByKind(state.timeline, 'cultivate') >= slots) {
    return { ok: false, reason: '修炼队列已满' }
  }

  const plan = planUpgrade(state, target)
  if (!canAfford(state.player.qi, plan.cost)) {
    return { ok: false, reason: '升级所需真气不足' }
  }

  const id = eventIdFor(target)
  if (state.timeline.events.some((e) => e.id === id)) {
    return { ok: false, reason: '该项目已在修炼中' }
  }

  const event: GameEvent = {
    id,
    kind: 'cultivate',
    finishAt: state.clock.gameT + plan.seconds,
    payload: { ...target, toLevel: plan.toLevel },
  }

  return {
    ok: true,
    state: {
      ...state,
      player: {
        ...state.player,
        qi: subQi(state.player.qi, plan.cost),
        // 道行 = 累计消耗的真气（1 点 = 1 时辰）
        daoxing: state.player.daoxing + totalQi(plan.cost),
      },
      timeline: schedule(state.timeline, event),
    },
  }
}

const eventIdFor = (t: CultivateTarget): string =>
  t.system === 'skill' ? `cultivate:skill:${t.id}` : `cultivate:${t.system}:${t.index}`

/** 修炼事件到点：等级 +1。丹田气海升级会改真气上限。 */
export function resolveCultivate(state: GameState, event: GameEvent): GameState {
  const system = event.payload['system'] as CultivateTarget['system']
  const toLevel = event.payload['toLevel'] as number

  if (system === 'meridian') {
    const idx = event.payload['index'] as number
    const meridians = state.player.meridians.map((v, i) => (i === idx ? toLevel : v))
    return { ...state, player: { ...state.player, meridians } }
  }

  if (system === 'body') {
    const idx = event.payload['index'] as number
    const body = state.player.body.map((v, i) => (i === idx ? toLevel : v))
    const player = { ...state.player, body }
    // 丹田变大了，当前真气不必截断；变小不会发生
    return { ...state, player }
  }

  const id = event.payload['id'] as string
  return {
    ...state,
    player: { ...state.player, skills: { ...state.player.skills, [id]: toLevel } },
  }
}

/** 当前丹田容量（单种真气）。 */
export const capacityOf = (state: GameState): number =>
  dantianCapacity(state.player.body[BODY_DANTIAN] ?? 0)

/**
 * 按小时产出真气，并按丹田上限截断。
 * 产量公式见 `src/data/meridian.ts` 的 `hourlyQi`（官方公式）。
 */
export function gainQi(state: GameState, perHour: FiveQi, seconds: number): GameState {
  const cap = capacityOf(state)
  const gained = perHour.map((v) => (v * seconds) / 3600) as unknown as FiveQi
  return {
    ...state,
    player: { ...state.player, qi: clampQi(addQi(state.player.qi, gained), cap) },
  }
}

/** 仙石扣除：先扣附加，再扣普通（官方指南原文）。 */
export function spendCoin(
  state: GameState,
  amount: number,
  opts: { readonly requireNormal?: boolean } = {},
): StartResult {
  const { coin, bonusCoin } = state.player
  if (opts.requireNormal) {
    // 买玩家出售的法宝、高级 VIP 只能用普通仙石
    if (coin < amount) return { ok: false, reason: '普通仙石不足' }
    return { ok: true, state: { ...state, player: { ...state.player, coin: coin - amount } } }
  }
  if (bonusCoin + coin < amount) return { ok: false, reason: '仙石不足' }
  const fromBonus = Math.min(bonusCoin, amount)
  return {
    ok: true,
    state: {
      ...state,
      player: {
        ...state.player,
        bonusCoin: bonusCoin - fromBonus,
        coin: coin - (amount - fromBonus),
      },
    },
  }
}

/** 仙石加速：「半」减半剩余时间（2 仙石），「完」直接完成（10 仙石）。 */
export const SPEEDUP_HALF_COST = 2
export const SPEEDUP_FINISH_COST = 10

export function speedUp(
  state: GameState,
  mode: 'half' | 'finish',
): StartResult {
  const cost = mode === 'half' ? SPEEDUP_HALF_COST : SPEEDUP_FINISH_COST
  const paid = spendCoin(state, cost)
  if (!paid.ok) return paid

  const now = paid.state.clock.gameT
  const events = paid.state.timeline.events.map((e) =>
    e.kind === 'cultivate'
      ? {
          ...e,
          finishAt: mode === 'finish' ? now : now + Math.max(0, (e.finishAt - now) / 2),
        }
      : e,
  )
  return { ok: true, state: { ...paid.state, timeline: { events } } }
}
