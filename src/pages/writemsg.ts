/**
 * 写消息（writemsg.jsp，L 窗，内容表宽 460）。
 *
 * ★ 本页是全项目证据最少的一格：**零截图、零 DOM**（`docs/spec/PAGE-INDEX.md` §27）。
 * 留下来的只有三种调用形态（`09 §1.17` / `§1.18`）：
 *   `writemsg.jsp`（从收件箱顶部「写消息」）、
 *   `writemsg.jsp?receiver={名字}`（从场景玩家行的 `talk.gif` / 资料窗的「发送消息」）、
 *   `writemsg.jsp?remsg={msgid}`（从读信页「回复」钮）。
 *
 * 所以下面整张表都是【重建】，只沿用同族页面的通式：
 *  - 表壳 `TABLE.tablebg cellSpacing=1 cellPadding=3 width=460`（`09 §5` 表格通用参数）；
 *  - 段标题行 `TR.titlebg.middlebold`，标签格 `TD.middlebold width=80`（同 `09 §1.3` 资料表）；
 *  - 按钮用原生 `<INPUT type=button>`，与读信页的「回复/删除/关闭」一致（`09 §1.1`）；
 *  - 提交动作名 `sendmsg` 也是重建 —— `09 §1.18` 的动作全表里没有它。
 *
 * **不画「写消息」标题带**：窗名由浮窗标题条显示（调用方传的就是「写消息」），
 * 原版不会在内容里重复它 —— `guides/54385-p1.html` 那份实捕里 R 窗壳子标题是「消息」，
 * 内容表头写的是「收件箱」，两者不同名。
 */

import { esc } from './html.ts'

export type WriteMsgVm = {
  /** 预填的收件人（`?receiver=` 或由 `?remsg=` 反查出的原发信人）；新写信为空串 */
  readonly receiver: string
  /** 预填主题。回复时原版主题是 `Re:{原主题}`（`03 §1.1` [原文]） */
  readonly subject: string
  /** 回复的原信 id，回传给服务端用；新写信为 null */
  readonly replyTo: number | null
}

/** 回复时的主题前缀 [原文]（`Re:你也真可怜`）。 */
export const replySubject = (original: string): string => `Re:${original}`

/** 渲染写消息表单。 */
export function renderWriteMsg(vm: WriteMsgVm): string {
  return `<FORM id=writemsgform>
<INPUT type=hidden name=remsg value=${vm.replyTo ?? ''}>
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="trbg middle"><TD class=middlebold width=80>收件人：</TD>
<TD><INPUT class=middle id=msgreceiver size=20 name=receiver value="${esc(vm.receiver)}"></TD></TR>
<TR class="trbg middle"><TD class=middlebold>主题：</TD>
<TD><INPUT class=middle id=msgsubject size=40 name=subject value="${esc(vm.subject)}"></TD></TR>
<TR class="trbg middle"><TD class=middlebold vAlign=top>正文：</TD>
<TD><TEXTAREA class=middle id=msgtext rows=10 cols=48 name=content></TEXTAREA></TD></TR>
<TR class="trbg middle" align=middle><TD colSpan=2>
<INPUT type=button value=发送 onclick="postForm('sendmsg', 'form=writemsgform');closeLWindow();">　<INPUT type=button value=关闭 onclick=closeLWindow();></TD></TR>
</TBODY></TABLE></FORM>`
}
