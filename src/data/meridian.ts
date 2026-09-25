/**
 * 经脉（十二正经）。
 *
 * 分组与五行映射是【照原版】——从 2009-05 的紫微斗数推算信原文解出，两个独立样本吻合。
 * 逐级吸收倍率是【按推断】——9 个锚点 + 单调插值重建，中间级无直接证据。
 * 逐级升级消耗与耗时是【只能重建】——官方数据表是图片帖且图片未存档。
 *
 * 详见 `docs/spec/DECISIONS.md` §2.1。
 */

import { makeCurve, type Anchor } from './curve.ts'

export const ELEMENTS = ['金', '木', '水', '火', '土'] as const
export type Element = (typeof ELEMENTS)[number]

/**
 * 五行相生：生我者 / 我生者。原版 `mapData` 的字段顺序是 gold,wood,earth,water,fire，
 * 说明引擎内部的五行顺序是"金木土水火"，但界面上按"金木水火土"显示。
 * 这里只编码生克关系，顺序问题留给展示层。
 */
const GENERATES: Record<Element, Element> = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' }
const OVERCOMES: Record<Element, Element> = { 金: '木', 木: '土', 土: '水', 水: '火', 火: '金' }

/** 我生者（本命生出的那一种） */
export const generates = (self: Element): Element => GENERATES[self]
/** 生我者 */
export const generatedBy = (self: Element): Element =>
  ELEMENTS.find((e) => GENERATES[e] === self)!
/** 我克者 */
export const overcomes = (self: Element): Element => OVERCOMES[self]
/** 克我者 —— 即「五行一缺」，这一种真气无法靠经脉炼化，只能靠炼丹或交易补 */
export const overcomeBy = (self: Element): Element =>
  ELEMENTS.find((e) => OVERCOMES[e] === self)!

export type MeridianGroup = '手三阴' | '手三阳' | '足三阴' | '足三阳'

/**
 * 十二正经的名单与分组。[原文]
 * 出处：`reference/text/forum162/article-96998-p1.txt`（2009-05-06 系统推算信全文，
 * 一次列全 12 条并按四组标注五行）。
 */
export const MERIDIANS: readonly { name: string; group: MeridianGroup }[] = [
  { name: '手太阴肺经', group: '手三阴' },
  { name: '手厥阴心包经', group: '手三阴' },
  { name: '手少阴心经', group: '手三阴' },
  { name: '手阳明大肠经', group: '手三阳' },
  { name: '手少阳三焦经', group: '手三阳' },
  { name: '手太阳小肠经', group: '手三阳' },
  { name: '足太阴脾经', group: '足三阴' },
  { name: '足厥阴肝经', group: '足三阴' },
  { name: '足少阴肾经', group: '足三阴' },
  { name: '足阳明胃经', group: '足三阳' },
  { name: '足少阳胆经', group: '足三阳' },
  { name: '足太阳膀胱经', group: '足三阳' },
]

/**
 * 经脉组 → 炼化哪一种真气。**随角色本命属性变化**，不是固定映射。[原文+推断]
 *
 * 推导（`docs/spec/DECISIONS.md` §2.1）：
 *  - 样本 A [原文]：推算信显示 手三阴=火·足三阴=金·足三阳=土·手三阳=木·缺水。
 *    缺水 ⇒ 水克我 ⇒ 本命为火。代入即得下表。
 *  - 样本 B [截图 #3]：木属性角色的足阳明胃经（足三阳）掌管火；木生火 ⇒ 足三阳=我生 ✓。
 *
 * 注意：`reference/02-RULES-EXTRACTED.md` 写「足阳明胃经掌管火真气」，那只对木属性角色成立。
 */
export function groupElement(self: Element, group: MeridianGroup): Element {
  switch (group) {
    case '手三阴':
      return self // 本命
    case '手三阳':
      return generatedBy(self) // 生我
    case '足三阴':
      return overcomes(self) // 我克
    case '足三阳':
      return generates(self) // 我生
  }
}

/**
 * 逐级吸收倍率。[按推断 —— 9 个锚点 + 单调插值]
 *
 * 官方描述是"以 N 倍速度吸收 X 真气"，Lv.0 为 1 倍。
 * 早期归档猜测是斐波那契（…3,5,8,13…），已被 Lv.8=40 否定。
 */
export const MULTIPLIER_ANCHORS: readonly Anchor[] = [
  { level: 0, value: 1, source: 'docs/research/03-forum-verbatim-mining.md §1.17（版主帖：Lv.0 = 1 倍）' },
  { level: 1, value: 2, source: 'docs/research/02-guides-and-rules.md §1.2' },
  { level: 2, value: 5, source: 'reference/images/17173-live/20081225104603605_all/xiuzhen802.jpg（#3：Lv.2「以5倍速度吸收火真气」）' },
  { level: 3, value: 8, source: '同上（#3：下一等级「以8倍速度吸收」）' },
  { level: 8, value: 40, source: 'docs/research/02-guides-and-rules.md §1.2（玩家产量反推）' },
  { level: 9, value: 60, source: '同上' },
  { level: 13, value: 200, source: 'reference/text/forum162/article-96998-p1.txt（推算信：Lv.13 200倍）' },
  { level: 14, value: 270, source: '同上（Lv.14 270倍）' },
  { level: 20, value: 1000, source: 'docs/research/03-forum-verbatim-mining.md §1.17（版主帖：满级 20 级 1000 倍）' },
]

/** 经脉等级上限。心动期之前封顶 13 级 [原文]，满级 20 [原文]。 */
export const MAX_LEVEL = 20
export const MAX_LEVEL_BEFORE_XINDONG = 13

const multiplierCurve = makeCurve(MULTIPLIER_ANCHORS)

/** 某级经脉的吸收倍率。 */
export function multiplier(level: number): number {
  if (level <= 0) return 1
  return multiplierCurve(Math.min(level, MAX_LEVEL))
}

/**
 * 真气产量（每小时，单种真气）。[原文]
 *
 * 官方公式：`真气增长 = (天地元气 × 经脉效率 × 付费加成) / 当地玩家数 − 法宝消耗`
 * 出处：`reference/text/news/huodong-xz-2009-11-02-2048.txt`。
 * 玩家版表述：`地块元气 × Σ(该元素三条经脉的倍率) − 法宝耗气`
 * 出处：`docs/research/02-guides-and-rules.md §1.2`（单脉速升论原文）。
 *
 * 注意「当地玩家数」：未出保护期的玩家同站一格不分薄，出保后平分 [原文]。
 */
export function hourlyQi(params: {
  /** 该元素在当前地块的天地元气 */
  readonly terrainQi: number
  /** 该元素对应的三条经脉的等级 */
  readonly meridianLevels: readonly [number, number, number]
  /** 付费加成，+25% 吸收速度时为 1.25，默认 1 */
  readonly payBonus?: number
  /** 平分元气的玩家数（含自己），默认 1 */
  readonly sharingPlayers?: number
  /** 身上法宝每小时消耗的该种真气 */
  readonly itemUpkeep?: number
}): number {
  const efficiency = params.meridianLevels.reduce((sum, lv) => sum + multiplier(lv), 0)
  const gross = (params.terrainQi * efficiency * (params.payBonus ?? 1)) / (params.sharingPlayers ?? 1)
  return Math.floor(gross) - (params.itemUpkeep ?? 0)
}
