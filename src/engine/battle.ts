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
import { resolveBattle, tangleDuration, combatDamage, absorbedLoot, type CombatSword } from './combat.ts'
import { addQi, totalQi, ZERO_QI, type FiveQi, type GameState, type MailItem, clampQi } from './state.ts'
import { capacityOf } from './cultivate.ts'
import { distance } from '../data/world.ts'
import { panelStat, type Quality } from '../data/artifacts.ts'
import { npcAt, patchNpc } from './npc.ts'
import { swordByName } from '../data/swords.ts'

/** 战斗事件的四种状态，对应原版事件栏的四种句式。 */
export type BattlePhase = 'outbound' | 'fighting' | 'returning'

export type BattleTarget = {
  readonly kind: 'monster' | 'player'
  /** NPC稳定标识；旧存档仅在名字唯一时回退。 */
  readonly npcId?: number
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
  /** 出击时快照，途中修炼不会追溯改变已出击飞剑。 */
  readonly launchedStats?: LaunchedSwordStats
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

export type SwordArt = '碎玉剑法' | '小周天剑法' | '吸星剑法'
export type LaunchOptions = { readonly wanjianLevel?: number; readonly sightRange?: number; readonly swordArt?: SwordArt }

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
  opts: LaunchOptions = {},
): LaunchResult {
  if (swords.length === 0) return { ok: false, reason: '请选择出击的飞剑' }

  const selectionError = swordSelectionError(state, swords) ?? swordArtError(state, opts.swordArt)
  if (selectionError) return { ok: false, reason: selectionError }
  swords = prepareSwords(state, swords, opts.swordArt)
  const limit = swordsOutLimit(opts.wanjianLevel ?? state.player.skills['万剑诀'] ?? 0)
  if (swordsOut(state) + swords.length > limit) {
    return { ok: false, reason: `最多只能同时控制 ${limit} 把飞剑` }
  }

  const dist = distance(state.player.x, state.player.y, target.x, target.y)
  // 玩家要在视野内才能打；怪物不限距离 [原文]
  if (target.kind === 'player' && dist > (opts.sightRange ?? 4)) {
    return { ok: false, reason: '目标不在视野范围内，需要先用九宫飞星法推算其位置' }
  }

  const slowest = Math.min(...swords.map((s) => statsOf(s).speed))
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
  return { ok: true, state: { ...swordStatus(state, swords, '斩杀中'), timeline: schedule(state.timeline, event) } }
}

export type LaunchedSwordStats = {
  readonly instantAttackRatio?: number
  readonly absorb?: number
  readonly noReturn?: boolean
  readonly attack: number
  readonly durability: number
  readonly agility: number
  readonly speed: number
}

/** 被动仅出击生效。攻耐每级1%由战报反推（02 §3）；速度幅度按同量级重建。 */
export function launchedSwordStats(sword: LaunchSword, skills: Readonly<Record<string, number>>, art?: SwordArt): LaunchedSwordStats {
  const bonus = (name: string) => 1 + Math.max(0, Math.min(20, skills[name] ?? 0)) / 100
  return {
    attack: Math.floor(panelStat(sword.attack, sword.quality, sword.refine) * bonus('心剑诀') * (art === '碎玉剑法' ? 2 : art === '小周天剑法' ? 0.25 : 1)),
    durability: Math.floor(panelStat(sword.durability, sword.quality, sword.refine) * bonus('身剑诀') * (art === '吸星剑法' ? 0.25 : 1)),
    agility: panelStat([sword.agility, sword.agility], sword.quality, sword.refine) * (art === '小周天剑法' ? 2 : 1),
    absorb: panelStat(swordByName(sword.name)?.absorb ?? [0, 0], sword.quality, sword.refine) * (art === '吸星剑法' ? 2 : 1),
    noReturn: art === '碎玉剑法',
    speed: sword.speed * bonus('大周天剑法'),
    // Lv1 2% 见 article-105340-p1；逐级线性增长为重建。
    instantAttackRatio: Math.max(0, Math.min(20, skills['剑心通明'] ?? 0)) * 0.02,
  }
}

