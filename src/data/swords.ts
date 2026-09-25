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
const RAW: readonly Sword[] = (fixture as unknown as { swords: readonly Sword[] }).swords

/**
 * 两把剑的物品窗转录不全，在这里补。**夹具本身不动** —— 它是原帖的忠实转录，
 * 补的东西一律放在这一层，各自标清楚是「原文推断」还是「重建」。
 *
 * 1. **冰魄寒光剑的击退 = 0，这是【原文】而不是缺失。**
 *    对照表 `reference/text/forum162/article-95102-p1.txt`（2 楼「飞剑/属性/门派/
 *    炼制需要/使用需要/效果」六列表）里，乌光玄铁、墨叶血浪、上善若水、太乙金光、
 *    七星磐龙的「效果」列都写着「击退」，**唯独冰魄寒光剑那一行的效果列是空的**
 *    —— 它本来就没有击退。之前当成「转录不全」是误判。
 *
 * 2. **三阴绝脉剑的速度/敏捷/炼制消耗/耗时是【重建】。**
 *    它在**全部三项可观测数值上与天雷万磁剑完全相同**
 *    （攻击 24~240、耐久 12~120、吸收 0~0，且同为击退 0 的特效剑），
 *    所以按天雷万磁剑取值。这与全项目对待逐级消耗表、世界地形的做法同一个标准：
 *    有依据的插值 + 标注，而不是留空。
 */
const PATCHES: Readonly<Record<string, Partial<Sword> & { readonly why: string }>> = {
  冰魄寒光剑: {
    knockback: 0,
    why: '原文：reference/text/forum162/article-95102-p1.txt 对照表里它的「效果」列是空的',
  },
  三阴绝脉剑: {
    speed: 5,
    agility: 3,
    craftCost: [700, 400, 700, 800, 300] as FiveQi,
    craftSeconds: 2000,
    why: 'reconstructed（三项可观测数值与天雷万磁剑完全一致，按它取值）',
  },
}

export const SWORDS: readonly Sword[] = RAW.map((s) => {
  const p = PATCHES[s.name]
  if (!p) return s
  const { why: _why, ...fields } = p
  return { ...s, ...fields }
})

/** 哪些剑的数值是补过的，补的是什么、为什么。给出处闸门和文档用。 */
export const SWORD_PATCH_NOTES: Readonly<Record<string, string>> =
  Object.fromEntries(Object.entries(PATCHES).map(([k, v]) => [k, v.why]))

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
