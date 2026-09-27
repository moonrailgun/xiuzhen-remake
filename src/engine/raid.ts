/**
 * 来袭：NPC 打你。
 *
 * 为什么要有这个模块：原版一半的乐趣来自真人互抢，**护身法宝、固本暗仓、击退、
 * 受伤信这一整套规则只有在「被打」时才生效**。单机下没有真人，不模拟来袭的话
 * 这些原版规则就永远跑不起来 —— `combat.ts` 的 `guardHoldSeconds` / `defenseOrder`
 * 和 `loot.ts` 的 `lootFrom` / `knockback` / `woundedText` 全都会成为死代码。
 *
 * 【照原版】的部分：
 *  - **保护期内不会被打**：道行满 18 年或建号满 10 天才出保，先到者为准 [原文]；
 *  - **来袭时护身先接战**，护身撑住的秒数 = 护身敏捷之和；护身在前、飞剑在后 [原文]；
 *  - **只有超出「固本培元」暗仓的真气抢得走** [原文]；
 *  - **被打时挂在市场的单自动取消并可被掠夺** [原文]；
 *  - **命中会把人击退到附近 1–4 格** [原文]；
 *  - 受伤信文案逐字（`loot.ts` 的 `woundedText`）。
 *
 * 【只能重建】的部分：**来袭的频率与挑人规则**。原版是真人自己决定打谁，
 * 单机下按世界种子 + 游戏小时确定性地掷骰，所以同一个存档重放结果一致、
 * 离线再久也是按同一套规则补算，不会「关掉游戏就安全」。
 */

import { schedule, type GameEvent } from './timeline.ts'
import { rand, randInt } from './rng.ts'
import { resolveBattle, defenseOrder, guardHoldSeconds, tangleDuration, artifactCombatSword, combatDamage, absorbedLoot, isCountering, COUNTER_MULTIPLIER, type CombatSword } from './combat.ts'
import { knockback, woundedText, vaultCapacity } from './loot.ts'
import { allNpcsAt, npcAt, npcCombatArtifacts, npcSwordStatus, npcCombatDamage, npcReturnEvent, patchNpc } from './npc.ts'
import { prepareSwords, swordSelectionError, swordArtError, toCombat, swordsOut, swordsOutLimit, prepareNpcAid, flightSeconds, type NpcAid, type LaunchSword, type LaunchOptions, type LaunchResult } from './battle.ts'
import { cancelAllMyOrders, ctxOf, applyCtx } from './market.ts'
import { sceneName, distance, terrainAt } from '../data/world.ts'
import { formatGameDate, HOUR, DAY } from './clock.ts'
import {
  isOutOfProtection, subQi, totalQi, type FiveQi, type GameState, type MailItem,
} from './state.ts'

export const RAID_EVENT_ID = 'raid'

/** 每小时被盯上的基础概率。[重建] —— 原版是真人行为，没有频率可言。 */
export const RAID_CHANCE_PER_HOUR = 0.06

/** 只有「狼」会主动抢；羊闷头修炼。[照原版的玩家分类] */
const RAIDER_PROFILES = ['小狼', '大狼'] as const

/** 挑人半径：原版打人要在视野内，这里给攻击方一个宽一点的范围。[重建] */
export const RAID_RANGE = 12

/** 把玩家的法宝换算成迎敌单位：护身在前、飞剑在后。 */
export function defenders(state: GameState): readonly CombatSword[] {
  return defenseOrder(state.player.artifacts.filter(a => a.status === '空闲')
    .map(artifactCombatSword).filter((s): s is CombatSword => s !== null)
    .map(s => ({ ...s, instantDefenseRatio: !s.defensiveOnly ? Math.max(0, Math.min(20, state.player.skills['剑心通灵'] ?? 0)) * 0.02 : 0 })))
}

/**
 * 看看这一小时有没有人来打你。确定性：同一个存档、同一小时，结果恒定。
 *
 * 不会来袭的情况：还在保护期、身上已有来袭事件、附近没有狼。
 */