const statsOf = (sword: LaunchSword): LaunchedSwordStats => ({ ...launchedSwordStats(sword, {}), ...sword.launchedStats })
export const prepareSwords = (state: GameState, swords: readonly LaunchSword[], art?: SwordArt): LaunchSword[] =>
  swords.map((sword) => ({ ...sword, launchedStats: launchedSwordStats(sword, state.player.skills, art) }))

export function swordArtError(state: GameState, art?: SwordArt): string | null {
  if (!art) return null
  if (!['碎玉剑法', '小周天剑法', '吸星剑法'].includes(art)) return '未知剑术'
  return (state.player.skills[art] ?? 0) > 0 ? null : `尚未学会${art}`
}

function swordStatus(state: GameState, swords: readonly LaunchSword[], status: string): GameState {
  const ids = new Set(swords.map((sword) => sword.id))
  return { ...state, player: { ...state.player, artifacts: state.player.artifacts.map((artifact) =>
    ids.has(artifact.id) ? { ...artifact, status } : artifact) } }
}

function swordSelectionError(state: GameState, swords: readonly LaunchSword[]): string | null {
  const out = new Set(state.timeline.events.filter((event) => event.kind === 'battle')
    .flatMap((event) => event.payload['swordIds'] as string[] ?? []))
  if (new Set(swords.map((sword) => sword.id)).size !== swords.length || swords.some((sword) =>
    out.has(sword.id) || state.player.artifacts.some((artifact) => artifact.id === sword.id && artifact.status !== '空闲'))) {
    return '只能选择空闲且不重复的飞剑'
  }
  const unmet = swords.map((sword) => swordByName(sword.name))
    .find((sword) => sword && sword.wieldLevel > (state.player.skills['御剑术'] ?? 0))
  return unmet ? `驱使${unmet.name}需要御剑术${unmet.wieldLevel}级` : null
}

