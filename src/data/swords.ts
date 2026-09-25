/**
 * 十四把飞剑的完整数值表。
 *
 * 数据本身是【照原版】—— `tools/fixtures/swords.json` 由玩家帖里逐字转录的
 * 原版物品窗解析而来（`reference/text/forum162/article-94153-p1.txt`），
 * 14 把剑逐项与三张截图对照过（见 `artifacts.test.ts`）。
 * 这里不复制一份，直接引用那份夹具，保证「数值只有一个出处」。
 *
 * 两个要注意的地方：
 *
 * 1. **炼制消耗是水属性角色的读数**（夹具 `sourceNote` 原话）。和升级消耗一样，
 *    炼制消耗按**本命的生克关系**排，不是固定的五行列 —— 所以给别的属性用之前
 *    必须先按关系重投影，见 `craftCostFor`。
 * 2. 攻击/耐久/吸收写成 `[废品, 极品]` 区间，速度/敏捷/击退是单值（不吃品质），
 *    这一条由 `artifacts.ts` 的 `panelStat` 负责，不在这里处理。
 */

import { ELEMENTS, type Element } from './meridian.ts'
import { relationOf, type QiRelation } from './upgrade.ts'
import type { FiveQi } from '../engine/state.ts'
import fixture from '../../tools/fixtures/swords.json' with { type: 'json' }

export type Sword = {
  readonly name: string
  readonly flavor: readonly string[]
  /** 剑自身的五行属性；少数剑无属性 */
  readonly element: Element | null
  /** 极品能否上市场交易 */
  readonly tradable: boolean
  /** 需要的铸剑之术等级 */
  readonly forgeLevel: number
  /** 需要的御剑术等级 */
  readonly wieldLevel: number
  /** [废品, 极品] */
  readonly attack: readonly [number, number]
  readonly durability: readonly [number, number]
  readonly absorb: readonly [number, number]
  /**
   * 不吃品质的单值。
   * **可能为 null** —— 三阴绝脉剑与冰魄寒光剑的物品窗转录不全，
   * 缺的字段原资料里就没有，不补。
   */
  readonly speed: number | null
  readonly agility: number | null
  readonly knockback: number | null
  /** 每小时耗气，金木水火土（水属性角色读数） */
  readonly upkeepPerHour: FiveQi
  /** 炼制消耗，金木水火土（水属性角色读数，用前先过 `craftCostFor`）；缺转录时为 null */
  readonly craftCost: FiveQi | null
  readonly craftSeconds: number | null
}

/** 转录不全的剑：炼制消耗或耗时缺，炼制页里只能列出来、不能炼。 */
export const isComplete = (s: Sword): boolean =>
  s.craftCost !== null && s.craftSeconds !== null

/** 夹具是水属性角色拍的，所有按关系分配的数值都要以水为基准反推。 */
const MEASURED_AS: Element = '水'

// 夹具是 JSON，元组长度与可空字段在类型上宽于 `Sword`；
// 内容由 `artifacts.test.ts` 逐项守着，这里只做一次断言收窄。
export const SWORDS: readonly Sword[] = (fixture as unknown as { swords: readonly Sword[] }).swords

export const SWORDS_SOURCE =
  'reference/text/forum162/article-94153-p1.txt（原版物品窗逐字，经 tools/fixtures/parse_swords.py 解析）'

export const swordByName = (name: string): Sword | undefined =>
  SWORDS.find((s) => s.name === name)

/**
 * 把「水属性角色的读数」换算成本命属性为 `self` 的角色的实际消耗。
 *
 * 依据与 `upgrade.ts` 同一条规律：五行消耗按**本命的生克关系**排，不按固定五行列。
 * 玉虚桃木剑的水属性读数 金95 木95 水140 火120 土48
 * → 本命140 > 我克120 > 生我95 = 我生95 > 克我48，这个次序与经脉/本体一致。
 * 所以按关系取出来、按新本命放回去即可，总量不变。
 */
export function craftCostFor(measured: FiveQi | null, self: Element): FiveQi | null {
  if (!measured) return null
  const byRelation = {} as Record<QiRelation, number>
  ELEMENTS.forEach((e, i) => {
    byRelation[relationOf(MEASURED_AS, e)] = measured[i] ?? 0
  })
  return ELEMENTS.map((e) => byRelation[relationOf(self, e)] ?? 0) as unknown as FiveQi
}

/** 能不能炼：铸剑之术与御剑术都要够级。 */
export const canForge = (s: Sword, forge: number, wield: number): boolean =>
  forge >= s.forgeLevel && wield >= s.wieldLevel
