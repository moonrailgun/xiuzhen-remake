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
  readonly instantAttackRatio?: number
  readonly instantDefenseRatio?: number
}

export type SwordOutcome = {
  readonly id: string
  readonly damageTaken: number
  readonly broken: boolean
  /** 有效攻击 = 面板值 + 相生加成。战报打印的就是这个 */
  readonly attack: number
  /** 有效耐久 = 面板值 + 相生加成。伤害按它截断，所以战报也得打印它 */
  readonly durability: number
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

/** 剑心只作用于飞剑。按面板值同时判定、先于相生结算为重建，严格低于阈值为原文。 */
function instantCuts(a: readonly CombatSword[], b: readonly CombatSword[]) {
  return {
    a: new Set(a.filter(s => !s.defensiveOnly && b.some(d => !d.defensiveOnly && s.attack < d.durability * (d.instantDefenseRatio ?? 0))).map(s => s.id)),
    b: new Set(b.filter(s => !s.defensiveOnly && a.some(d => !d.defensiveOnly && s.durability < d.attack * (d.instantAttackRatio ?? 0))).map(s => s.id)),
  }
}

/** 先剔除瞬断飞剑，再按双方敏捷算缠斗。 */
export function tangleDuration(a: readonly CombatSword[], b: readonly CombatSword[]): number {
  const cut = instantCuts(a, b)
  const left = a.filter(s => !cut.a.has(s.id)), right = b.filter(s => !cut.b.has(s.id))
  if ((cut.a.size || cut.b.size) && (!left.length || !right.length)) return 0
  return [...left, ...right].reduce((sum, s) => sum + s.agility, 0)
}

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
  const cut = instantCuts(attackers, defenders)
  const activeA = attackers.filter(s => !cut.a.has(s.id)), activeD = defenders.filter(s => !cut.b.has(s.id))
  const aBonus = generationBonus(activeA)
  const dBonus = generationBonus(activeD)

  // **取整要在判定之前做，不能判定完了再各取各的。**
  // 相生加成会带小数（给方耐久的一半按被生剑数平分，100/2/3 = 16.67），
  // 要是判定用小数、战报打印时才各自 `Math.floor`，就会出现
  // 「耐久 16766 / 受到伤害 16766 / 完好无损」—— 两个不同的实数落到同一个整数上，
  // 直接违反 6944 条真实战报零反例的「受到伤害 == 耐久 ⇔ 惨被斩断」。
  // 原版战报里攻击与耐久两列**全是整数**，所以原版本来就是拿整数在算。
  const effAttack = (s: CombatSword, bonus: ReadonlyMap<string, { attack: number }>) =>
    Math.floor(s.attack + (bonus.get(s.id)?.attack ?? 0))
  const effDurability = (s: CombatSword, bonus: ReadonlyMap<string, { durability: number }>) =>
    Math.floor(s.durability + (bonus.get(s.id)?.durability ?? 0))

  const side = (
    mine: readonly CombatSword[],
    myBonus: ReadonlyMap<string, { attack: number; durability: number }>,
    theirs: readonly CombatSword[],
    theirBonus: ReadonlyMap<string, { attack: number }>,
    cutIds: ReadonlySet<string>,
  ): SwordOutcome[] => {
    if (mine.length === 0) return []
    // 官方算例（corpus/4309）：逐属性分摊，仅「我克」的那部分额外 +50%。
    // 相生加出的攻击属于接受支援的剑，因此也按该剑属性判断。
    const rows = mine.map((s) => ({
      id: s.id,
      dur: effDurability(s, myBonus),
      total: theirs.reduce((sum, t) => sum + effAttack(t, theirBonus)
        * (isCountering(t.element, s.element) ? COUNTER_MULTIPLIER : 1), 0),
      incoming: cutIds.has(s.id) ? effDurability(s, myBonus) : 0,
      broken: cutIds.has(s.id),
    }))

    // **断一把就重新分摊。** 一次性均摊解释不了真实战报：102139#L45 里 4 把同款
    // 古纹青石剑（同名⇒同属性⇒无相生、相克倍率一致）耐久 640/2560/20480/40960，
    // 对方单剑攻击 108748，战报四把全断 —— 一次性均摊最多算出 108748×1.5/4 = 40780
    // < 40960，第四把该是「完好无损」。改成断剑后幸存者重分摊：27187 先断掉前三把，
    // 最后一把独自吃 108748 ≥ 40960，正好对上。
    // 全库 31 场全表战报 6804 条记录：一次性均摊有 642 条「数学上不可能断」，迭代后降到 87。
    let alive = rows.filter(r => !r.broken)
    for (;;) {
      const n = alive.length
      if (n === 0) break
      for (const r of alive) r.incoming = r.total / n
      const broke = alive.filter((r) => r.incoming >= r.dur)
      if (broke.length === 0) break
      for (const r of broke) r.broken = true
      alive = alive.filter((r) => !r.broken)
    }

    // 战报里 `受到伤害 ≤ 耐久` 且 `受到伤害 == 耐久 ⇔ 惨被斩断`，所以显示值截断到耐久。
    return rows.map((r, i) => ({
      id: r.id,
      damageTaken: Math.floor(Math.min(r.incoming, r.dur)),
      broken: r.broken,
      attack: effAttack(mine[i]!, myBonus),
      durability: r.dur,
    }))
  }

  return {
    attacker: side(attackers, aBonus, activeD, dBonus, cut.a),
    defender: side(defenders, dBonus, activeA, aBonus, cut.b),
    tangleSeconds: tangleDuration(attackers, defenders),
  }
}
