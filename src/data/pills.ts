/** 丹药种类见官方法术页；恢复量见 docs/spec/DECISIONS-rules.md §17。 */
export const PILL_NAMES = ['紫金丹', '碧罗丹', '冰雪丹', '烈炎丹', '微尘丹', '五行丹'] as const
export const PILL_TIERS = [
  '一炼', '二炼', '三炼', '四炼', '五炼', '六炼', '七炼', '八炼', '九炼', '十炼',
  '十一炼', '十二炼', '十三炼', '十四炼', '十五炼', '十六炼', '十七炼', '十八炼', '十九炼', '二十炼',
] as const

/** 一炼与九炼截图一致；13903-p1.txt L125 原文确认。 */
export const PILL_SECONDS = 22 * 3600 + 30 * 60
export const WUXING_PILL_SECONDS = 24 * 3600

/** 原文：13903-p1.txt L125，单行丹22小时30分、五行丹24小时；L40炼丹不耗气。 */
export function pillRecipe(name: string): { tier: number; kind: number; baseSeconds: number } | null {
  const kind = PILL_NAMES.findIndex(n => name.endsWith(n))
  const tier = PILL_TIERS.findIndex(n => name === n + PILL_NAMES[kind]) + 1
  return kind < 0 || tier === 0 ? null : { tier, kind, baseSeconds: kind === 5 ? WUXING_PILL_SECONDS : PILL_SECONDS }
}
