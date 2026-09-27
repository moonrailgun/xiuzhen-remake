/**
 * 中栏（事件）与右栏（任务 / 护法）—— 这两栏在所有主页面上都在，不是人物页专有。
 *
 * 依据：原版 map.jsp 整页 DOM 里同样有 #gmid / #gright；截图 #2 与 #114 的这两栏结构一致。
 * 事件分四类，对应 `src/engine/timeline.ts` 的 EventKind：
 * 战斗事件 / 炼器事件 / 移动事件 / 修炼事件。
 */

import { esc, escJs, each, when, js } from './html.ts'
import { countdown } from './shell.ts'

export type EventRow = {
  /** 事件栏左侧的小图标文件名，如 `event/battle.gif` */
  readonly icon?: string
  /** 正文，如「1 返回」「炼制丹药 × 1」「百炼之法 Lv1」 */
  readonly text: string
  /** 剩余秒数；null 表示时间未知（原版显示 ???） */
  readonly seconds: number | null
  /** 仙石加速：修炼事件右上角的「半 完」 */
  readonly speedup?: boolean
  /**
   * 战斗事件行整行是个链接，点开 B 窗的战斗事件总览。
   * 写法照原版 DOM（09 §1.7）：`<A style="COLOR:black" onclick="openBWindow('', '…')">`
   * 包住图标与文字，倒计时留在链接外面。
   */
  readonly openUrl?: string
  /** 可取消（移动事件右侧的红 ×） */
  readonly cancelId?: string
  /** 多段移动的下一段 */
  readonly nextLeg?: { readonly text: string; readonly seconds: number }
}

export type ScenePlayer = {
  readonly name: string
  /** 状态后缀：n 未出保 / m 移动中 / i 三天未上线 / b 封停 / s 免战 */
  readonly suffix?: 'n' | 'm' | 'i' | 'b' | 's'
  readonly avatar: string
}

export type QuestRow = {
  readonly id: string
  readonly title: string
  /** 第二行的补充，如「目标地点：(154,102)」 */
  readonly detail?: string
  readonly abandonable?: boolean
}

export type MidVm = {
  readonly battle: readonly EventRow[]
  readonly craft: readonly EventRow[]
  readonly move: readonly EventRow[]
  readonly cultivate: readonly EventRow[]
  readonly npcs: readonly string[]
  readonly players: readonly ScenePlayer[]
}

export type RightVm = {
  readonly quests: readonly QuestRow[]
  /** 为我护法 / 为他护法，原版都是 (0/7) */
  readonly guardingMe: number
  readonly guardingOthers: number
  readonly guardCap: number
}

/**
 * 六个区块共用的外壳。**照原版 DOM**（`09 §2.6` 逐字）：
 *
 *   外表 cellSpacing=0 **cellPadding=0** width=240
 *    ├ 第一行：左格套一张 width={80|200} 的小表（`TD width=8>&nbsp;` 顶一格 +
 *    │          `TD.bigbold > A.help onclick="hlp('主题')"`），右格放「半/完」等操作
 *    ├ 第二行：空态表 cellSpacing=0 **cellPadding=8** —— 空态那一格是
 *    │          `TD.smallgray align=left`，文案**前面有一个全角空格**
 *    ├ 第三行：事件行表 cellPadding=3
 *    └ 第四行：`TD colSpan=2 height=5` 的垫高行
 *
 * 注意**帮助主题名与显示标题不同**：显示「当前场景中的NPC」，hlp 主题是「场景中的NPC」。
 */
function blockShell(opts: {
  readonly title: string
  readonly helpTopic: string
  /** 标题小表的宽度：事件块 80，场景块 200（原文） */
  readonly titleWidth: 80 | 200
  /** 右上角操作区，默认一个 &nbsp; */
  readonly corner?: string
  readonly body: string
}): string {
  return `<TABLE cellSpacing=0 cellPadding=0 width=240 border=0><TBODY>
<TR>
<TD><TABLE cellSpacing=0 cellPadding=0 width=${opts.titleWidth} border=0><TBODY><TR>
<TD width=8>&nbsp;</TD>
<TD class=bigbold><A class=help href="#" onclick="hlp('${js(opts.helpTopic)}')">${esc(opts.title)}</A></TD>
</TR></TBODY></TABLE></TD>
<TD align=right>${opts.corner ?? '&nbsp;'}</TD>
</TR>
${opts.body}
<TR><TD colSpan=2 height=5></TD></TR>
</TBODY></TABLE>`
}

/** 空态行：自己一张 cellPadding=8 的表，文案前有一个全角空格（原文）。 */
const emptyRow = (text: string): string =>
  `<TR><TD colSpan=2><TABLE cellSpacing=0 cellPadding=8 width=240 border=0><TBODY>
<TR><TD class=smallgray align=left>　${esc(text)}</TD></TR>
</TBODY></TABLE></TD></TR>`

