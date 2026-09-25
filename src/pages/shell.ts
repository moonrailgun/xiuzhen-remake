/**
 * 整页框架（`#gpage`）。
 *
 * 结构完全照原版 —— 依据是玩家粘贴的 2009-02-13 s14 服 `map.jsp` 整页 DOM
 * （`docs/research/recovered-assets/pasted-dom/54385-post28-map.jsp-fullpage.html`）。
 * id、class、图片文件名一律沿用原名，这样截图对齐和以后补素材都不用改结构。
 *
 * 版本取舍见 `docs/spec/DECISIONS.md` §1.5：右上按钮按 DOM 做 7 个，
 * 版本号与服务器时间都显示，主标签 7 个。
 */

import { esc, escJs, num, each, when } from './html.ts'

export type ResourceBar = {
  /** 金木水火土 当前量 */
  readonly current: readonly [number, number, number, number, number]
  /** 丹田容量（五行共用一个上限） */
  readonly capacity: number
  /** 每小时增量，可为负（身上飞剑耗气） */
  readonly perHour: readonly [number, number, number, number, number]
  /** 普通仙石 */
  readonly coin: number
  /** 附加仙石 */
  readonly bonusCoin: number
}

export type ShellVm = {
  /** 当前选中的主标签 */
  readonly tab: MainTab
  readonly resources: ResourceBar
  /** 顶栏左上角的服务器时间 HH:MM:SS */
  readonly serverTime: string
  /** 左下角版本号，原版为 `版本号:1.2.1-yyge` */
  readonly version: string
  /** 三栏内容（已渲染好的 HTML） */
  readonly left: string
  readonly mid: string
  readonly right: string
}

export const MAIN_TABS = ['player', 'skill', 'item', 'map', 'ally', 'trade', 'msg'] as const
export type MainTab = (typeof MAIN_TABS)[number]

/** 主标签 → 原版路由与图片名。消息不是页面，是右侧浮窗。 */
const TAB_DEF: Record<MainTab, { href: string | null; onclick?: string }> = {
  player: { href: 'player.jsp' },
  skill: { href: 'skill.jsp' },
  item: { href: 'item.jsp' },
  map: { href: 'map.jsp' },
  ally: { href: 'ally.jsp' },
  trade: { href: 'trade.jsp' },
  msg: { href: null, onclick: "openRWindow('消息','msg.jsp')" },
}

/** 右上角 7 个小按钮。`about` 在 2008 截图里没有，是 2009-02 DOM 才有的。 */
const LITTLE_MENU: readonly { img: string; onclick?: string; href?: string; title: string }[] = [
  { img: 'index.gif', href: 'index.jsp', title: '首页' },
  { img: 'help.gif', onclick: "hlp('游戏指南')", title: '游戏指南' },
  { img: 'rank.gif', onclick: "openLWindow('', 'rank.jsp')", title: '排行榜' },
  { img: 'playerdir.gif', onclick: "openLWindow('', 'playerinfo.jsp')", title: '个人资料' },
  { img: 'vip.gif', onclick: "openLWindow('', 'payment.jsp')", title: '付费功能' },
  { img: 'bbs.gif', href: '#', title: '论坛' },
  { img: 'about.gif', onclick: "openLWindow('', 'about.jsp')", title: '关于' },
]

const RES_ICONS = ['gold', 'wood', 'water', 'fire', 'earth'] as const
const RES_NAMES = ['金', '木', '水', '火', '土'] as const

function resourceBar(r: ResourceBar): string {
  return `<DIV id=resource>
<TABLE height=30 cellSpacing=0 cellPadding=1 width=700 align=center border=0><TBODY><TR class=small>
${each(RES_ICONS, (icon, i) => {
  const inc = r.perHour[i]!
  return `<TD noWrap width=16><IMG title=${RES_NAMES[i]} src="img/res/${icon}.gif"></TD>` +
    `<TD noWrap width=100><SPAN id=${icon}>${num(r.current[i]!)}</SPAN>/<SPAN class=storage>${num(r.capacity)}</SPAN><BR>` +
    `${inc < 0 ? '-' : '+'} <SPAN id=${icon}inc>${num(Math.abs(inc))}</SPAN></TD>`
})}
<TD noWrap width=16><IMG title=仙石 src="img/res/coin.gif"></TD>
<TD noWrap><SPAN id=coin>${num(r.coin)} +${num(r.bonusCoin)} </SPAN></TD>
</TR></TBODY></TABLE></DIV>`
}

function bigMenu(active: MainTab): string {
  return `<DIV id=bigmenu>
<TABLE height=28 width="100%" border=0><TBODY><TR>
${each(MAIN_TABS, (t) => {
  const def = TAB_DEF[t]
  const img = `<IMG${t === 'msg' ? ' id=msgopenbtn' : ''} height=20 src="img/btn/${t}_${t === active ? 2 : 1}.gif" width=60>`
  // onclick 是本模块的常量（不含任何用户输入），原样输出以保持与原版逐字一致。
  // 凡是要把玩家名等动态值拼进 onclick 的地方，必须走 escJs。
  // 原版是链接跳转到 .jsp；本地版把它拦成 gotoTab()，但保留原 href 便于对照
  const a = def.href
    ? `<A href="${def.href}" onclick="return gotoTab('${t}'),false">${img}</A>`
    : `<A onclick="${def.onclick!}" href="#">${img}</A>`
  return `<TD width="12.5%"><DIV align=center>${a}</DIV></TD>`
})}
</TR></TBODY></TABLE></DIV>`
}

