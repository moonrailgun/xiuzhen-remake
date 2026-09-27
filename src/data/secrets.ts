/** 原文：reference/text/official-site/xzxs-content-fashu.html.txt。
 * 地形减时见 docs/research/05-ui-items-market-pages.md §12.2；江河每本 80 秒为同构重建。
 */
export const SECRET_BOOKS = [
  '御剑飞行', '物理通明', '六壬神定', '紫微斗数', '诰命真经',
  '三皇内文上', '三皇内文中', '三皇内文下',
  '五岳山形图', '五岳真形图', '五岳神形图',
  '临江辟水诀', '涉泽辟水诀', '伏波辟水诀',
  '先天剑气', '先天罡气', '剑心通明', '剑心通灵', '先天神数',
] as const
export const SECRET_MATERIALS = ['青玉简页', '夜明珠', '了缘拂尘', '雷音钟'] as const
export const isSecretBook = (name: string): boolean => SECRET_BOOKS.some(n => n === name)

export function walkingReduction(terrain: string, skills: Readonly<Record<string, number>>): number {
  const books = terrain === '森林' ? SECRET_BOOKS.slice(5, 8) : terrain === '青山' ? SECRET_BOOKS.slice(8, 11)
    : terrain === '江河' ? SECRET_BOOKS.slice(11, 14) : []
  const seconds = terrain === '森林' ? 40 : terrain === '青山' ? 60 : 80
  return books.filter(n => (skills[n] ?? 0) > 0).length * seconds
}

/** 2009-01-04 开放的五本秘笈：news/huodong-xz-2008-12-31-828.txt。
 * reconstructed：20级上限、升级成本沿用普通法术；具体效果数值见 DECISIONS-rules §47。
 */
export const SECRET_SKILLS = SECRET_BOOKS.slice(14).map((name, i) => ({ id: 401 + i, name, cap: 20 }))
