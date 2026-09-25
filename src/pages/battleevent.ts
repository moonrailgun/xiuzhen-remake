/**
 * 战斗事件总览（`battleevent.jsp?tab=N`，B 窗，**表宽 900**）。
 *
 * **整页照原版 DOM** —— `docs/research/09-pasted-dom-templates.md` §1.7，10 段片段、
 * 出击 / 来袭 / 相遇 / 缠斗四态齐全：
 *   `guides/54385-p2.html@17928`（页头）、`@18320`（单剑）、
 *   `forum162/article-106553-p1.html@10392`（来袭）、
 *   `forum162/article-95258-p1.html@4277`（多人缠斗）、
 *   `forum162/article-106697-p1`（缠斗）、`article-97112-p1`（相遇）、`article-103222-p1`（出击）。
 *
 * 逐字照抄的地方（改动即失真）：
 *  - 页头那张 `width=900` 两列表：左 150×30 的 `titlebattle.gif`，
 *    **`title` 属性原版误写成「个人资料」**（复制粘贴 bug），照抄；右侧「手动刷新」。
 *  - 四种事件标题句：
 *      出击 `你放去攻击{目标}({x},{y})的{倒计时}后于{时间}到达`
 *      来袭 `来自{玩家}的{倒计时}后于{时间}到达并攻击你`
 *      相遇 `在({x},{y})还有{倒计时}于{时间}相遇`
 *      缠斗 `在({x},{y})缠斗 剩余{倒计时}于{时间}结束`
 *  - 每把剑 4 行：`来自X的Y` / 五列表头 `攻击 耐久 敏捷 吸收 击退` / 数值 /
 *    `剩余时间 … 到达时间 …`；**敌方看不穿时名字与五项全是 `???`**。
 *  - 标题行 `TR.titlebg.smallbold align=right`、操作行 `TR.trbg align=right`，
 *    操作链接用全角空格分隔。
 *  - 单边事件时另一侧是 `<TD class=trbg width="50%" rowSpan=4>`。
 *
 * 补写部分：原版每张表的 `colSpan` 写作 `{{6|10}}`（随单边/双边变）。
 * 对得上：一侧 5 列，双边就是 10；单边是 5 列**加上那个 `rowSpan=4` 的占位格** = 6。
 * 返航标题未留存，按现有返航事件重建。
 */

import { esc, escJs, each, num, when, js } from './html.ts'
import { countdown } from './shell.ts'

export type BattleEventKind = 'outbound' | 'incoming' | 'meeting' | 'fighting' | 'returning'

/** 一把参战飞剑。看不穿的敌剑把 `name` 与 `stats` 留空，渲染成 `???`。 */
export type BattleEventSword = {
  /** 持有者 */
  readonly owner: string
  readonly ownerId: number
  /** 飞剑全名（含品质与 `+N`）；不知道时留空 */
  readonly name?: string
  readonly itemId?: number
  /** 攻击 / 耐久 / 敏捷 / 吸收 / 击退；不知道时留空 */
  readonly stats?: readonly [number, number, number, number, number]
  /** 剩余秒数；null = 原版的 `???` */
  readonly seconds: number | null
  /** 到达时间 `YYYY-MM-DD HH:MM:SS`；已到达的只显示这个 */
  readonly arriveAt: string
  /** 来袭方才有：`从{玩家} ({x},{y})而来` */
  readonly from?: { readonly name: string; readonly x: number; readonly y: number }
}

export type BattleEventItem = {
  readonly eventId: string
  readonly kind: BattleEventKind
  /** 标题句里的目标名（出击）或来袭者（来袭） */
  readonly who: string
  readonly at: readonly [number, number]
  readonly seconds: number | null
  /** 标题句尾的绝对时刻 */
  readonly when: string
  /** 左军（自己这边）与右军。单边事件另一侧给空数组 */
  readonly left: readonly BattleEventSword[]
  readonly right: readonly BattleEventSword[]
}

export type BattleEventVm = {
  /** 入口带的 tab：2 = 斩杀（出击中）、3 = 返回（原版实见值） */
  readonly tab: number
  readonly events: readonly BattleEventItem[]
}

const STAT_HEADS = ['攻击', '耐久', '敏捷', '吸收', '击退'] as const

/** 四种战斗标题逐字照原版（09 §1.7）；返航标题为重建。 */
export function titleLine(e: BattleEventItem): string {
  const t = countdown(e.seconds)
  switch (e.kind) {
    case 'outbound':
      return `你放去攻击${esc(e.who)}(${num(e.at[0])},${num(e.at[1])})的${t}后于${esc(e.when)}到达`
    case 'incoming':
      return `来自${esc(e.who)}的${t}后于${esc(e.when)}到达并攻击你`
    case 'meeting':
      return `在(${num(e.at[0])},${num(e.at[1])})还有${t}于${esc(e.when)}相遇`
    case 'fighting':
      return `在(${num(e.at[0])},${num(e.at[1])})缠斗 剩余${t}于${esc(e.when)}结束`
    case 'returning':
      return `你的飞剑正从${esc(e.who)}(${num(e.at[0])},${num(e.at[1])})返航，${t}后于${esc(e.when)}返回`
  }
}

/**
 * 标题行右侧的操作链接。**alt 提示与 onclick 全是原文**（09 §1.7）。
 * 来袭事件是「还击 / 战斗地图」，其他战斗是「求援 / 支援 / 战斗地图」；返航不再提供战斗操作。
 */