/** 事件区块：标题 + 若干行；空区块原版仍然显示标题。 */
function eventBlock(
  title: string,
  rows: readonly EventRow[],
  emptyText?: string,
  helpTopic = title,
): string {
  // 「半 完」在原版是整块的右上角操作，不是某一行的（`09 §2.6` 的模板里它在第一行右格）
  const speedup = rows.some((r) => r.speedup)
    // 原文：半 = 减半所有修炼事件剩余时间(2 仙石, pay=10)；完 = 直接完成(10 仙石, pay=11)
    ? `<TABLE class=skillup cellSpacing=0 cellPadding=0 width=50 align=right border=0><TBODY><TR>
<TD><A class=skillup href="#" onclick="MDialogOkCancel('', '减半所有修炼事件剩余时间，需要花费2个仙石', 'ajaxPost(\\'paycoin\\', \\'pay=10\\', refleshAll);')">半</A></TD>
<TD><A class=skillup href="#" onclick="MDialogOkCancel('', '直接完成所有修炼事件，需要花费10个仙石', 'ajaxPost(\\'paycoin\\', \\'pay=11\\', refleshAll);')">完</A></TD>
</TR></TBODY></TABLE>`
    : undefined

  const body = rows.length === 0
    ? emptyRow(emptyText ?? '目前没有任何事件')
    : `<TR><TD colSpan=2><TABLE cellSpacing=0 cellPadding=3 width=240 border=0><TBODY>
${eventRows(rows)}
</TBODY></TABLE></TD></TR>`

  return blockShell({
    title,
    helpTopic,
    titleWidth: 80,
    ...(speedup ? { corner: speedup } : {}),
    body,
  })
}

/**
 * 事件行。两种排法，都对着原版实物做：
 *
 * **单行事件**（炼器/战斗/修炼）—— 照 `09 §2.6` 的 DOM 原文：
 *   `<TD class=small width=140>　<IMG mark.gif><IMG mark.gif> 炼制丹药 × 1</TD>`
 *   `<TD class=small width=60><SPAN title=剩余时间 start=…></TD><TD>&nbsp;</TD>`
 *   两个墨点**在文字格内**，不单独占一格。
 *
 * **移动事件**（两行）—— 照截图 #114（2010-08，`z0811xz01.jpg` 中栏 y195–285）：
 *   墨点与红 × 各占一格且**都是 `rowSpan=2`**，竖直居中跨在两行中间；
 *   第一行是当前段坐标 + 总剩余，第二行是「下个目标(x,y)」+ 下一格剩余。
 *   （研究笔记 §2.6 的「右侧 rowSpan=2 的取消钮」说的就是这个。）
 */
function eventRows(rows: readonly EventRow[]): string {
  return each(rows, (r) => {
    // 战斗/返回行把墨点换成 attack.gif / back.gif（`09 §资源表`）
    const dots = r.icon && r.icon !== 'event/mark.gif'
      ? `<IMG src="img/${esc(r.icon)}">`
      : '<IMG src="img/event/mark.gif"><IMG src="img/event/mark.gif">'
    const time = (s: number | null) =>
      `<TD class=small width=60 align=right noWrap>${countdown(s)}</TD>`

    if (r.nextLeg) {
      const cancel = r.cancelId
        ? `<TD width=16 rowSpan=2 align=center><A href="#" onclick="cancelmove('${js(r.cancelId)}')"><IMG src="img/event/cancel.gif" title="取消"></A></TD>`
        : '<TD width=16 rowSpan=2>&nbsp;</TD>'
      return `<TR class=middle><TD width=20 rowSpan=2 align=center>${dots}</TD>` +
        `<TD class=small width=124>${esc(r.text)}</TD>${time(r.seconds)}${cancel}</TR>` +
        `<TR class=middle><TD class=small width=124>${esc(r.nextLeg.text)}</TD>` +
        `${time(r.nextLeg.seconds)}</TR>`
    }

    const label = `　${dots} ${esc(r.text)}`
    const cell = r.openUrl
      ? `<A style="COLOR:black" href="#" onclick="openBWindow('', '${js(r.openUrl)}')">${label}</A>`
      : label
    const cancel = r.cancelId
      ? `<A href="#" onclick="cancelmove('${js(r.cancelId)}')"><IMG src="img/event/cancel.gif" title="取消"></A>`
      : '&nbsp;'
    return `<TR class=middle><TD class=small width=140>${cell}</TD>` +
      `${time(r.seconds)}<TD width=16 align=center>${cancel}</TD></TR>`
  })
}

