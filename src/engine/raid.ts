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
import { resolveBattle, defenseOrder, isCountering, COUNTER_MULTIPLIER, type CombatSword } from './combat.ts'
import { lootFrom, knockback, woundedText, vaultCapacity } from './loot.ts'
import { allNpcsAt } from './npc.ts'
import { cancelAllMyOrders, ctxOf, applyCtx } from './market.ts'
import { panelStat } from '../data/artifacts.ts'
import { swordByName } from '../data/swords.ts'
import { sceneName } from '../data/world.ts'
import { formatGameDate, HOUR, DAY } from './clock.ts'
import {
  isOutOfProtection, subQi, type FiveQi, type GameState, type MailItem,
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
  const items = state.player.artifacts
    .filter((a) => (a.kind === 'sword' || a.kind === 'guard') && a.status === '空闲')
    .map((a): CombatSword | null => {
      const t = swordByName(a.name)
      if (a.kind === 'guard') {
        // 护身的攻/耐/敏同量级（03 §1.17），这里用面板值的近似
        const base = 120
        return {
          id: a.id,
          name: a.name,
          element: null,
          attack: panelStat([base, base * 10], a.quality, a.refine),
          durability: panelStat([base, base * 10], a.quality, a.refine),
          agility: panelStat([base, base * 10], a.quality, a.refine),
          defensiveOnly: true,
        }
      }
      if (!t || t.agility === null) return null
      return {
        id: a.id,
        name: a.name,
        element: t.element,
        attack: panelStat(t.attack, a.quality, a.refine),
        durability: panelStat(t.durability, a.quality, a.refine),
        agility: panelStat([t.agility, t.agility], a.quality, a.refine),
        // 同剑心通明按每级2%重建。
        instantDefenseRatio: Math.max(0, Math.min(20, state.player.skills['剑心通灵'] ?? 0)) * 0.02,
      }
    })
    .filter((x): x is CombatSword => x !== null)
  return defenseOrder(items)
}

/**
 * 看看这一小时有没有人来打你。确定性：同一个存档、同一小时，结果恒定。
 *
 * 不会来袭的情况：还在保护期、身上已有来袭事件、附近没有狼。
 */
export function scheduleRaid(state: GameState): GameState {
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
  const dist = Math.abs(who.x - state.player.x) + Math.abs(who.y - state.player.y)

  const event: GameEvent = {
    id: RAID_EVENT_ID,
    kind: 'raid',
    // 飞过来的时间：按一把中速剑折算（与出击同一套量级）
    finishAt: state.clock.gameT + Math.max(60, dist * 120),
    payload: {
      attacker: who.base.name,
      attackerId: who.base.id,
      fromX: who.x,
      fromY: who.y,
      swordPower: who.swordPower,
      swords: who.swords,
      element: who.base.element,
    },
  }
  return { ...state, timeline: schedule(state.timeline, event) }
}

/**
 * 来袭到点：护身先接战 → 结算 → 输了被抢真气并被击退 → 收到受伤信。
 *
 * 被打时**市场挂单自动取消**（原文），所以先把单撤回来 —— 撤回来的真气
 * 也就一并暴露在掠夺范围内，这正是原版的规则。
 */
export function resolveRaid(state: GameState, event: GameEvent): GameState {
  const attackerName = String(event.payload['attacker'] ?? '某人')
  const power = Number(event.payload['swordPower'] ?? 16)
  const count = Math.max(1, Number(event.payload['swords'] ?? 1))
  const element = event.payload['element'] as CombatSword['element']

  // 挂单先撤回来（原文：被打时挂在市场的单自动取消并可被掠夺）
  const s0 = applyCtx(cancelAllMyOrders(ctxOf(state)))

  const attackers: readonly CombatSword[] = Array.from({ length: count }, (_, i) => ({
    id: `raid:${i}`,
    name: '飞剑',
    element,
    attack: power,
    durability: power * 2,
    agility: Math.max(1, Math.round(power / 8)),
  }))
  // 先天先于法宝自动防御（2008-12-31 官方更新说明）。剑气20/级有后期旁证，罡气同量级重建。
  const innate = (name: string) => Math.max(0, Math.min(20, s0.player.skills[name] ?? 0)) * 20
  const cut = power * 2 < innate('先天剑气') * (isCountering(s0.player.element, element) ? COUNTER_MULTIPLIER : 1)
  const repelled = power * (isCountering(element, s0.player.element) ? COUNTER_MULTIPLIER : 1) < innate('先天罡气')
  if (cut || repelled) {
    return { ...s0, mail: [raidMail(s0, attackerName, null, cut ? '先天剑气' : '先天罡气'), ...s0.mail].slice(0, 200) }
  }
  const myItems = defenders(s0)
  const result = resolveBattle(attackers, myItems)

  // 打坏的法宝标「损坏」
  const brokenIds = result.defender.filter((o) => o.broken).map((o) => o.id)
  const artifacts = s0.player.artifacts.map((a) =>
    brokenIds.includes(a.id) ? { ...a, status: '损坏' } : a)

  // 守住了 = 还有没被打断的法宝；一件都没有（或本来就没带）就算被打穿
  const held = myItems.length > 0 && brokenIds.length < myItems.length
  if (held) {
    return {
      ...s0,
      player: { ...s0.player, artifacts },
      mail: [raidMail(s0, attackerName, null), ...s0.mail].slice(0, 200),
    }
  }

  // 被打穿：只有超出固本暗仓的真气抢得走
  const rootLevel = s0.player.body[4] ?? 0
  const { taken } = lootFrom(s0.player.qi, rootLevel)
  const hit = knockback(s0.player.x, s0.player.y, s0.worldSeed, event.finishAt)

  return {
    ...s0,
    player: {
      ...s0.player,
      artifacts,
      qi: subQi(s0.player.qi, taken) as FiveQi,
      x: hit.x,
      y: hit.y,
    },
    mail: [raidMail(s0, attackerName, { taken, at: hit }), ...s0.mail].slice(0, 200),
  }
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
