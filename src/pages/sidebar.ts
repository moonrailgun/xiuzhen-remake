/**
 * 中栏（事件）与右栏（任务 / 护法）—— 这两栏在所有主页面上都在，不是人物页专有。
 *
 * 依据：原版 map.jsp 整页 DOM 里同样有 #gmid / #gright；截图 #2 与 #114 的这两栏结构一致。
 * 事件分四类，对应 `src/engine/timeline.ts` 的 EventKind：
 * 战斗事件 / 炼器事件 / 移动事件 / 修炼事件。
 */

import { esc, each, when } from './html.ts'
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

/** 事件区块：bigbold 标题 + 若干行；空区块原版仍然显示标题。 */
function eventBlock(title: string, rows: readonly EventRow[], emptyText?: string): string {
  return `<TABLE cellSpacing=0 cellPadding=3 width=240 border=0><TBODY>
<TR><TD class=bigbold colSpan=3>${esc(title)}</TD></TR>
${
    rows.length === 0
      ? `<TR><TD class=smallgray colSpan=3>${esc(emptyText ?? '目前没有任何事件')}</TD></TR>`
      : each(rows, (r) => {
          const speed = r.speedup
            // 「半」= 减半剩余时间（2 仙石），「完」= 直接完成（10 仙石）
            ? `<TD class=smallbold align=right noWrap><A class=skillup href="#" onclick="paycoin(8)">半</A> <A class=skillup href="#" onclick="paycoin(10)">完</A></TD>`
            : ''
          const cancel = r.cancelId
            ? `<TD width=16><A href="#" onclick="cancelmove('${esc(r.cancelId)}')"><IMG src="img/event/cancel.gif" title="取消"></A></TD>`
            : ''
          const main = `<TR class=middle><TD width=16>${
            r.icon ? `<IMG src="img/${esc(r.icon)}">` : '<IMG src="img/event/mark.gif">'
          }</TD><TD>${esc(r.text)}</TD><TD align=right noWrap>${countdown(r.seconds)}</TD>${cancel}</TR>`
          const next = r.nextLeg
            ? `<TR class=middle><TD></TD><TD>${esc(r.nextLeg.text)}</TD><TD align=right noWrap>${countdown(r.nextLeg.seconds)}</TD></TR>`
            : ''
          return speed
            ? `<TR><TD colSpan=2></TD>${speed}</TR>${main}${next}`
            : `${main}${next}`
        })
  }
</TBODY></TABLE>`
}

export function renderMid(vm: MidVm): string {
  return [
    eventBlock('战斗事件', vm.battle, '目前没有任何事件'),
    eventBlock('炼器事件', vm.craft, '目前没有任何事件'),
    // 移动事件在没有移动时原版不显示这一块
    when(vm.move.length > 0, () => eventBlock('移动事件', vm.move)),
    eventBlock('修炼事件', vm.cultivate, '目前没有任何事件'),

    `<TABLE cellSpacing=0 cellPadding=3 width=240 border=0><TBODY>
<TR><TD class=bigbold>当前场景中的NPC</TD></TR>
${
      vm.npcs.length === 0
        ? '<TR><TD class=smallgray>当前场景中没有NPC</TD></TR>'
        : each(vm.npcs, (n) => `<TR class=middle><TD><A class=skillup href="#" onclick="openLWindow('','npc.jsp?name=${encodeURIComponent(n)}')">${esc(n)}</A></TD></TR>`)
    }
</TBODY></TABLE>`,

    `<TABLE cellSpacing=0 cellPadding=3 width=240 border=0><TBODY>
<TR><TD class=bigbold colSpan=2>当前场景中的玩家</TD></TR>
${
      vm.players.length === 0
        ? '<TR><TD class=smallgray colSpan=2>当前场景中只有你一个人</TD></TR>'
        : each(vm.players, (p) => {
            const name = esc(p.name)
            return `<TR class=middle><TD width=28><IMG src="img/avatar/${esc(p.avatar)}.gif" width=24 height=24></TD>` +
              `<TD noWrap><A class=skillup href="#" onclick="openLWindow('','playerinfo.jsp?name=${encodeURIComponent(p.name)}')">${name}</A>` +
              `${p.suffix ? ` <SPAN class=smallgray>(${p.suffix})</SPAN>` : ''}` +
              // 四个操作：攻击 / 推算 / 消息 / 加为护法
              ` <A href="#" onclick="openLWindow('','fight.jsp?target=${encodeURIComponent(p.name)}')"><IMG src="img/event/attack.gif" title="攻击"></A>` +
              ` <A href="#" onclick="spyPlayer('${esc(p.name)}')"><IMG src="img/event/spy.gif" title="推算"></A>` +
              ` <A href="#" onclick="openLWindow('写消息','writemsg.jsp?receiver=${encodeURIComponent(p.name)}')"><IMG src="img/talk.gif" title="发送消息"></A>` +
              ` <A href="#" onclick="addpal('${esc(p.name)}')"><IMG src="img/friend.gif" title="加为护法"></A>` +
              `</TD></TR>`
          })
    }
<TR><TD colSpan=2 align=center><A class=skillup href="#" onclick="openLWindow('','playerlist.jsp')">点击此处查看更多玩家</A></TD></TR>
</TBODY></TABLE>`,
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
          const body = `<A class=skillup href="#" onclick="openLWindow('','quest.jsp?questid=${esc(q.id)}')">${esc(q.title)}</A>` +
            (q.detail ? `<BR><SPAN class=middle>${esc(q.detail)}</SPAN>` : '')
          return `<TR class="trbg middle"><TD width=16 vAlign=top><IMG src="img/event/quest.gif"></TD>` +
            `<TD>${body}</TD>` +
            `<TD width=30 vAlign=top align=right>${
              q.abandonable === false
                ? ''
                : `<A class=skillup href="#" onclick="cancelquest('${esc(q.id)}')">放弃</A>`
            }</TD></TR>`
        })
  }
<TR class="trbg middle"><TD colSpan=3><IMG src="img/event/mark.gif">&nbsp;<A class=skillup href="#" onclick="openLWindow('','quest.jsp?tab=avail')">查看可领取任务</A></TD></TR>
</TBODY></TABLE>
<BR>
${guardBlock('为我护法', vm.guardingMe, vm.guardCap, '请人护法', 'guard.jsp?tab=1')}
${guardBlock('为他护法', vm.guardingOthers, vm.guardCap, '为人护法', 'guard.jsp?tab=2')}`
}