export function scheduleRaid(state: GameState): GameState {
  if ((state.peaceUntil ?? 0) > state.clock.gameT) return state
  if (!isOutOfProtection(state.player, state.clock.gameT, DAY)) return state
  if (state.timeline.events.some((e) => e.id === RAID_EVENT_ID)) return state

  const hour = Math.floor(state.clock.gameT / HOUR)
  if (rand(state.worldSeed, 'raid', hour) >= RAID_CHANCE_PER_HOUR) return state

  const wolves = allNpcsAt(state.npc, state.clock.gameT, state.worldSeed).filter(
    (n) =>
      (RAIDER_PROFILES as readonly string[]).includes(n.base.profile) &&
      n.swords > 0 &&
      Math.abs(n.x - state.player.x) + Math.abs(n.y - state.player.y) <= RAID_RANGE,
  )
  if (wolves.length === 0) return state

  const who = wolves[randInt(wolves.length, state.worldSeed, 'raider', hour)]!

  const attackers = npcCombatArtifacts(who).filter(s => !s.defensiveOnly &&
    (s.name !== '天雷万磁剑' || terrainAt(state.worldSeed, who.x, who.y) === '青山'))
  if (!attackers.length) return state
  const seconds = flightSeconds(distance(who.x, who.y, state.player.x, state.player.y), Math.min(...attackers.map(s => s.speed ?? 1)))
  const event: GameEvent = {
    id: RAID_EVENT_ID,
    kind: 'raid',
    // 飞过来的时间：按一把中速剑折算（与出击同一套量级）
    finishAt: state.clock.gameT + seconds,
    payload: {
      phase: 'outbound', attackers, returnSeconds: seconds,
      attacker: who.base.name,
      attackerId: who.base.id,
      fromX: who.x,
      fromY: who.y,
      swordPower: who.swordPower,
      swords: who.swords,
      element: who.base.element,
    },
  }
  return { ...npcSwordStatus(state, who.base.id, attackers.map(s => s.id), '斩杀中'), timeline: schedule(state.timeline, event) }
}

/**
 * 来袭到点：护身先接战 → 结算 → 输了被抢真气并被击退 → 收到受伤信。
 *
 * 被打时**市场挂单自动取消**（原文），所以先把单撤回来 —— 撤回来的真气
 * 也就一并暴露在掠夺范围内，这正是原版的规则。
 */
/** 主游戏逐事件调用此入口：到达 → 护身拖延 → 交战 → NPC返航。 */
export function resolveRaidEvent(state: GameState, event: GameEvent): { state: GameState; follow?: GameEvent[] } {
  const phase = event.payload['phase'] as string | undefined
  if (phase === 'returning') {
    const npcId = Number(event.payload['npcId'])
    const next = npcSwordStatus(state, npcId, event.payload['swordIds'] as string[], '空闲')
    const loot = Number(event.payload['loot'] ?? 0)
    return { state: loot > 0 ? { ...next, npc: patchNpc(next.npc, npcId, { qiGained: (next.npc.patches[npcId]?.qiGained ?? 0) + loot }) } : next }
  }
  const attackerId = Number(event.payload['attackerId'])
  const power = Number(event.payload['swordPower'] ?? 16)
  // 旧档来袭缺实体快照时优先找到真实NPC；无ID的历史合成事件才使用兼容面板。
  const base = state.npc.bases.find(n => n.id === attackerId)
  let attackers: readonly CombatSword[] = event.payload['attackers'] as CombatSword[] | undefined ??
    (base ? npcCombatArtifacts(npcAt(state.npc, base, event.finishAt, state.worldSeed)) : Array.from({ length: Math.max(1, Number(event.payload['swords'] ?? 1)) }, (_, i) => ({
      id: `raid:${i}`, name: '飞剑', element: event.payload['element'] as CombatSword['element'], attack: power,
      durability: power * 2, agility: Math.max(1, Math.round(power / 8)), absorb: power * 4,
    })))
  const aid = (event.payload['aid'] as NpcAid[] | undefined) ?? []
  if ((state.peaceUntil ?? 0) > event.finishAt) return finishRaid(state, event, attackers, aid, [], null, '免战')

  if (!phase || phase === 'outbound') {
    let next = applyCtx(cancelAllMyOrders(ctxOf(state)))
    const innate = (name: string) => Math.max(0, Math.min(20, next.player.skills[name] ?? 0)) * 20
    const cut = attackers.filter(s => s.durability < innate('先天剑气') * (isCountering(next.player.element, s.element) ? COUNTER_MULTIPLIER : 1))
    next = npcCombatDamage(next, attackerId, cut.map(s => ({ id: s.id, damageTaken: s.durability, broken: true, attack: s.attack, durability: s.durability })))
    attackers = attackers.filter(s => !cut.some(c => c.id === s.id))
    const repelled = attackers.length > 0 && attackers.every(s => s.attack * (isCountering(s.element, next.player.element) ? COUNTER_MULTIPLIER : 1) < innate('先天罡气'))
    if (!attackers.length || repelled) return finishRaid(next, event, attackers, aid, [], null, cut.length ? '先天剑气' : '先天罡气')
    const items = defenders(next), guards = items.filter(s => s.defensiveOnly)
    if (guards.length) {
      next = playerStatus(next, guards.map(s => s.id), '绞杀中')
      return { state: next, follow: [{ ...event, finishAt: event.finishAt + guardHoldSeconds(guards),
        payload: { ...event.payload, phase: 'guard', attackers, guards } }] }
    }
    return beginRaidFight(next, { ...event, payload: { ...event.payload, attackers } }, items)
  }
  if (phase === 'guard') {
    const guards = event.payload['guards'] as CombatSword[] ?? []
    const raised = (event.payload['defending'] as LaunchSword[] ?? []).map(s => toCombat(s, 'player'))
    return beginRaidFight(state, event, [...guards, ...raised, ...defenders(state)])
  }

  const mine = event.payload['defenders'] as CombatSword[] ?? []
  const timelyAid = aid.filter(a => a.arriveAt <= event.finishAt)
  const result = resolveBattle(attackers, [...mine, ...timelyAid.flatMap(a => a.swords)])
  const noReturn = new Set(mine.filter(s => s.noReturn).map(s => s.id))
  const defendingOutcomes = result.defender.map(o => noReturn.has(o.id) ? { ...o, broken: true } : o)
  const survivors = attackers.filter(s => !result.attacker.find(o => o.id === s.id)?.broken)
  const held = survivors.length === 0 || defendingOutcomes.some(o => !o.broken)
  let next: GameState = { ...state, player: { ...state.player, artifacts: combatDamage(state.player.artifacts, defendingOutcomes, survivors.some(s => s.name === '天雷万磁剑') && !held) } }
  next = npcCombatDamage(next, attackerId, result.attacker, [...mine, ...timelyAid.flatMap(a => a.swords)].some(s => s.name === '天雷万磁剑') && held, '返回中')
  for (const helper of timelyAid) next = npcCombatDamage(next, helper.npcId, defendingOutcomes, survivors.some(s => s.name === '天雷万磁剑') && !held, '返回中')
  if (held) return finishRaid(next, event, survivors, aid, defendingOutcomes, null)
  const taken = absorbedLoot(next.player.qi, next.player.body[4] ?? 0, survivors.reduce((n, s) => n + (s.absorb ?? 0), 0))
  const hit = knockback(next.player.x, next.player.y, next.worldSeed, event.finishAt)
  next = { ...next, player: { ...next.player, qi: subQi(next.player.qi, taken) as FiveQi, ...hit } }
  return finishRaid(next, event, survivors, aid, defendingOutcomes, { taken, at: hit })
}

