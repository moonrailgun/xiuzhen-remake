/**
 * 升级消耗与耗时。
 *
 * **这是全项目重建成分最高的一块**：官方的经脉/本体/法术逐级数据表是图片帖，
 * 图片一张没存档（`reference/04-SOURCES.md`）。我们手里只有散落的几个锚点，
 * 所以这里是「过锚点的重建曲线」，不是原版数值。代码里每条都标了出处或 `reconstructed`。
 *
 * 解出来的两条规律（有多组样本互证）：
 *
 * 1. **五行配比按本命属性的生克关系排**，不是固定的金木水火土列。
 *    经脉与本体：`本命 > 我克 > 生我 > 我生 > 克我`。
 *    验证：足阳明胃经 Lv2→3（木属性）木430 > 土360 > 水210 > 火130 > 金0；
 *    丹田 Lv27→28（金属性）金240000 > 木190000 > 土170000 > 水160000 > 火23000；
 *    丹田 Lv34→35 与 Lv35→36（水属性）同样吻合 —— 三个不同本命的角色代入后顺序一致。
 *    法术另有一套（炼丹之术 Lv3→4：生我250 > 我克160 > 本命120 > 我生93 > 克我0）。
 *
 * 2. **总消耗与耗时大致成正比**，比值随系统与等级在 0.7–1.0 之间
 *    （经脉 0.78、法术 0.71、丹田 0.98–1.01）。
 */

import { makeCurve, type Anchor } from './curve.ts'
import { generates, generatedBy, overcomes, overcomeBy, ELEMENTS, type Element } from './meridian.ts'
import type { FiveQi } from '../engine/state.ts'

/** 五行关系，按消耗从多到少的次序。 */
export type QiRelation = '本命' | '我克' | '生我' | '我生' | '克我'

/** 某个本命属性下，每种五行对应什么关系。 */
export function relationOf(self: Element, other: Element): QiRelation {
  if (other === self) return '本命'
  if (overcomes(self) === other) return '我克'
  if (generatedBy(self) === other) return '生我'
  if (generates(self) === other) return '我生'
  return '克我'
}

/**
 * 各系统的五行配比（按关系）。[按推断 —— 从实测样本归一化]
 * 顺序：本命 / 我克 / 生我 / 我生 / 克我
 */
export const COST_RATIO: Record<'meridian' | 'body' | 'skill', readonly [number, number, number, number, number]> = {
  // 足阳明胃经 Lv2→3（木属性）：430/360/210/130/0，总 1130
  meridian: [0.381, 0.319, 0.186, 0.115, 0],
  // 丹田气海 Lv27→28（金）与 Lv34→35、Lv35→36（水）三组的平均
  body: [0.313, 0.235, 0.215, 0.204, 0.029],
  // 炼丹之术 Lv3→4：生我最多、克我为 0
  skill: [0.193, 0.257, 0.401, 0.149, 0],
}

/** 把一个总量按关系配比拆成金木水火土。 */
export function splitByElement(
  total: number,
  self: Element,
  system: keyof typeof COST_RATIO,
): FiveQi {
  const ratio = COST_RATIO[system]
  const byRelation: Record<QiRelation, number> = {
    本命: ratio[0],
    我克: ratio[1],
    生我: ratio[2],
    我生: ratio[3],
    克我: ratio[4],
  }
  return ELEMENTS.map((e) => Math.round(total * byRelation[relationOf(self, e)])) as unknown as FiveQi
}

// —— 总消耗曲线 ——
// 锚点是「升到该级」所需的总真气。

/** 经脉：升到第 N 级的总消耗。 */
const MERIDIAN_ANCHORS: readonly Anchor[] = [
  { level: 2, value: 375, source: 'docs/research/02-guides-and-rules.md §2.2（金属性本命脉 1→2 共 375）' },
  { level: 3, value: 1130, source: 'reference/images/17173-live/20081225104603605_all/xiuzhen802.jpg（#3：0/430/210/130/360）' },
  { level: 4, value: 1890, source: 'docs/research/02-guides-and-rules.md §2.2（主脉 3→4）' },
  // 往上没有直接锚点，用「三转周天后道行 ≈12 年」这个累计锚点约束（见测试）
  { level: 13, value: 120000, source: 'reconstructed（由累计锚点「三转周天≈12 年道行」反推）' },
  { level: 20, value: 2000000, source: 'reconstructed（心动前封顶 13 级，20 级是满级）' },
]

