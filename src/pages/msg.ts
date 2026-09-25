/**
 * 收件箱（msg.jsp，R 窗，内容表宽 230）。
 *
 * 外壳与分页栏是【照原版 DOM】—— 2009-02-13 s14 服 map.jsp 整页里的 `#rwindowcontent`
 * （`docs/research/recovered-assets/pasted-dom/54385-post28-map.jsp-fullpage.html`），
 * 逐字沿用：顶部「收件箱 | 写消息」两个 `SPAN.skillup`（原版 `openRWindow( '消息', …)`
 * 括号后带一个空格，照抄）、`FORM#msgform` 里 `TABLE.tablebg cellSpacing=1 cellPadding=2 width=230`、
 * 表头 = 30px 全选 checkbox + `收件箱`、底栏「删除」按钮 + `第{p}页 / 共{n}页` + 四个分页图。
 *
 * ★ 唯一的缺口：**样本收件箱是空的，有信时的列表行 DOM 未留存**（这也是本页只有 B 档的原因，
 *   见 `docs/spec/PAGE-INDEX.md` §25）。所以下面的消息行是【按表头通式重建】：
 *   原版空表头写的是 `TD width=30` + `TD colSpan=2`（合计 3 列），而消息本身有
 *   主题 / 发信人 / 发信时间 三项（见读信页 `09 §1.1` 的三行表头），
 *   所以有信时按 4 列（勾选框 + 三项）做，表头的 colSpan 随之变成 3；
 *   空表时严格保持原版的 `colSpan=2`。
 */

import { esc, each, when } from './html.ts'

export type MsgRow = {
  readonly id: number
  /** 主题。战报为 `{攻}攻击{防}`，推算为 `{推算者}推算{目标}`，玩家回信为 `Re:{原主题}` */
  readonly subject: string
  /** 发信人。系统信恒为字面量「系统」 */
  readonly sender: string
  /** YYYY-MM-DD HH:MM:SS */
  readonly sentAt: string
  /** 未读。原版未读标记的样式未留存（缺口），这里只在数据上留出位置 */
  readonly unread?: boolean
}

export type MsgVm = {
  readonly rows: readonly MsgRow[]
  /** 当前页码，从 1 起 */
  readonly page: number
  readonly pages: number
}

/** 四个分页图标，`alt` 与文件名都是原版原文。 */
const PAGERS: readonly { readonly img: string; readonly alt: string }[] = [
  { img: 'top.gif', alt: '首页' },
  { img: 'ahead.gif', alt: '前一页' },
  { img: 'back.gif', alt: '后一页' },
  { img: 'bottom.gif', alt: '尾页' },
]

/** 渲染收件箱。 */
export function renderMsg(vm: MsgVm): string {
  const target = [1, Math.max(1, vm.page - 1), Math.min(vm.pages, vm.page + 1), vm.pages]

  return `<DIV class=middle><SPAN class=skillup><A onclick="openRWindow( '消息', 'msg.jsp')" href="#">收件箱</A></SPAN> | <SPAN class=skillup><A onclick="openLWindow( '写消息', 'writemsg.jsp')" href="#">写消息</A></SPAN></DIV>
<FORM id=msgform>
<TABLE class=tablebg cellSpacing=1 cellPadding=2 width=230 align=center border=0>
<TBODY>
<TR class="titlebg smallbold" align=middle>
<TD width=30><INPUT onclick=selectAllMsg(this.checked) type=checkbox></TD>
<TD colSpan=${vm.rows.length === 0 ? 2 : 3}>收件箱</TD></TR>
${when(vm.rows.length > 0, () =>
    `<TR class="trbg2 small" align=middle><TD>&nbsp;</TD><TD>主题</TD><TD>发信人</TD><TD>发信时间</TD></TR>` +
    each(vm.rows, (r) =>
      `<TR class="trbg small"><TD align=middle><INPUT type=checkbox name=ids value=${r.id}></TD>` +
      `<TD><A class=${r.unread ? 'smallbold' : 'small'} onclick="openLWindow('','msgdetail.jsp?msg=${r.id}')" href="#">${esc(r.subject)}</A></TD>` +
      `<TD align=middle>${esc(r.sender)}</TD>` +
      `<TD class=smallgray align=middle>${esc(r.sentAt)}</TD></TR>`))}
</TBODY></TABLE></FORM>
<TABLE cellSpacing=0 cellPadding=3 width=230 border=0>
<TBODY>
<TR class=small align=right>
<TD><INPUT onclick=removeSelectMsg(1); type=button value=删除></TD>
<TD width=175>第${vm.page}页 / 共${vm.pages}页${each(PAGERS, (p, i) =>
    `<A onclick="openRWindow('消息','msg.jsp?page=${target[i] ?? 1}')" href="#"><IMG alt=${p.alt} src="img/${p.img}">${i === PAGERS.length - 1 ? '　' : ''}</A>${i === PAGERS.length - 1 ? '' : ' '}`)}</TD></TR></TBODY></TABLE>`
}
