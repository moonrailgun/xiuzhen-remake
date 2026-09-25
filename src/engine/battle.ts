/**
 * 出击与战斗事件。
 *
 * 【照原版】（17173 老专区《战斗扫盲》原文）：
 *  - 攻击 = 选法术 + 选飞剑 → 生成「斩杀」战斗事件；
 *  - **飞剑飞过去要时间，打完飞回来也要时间**；
 *  - 同一人初期最多同时控制 **5 把**飞剑在外（万剑诀每级 +1）；
 *  - 视野内的玩家可攻击，**怪物不限距离**；
 *  - 战胜继续前往，战败直接返回；
 *  - 赢了抢对方真气（超出固本暗仓的部分）。
 *
 * 【重建】：飞行耗时的具体公式。已知「速度」是飞剑的一项属性、
 * 「向某地御剑飞行所需时间 = 两地直线距离 / 飞剑速度」[原文，指的是御剑飞行移动]，
 * 这里把出击的飞行时间也按同一形式算。
 */

import { schedule, type GameEvent } from './timeline.ts'
import { resolveBattle, type CombatSword } from './combat.ts'
import { addQi, subQi, type FiveQi, type GameState, type MailItem } from './state.ts'
import { distance } from '../data/world.ts'
import { lootFrom } from './loot.ts'
import { panelStat, type Quality } from '../data/artifacts.ts'

/** 战斗事件的四种状态，对应原版事件栏的四种句式。 */
export type BattlePhase = 'outbound' | 'fighting' | 'returning'

export type BattleTarget = {
  readonly kind: 'monster' | 'player'
  readonly name: string
  readonly x: number
  readonly y: number
  /** 怪物属性（原版任务详情页给的就是这三项 + 属性） */
  readonly attack: number
  readonly agility: number
  readonly hp: number
  readonly element: CombatSword['element']
}

/** 出击用的飞剑（从背包里选）。 */
export type LaunchSword = {
  readonly id: string
  readonly name: string
  readonly quality: Quality
  readonly refine: number
  /** [废品, 极品] 区间，取自 tools/fixtures/swords.json */
  readonly attack: readonly [number, number]
  readonly durability: readonly [number, number]
  readonly speed: number
  readonly agility: number
  readonly element: CombatSword['element']
}

/** 同时在外的飞剑上限：初期 5 把，万剑诀每级 +1。[原文] */
export const BASE_SWORDS_OUT = 5
export const swordsOutLimit = (wanjianLevel: number): number => BASE_SWORDS_OUT + wanjianLevel

/** 在外的飞剑数（所有未结束的战斗事件里的剑加起来）。 */
export function swordsOut(state: GameState): number {
  return state.timeline.events
    .filter((e) => e.kind === 'battle')
    .reduce((sum, e) => sum + ((e.payload['swordIds'] as string[])?.length ?? 0), 0)
}

/**
 * 飞行耗时（秒）。[重建]
 * 原文只给了御剑飞行移动的公式「两地直线距离 / 飞剑速度」，出击按同一形式算。
 * 速度越高飞得越快；同一批剑取最慢的那把（要一起到）。
 */
export function flightSeconds(dist: number, speed: number): number {
  return Math.max(60, Math.round((dist * 3600) / Math.max(1, speed)))
}

export type LaunchResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string }

/**
 * 出击。生成一个战斗事件，倒计时是飞过去的时间。
 */
export function launch(
  state: GameState,
  target: BattleTarget,
  swords: readonly LaunchSword[],
  opts: { readonly wanjianLevel?: number; readonly sightRange?: number } = {},
): LaunchResult {
  if (swords.length === 0) return { ok: false, reason: '请选择出击的飞剑' }

  const limit = swordsOutLimit(opts.wanjianLevel ?? 0)
  if (swordsOut(state) + swords.length > limit) {
    return { ok: false, reason: `最多只能同时控制 ${limit} 把飞剑` }
  }

  const dist = distance(state.player.x, state.player.y, target.x, target.y)
  // 玩家要在视野内才能打；怪物不限距离 [原文]
  if (target.kind === 'player' && dist > (opts.sightRange ?? 4)) {
    return { ok: false, reason: '目标不在视野范围内，需要先用九宫飞星法推算其位置' }
  }

  const slowest = Math.min(...swords.map((s) => s.speed))
  const seconds = flightSeconds(dist, slowest)

  // id 要连同序号：同一时刻可以对同一个目标连着放两批剑（原版的「支援」就是这样），
  // 只用「时刻+目标名」会撞 id。
  const seq = state.timeline.events.filter((e) => e.kind === 'battle').length
  const event: GameEvent = {
    id: `battle:${state.clock.gameT}:${seq}:${target.name}`,
    kind: 'battle',
    finishAt: state.clock.gameT + seconds,
    payload: {
      phase: 'outbound' satisfies BattlePhase,
      target,
      swords,
      swordIds: swords.map((s) => s.id),
    },
  }
  return { ok: true, state: { ...state, timeline: schedule(state.timeline, event) } }
}

