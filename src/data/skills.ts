/** 法术树的共享规则与截图布局元数据。来源随节点定义保留。 */

/** 树上的一格。col/row 是 04 §7.2 的 3×4 网格坐标。 */
export type SkillNode = {
  readonly id: number
  readonly name: string
  /** `(当前/上限)` 的分母，来自 04 §7.3 的逐格读数 */
  readonly cap: number
  /** 9260-p1.txt：三派独门法术。 */
  readonly school?: '昆仑' | '蜀山' | '通天'
  readonly col: 0 | 1 | 2
  readonly row: 0 | 1 | 2 | 3
  /** 解锁前置 = 背景图上指进这一格的箭头与其 Lv.N 标注；要全部满足 */
  readonly requires?: readonly { readonly id: number; readonly level: number }[]
}

/**
 * 炼器树（tab=2）。格位与上限是【截图实测】04 §7.3（#118 / #8）：
 *   c0r0 炼丹之术 0/20（葫芦写「丹」）、c1r0 0/20（布囊写「铸」）、
 *   c1r1 0/20、c2r1 0/20、c1r2 **0/4**、c2r2 0/20。
 * 箭头：c1r0 ─Lv.1↓→ c1r1；c1r1 ─Lv.3→ c2r1；c1r1 ─Lv.5↓→ c1r2；c2r1 ─Lv.5↓→ c2r2。
 *
 * 三个 id 是【照原版 DOM】09b §1.2：**101=灵宝真经、106=御宝秘录、107=炼器总纲**。
 * 炼器总纲是昆仑专属、「上品率 50%→70%」共 4 档 → 正好落在 0/4 的 c1r2。
 * 其余节点名取自 02 §1.4 的攻略原文（炼丹之术 / 百炼之法 / 铸剑之术 / 灵宝真经 / 御宝秘录），
 * **名字↔格位的对应是 [推断]**：04 §7.2 读到 c1r0 的图上写着「铸」，所以把铸剑之术放在 c1r0，
 * 与 02 §1.4「百炼之法 —Lv.1→ 铸剑之术」的先后相反 —— 这一处两份证据打架，记 [推断]。
 * id 102/103/104 也是 [推断]（只是填在 101–107 的空档里）。
 */
const PRODUCE_NODES: readonly SkillNode[] = [
  { id: 102, name: '炼丹之术', cap: 20, col: 0, row: 0 },
  { id: 103, name: '铸剑之术', cap: 20, col: 1, row: 0 },
  { id: 104, name: '百炼之法', cap: 20, col: 1, row: 1, requires: [{ id: 103, level: 1 }] },
  { id: 101, name: '灵宝真经', cap: 20, col: 2, row: 1, requires: [{ id: 104, level: 3 }] },
  { id: 107, name: '炼器总纲', school: '昆仑', cap: 4, col: 1, row: 2, requires: [{ id: 104, level: 5 }] },
  { id: 106, name: '御宝秘录', cap: 20, col: 2, row: 2, requires: [{ id: 101, level: 5 }] },
]

/**
 * 剑术树（tab=1）。格位与上限【截图实测】04 §7.3（#120，用到第 4 行）：
 *   c1r0 御剑（卷轴+剑）、c0r1 莲台法器、c2r1 宽刃剑、c1r1 0/20、c1r2 **0/10**、c1r3 **0/1**。
 * 名称取自 02 §1.4 [原文]：御剑术 → 心剑诀 / 身剑诀 → 大周天剑法 → 万剑诀(0/10) →
 * 门派剑诀(0/1：碎玉/小周天/吸星)。上限 0/10 与 0/1 与 02 的读数完全吻合，
 * 所以这棵树的名字↔格位对应比炼器可靠。id 20X 是 [推断]。
 */
const SWORD_NODES: readonly SkillNode[] = [
  { id: 201, name: '御剑术', cap: 20, col: 1, row: 0 },
  { id: 202, name: '心剑诀', cap: 20, col: 0, row: 1, requires: [{ id: 201, level: 1 }] },
  { id: 203, name: '身剑诀', cap: 20, col: 2, row: 1, requires: [{ id: 201, level: 1 }] },
  {
    id: 204,
    name: '大周天剑法',
    cap: 20,
    col: 1,
    row: 1,
    requires: [{ id: 202, level: 3 }, { id: 203, level: 3 }],
  },
  { id: 205, name: '万剑诀', cap: 10, col: 1, row: 2, requires: [{ id: 204, level: 5 }] },
  { id: 206, name: '门派剑诀', cap: 1, col: 1, row: 3, requires: [{ id: 202, level: 5 }] },
]

/**
 * 术数树（tab=3）。格位与上限【截图实测】04 §7.3（#119）：
 *   c0r0 易经 **0/500**、c2r0 九宫阵图 **0/2**、c1r1 0/20、c2r1 0/20、c0r2 0/20、c2r2 **0/2**。
 * 箭头：易经 ─Lv.5↓→ c1r1；易经 ─Lv.64↓→ c0r2；c1r1 ─Lv.3→ c2r1；
 *       c1r1 ─Lv.20←→ c0r2；c2r0 ─Lv.1↓→ c2r1；c2r1 ─Lv.1↓→ c2r2。
 * 名称取自 02 §1.4 / 03 §1.6 的七种术数 [原文]，**格位对应 [推断]**。
 */
const MATH_NODES: readonly SkillNode[] = [
  { id: 301, name: '易经', cap: 500, col: 0, row: 0 },
  { id: 302, name: '九宫飞星法', cap: 2, col: 2, row: 0 },
  { id: 303, name: '梅花易数', school: '蜀山', cap: 20, col: 1, row: 1, requires: [{ id: 301, level: 5 }] },
  {
    id: 304,
    name: '太乙神数',
    school: '通天',
    cap: 20,
    col: 2,
    row: 1,
    // reconstructed：原格位对应不确定，不能要求学习另一门派专属梅花。
    requires: [{ id: 302, level: 1 }, { id: 301, level: 5 }],
  },
  {
    id: 305,
    name: '紫微斗数',
    cap: 20,
    col: 0,
    row: 2,
    requires: [{ id: 301, level: 64 }], // reconstructed：公共术数不再依赖蜀山专属梅花
  },
  { id: 306, name: '水镜玄光', cap: 2, col: 2, row: 2, requires: [{ id: 302, level: 1 }] }, // reconstructed：公共水镜以前置九宫替代通天专属太乙
]

export const SKILL_TREES: Record<'produce' | 'sword' | 'math', readonly SkillNode[]> = {
  produce: PRODUCE_NODES,
  sword: SWORD_NODES,
  math: MATH_NODES,
}