function playerStatus(state: GameState, ids: readonly string[], status: string): GameState {
  return { ...state, player: { ...state.player, artifacts: state.player.artifacts.map(a => ids.includes(a.id) ? { ...a, status } : a) } }
}
function beginRaidFight(state: GameState, event: GameEvent, mine: readonly CombatSword[]): { state: GameState; follow: GameEvent[] } {
  const attackers = event.payload['attackers'] as CombatSword[]
  const aid = event.payload['aid'] as NpcAid[] ?? []
  // 护身敏捷已经在guard阶段付过时间；飞剑敏捷另计，援军必须实际赶到才参战。
  const seconds = tangleDuration(attackers, [...mine.filter(s => !s.defensiveOnly), ...aid.filter(a => a.arriveAt <= event.finishAt).flatMap(a => a.swords)])
  return { state: playerStatus(state, mine.map(s => s.id), '绞杀中'), follow: [{ ...event,
    finishAt: event.finishAt + seconds, payload: { ...event.payload, phase: 'fighting', defenders: mine } }] }
}
function finishRaid(state: GameState, event: GameEvent, survivors: readonly CombatSword[], aid: readonly NpcAid[],
  defendOutcomes: readonly { id: string; broken: boolean }[],
  hurt: { taken: FiveQi; at: { x: number; y: number } } | null, defense = '法宝'): { state: GameState; follow: GameEvent[] } {
  const attackerId = Number(event.payload['attackerId'])
  const follow: GameEvent[] = []
  const reserved = ['guards', 'defenders', 'defending'].flatMap(key => (event.payload[key] as { id: string }[] | undefined) ?? []).map(s => s.id)
  const released = playerStatus(state, state.player.artifacts.filter(a => reserved.includes(a.id) && a.status === '绞杀中').map(a => a.id), '空闲')
  let next = npcSwordStatus(released, attackerId, survivors.map(s => s.id), '返回中')
  if (state.npc.bases.some(n => n.id === attackerId) && survivors.length) follow.push(npcReturnEvent(event, attackerId, survivors.map(s => s.id), Number(event.payload['returnSeconds'] ?? 60), hurt ? totalQi(hurt.taken) : 0))
  for (const helper of aid) {
    const ids = helper.swords.filter(s => !defendOutcomes.find(o => o.id === s.id)?.broken).map(s => s.id)
    next = npcSwordStatus(next, helper.npcId, ids, '返回中')
    if (ids.length) follow.push(npcReturnEvent(event, helper.npcId, ids, helper.returnSeconds))
  }
  return { state: { ...next, mail: [raidMail(next, String(event.payload['attacker'] ?? '某人'), hurt, defense), ...next.mail].slice(0, 200) }, follow }
}