/** 把出击飞剑换算成参战单位（面板值 = 基础 × 品质 × 2^淬炼）。 */
function toCombat(s: LaunchSword): CombatSword {
  return {
    id: s.id,
    name: s.name,
    element: s.element,
    attack: panelStat(s.attack, s.quality, s.refine),
    durability: panelStat(s.durability, s.quality, s.refine),
    agility: panelStat([s.agility, s.agility], s.quality, s.refine),
  }
}

function targetToCombat(t: BattleTarget): CombatSword {
  return { id: `target:${t.name}`, name: t.name, element: t.element, attack: t.attack, durability: t.hp, agility: t.agility }
}

export type BattleOutcome = {
  readonly won: boolean
  readonly lostSwordIds: readonly string[]
  readonly loot: FiveQi
  readonly report: MailItem
}

/**
 * 战斗事件到点。
 *  - outbound：飞到了 → 结算 → 生成战报 → 排「返回」事件；
 *  - returning：飞剑回到身上，事件结束。
 */
export function resolveBattleEvent(
  state: GameState,
  event: GameEvent,
): { state: GameState; follow?: GameEvent[] } {
  const phase = event.payload['phase'] as BattlePhase
  const target = event.payload['target'] as BattleTarget
  const swords = event.payload['swords'] as LaunchSword[]

  if (phase === 'returning') {
    // 飞剑归位，没有额外结算
    return { state }
  }

  const mine = swords.map(toCombat)
  const theirs = [targetToCombat(target)]
  const result = resolveBattle(mine, theirs)

  const lost = result.attacker.filter((o) => o.broken).map((o) => o.id)
  const won = result.defender.every((o) => o.broken)

  // 赢了抢真气。打玩家时照原版规则：**只有超出对方固本培元暗仓的部分**抢得走；
  // 打怪没有暗仓，按生命值折算一份战利品 [重建]。
  const loot: FiveQi = !won
    ? ([0, 0, 0, 0, 0] as unknown as FiveQi)
    : target.kind === 'player'
      ? lootFrom(
          (event.payload['targetQi'] as FiveQi) ?? ([0, 0, 0, 0, 0] as unknown as FiveQi),
          (event.payload['targetRootLevel'] as number) ?? 0,
        ).taken
      : ([target.hp * 2, target.hp * 2, target.hp * 2, target.hp * 2, target.hp * 2] as unknown as FiveQi)

  const report = buildReport(state, target, swords, result, won)

  const survivors = swords.filter((s) => !lost.includes(s.id))
  const next: GameEvent[] = survivors.length
    ? [{
        id: `${event.id}:back`,
        kind: 'battle',
        finishAt: event.finishAt + flightSeconds(
          distance(state.player.x, state.player.y, target.x, target.y),
          Math.min(...survivors.map((s) => s.speed)),
        ),
        payload: { phase: 'returning' satisfies BattlePhase, target, swords: survivors, swordIds: survivors.map((s) => s.id) },
      }]
    : []

  return {
    state: {
      ...state,
      player: {
        ...state.player,
        qi: addQi(state.player.qi, loot),
        // 断掉的剑从背包里移除
        artifacts: state.player.artifacts.filter((a) => !lost.includes(a.id)),
      },
      mail: [report, ...state.mail].slice(0, 200),
    },
    follow: next,
  }
}

/**
 * 战报。格式照原版（`docs/research/03-forum-verbatim-mining.md` §1.2）：
 * 主题写作 `{攻}攻击{防}`、发信人「系统」、开场白一字不差、
 * 正文是四列表（攻击/耐久/受到伤害/结果），结果只有「完好无损」「惨被斩断」两种。
 */
export const BATTLE_INTRO = '双方的法宝交缠在一起拼斗……终于分出结果来了！'

function buildReport(
  state: GameState,
  target: BattleTarget,
  swords: readonly LaunchSword[],
  result: ReturnType<typeof resolveBattle>,
  won: boolean,
): MailItem {
  const rows = swords.map((s, i) => {
    const o = result.attacker[i]
    const c = toCombat(s)
    return {
      name: `${s.quality}${s.name}${s.refine > 0 ? `+${s.refine}` : ''}`,
      attack: c.attack,
      durability: c.durability,
      damage: o?.damageTaken ?? 0,
      result: o?.broken ? '惨被斩断' : '完好无损',
    }
  })

  return {
    id: `mail:${state.clock.gameT}:${target.name}`,
    subject: `${state.player.name}攻击${target.name}`,
    from: '系统',
    at: state.clock.gameT,
    read: false,
    kind: 'battle',
    body: { intro: BATTLE_INTRO, rows, won, target: target.name },
  }
}

