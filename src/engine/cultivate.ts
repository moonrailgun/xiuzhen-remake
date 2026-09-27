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
import { addQi, subQi, canAfford, clampQi, totalQi, REALMS, type FiveQi, type GameState } from './state.ts'
import { upgradeCost, upgradeSeconds, dantianCapacity, BASE_DANTIAN_MAX_LEVEL } from '../data/upgrade.ts'
import {
  MERIDIANS,
  MAX_LEVEL as MERIDIAN_MAX_LEVEL,
  MAX_LEVEL_BEFORE_XINDONG as MERIDIAN_MAX_BEFORE_XINDONG,
  type Element,
} from '../data/meridian.ts'
import { SECRET_SKILLS } from '../data/secrets.ts'
import { SKILL_TREES } from '../data/skills.ts'

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

/**
 * 丹田气海的等级上限。其余 7 项本体按经脉的满级 20 处理
 * 基准期上限缺表，丹田暂重建为30；旧档的更高等级与容量保留。
 */
export const BODY_MAX_LEVEL = 20
export const DANTIAN_MAX_LEVEL = BASE_DANTIAN_MAX_LEVEL

/**
 * 这一项还能不能再升。
 *
 * 以前只有法术查上限，经脉和本体直接放行 —— 升到 21 级要花上百万真气、几十游戏天，
 * 而 `multiplier()` / `vaultCapacity()` 都在 20 级夹住，**收益整整是零**。
 * 经脉另有一条原文规则：心动期之前封顶 13 级（`meridian.ts` 的 MAX_LEVEL_BEFORE_XINDONG）。
 */
export function levelCapBlockReason(state: GameState, target: CultivateTarget): string | undefined {
  if (target.system === 'skill') return undefined
  // 序号越界必须挡住：`levelOf` 会返回 0（`?? 0`），等级上限也就随便过，
  // 于是排出一个 index=99 的修炼事件 —— `validateGameState` 不收它，
  // 从那一刻起**每一次自动存档都会抛错**，客户端还会把它说成「浏览器空间不足」。
  const slots = target.system === 'meridian' ? MERIDIANS.length : BODY_PARTS.length
  if (!Number.isInteger(target.index) || target.index < 0 || target.index >= slots) {
    return '没有这一项可以修炼'
  }
  const now = levelOf(state, target)
  if (target.system === 'meridian') {
    const beforeXindong = REALMS.indexOf(state.player.realm) < REALMS.indexOf('心动期')
    const cap = beforeXindong ? MERIDIAN_MAX_BEFORE_XINDONG : MERIDIAN_MAX_LEVEL
    if (now >= cap) {
      return beforeXindong ? `经脉在心动期之前最高 ${cap} 级` : `经脉已修炼至上限 ${cap} 级`
    }
    return undefined
  }
  const cap = target.index === BODY_DANTIAN ? DANTIAN_MAX_LEVEL : BODY_MAX_LEVEL
  return now >= cap ? `${BODY_PARTS[target.index] ?? '该项本体'}已修炼至上限 ${cap} 级` : undefined
}

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
  const context = { meridianGroup: target.system === 'meridian' ? MERIDIANS[target.index]?.group : undefined,
    bodyPart: target.system === 'body' ? BODY_PARTS[target.index] : undefined }
  const cost = upgradeCost(target.system, to, state.player.element, target.system === 'skill' ? target.id : undefined, context)
  const seconds = upgradeSeconds(target.system, to, {
    ...context,
    steelLevel: state.player.body[BODY_STEEL] ?? 0,
    calmLevel: state.player.body[BODY_CALM] ?? 0,
    skillId: target.system === 'skill' ? target.id : undefined,
  })
  return { cost, seconds, fromLevel: from, toLevel: to }
}

/** 前置与等级上限共用法术页的规则；未知法术不能凭字符串获得。 */
export function skillUpgradeBlockReason(state: GameState, id: string): string | undefined {
  const secret = SECRET_SKILLS.find(n => n.name === id)
  if (secret) {
    const level = state.player.skills[id] ?? 0
    return level < 1 ? '需要先学习这本秘笈' : level >= secret.cap ? '该法术已修炼至上限' : undefined
  }
  const nodes = Object.values(SKILL_TREES).flat()
  const node = nodes.find((n) => n.name === id)
  if (!node) return '没有这门法术'
  if (node.school && node.school !== state.player.school) return `${node.name}是${node.school}专属法术`
  if ((state.player.skills[id] ?? 0) >= node.cap) return '该法术已修炼至上限'
  for (const requirement of node.requires ?? []) {
    const parent = nodes.find((n) => n.id === requirement.id)!
    if ((state.player.skills[parent.name] ?? 0) < requirement.level) {
      return `需要先将${parent.name}修炼至${requirement.level}级`
    }
  }
  return undefined
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
  if (target.system === 'skill') {
    const reason = skillUpgradeBlockReason(state, target.id)
    if (reason) return { ok: false, reason }
  }
  const capped = levelCapBlockReason(state, target)
  if (capped) return { ok: false, reason: capped }
  const slots = cultivateSlots(opts.hasVip ?? state.player.vip)
  // 结丹的「压缩真元」虽然也排成 cultivate 事件，但**不占修炼队列**。
  // 队列规则的原文是「普通用户一次只能进行 1 项修炼事件……**不包括炼器事件**」
  // （官方新手指南），明确点了炼器，对结丹只字未提 —— 结丹是 2009-01 才开的，
  // 那句话写在它之前。占队列的话，非 VIP 结丹期间 10 轮 × 12 小时 = 120 游戏小时
  // 连一条经脉都升不了，这个惩罚没有任何依据。[重建：按炼器同例处理]
  const inQueue = state.timeline.events
    .filter((e) => e.kind === 'cultivate' && e.payload['op'] !== 'goldenCore')
  if (inQueue.length >= slots) {
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
    // 50102-p1.txt：普通VIP是串行等待，第二项在第一项之后完成。
    finishAt: Math.max(state.clock.gameT, ...inQueue.map(e => e.finishAt)) + plan.seconds,
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
  dantianCapacity(state.player.body[BODY_DANTIAN] ?? 0) + state.quests.dantianBonus

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
  // 「所有修炼事件」是原版逐字（付费页 pay=10/11 的说明），所以确实是一次加速全部。
  // 但结丹的「压缩真元」只是借用了 cultivate 这个 kind，`startCultivate` 已经把它
  // 排除在修炼队列之外，这里同样排除 —— 否则 10 仙石就跳过整套 10 轮结丹。
  const affected = (e: GameEvent): boolean => e.kind === 'cultivate' && e.payload['op'] !== 'goldenCore'
  // 队列空着也照扣仙石是纯亏，先查再付。
  if (!state.timeline.events.some(affected)) return { ok: false, reason: '没有正在进行的修炼事件' }
  const paid = spendCoin(state, cost)
  if (!paid.ok) return paid

  const now = paid.state.clock.gameT
  const events = paid.state.timeline.events.map((e) =>
    affected(e)
      ? {
          ...e,
          finishAt: mode === 'finish' ? now : now + Math.max(0, (e.finishAt - now) / 2),
        }
      : e,
  )
  events.sort((a, b) => a.finishAt - b.finishAt)
  return { ok: true, state: { ...paid.state, timeline: { events } } }
}
