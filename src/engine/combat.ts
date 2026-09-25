/**
 * 战斗结算。
 *
 * 规则文字是【照原版】——出自 17173 老专区《战斗扫盲》（`reference/text/third-party/17173-webxz-zhandou.txt`）：
 *  - 「敏捷 = 缠斗秒数」：两剑相遇，缠斗时长 = 双方敏捷之和（秒）。第三把剑在缠斗结束前赶到，
 *    则时长按其敏捷再延长，并一起结算。
 *  - 「断剑判定」：对方飞剑总攻击 ÷ 我方飞剑数 > 我方单把飞剑耐久 → 该剑损坏。未断则下次满耐久。
 *  - 「五行相生」：支援的飞剑把自身攻击和耐久的**一半**加到它所「生」的那种飞剑上，
 *    按被生飞剑数量平分；加出来的伤害算被生飞剑的属性。
 *  - 「五行相克」：判断是否断剑时额外 ×150%。
 *  - 同一人初期最多同时控制 5 把飞剑在外（万剑诀每级 +1）。
 *
 * 伤害分摊的细节是【按推断】——从 44 场、6944 条真实战报记录反推，见 `combat.test.ts`。
 */

import type { Element } from '../data/meridian.ts'
import { generates, overcomes } from '../data/meridian.ts'

/** 参战的一把法宝（飞剑或护身）。数值已是面板值（含品质、淬炼、人物加成）。 */
export type CombatSword = {
  readonly id: string
  readonly name: string
  readonly element: Element | null
  readonly attack: number
  readonly durability: number
  readonly agility: number
  /** 护身不能出击，只能迎敌 */
  readonly defensiveOnly?: boolean
}

export type SwordOutcome = {
  readonly id: string
  readonly damageTaken: number
  readonly broken: boolean
}

export type BattleResult = {
  readonly attacker: readonly SwordOutcome[]
  readonly defender: readonly SwordOutcome[]
  /** 缠斗时长（秒）= 双方敏捷之和 */
  readonly tangleSeconds: number
}

/** 相克：攻方属性克守方属性时，判定断剑额外 ×150%。 */
export const COUNTER_MULTIPLIER = 1.5

export function isCountering(attacker: Element | null, defender: Element | null): boolean {
  if (!attacker || !defender) return false
  return overcomes(attacker) === defender
}

/**
 * 五行相生的支援加成：一把剑把自身攻击与耐久的一半，加给它所「生」的那种属性的剑，
 * 按被生剑的数量平分。
 *
 * @returns 每把剑获得的加成（按 id）
 */
export function generationBonus(
  swords: readonly CombatSword[],
): ReadonlyMap<string, { attack: number; durability: number }> {
  const bonus = new Map<string, { attack: number; durability: number }>()
  for (const s of swords) bonus.set(s.id, { attack: 0, durability: 0 })

  for (const giver of swords) {
    if (!giver.element) continue
    const target = generates(giver.element)
    const receivers = swords.filter((s) => s.element === target && s.id !== giver.id)
    if (receivers.length === 0) continue
    const attackShare = giver.attack / 2 / receivers.length
    const durabilityShare = giver.durability / 2 / receivers.length
    for (const r of receivers) {
      const b = bonus.get(r.id)!
      bonus.set(r.id, {
        attack: b.attack + attackShare,
        durability: b.durability + durabilityShare,
      })
    }
  }
  return bonus
}

/**
 * 护身先迎敌。[原文]
 *
 * 官方攻略《护身揭密》：「即使对方飞剑凌体之时，护身都可以自动御敌，将敌剑挡在空中，
 * 给予各位道友祭起飞剑的时间。至于抵挡的时间，则是由护身本身的敏捷决定。」
 *
 * 所以来袭时先由护身接战，护身撑住的秒数 = 护身敏捷之和；这段时间够不够让
 * 主人把飞剑祭起来，决定了飞剑能不能加入这一战。
 *
 * @returns 护身能争取到的秒数；没有护身则为 0
 */
export const guardHoldSeconds = (guards: readonly CombatSword[]): number =>
  guards.filter((g) => g.defensiveOnly).reduce((sum, g) => sum + g.agility, 0)

/**
 * 来袭时的迎敌顺序：护身在前、飞剑在后。
 * 「护法的基础是防御方必须要有护身」——飞剑敏捷只有几百秒（几分钟），
 * 而 +5 的最低级护身能撑 1.6 小时，护法才来得及支援。[原文]
 */
export function defenseOrder(items: readonly CombatSword[]): readonly CombatSword[] {
  return [...items].sort((a, b) => Number(b.defensiveOnly ?? false) - Number(a.defensiveOnly ?? false))
}

/** 缠斗时长 = 双方敏捷之和（秒）。 */
export const tangleDuration = (a: readonly CombatSword[], b: readonly CombatSword[]): number =>
  [...a, ...b].reduce((sum, s) => sum + s.agility, 0)

/**
 * 结算一场遭遇。
 *
 * 断剑规则（原文）：`对方飞剑总攻击 ÷ 我方飞剑数 > 我方单把飞剑耐久` → 断。
 * 也就是对方的总攻击平摊到我方每把剑上，摊到的伤害达到耐久就断。
 * 战报里 `受到伤害 ≤ 耐久`，且 `受到伤害 == 耐久 ⇔ 惨被斩断`（6944 条零反例），
 * 所以显示的「受到伤害」是**截断到耐久**的值。
 */
export function resolveBattle(
  attackers: readonly CombatSword[],
  defenders: readonly CombatSword[],
): BattleResult {
  const aBonus = generationBonus(attackers)
  const dBonus = generationBonus(defenders)

  const effAttack = (s: CombatSword, bonus: ReadonlyMap<string, { attack: number }>) =>
    s.attack + (bonus.get(s.id)?.attack ?? 0)
  const effDurability = (s: CombatSword, bonus: ReadonlyMap<string, { durability: number }>) =>
    s.durability + (bonus.get(s.id)?.durability ?? 0)

  const side = (
    mine: readonly CombatSword[],
    myBonus: ReadonlyMap<string, { attack: number; durability: number }>,
    theirs: readonly CombatSword[],
    theirBonus: ReadonlyMap<string, { attack: number }>,
  ): SwordOutcome[] => {
    if (mine.length === 0) return []
    return mine.map((s) => {
      const dur = effDurability(s, myBonus)
      // 官方算例（corpus/4309）：逐属性分摊，仅「我克」的那部分额外 +50%。
      // 相生加出的攻击属于接受支援的剑，因此也按该剑属性判断。
      const incoming = theirs.reduce((sum, t) => sum + effAttack(t, theirBonus)
        * (isCountering(t.element, s.element) ? COUNTER_MULTIPLIER : 1), 0) / mine.length
      const broken = incoming >= dur
      return {
        id: s.id,
        damageTaken: Math.floor(Math.min(incoming, dur)),
        broken,
      }
    })
  }

  return {
    attacker: side(attackers, aBonus, defenders, dBonus),
    defender: side(defenders, dBonus, attackers, aBonus),
    tangleSeconds: tangleDuration(attackers, defenders),
  }
}
