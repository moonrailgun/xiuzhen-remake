/**
 * 法术页（skill.jsp）：炼器 / 剑术 / 术数 / 秘笈 四个子标签。
 *
 * 页头与整体骨架是【照原版 DOM】——出处 `all-fragments.html` ←
 * `raw/forum162/article-113453-p2.html@25915`（09 §1.10 / 04 §7.1）：
 *   左 150×30 标题图 + 右 `A.skillup` 子标签用 ` | ` 分隔 + 一行 20px 空行 +
 *   一张 460×425 的背景图 `img/skill/bg{produce}{k}.gif`。
 * **箭头与 Lv.N 标注全在背景图上**，图标只是叠在上面的绝对定位元素（IE 复制时丢了坐标）。
 *
 * 3×4 网格坐标是【截图实测】——04 §7.2：图标外框 64×64，
 * 列左缘 x = 58/198/338（pitch 140），行上缘 y = 0/120/240/360（pitch 120）。
 * 四张截图（#118 #8 炼器、#119 术数、#120 剑术）都是原生 1:1，图标内填充区恰为 60×60。
 *
 * 图标格写法是【照原版 DOM】——09b §1.2（`raw/forum162/article-113453-p1.html@12259`）：
 *   `<A onclick="openRWindow('{名} Lv.{n}','skillmid.jsp?skill={id}')"><IMG title={名}
 *     src="img/skill/{id}.gif"></A>({当前}/{上限})`
 * （原版在 `openRWindow(` 后多一个空格，是模板 bug，09b 明写「复刻时不必照抄」。）
 *
 * 子标签**没有选中态**：原版当前页与其他页同为绿色，见 `DECISIONS-ui.md` 与 `shell.pageHeader`。
 */

import { esc, escJs, each, num, when, js } from './html.ts'
import { pageHeader } from './shell.ts'

export type SkillTab = 'produce' | 'sword' | 'math' | 'book'
export type School = '蜀山' | '昆仑' | '通天'

import { SKILL_TREES, type SkillNode } from '../data/skills.ts'
export { SKILL_TREES, type SkillNode } from '../data/skills.ts'

export type BookRow = {
  readonly name: string
  readonly itemId: number
  readonly count: number
}

export type SkillVm = {
  readonly tab: SkillTab
  /** 炼器树的背景图按道源分三套 `bgproduce{s,k,t}.gif`（04 §7.1 [推断]） */
  readonly school: School
  /** 技能 id → 当前等级；没有的按 0 */
  readonly levels: Readonly<Record<number, number>>
  /** 秘笈标签的书目（本项目按同系列通式推，见下） */
  readonly books?: readonly BookRow[]
}

// —— 网格几何（04 §7.2 截图实测）——

const COL_X = [58, 198, 338] as const
const ROW_Y = [0, 120, 240, 360] as const
const CELL = 64

/** 道源 → 炼器树背景图的尾字母。`k`=昆仑 是 DOM 原文，另两个按同一命名推。 */
const SCHOOL_KEY: Record<School, string> = { 蜀山: 's', 昆仑: 'k', 通天: 't' }

/** 子标签：显示顺序与路由都是 DOM 原文（炼器 tab=2 / 剑术 tab=1 / 术数 tab=3 / 秘笈 tab=6）。 */
export const SKILL_TABS: readonly { readonly tab: SkillTab; readonly label: string; readonly href: string }[] = [
  { tab: 'produce', label: '炼器', href: 'skill.jsp?tab=2' },
  { tab: 'sword', label: '剑术', href: 'skill.jsp?tab=1' },
  { tab: 'math', label: '术数', href: 'skill.jsp?tab=3' },
  { tab: 'book', label: '秘笈', href: 'skill.jsp?tab=6' },
]

/** 各标签的 150×30 标题图。炼器 = titleproduce.gif 是 DOM 原文，其余按同一命名推。 */
const TITLE_IMG: Record<SkillTab, string> = {
  produce: 'titleproduce.gif',
  sword: 'titlesword.gif',
  math: 'titlemath.gif',
  book: 'titlebook.gif',
}

