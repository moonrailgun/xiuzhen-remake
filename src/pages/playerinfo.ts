/**
 * 个人资料（playerinfo.jsp[?playerid=N]，L 窗，内容表宽 460）。
 *
 * 这一页有**全库最多的 DOM 样本（66 段）**，所以整张表逐字照抄，见 `09 §1.3`
 * （SRC=`forum162/article-104797-p1.html@11885` 标题条 / `@12039` 自己态带「编辑资料」/
 * `@13852` 删除角色块；批量样本另见 `article-105056-p1|p2|p3` 约 20 份）：
 *
 *  - 墨迹标题条 `TABLE.titlebg2 width=460` 单格 `玩家：{名字}`；
 *  - 正表首行左侧 `TD.trbg rowSpan=9` = 头像 + `talk.gif`（发送消息）+ `friend.gif`（加为护法），
 *    右侧 `TD.titlebg colSpan=2 详细资料`；其后 8 行「属性/排名/道行/道源/门派/年龄/性别/所在地」；
 *  - ★ **标点不统一是原版如此**：`属性：` 用全角冒号，其余 7 行用半角 `:`，照抄不改；
 *  - 道行显示为**中文数字年**（「三千六百年」「二年零五个月」）；年龄未填为 `-`；
 *  - 末尾 `简介` 段；自己态多一行 `编辑资料`（`playerinfo.jsp?tab=2`）。
 *
 * 删除角色块 [原文]（`03 §1.15` / `09 §1.3`）：两段文案一字不改；
 * 「角色正在删除中」那一句在原版里是**内联** `style="COLOR:#ff0000"` 而不是 class ——
 * 全站唯一一处字面 `#ff0000`（`DECISIONS-ui` §10 明确要求照抄），所以这里也写成内联。
 * 删除/撤回的按钮外观原版没留下，按读信页的原生 `<INPUT type=button>` 通式【重建】。
 */

import { esc, escJs, when } from './html.ts'

/** 动态值进内联 onclick 的 JS 字符串字面量：先转 JS、再转 HTML 属性，两层都要。 */
const js = (v: unknown): string => esc(escJs(v))

export type PlayerInfoVm = {
  readonly playerId: number
  readonly name: string
  /** 头像基名 `{shushan|kunlun|tongtian}{m|f}` */
  readonly avatar: string
  /** 本命属性，金木水火土 */
  readonly element: string
  /** 道行榜排名 */
  readonly rank: number
  /** 道行，中文数字年 */
  readonly dao: string
  /** 道源（出身门派）：蜀山 / 昆仑 / 通天 */
  readonly origin: '蜀山' | '昆仑' | '通天'
  /** 所属门派；无门派时原版显示 `-` */
  readonly ally: { readonly id: number; readonly name: string } | null
  /** 门派内头衔，跟在门派名后面（「封神榜 唯我金仙」） */
  readonly allyTitle?: string
  /** 玩家自填，未填为 `-` */
  readonly age: string
  readonly gender: '男' | '女'
  /** 玩家自填的所在地 */
  readonly location: string
  readonly intro: string
  /** 看自己 → 多「编辑资料」与删除角色块 */
  readonly self: boolean
  /** 正在删除中时剩余天数（如 2.99）；null 表示没有在删 */
  readonly deletingDays: number | null
}

/** 删除角色说明 [原文]。 */
export const DELETE_NOTICE =
  '你可以在这里删除你的角色。从你开始执行删除命令后，需要3天时间你的角色才会被完全删除。在24小时之内你可以撤回你的删除命令。'

const row = (label: string, value: string): string =>
  `<TR class="trbg middle"><TD>${esc(label)}</TD><TD>${value}</TD></TR>`

/** 删除角色块。只出现在自己的资料页。 */
function deleteBlock(vm: PlayerInfoVm): string {
  const deleting = vm.deletingDays !== null
  return `<TR class="titlebg bigbold" align=middle><TD colSpan=3>删除角色</TD></TR>
<TR class="trbg middle"><TD colSpan=3>${esc(DELETE_NOTICE)}</TD></TR>
${
    deleting
      ? `<TR class="trbg middle"><TD colSpan=3><SPAN style="COLOR:#ff0000">角色正在删除中，离完全删除还有<SPAN class=b>${esc(vm.deletingDays)}</SPAN>天。你还可以撤回你的删除命令。</SPAN></TD></TR>
<TR class="trbg middle" align=middle><TD colSpan=3><INPUT type=button value=撤回删除 onclick="postForm('canceldelplayer', '');"></TD></TR>`
      : `<TR class="trbg middle" align=middle><TD colSpan=3><INPUT type=button value=删除角色 onclick="MDialogOkCancel('', '确定要删除这个角色吗?', function(){postForm('delplayer', '');})"></TD></TR>`
  }`
}

/** 渲染个人资料。 */
export function renderPlayerInfo(vm: PlayerInfoVm): string {
  const allyCell = vm.ally
    ? `<A class=skillup onclick="openLWindow('', 'allyinfo.jsp?ally=${vm.ally.id}')" href="#">${esc(vm.ally.name)}</A>${vm.allyTitle ? ` ${esc(vm.allyTitle)}` : ''}`
    : '-'

  return `<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width=460 border=0><TBODY>
<TR class=bigbold align=middle><TD>玩家：${esc(vm.name)}</TD></TR></TBODY></TABLE>
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class=middlebold align=middle>
<TD class=trbg vAlign=center align=middle rowSpan=9><IMG src="img/avatar/${esc(vm.avatar)}.gif"><BR>
<A onclick="openLWindow('写消息', 'writemsg.jsp?receiver=${js(vm.name)}')" href="#"><IMG title=发送消息 src="img/talk.gif"></A>&nbsp;<A onclick="postForm('addpal', 'playerid=${vm.playerId}')" href="#"><IMG title=加为护法 src="img/friend.gif"></A></TD>
<TD class=titlebg colSpan=2>详细资料</TD></TR>
<TR class="trbg middle"><TD width=80>属性：</TD><TD width=200>${esc(vm.element)}</TD></TR>
${row('排名:', String(vm.rank))}
${row('道行:', esc(vm.dao))}
${row('道源:', esc(vm.origin))}
${row('门派:', allyCell)}
${row('年龄:', esc(vm.age))}
${row('性别:', esc(vm.gender))}
${row('所在地:', esc(vm.location))}
<TR class="titlebg middlebold" align=middle><TD colSpan=3>简介</TD></TR>
<TR class="trbg middle"><TD colSpan=3>${esc(vm.intro)}</TD></TR>
${when(vm.self, () =>
    `<TR class="trbg middle"><TD class=skillup colSpan=3><IMG height=7 src="img/event/mark.gif" width=4> <A onclick="openLWindow('','playerinfo.jsp?tab=2')" href="#">编辑资料</A></TD></TR>
${deleteBlock(vm)}`)}
</TBODY></TABLE>`
}