/** 本体：升到第 N 级的总消耗。丹田气海的三个高等级锚点来自截图。 */
const BODY_ANCHORS: readonly Anchor[] = [
  { level: 2, value: 400, source: 'reconstructed（与经脉同量级）' },
  { level: 12, value: 1800, source: 'docs/spec/DECISIONS-rules.md §4（固本培元 Lv12 = 1800）' },
  { level: 28, value: 783000, source: 'docs/research/04-ui-core-pages.md（丹田 Lv27→28：240000/190000/160000/23000/170000）' },
  { level: 35, value: 4390000, source: 'reference/images/17173-live/20090921133953494/dfdeee02.jpg（#32）' },
  { level: 36, value: 5570000, source: 'reference/images/17173-live/20090921133953494/dfdeee03.jpg（#33）' },
]

/** 法术：升到第 N 级的总消耗。 */
const SKILL_ANCHORS: readonly Anchor[] = [
  { level: 1, value: 120, source: 'reconstructed（法术 Lv.1 无锚点；按炼丹之术 Lv.3→4 的量级往下外推）' },
  { level: 4, value: 623, source: 'reference/images/17173-live/20100603104231289/xcds1.jpg（#92：炼丹之术 Lv3→4 共 623）' },
  { level: 20, value: 900000, source: 'reconstructed（由「御剑术 0→20 约 73 小时」「铸剑之术 0→20 约 280 小时」约束）' },
]

const meridianCurve = makeCurve(MERIDIAN_ANCHORS)
const bodyCurve = makeCurve(BODY_ANCHORS)
const skillCurve = makeCurve(SKILL_ANCHORS)

/** 升到 `toLevel` 需要的总真气。 */
export function totalCost(system: keyof typeof COST_RATIO, toLevel: number): number {
  if (toLevel <= 0) return 0
  const curve = system === 'meridian' ? meridianCurve : system === 'body' ? bodyCurve : skillCurve
  return curve(toLevel)
}

/** 升到 `toLevel` 的五行消耗。 */
export const upgradeCost = (
  system: keyof typeof COST_RATIO,
  toLevel: number,
  self: Element,
): FiveQi => splitByElement(totalCost(system, toLevel), self, system)

/**
 * 升级耗时（秒）。
 *
 * 总消耗与耗时大致成正比（实测比值：经脉 0.78、法术 0.71、丹田约 1.0）。
 * 两项本体会改耗时：
 *  - **炼体成钢**提升经脉和本体的升级速度 [原文]；
 *  - **心静通灵**提升法术修炼速度 [原文]。
 * 具体每级减多少 [未知]，这里按每级 −2% 重建。
 */
export function upgradeSeconds(
  system: keyof typeof COST_RATIO,
  toLevel: number,
  opts: { readonly steelLevel?: number; readonly calmLevel?: number } = {},
): number {
  const total = totalCost(system, toLevel)
  const rate = system === 'skill' ? 1 / 0.71 : system === 'meridian' ? 1 / 0.78 : 1.0
  const base = total * rate
  const boost =
    system === 'skill' ? (opts.calmLevel ?? 0) : (opts.steelLevel ?? 0)
  return Math.max(1, Math.round(base * Math.max(0.2, 1 - 0.02 * boost)))
}

// —— 丹田容量 ——
// 基准版取 2008-11 的序列（`docs/spec/DECISIONS-rules.md` §5）：
// 2009-09「丹田开放到 36 级」时官方改过表，Lv9=10000 属改表后的版本，基准期不用。

const DANTIAN_ANCHORS: readonly Anchor[] = [
  { level: 2, value: 2900, source: 'reference/images/17173-live/20081225104603605_all/xiuzhen801.jpg（#2 资源条 /2900）' },
  { level: 3, value: 3500, source: 'docs/spec/DECISIONS-rules.md §5（2008-11 序列）' },
  { level: 10, value: 8600, source: '同上' },
  { level: 20, value: 400000, source: 'docs/research/02-guides-and-rules.md §2.1（筑基→辟谷奖励「充满丹田」≈40 万）' },
  { level: 27, value: 270000, source: 'docs/research/04-ui-core-pages.md（Lv.27 容量 270000）' },
  { level: 28, value: 330000, source: '同上' },
  { level: 35, value: 1200000, source: 'reference/images/17173-live/20090921133953494/dfdeee03.jpg（#33）' },
  { level: 36, value: 1400000, source: '同上' },
]

// Lv20 的 40 万与 Lv27 的 27 万冲突（前者是「充满丹田」的约数，后者是截图实测），
// 取截图值，把 Lv20 的锚点降权为区间上界。
const dantianCurve = makeCurve(
  DANTIAN_ANCHORS.filter((a) => a.level !== 20),
)

/** 丹田气海第 N 级的单种真气容量。 */
export const dantianCapacity = (level: number): number =>
  level <= 0 ? 1000 : dantianCurve(Math.min(level, 36))