/** 保留直接结算API给旧调用方；生产时钟使用resolveRaidEvent逐阶段处理。 */
export function resolveRaid(state: GameState, event: GameEvent): GameState {
  let next = state, pending = [event]
  while (pending.length) {
    const ev = pending.shift()!, result = resolveRaidEvent(next, ev)
    next = result.state
    pending.push(...result.follow ?? [])
  }
  return next
}

/** 护身争取到的时间里主动祭剑，才获得出击被动与所选剑术。 */
export function defendRaid(state: GameState, eventId: string, swords: readonly LaunchSword[], opts: LaunchOptions = {}): LaunchResult {
  const event = state.timeline.events.find(e => e.id === eventId && e.kind === 'raid' && e.payload['phase'] !== 'returning')
  if (!event || !['guard', 'fighting'].includes(String(event.payload['phase']))) return { ok: false, reason: '敌剑尚未接战或战斗已结束' }
  if (!swords.length) return { ok: false, reason: '请选择迎敌飞剑' }
  const error = swordSelectionError(state, swords) ?? swordArtError(state, opts.swordArt)
  if (error) return { ok: false, reason: error }
  if (swordsOut(state) + swords.length > swordsOutLimit(opts.wanjianLevel ?? state.player.skills['万剑诀'] ?? 0)) return { ok: false, reason: '超过同时控制飞剑的上限' }
  const prepared = prepareSwords(state, swords, opts.swordArt)
  const fighting = event.payload['phase'] === 'fighting'
  const changed = { ...event, finishAt: event.finishAt + (fighting ? prepared.reduce((n, s) => n + s.launchedStats!.agility, 0) : 0),
    payload: { ...event.payload, defending: [...(event.payload['defending'] as LaunchSword[] ?? []), ...prepared],
      ...(fighting ? { defenders: [...(event.payload['defenders'] as CombatSword[] ?? []), ...prepared.map(s => toCombat(s, 'player'))] } : {}) } }
  return { ok: true, state: { ...playerStatus(state, prepared.map(s => s.id), '绞杀中'), timeline: { events: state.timeline.events.map(e => e.id === eventId ? changed : e) } } }
}
export function requestRaidAid(state: GameState, eventId: string, npcId: number): LaunchResult {
  const event = state.timeline.events.find(e => e.id === eventId && e.kind === 'raid' && e.payload['phase'] !== 'returning')
  if (!event) return { ok: false, reason: '来袭已经结束' }
  const prepared = prepareNpcAid(state, npcId, state.player.x, state.player.y)
  if (!prepared.ok) return prepared
  if (prepared.aid.arriveAt > event.finishAt) return { ok: false, reason: '援军来不及赶到这场战斗' }
  const fighting = event.payload['phase'] === 'fighting'
  return { ok: true, state: { ...prepared.state, timeline: { events: prepared.state.timeline.events.map(e => e.id === eventId ? { ...e,
    finishAt: e.finishAt + (fighting ? prepared.aid.swords.reduce((n, s) => n + s.agility, 0) : 0),
    payload: { ...e.payload, aid: [...(e.payload['aid'] as NpcAid[] ?? []), prepared.aid] } } : e) } } }
}

/** 受伤信。被打穿时用原版逐字文案；守住了则只报一句。 */
function raidMail(
  s: GameState,
  attacker: string,
  hurt: { readonly taken: FiveQi; readonly at: { x: number; y: number } } | null,
  defense = '法宝',
): MailItem {
  const base = {
    id: `raid:${s.clock.gameT}:${attacker}`,
    from: '系统' as const,
    at: s.clock.gameT,
    read: false,
    kind: 'battle' as const,
  }
  if (!hurt) {
    return {
      ...base,
      subject: `${attacker}攻击你`,
      body: {
        kind: 'text',
        paragraphs: [`　　${attacker}的飞剑向你飞来，被你的${defense}挡了下来。`],
      },
    }
  }
  return {
    ...base,
    subject: `${attacker}攻击你`,
    body: {
      kind: 'text',
      paragraphs: woundedText({
        attacker,
        quality: '',
        sword: '飞剑',
        refine: 0,
        x: hurt.at.x,
        y: hurt.at.y,
        place: sceneName(s.worldSeed, hurt.at.x, hurt.at.y),
      }).split('\n'),
      taken: [...hurt.taken],
      at: formatGameDate(s.clock.gameT),
    },
  }
}

export { vaultCapacity }