export function renderMid(vm: MidVm): string {
  return [
    eventBlock('战斗事件', vm.battle, '目前没有任何事件'),
    eventBlock('炼器事件', vm.craft, '目前没有任何事件'),
    // 移动事件在没有移动时原版不显示这一块
    when(vm.move.length > 0, () => eventBlock('移动事件', vm.move)),
    eventBlock('修炼事件', vm.cultivate, '目前没有任何事件'),

    // 场景两块的标题表宽是 200（事件块是 80），
    // 且 hlp 主题名比显示标题短：「场景中的NPC」「场景中的玩家」（原文）
    blockShell({
      title: '当前场景中的NPC',
      helpTopic: '场景中的NPC',
      titleWidth: 200,
      body: vm.npcs.length === 0
        ? emptyRow('当前场景中没有NPC')
        : `<TR><TD colSpan=2><TABLE cellSpacing=0 cellPadding=3 width=240 border=0><TBODY>
${each(vm.npcs, (n) => `<TR class=middle><TD class=small>　<A class=skillup href="#" onclick="openLWindow('','npc.jsp?name=${js(encodeURIComponent(n))}')">${esc(n)}</A></TD></TR>`)}
</TBODY></TABLE></TD></TR>`,
    }),

    blockShell({
      title: '当前场景中的玩家',
      helpTopic: '场景中的玩家',
      titleWidth: 200,
      body: `<TR><TD colSpan=2>${
      vm.players.length === 0
        ? `<TABLE cellSpacing=0 cellPadding=8 width=240 border=0><TBODY>
<TR><TD class=smallgray align=left>　当前场景中只有你一个人</TD></TR>
</TBODY></TABLE>`
        : `<TABLE cellSpacing=0 cellPadding=3 width=240 border=0><TBODY>
${each(vm.players, (p) => {
            const name = esc(p.name)
            return `<TR class=middle><TD width=28><IMG src="img/avatar/${esc(p.avatar)}.gif" width=24 height=24></TD>` +
              `<TD noWrap><A class=skillup href="#" onclick="openLWindow('','playerinfo.jsp?name=${js(encodeURIComponent(p.name))}')">${name}</A>` +
              `${p.suffix ? ` <SPAN class=smallgray>(${p.suffix})</SPAN>` : ''}` +
              // 四个操作：攻击 / 推算 / 消息 / 加为护法
              ` <A href="#" onclick="openLWindow('','fight.jsp?target=${js(encodeURIComponent(p.name))}')"><IMG src="img/event/attack.gif" title="攻击"></A>` +
              ` <A href="#" onclick="spyPlayer('${js(p.name)}')"><IMG src="img/event/spy.gif" title="推算"></A>` +
              ` <A href="#" onclick="openLWindow('写消息','writemsg.jsp?receiver=${js(encodeURIComponent(p.name))}')"><IMG src="img/talk.gif" title="发送消息"></A>` +
              ` <A href="#" onclick="addpal('${js(p.name)}')"><IMG src="img/friend.gif" title="加为护法"></A>` +
              `</TD></TR>`
          })}
</TBODY></TABLE>`
    }<TABLE cellSpacing=0 cellPadding=3 width=240 border=0><TBODY>
<TR><TD align=center><A class=skillup href="#" onclick="openLWindow('','playerlist.jsp')">点击此处查看更多玩家</A></TD></TR>
</TBODY></TABLE></TD></TR>`,
    }),
  ].join('\n')
}

export function renderRight(vm: RightVm): string {
  const guardBlock = (label: string, n: number, cap: number, linkText: string, url: string) =>
    `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=220 border=0><TBODY>
<TR class="titlebg bigbold" align=middle><TD>${esc(label)} (${n}/${cap})</TD></TR>
<TR class="trbg middle"><TD><IMG src="img/event/mark.gif">&nbsp;<A class=skillup href="#" onclick="openLWindow('','${url}')">${esc(linkText)}</A></TD></TR>
</TBODY></TABLE>`

  return `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=220 border=0><TBODY>
<TR class="titlebg bigbold" align=middle><TD colSpan=3>任务</TD></TR>
${
    vm.quests.length === 0
      ? '<TR class="trbg middle"><TD class=smallgray colSpan=3>目前没有任务</TD></TR>'
      : each(vm.quests, (q) => {
          const body = `<A class=skillup href="#" onclick="openLWindow('','quest.jsp?questid=${js(q.id)}')">${esc(q.title)}</A>` +
            (q.detail ? `<BR><SPAN class=middle>${esc(q.detail)}</SPAN>` : '')
          return `<TR class="trbg middle"><TD width=16 vAlign=top><IMG src="img/event/quest.gif"></TD>` +
            `<TD>${body}</TD>` +
            `<TD width=30 vAlign=top align=right>${
              q.abandonable === false
                ? ''
                : `<A class=skillup href="#" onclick="cancelquest('${js(q.id)}')">放弃</A>`
            }</TD></TR>`
        })
  }
<TR class="trbg middle"><TD colSpan=3><IMG src="img/event/mark.gif">&nbsp;<A class=skillup href="#" onclick="showAvailableQuests()">查看可领取任务</A></TD></TR>
</TBODY></TABLE>
<BR>
${guardBlock('为我护法', vm.guardingMe, vm.guardCap, '请人护法', 'guard.jsp?tab=1')}
${guardBlock('为他护法', vm.guardingOthers, vm.guardCap, '为人护法', 'guard.jsp?tab=2')}`
}