export function actionLinks(e: BattleEventItem, side: 0 | 1 = 0): string {
  if (e.kind === 'returning') return ''
  const map = `<A class=smallbold alt="点此查看战斗示意图" href="#" ` +
    `onclick="openLWindow('战场地图', 'battlemap.jsp?eventid=${js(e.eventId)}&side=${side}')">战斗地图</A>`

  if (e.kind === 'incoming') {
    return `<A class=smallbold alt="点击进行还击" href="#" ` +
      `onclick="openLWindow('', 'fight.jsp?type=2&eventid=${js(e.eventId)}&side=1')">还击</A>　${map}`
  }

  // 求援的弹窗是原版唯一带输入框的 MDialog，三参数形式，文案照抄
  const help = `<A class=smallbold alt="点此向他人请求援手" href="#" ` +
    `onclick="MDialog('请求援手','请输入道友的名字<br><p></p><p align=center><input id=gethelpname></input></p>', ` +
    `function(){sendEventMsg('${js(e.eventId)}',${side})})">求援</A>`
  const back = `<A class=smallbold alt="点此帮助左方" href="#" ` +
    `onclick="openLWindow('', 'fight.jsp?type=3&eventid=${js(e.eventId)}&side=${side}&msg=0')">支援</A>`
  return `${help}　${back}　${map}`
}

/** 一把剑的四行（占 5 列）。看不穿的敌剑名字与五项都是 `???`。 */
function swordRows(s: BattleEventSword): readonly string[] {
  const nameCell = s.name === undefined
    ? `来自<A class=skillup href="#" onclick="openLWindow('','playerinfo.jsp?playerid=${num(s.ownerId)}')">${esc(s.owner)}</A>的???`
    : `来自<A class=skillup href="#" onclick="openLWindow('','playerinfo.jsp?playerid=${num(s.ownerId)}')">${esc(s.owner)}</A>` +
      `的<A class=skillup href="#" onclick="openRWindow('${js(s.name)}','itemmid.jsp?item=${num(s.itemId ?? 0)}')">${esc(s.name)}</A>`

  const fromLine = s.from
    ? `<BR><SPAN class=small>从${esc(s.from.name)} (${num(s.from.x)},${num(s.from.y)})而来</SPAN>`
    : ''

  const values = s.stats
    ? each(s.stats, (v) => `<TD>${num(v)}</TD>`)
    : each(STAT_HEADS, () => '<TD>???</TD>')

  // 已到达的只剩「到达时间」（原版如此）
  const timeCell = s.seconds === null && s.name === undefined
    ? `到达时间 ${esc(s.arriveAt)}`
    : `剩余时间 ${countdown(s.seconds)} 到达时间 ${esc(s.arriveAt)}`

  return [
    `<TD colSpan=5>${nameCell}${fromLine}</TD>`,
    `${each(STAT_HEADS, (h, i) => `<TD${i === 0 ? ' width="10%"' : ''}>${h}</TD>`)}`,
    values,
    `<TD colSpan=5 align=right>${timeCell}</TD>`,
  ]
}

/** 空白的一侧：`TD.trbg width="50%" rowSpan=4`（原版单边事件的写法）。 */
const EMPTY_SIDE = '<TD class=trbg width="50%" rowSpan=4></TD>'

function eventTable(e: BattleEventItem): string {
  const pairs = Math.max(e.left.length, e.right.length, 1)
  const twoSided = e.left.length > 0 && e.right.length > 0
  const cols = twoSided ? 10 : 6

  const blocks: string[] = []
  for (let i = 0; i < pairs; i++) {
    const l = e.left[i]
    const r = e.right[i]
    const lr = l ? swordRows(l) : null
    const rr = r ? swordRows(r) : null
    // 四行：名称 / 表头 / 数值 / 时间。左右两军并排，缺的一侧用 rowSpan=4 占位
    const cls = ['trbg middlebold', 'titlebg smallbold', 'trbg small', 'trbg small']
    const align = ['middle', 'middle', 'middle', 'right']
    for (let row = 0; row < 4; row++) {
      const left = lr ? lr[row]! : (row === 0 ? EMPTY_SIDE : '')
      const right = rr ? rr[row]! : (row === 0 ? EMPTY_SIDE : '')
      blocks.push(`<TR class="${cls[row]}" align=${align[row]}>${left}${right}</TR>`)
    }
  }

  return `<TABLE class="tablebg middle" cellSpacing=1 cellPadding=3 width=900 border=0><TBODY>
<TR class="titlebg smallbold" align=right><TD colSpan=${cols}>${titleLine(e)}</TD></TR>
<TR class=trbg align=right><TD colSpan=${cols}>${actionLinks(e)}</TD></TR>
${blocks.join('\n')}
</TBODY></TABLE>`
}

/** 渲染战斗事件总览（B 窗内容）。 */
export function renderBattleEvent(vm: BattleEventVm): string {
  return `<TABLE cellSpacing=0 cellPadding=0 width=900 border=0><TBODY><TR>
<TD align=left width="50%"><IMG title=个人资料 height=30 src="img/title/titlebattle.gif" width=150></TD>
<TD class=middle align=right width="50%"><A class=skillup href="#" onclick="openBWindow('', 'battleevent.jsp?tab=${num(vm.tab)}')">手动刷新</A></TD>
</TR></TBODY></TABLE>
${when(
    vm.events.length === 0,
    () => '<DIV class=middle style="padding:12px">　目前没有任何事件</DIV>',
    () => each(vm.events, eventTable),
  )}`
}