/** 背景图名。`bgproducek.gif` 是 DOM 原文，其余按 04 §7.1 的命名推。 */
function treeBg(vm: SkillVm): string {
  if (vm.tab === 'sword') return 'bgsword.gif'
  if (vm.tab === 'math') return 'bgmath.gif'
  return `bgproduce${SCHOOL_KEY[vm.school]}.gif`
}

const levelOf = (levels: SkillVm['levels'], id: number): number => levels[id] ?? 0

/** 前置全部满足才解锁；未解锁显示原版的「?」图标（04 §7.2：米黄底 + 居中粗黑问号）。 */
export function isUnlocked(node: SkillNode, levels: SkillVm['levels']): boolean {
  return (node.requires ?? []).every((r) => levelOf(levels, r.id) >= r.level)
}

/** 法术树：一张 460×425 背景图 + 绝对定位的图标格与 `(当前/上限)`。 */
function tree(nodes: readonly SkillNode[], vm: SkillVm): string {
  return `<DIV class=skilltree style="background-image:url(img/skill/${treeBg(vm)})">
${each(nodes, (n) => {
    const x = COL_X[n.col]
    const y = ROW_Y[n.row]
    const lv = levelOf(vm.levels, n.id)
    const icon = isUnlocked(n, vm.levels) ? `${n.id}.gif` : 'unknown.gif'
    // 计数在图标右下角外侧：文字左缘 = 图标右缘 +1，文字底 ≈ 图标底 +3（04 §7.2）
    return `<A class=skillcell style="left:${x}px;top:${y}px" href="#" ` +
      `onclick="openRWindow('${js(n.name)} Lv.${lv}','skillmid.jsp?skill=${n.id}')">` +
      `<IMG title="${esc(n.name)}" height=${CELL} width=${CELL} src="img/skill/${icon}"></A>` +
      `<SPAN class=skillcount style="left:${x + CELL + 1}px;top:${y + CELL - 11}px">` +
      `(${num(lv)}/${num(n.cap)})</SPAN>`
  })}
</DIV>`
}

/**
 * 秘笈标签（tab=6）。**既无截图也无 DOM**（PAGE-INDEX 列为 C 档），
 * 这里按同系列通式推：墨迹标题条 + `tablebg` 三列表，列宽与行样式照法宝一览页。
 * 台账：**按同系列推**。旁证只有 05 §12.2 的「秘笈用途表」（19 本）与 05 §6 的秘笈弹窗 #14
 * （「学习秘笈后可以获得秘笈上记载的法门，使用后秘笈会消失。」）→ 操作列做「学习」。
 */
function bookList(vm: SkillVm): string {
  const rows = vm.books ?? []
  return `<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR>
<TD class=bigbold align=middle><A class=help href="#" onclick="hlp('秘笈')">秘笈</A></TD>
</TR></TBODY></TABLE>
<TABLE class="tablebg middle" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle><TD width="60%">名称</TD><TD width="20%">数量</TD><TD width="20%">操作</TD></TR>
${when(
    rows.length === 0,
    () => `<TR class="trbg middle" align=middle><TD colSpan=3><SPAN class=smallgray>目前没有任何秘笈</SPAN></TD></TR>`,
    () => each(rows, (b) =>
      `<TR class="trbg middle" align=middle>` +
      `<TD align=left><A class=skillup href="#" onclick="openRWindow('${js(b.name)}','itemmid.jsp?item=${b.itemId}')">${esc(b.name)}</A></TD>` +
      `<TD>${num(b.count)}</TD>` +
      `<TD><A class=skillup href="#" onclick="sendUseItem3()">学习</A></TD></TR>`),
  )}
</TBODY></TABLE>`
}

/** 渲染法术页左栏（`#gleft` 的内容）。 */
export function renderSkill(vm: SkillVm): string {
  const tabs = SKILL_TABS.map((t) => ({ label: t.label, href: t.href }))
  const body =
    vm.tab === 'book' ? bookList(vm) : tree(SKILL_TREES[vm.tab], vm)
  // 页头与树之间原版有一行 height=20 的空行（DOM 原文）
  return `${pageHeader(TITLE_IMG[vm.tab], tabs)}
<DIV style="height:20px"></DIV>
${body}`
}