/** 六种浮窗的空壳。内容由客户端填，结构照原版。 */
function windows(): string {
  const frame = (key: string, withTitle: boolean, buttons: string) => `
<IFRAME id=${key}iframe style="DISPLAY: none" src="about:blank"></IFRAME>
<DIV id=${key} style="DISPLAY: none"><DIV id=${key}inner>
<DIV class=dlgclosebtn><A onclick=close${key.charAt(0).toUpperCase()}${key.slice(1, -6)}Window() href="#"><IMG src="img/closewindow.gif"></A></DIV>
<DIV id=${key}content></DIV>
${withTitle ? `<DIV id=${key}title><SPAN id=${key}text class=title3></SPAN></DIV>` : ''}
${buttons}
</DIV></DIV>`

  return [
    // L 窗：内容表宽 460，放资料/排行/战报/任务/NPC 对话
    frame('lwindow', true, ''),
    // R 窗：内容表宽 230，放物品/法术/消息
    frame('rwindow', true, ''),
    // B 窗：内容表宽 900，只用于战斗详情
    frame('bwindow', true, ''),
    // H 窗：游戏指南，没有标题条
    frame('hwindow', false, ''),
    // M 窗：单按钮提示
    frame('mwindow', true, `<DIV class=mwindowok><A onclick="OnMDialogOK()" href="#"><IMG src="img/btn/btnok.gif"></A></DIV>`),
    // M2 窗：确定/取消。注意原版 MDialog 是三参数、且是唯一带输入框的弹窗
    frame('mwindow2', true,
      `<DIV class=mwindow2ok><A onclick="OnMDialog2OK()" href="#"><IMG src="img/btn/btnok.gif"></A></DIV>` +
      `<DIV class=mwindow2cancel><A onclick="closeMWindow2()" href="#"><IMG src="img/btn/btncancel.gif"></A></DIV>`),
  ].join('\n')
}

/** 渲染整页。返回的是 `#gpage` 及其内容，外层 html/head/body 在 index.html 里。 */
export function renderShell(vm: ShellVm): string {
  return `<DIV id=gpage>
<DIV id=top>
<DIV id=logo></DIV>
<DIV id=littlemenu>
<TABLE width=321 border=0><TBODY><TR>
${each(LITTLE_MENU, (m) => {
  const img = `<IMG height=17 src="img/btn/${m.img}" title="${esc(m.title)}">`
  // 同上：这些 onclick 都是常量
  const a = m.onclick ? `<A onclick="${m.onclick}" href="#">${img}</A>` : `<A href="${esc(m.href!)}">${img}</A>`
  return `<TD width=61><DIV align=center>${a}</DIV></TD>`
})}
</TR></TBODY></TABLE></DIV>
${resourceBar(vm.resources)}
${bigMenu(vm.tab)}
<DIV class=fontmid id=avgres><A onclick="openLWindow('','turnres.jsp')" href="#"><IMG src="img/btn/turn_1.gif" title="五行互化"></A></DIV>
<DIV class=smallgray id=servertimebox>服务器时间：<SPAN id=servertime>${esc(vm.serverTime)}</SPAN></DIV>
<DIV class=smallgray id=version>${esc(vm.version)}</DIV>
</DIV>
${windows()}
<DIV id=loading style="DISPLAY: none"><IMG src="img/loading.gif"></DIV>
<DIV id=gmain>
<DIV id=gleft>${vm.left}</DIV>
<DIV id=gmid>${vm.mid}</DIV>
<DIV id=gright>${vm.right}</DIV>
</DIV>
</DIV>`
}

/** 页头通式：150×30 标题图 + `A.skillup` 子标签（用 ` | ` 分隔）。各主页面都用它。 */
export function pageHeader(
  titleImg: string,
  subTabs: readonly { label: string; href?: string; onclick?: string; active?: boolean }[] = [],
): string {
  return `<TABLE width="100%" cellSpacing=0 cellPadding=0 border=0><TBODY><TR>
<TD align=left><IMG height=30 width=150 src="img/title/${titleImg}"></TD>
<TD align=right>${subTabs
    .map((t) => {
      const inner = esc(t.label)
      // 原版子标签没有选中态：两张截图里当前页与其他页同为绿色（DECISIONS-ui）
      // onclick 由调用方构造；若要拼玩家名等动态值，调用方须先用 escJs
      if (t.onclick) return `<A class=skillup onclick="${t.onclick}" href="#">${inner}</A>`
      if (t.href) return `<A class=skillup href="${esc(t.href)}">${inner}</A>`
      return `<SPAN class=skillup>${inner}</SPAN>`
    })
    .join(' | ')}</TD>
</TR></TBODY></TABLE>`
}

/** 原版倒计时：`<SPAN start="秒">`，由 timer 驱动；未知时间显示 `???`。 */
export const countdown = (seconds: number | null): string =>
  seconds === null
    ? '<SPAN class=countdown>???</SPAN>'
    : `<SPAN class=countdown start="${num(seconds)}">${fmtDuration(seconds)}</SPAN>`

function fmtDuration(total: number): string {
  const t = Math.max(0, Math.floor(total))
  const h = Math.floor(t / 3600)
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  const s = String(t % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export { escJs, when }