/** 旧存档没有出击快照时沿用原面板值。 */
function toCombat(s: LaunchSword, kind?: BattleTarget['kind']): CombatSword {
  return { id: s.id, name: s.name, element: s.element, ...statsOf(s),
    ...(kind === 'monster' ? { instantAttackRatio: 0 } : {}) }
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

/** 幸存飞剑在完成返回事件时才重新可用。 */
function returnEvent(state: GameState, event: GameEvent, target: BattleTarget, swords: readonly LaunchSword[], loot: FiveQi = ZERO_QI): GameEvent[] {
  if (!swords.length) return []
  return [{
    id: `${event.id}:back`,
    kind: 'battle',
    finishAt: event.finishAt + flightSeconds(distance(state.player.x, state.player.y, target.x, target.y),
      Math.min(...swords.map((sword) => statsOf(sword).speed))),
    payload: { phase: 'returning' satisfies BattlePhase, target, swords, swordIds: swords.map((sword) => sword.id), loot },
  }]
}

/** 飞到→缠斗→结算→返航；只有缠斗结束才产生outcome（供任务结算）。 */
export function resolveBattleEvent(
  state: GameState,
  event: GameEvent,
): { state: GameState; follow?: GameEvent[]; outcome?: BattleOutcome } {
  const phase = event.payload['phase'] as BattlePhase
  const target = event.payload['target'] as BattleTarget
  const swords = event.payload['swords'] as LaunchSword[]

  if (phase === 'returning') {
    const returned = swordStatus(state, swords, '空闲')
    const loot = (event.payload['loot'] as FiveQi | undefined) ?? ZERO_QI
    // 吸回来的真气同样**受丹田上限约束**。不截断的话会先溢出到上限的几十倍、
    // 而且那部分能立刻花掉（等于绕过丹田上限），下一次 gainQi 再把它悄悄抹平 ——
    // 玩家只看到真气凭空蒸发。注入/挂单退回/任务奖励/产量四处都截断了，这里漏了。
    const cap = capacityOf(returned)
    return {
      state: {
        ...returned,
        player: { ...returned.player, qi: clampQi(addQi(returned.player.qi, loot), cap) },
      },
    }
  }

  if (phase === 'outbound') {
    if (event.payload['lateReinforce']) {
      const source = state.mail.find((mail) => mail.kind === 'battle' && mail.body['eventId'] === event.payload['sourceBattleId'])
      // 原战败则直接回；怪物已被原队击杀不能重复领战利品。
      // 旧存档未记录来源或原信件已删除时安全返航，不凭空另开战斗。
      if (!source?.body['won'] || target.kind === 'monster') {
        return { state: swordStatus(state, swords, '返回中'), follow: returnEvent(state, event, target, swords) }
      }
    }
    return {
      // 缠斗阶段的**法宝状态**原版逐字是「绞杀中...」（03 §1.12 [原文]，09b §156 真实 DOM）。
      // 「缠斗」只出现在事件标题句「在(x,y)缠斗 剩余…结束」里，不是状态词。
      state: swordStatus(state, swords, '绞杀中'),
      follow: [{ ...event, finishAt: event.finishAt + tangleDuration(swords.map(s => toCombat(s, target.kind)), [targetToCombat(target)]),
        payload: { ...event.payload, phase: 'fighting' satisfies BattlePhase } }],
    }
  }

  const result = resolveBattle(swords.map(s => toCombat(s, target.kind)), [targetToCombat(target)])
  const playerOutcomes = result.attacker.map(o => swords.some(s => s.id === o.id && statsOf(s).noReturn) ? { ...o, broken: true } : o)
  const lost = playerOutcomes.filter((outcome) => outcome.broken).map((outcome) => outcome.id)
  const won = result.defender.every((outcome) => outcome.broken)
  // 战利品是**飞剑驮回来的**：一把都没活着回来就没有返航事件，也就没有东西能入账。
  // 这时还照样去扣 NPC 的库存，那点真气就凭空蒸发了（对方少了，玩家没多）。
  const anySurvivor = swords.some((sword) => !lost.includes(sword.id))
  const capacity = swords.filter(s => !lost.includes(s.id)).reduce((sum, s) => sum + (statsOf(s).absorb ?? 0), 0)
  let loot: FiveQi = ZERO_QI
  let npc = state.npc
  if (won && anySurvivor && target.kind === 'player') {
    const matches = state.npc.bases.filter((base) => target.npcId !== undefined ? base.id === target.npcId : base.name === target.name)
    const base = matches.length === 1 ? matches[0] : undefined
    if (base) {
      // 与九宫飞星保持同一NPC状态及五行/暗仓推导，不重复使用出击时的库存快照。
      const current = npcAt(state.npc, base, event.finishAt, state.worldSeed)
      const qi = Array(5).fill(Math.floor(current.qi / 5)) as unknown as FiveQi
      loot = absorbedLoot(qi, Math.max(0, Math.floor(current.daoxing / 20000)), capacity)
      const previous = npc.patches[base.id]
      npc = patchNpc(npc, base.id, { qiLost: (previous?.qiLost ?? 0) + totalQi(loot) })
    } else {
      // 兼容旧版已保存的显式战利品载荷。
      loot = absorbedLoot((event.payload['targetQi'] as FiveQi) ?? ZERO_QI, (event.payload['targetRootLevel'] as number) ?? 0, capacity)
    }
  } else if (won && anySurvivor) {
    // 怪物没有暗仓，按生命折算战利品 [重建]。
    loot = Array(5).fill(target.hp * 2) as unknown as FiveQi
  }

  const report = buildReport(state, target, swords, { ...result, attacker: playerOutcomes }, won, event)
  const survivors = swords.filter((sword) => !lost.includes(sword.id))
  const nextState = swordStatus({
    ...state,
    npc,
    player: { ...state.player, artifacts: combatDamage(state.player.artifacts, playerOutcomes) },
    mail: [report, ...state.mail].slice(0, 200),
  }, survivors, '返回中')
  return {
    state: nextState,
    follow: returnEvent(state, event, target, survivors, loot),
    outcome: { won, lostSwordIds: lost, loot, report },
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
  event: GameEvent,
): MailItem {
  const rows = swords.map((s, i) => {
    const o = result.attacker[i]
    const c = toCombat(s)
    return {
      name: `${s.quality}${s.name}${s.refine > 0 ? `+${s.refine}` : ''}`,
      // **打印有效值（面板 + 相生），不是面板值。**
      // 伤害是按有效耐久截断的，打印面板耐久会出现「受到伤害 130 / 耐久 100 / 完好无损」
      // 这种自相矛盾的行；原版战报本身也印的是有效值 —— 对同一战报里同名同品质、
      // 只差淬炼的剑做拟合，452 组里纯 `基础×2^淬炼` 只有 1 组吻合，
      // 带一个与淬炼无关的常数项的有 272 组，那个常数正是相生加成的形态。
      attack: o?.attack ?? Math.floor(c.attack),
      durability: o?.durability ?? Math.floor(c.durability),
      damage: o?.damageTaken ?? 0,
      result: o?.broken ? '惨被斩断' : '完好无损',
    }
  })

  return {
    id: `mail:${event.id}`,
    subject: `${state.player.name}攻击${target.name}`,
    from: '系统',
    at: event.finishAt,
    read: false,
    kind: 'battle',
    body: { intro: BATTLE_INTRO, rows, won, target: target.name, eventId: event.id },
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
  opts: LaunchOptions = {},
): LaunchResult {
  if (swords.length === 0) return { ok: false, reason: '请选择支援的飞剑' }

  const ev = state.timeline.events.find((e) => e.id === eventId && e.kind === 'battle')
  if (!ev) return { ok: false, reason: '这场战斗已经结束了' }
  if ((ev.payload['phase'] as BattlePhase) === 'returning') {
    return { ok: false, reason: '飞剑已经在返回途中' }
  }

  const selectionError = swordSelectionError(state, swords) ?? swordArtError(state, opts.swordArt)
  if (selectionError) return { ok: false, reason: selectionError }
  swords = prepareSwords(state, swords, opts.swordArt)
  const limit = swordsOutLimit(opts.wanjianLevel ?? state.player.skills['万剑诀'] ?? 0)
  if (swordsOut(state) + swords.length > limit) {
    return { ok: false, reason: `最多只能同时控制 ${limit} 把飞剑` }
  }

  const target = ev.payload['target'] as BattleTarget
  const dist = distance(state.player.x, state.player.y, target.x, target.y)
  const arriveAt =
    state.clock.gameT + flightSeconds(dist, Math.min(...swords.map((s) => statsOf(s).speed)))

  // 赶得上：并进原事件，并按新剑的敏捷延长缠斗
  const fighting = ev.payload['phase'] === 'fighting'
  const fightEnd = ev.finishAt + (fighting ? 0 : tangleDuration((ev.payload['swords'] as LaunchSword[]).map(s => toCombat(s, target.kind)), [targetToCombat(target)]))
  if (arriveAt <= fightEnd) {
    const merged = [...(ev.payload['swords'] as LaunchSword[]), ...swords]
    const extraTangle = swords.reduce((sum, s) => sum + statsOf(s).agility, 0)
    const events = state.timeline.events.map((e) =>
      e.id === eventId
        ? {
            ...e,
            finishAt: e.finishAt + (fighting ? extraTangle : 0),
            payload: { ...e.payload, swords: merged, swordIds: merged.map((s) => s.id) },
          }
        : e,
    )
    return { ok: true, state: { ...swordStatus(state, swords, '斩杀中'), timeline: { events } } }
  }

  // 赶不上：单独排一个事件，到点时那场已经结束，按结果处理
  const seq = state.timeline.events.filter((e) => e.kind === 'battle').length
  return {
    ok: true,
    state: {
      ...swordStatus(state, swords, '斩杀中'),
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
          sourceBattleId: ev.id,
        },
      }),
    },
  }
}