// ===========================================================================
// 求援与支援
// ===========================================================================
//
// 原文（17173 老专区《战斗扫盲》）：
//   「求援」就是输入一个朋友的名字，把这个战斗事件通过消息发送给他，
//   他收到消息后就也可以看见这个战斗事件，这样他就可以点选「支援」来帮助你。
//   「支援」就是继续丢飞剑过去帮忙……如果支援的飞剑可以及时赶到，
//   那就能够和那把飞剑一起战斗。
//   只要两把剑还在缠斗，第三把飞剑赶到，缠斗的时间就会根据第三把剑的敏捷延长，
//   而且第三把剑也会加入缠斗，在计算伤害的时候一起计算。
//   如果支援的剑赶不及，就会根据战斗的结果决定是否返回（败了就直接回来了，
//   赢了的话还会继续赶过去）。
//
// 「自己支援自己」是原版明确提到的玩法：「一开始打百妖老是失败的同学
// 不妨多造几把剑自己支援自己」。

/** 求援：把战斗事件发给某人，对方就能看到并支援。 */
export function requestHelp(
  state: GameState,
  eventId: string,
  friendName: string,
): { state: GameState; ok: boolean; reason?: string } {
  const ev = state.timeline.events.find((e) => e.id === eventId && e.kind === 'battle')
  if (!ev) return { state, ok: false, reason: '这场战斗已经结束了' }

  const mail: MailItem = {
    id: `help:${state.clock.gameT}:${eventId}`,
    // 原版求援是把事件通过消息发过去
    subject: `${state.player.name}请求援手`,
    from: state.player.name,
    at: state.clock.gameT,
    read: false,
    kind: 'player',
    body: {
      kind: '求援',
      eventId,
      target: (ev.payload['target'] as BattleTarget).name,
      to: friendName,
    },
  }
  return { state: { ...state, mail: [mail, ...state.mail].slice(0, 200) }, ok: true }
}

/**
 * 支援：往已有的战斗里再丢几把剑。
 *
 * 赶得上（在缠斗结束前到）就一起结算，并按新剑的敏捷延长缠斗时间；
 * 赶不上则按战斗结果决定去留。
 */
export function reinforce(
  state: GameState,
  eventId: string,
  swords: readonly LaunchSword[],
  opts: { readonly wanjianLevel?: number } = {},
): LaunchResult {
  if (swords.length === 0) return { ok: false, reason: '请选择支援的飞剑' }

  const ev = state.timeline.events.find((e) => e.id === eventId && e.kind === 'battle')
  if (!ev) return { ok: false, reason: '这场战斗已经结束了' }
  if ((ev.payload['phase'] as BattlePhase) === 'returning') {
    return { ok: false, reason: '飞剑已经在返回途中' }
  }

  const limit = swordsOutLimit(opts.wanjianLevel ?? 0)
  if (swordsOut(state) + swords.length > limit) {
    return { ok: false, reason: `最多只能同时控制 ${limit} 把飞剑` }
  }

  const target = ev.payload['target'] as BattleTarget
  const dist = distance(state.player.x, state.player.y, target.x, target.y)
  const arriveAt =
    state.clock.gameT + flightSeconds(dist, Math.min(...swords.map((s) => s.speed)))

  // 赶得上：并进原事件，并按新剑的敏捷延长缠斗
  if (arriveAt <= ev.finishAt) {
    const merged = [...(ev.payload['swords'] as LaunchSword[]), ...swords]
    const extraTangle = swords.reduce((sum, s) => sum + s.agility, 0)
    const events = state.timeline.events.map((e) =>
      e.id === eventId
        ? {
            ...e,
            finishAt: e.finishAt + extraTangle,
            payload: { ...e.payload, swords: merged, swordIds: merged.map((s) => s.id) },
          }
        : e,
    )
    return { ok: true, state: { ...state, timeline: { events } } }
  }

  // 赶不上：单独排一个事件，到点时那场已经结束，按结果处理
  const seq = state.timeline.events.filter((e) => e.kind === 'battle').length
  return {
    ok: true,
    state: {
      ...state,
      timeline: schedule(state.timeline, {
        id: `battle:${state.clock.gameT}:${seq}:${target.name}`,
        kind: 'battle',
        finishAt: arriveAt,
        payload: {
          phase: 'outbound' satisfies BattlePhase,
          target,
          swords,
          swordIds: swords.map((s) => s.id),
          lateReinforce: true,
        },
      }),
    },
  }
}
