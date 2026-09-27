/**
 * 门派页（ally.jsp）。
 *
 * 五个子标签【照 2008-10 截图 #122】：概况 | 成员 | 攻击 | 新闻 | 功能。
 * 「仙府」标签与功德区是 2009-06-30 资料片才有的，基准版没有 ——
 * 见 `docs/spec/DECISIONS.md` §1.5「门派页 = 5 个标签，无仙府、无功德区」。
 *
 * 各区块的证据：
 *  - 概况：字段与像素框来自截图 #122（原生 1:1，`docs/research/05` §13.1）；
 *    表结构照 `allyinfo.jsp` 的原版 DOM（`all-fragments.html` ←
 *    `raw/threads-unknown/45722-p1.html@6648`，含 `rowSpan=14` 的简介格）。
 *    注意原版 `rowSpan=14` 比实际行数多 1，照抄不改。
 *  - 成员：【照原版 DOM】`raw/threads-unknown/45722-p1.html@8258`
 *    （列宽 10/30/20/15/20%、序号 `1.` 右对齐、分页条 `page=&per=10&job=-2`）。
 *    分页行的 `colSpan=6` 也是原版写法（表只有 5 列），照抄。
 *  - 攻击 / 新闻：【照原版 DOM】`raw/guides/51316-p1.html@7246`、`guides/50765-p1.html`
 *    （列宽 5/35/35/25%、首格单字「攻/防/算」、门派列 `smallgray`「攻方 - 守方」、
 *    日期 `YY-MM-DD HH:MM`）。被推算时不暴露推算者，写「有人推算 X」。
 *
 * **与原版唯一的一处改动**：成员页码框的 onkeydown 原文是
 *   `location.href='ally.jsp?tab=2&page='+$('allypage').value+'&per=10&job=-2'`，
 * 本地版没有服务端，直接赋 `location.href` 会把整个游戏页跳走。URL 的拼法一字未动，
 * 只把 `location.href=` 换成 `gotoJsp(...)`（交给 `app.ts` 的路由拦截器）。
 * 这与 `shell.ts` 给主标签加 `onclick="return gotoTab(…),false"` 是同一个做法。
 *
 * 路由：09 §1.18 全量 grep 到的是 `ally.jsp?tab=1|2|3|4|61|62`，其中
 * tab=2=成员、tab=3=动态流水（DOM 里的 href 就是 `ally.jsp?tab=3#`）已确证；
 * 「攻击」与「功能」落在剩下的 tab=1 / tab=4 上是【推断】——
 * `PAGE-INDEX` §17 明列「tab=1 与 tab=3 的分工」为缺口。
 */

import { esc, each } from './html.ts'
import { pageHeader } from './shell.ts'

// 本页所有内联 onclick 里只拼数字 id，没有玩家名等字符串，所以不需要 escJs；
// 玩家名/门派名一律走 esc 输出到文本节点。

export type AllyTab = 'overview' | 'member' | 'attack' | 'news' | 'feature'

/** 一个可点开的门派/玩家引用。 */
export type AllyLink = {
  readonly id: number
  readonly name: string
}

export type AllyMember = {
  readonly playerId: number
  readonly name: string
  /** 门派内称号，原版实见「掌门」「杀手」 */
  readonly job: string
  readonly realm: string
  /** 道行，原版显示为中文数字年（「八百一十年」） */
  readonly dao: string
}

export type AllyNews = {
  readonly msgId: number
  /** 首格单字标签 */
  readonly kind: '攻' | '防' | '算' | '盟'
  /** 「{A}攻击{B}」；被推算时是「有人推算{B}」（不暴露推算者） */
  readonly text: string
  /** 攻方门派，无门派时为空串（原版写成「〓劍閣〓 - 」） */
  readonly fromAlly: string
  /** 守方门派 */
  readonly toAlly: string
  /** YY-MM-DD HH:MM */
  readonly date: string
}

export type AllyVm = {
  readonly management?: { readonly joined: boolean; readonly leader: boolean; readonly own: boolean;
    readonly guilds: readonly AllyLink[]; readonly recruits: readonly AllyLink[] }
  readonly tab: AllyTab
  readonly name: string
  readonly allyId: number
  readonly founder: AllyLink
  readonly leader: AllyLink
  /** YY-MM-DD */
  readonly createdAt: string
  /** 门派规模，渲染成「{n}人」 */
  readonly size: number
  /** 门派性质，未填写时原版是 `-` */
  readonly nature: string
  /** 门派交流首行的标签由门派自填：#122 是「QQ群」，DOM 样本是 `-` */
  readonly imLabel: string
  readonly im: string
  /** 门派论坛，有地址时是一个绿链「点击进入」 */
  readonly forum: string | null
  readonly allies: readonly AllyLink[]
  readonly enemies: readonly AllyLink[]
  readonly intro: string
  readonly members: readonly AllyMember[]
  readonly news: readonly AllyNews[]
  /** 成员页当前页码，从 1 起 */
  readonly page: number
  readonly pages: number
}

/** 子标签。选中态原版没有（两张截图里当前页与其他页同为绿色，见 DECISIONS-ui）。 */
const TABS: readonly { readonly tab: AllyTab; readonly label: string; readonly href: string }[] = [
  { tab: 'overview', label: '概况', href: 'ally.jsp' },
  { tab: 'member', label: '成员', href: 'ally.jsp?tab=2&page=1&per=10&job=-2' },
  // tab=1 / tab=4 是推断（09 §1.18 只确证了 2/3/61/62）
  { tab: 'attack', label: '攻击', href: 'ally.jsp?tab=1' },
  { tab: 'news', label: '新闻', href: 'ally.jsp?tab=3' },
  { tab: 'feature', label: '功能', href: 'ally.jsp?tab=4' },
]

const playerLink = (p: AllyLink, cls: string): string =>
  `<A class=${cls} onclick="openLWindow('', 'playerinfo.jsp?playerid=${p.id}')" href="#">${esc(p.name)}</A>`

const allyLink = (a: AllyLink): string =>
  `<A class=skillup onclick="openLWindow('', 'allyinfo.jsp?ally=${a.id}')" href="#">${esc(a.name)}</A>`

/** 同盟/敌对：原版在值格里再套一张 `cellSpacing=0 cellPadding=1 width="100%"` 的小表，每派一行。 */
const relationTable = (list: readonly AllyLink[]): string =>
  `<TABLE cellSpacing=0 cellPadding=1 width="100%" border=0><TBODY>` +
  each(list, (a) => `<TR><TD>${allyLink(a)}</TD></TR>`) +
  `</TBODY></TABLE>`

/** 概况：左侧 7 行资料 + 两个分段，右侧 `rowSpan=14` 的门派简介。 */
function overview(vm: AllyVm): string {
  const row = (label: string, value: string) =>
    `<TR class="trbg middle"><TD>${esc(label)}</TD><TD>${value}</TD></TR>`
  const section = (label: string) =>
    `<TR class="titlebg middlebold" align=middle><TD colSpan=2>${esc(label)}</TD></TR>`

  return `<TABLE class="middle tablebg" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle><TD colSpan=2>概况</TD><TD width="50%">门派简介</TD></TR>
<TR class="trbg middle"><TD width="20%">门派名称：</TD><TD width="30%">${esc(vm.name)}</TD>
<TD vAlign=top rowSpan=14>${esc(vm.intro)}</TD></TR>
${row('门派ID：', String(vm.allyId))}
${row('创始人：', `${playerLink(vm.founder, 'middlebold')} `)}
${row('现任掌门：', playerLink(vm.leader, 'middlebold'))}
${row('创建时间：', esc(vm.createdAt))}
${row('门派规模：', `${vm.size}人`)}
${row('门派性质：', esc(vm.nature))}
${section('门派交流')}
${row(`${vm.imLabel}：`, esc(vm.im))}
${row('门派论坛：', vm.forum ? `<A class=skillup href="${esc(vm.forum)}" target=_blank>点击进入</A>` : '- ')}
${section('门派关系')}
${row('同盟：', relationTable(vm.allies))}
${row('敌对：', relationTable(vm.enemies))}
</TBODY></TABLE>`
}

/**
 * 成员分页条。`尾页` 原版传 `page=0`（0 = 服务端解释为最后一页），照抄；
 * 输入框 id 也沿用 `allypage`，回车跳页。
 */
function memberPager(vm: AllyVm): string {
  const url = (p: number) => `ally.jsp?tab=2&page=${p}&per=10&job=-2`
  const link = (p: number, label: string) =>
    `<A class=smallbold href="${esc(url(p))}">${label}</A>`
  return `<TR class="trbg small"><TD colSpan=6>${link(1, '首页')}　${link(Math.max(1, vm.page - 1), '上一页')}　` +
    `第<INPUT class=small id=allypage onkeydown="if(event.keyCode==13){gotoJsp('ally.jsp?tab=2&page='+$('allypage').value+'&per=10&job=-2')}" size=3 value=${vm.page} name=textfield2>` +
    `/${vm.pages}页　${link(vm.page + 1, '下一页')}　${link(0, '尾页')}</TD></TR>`
}

function members(vm: AllyVm): string {
  return `<TABLE class="middle tablebg" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle><TD colSpan=5></TD></TR>
<TR class="trbg2 middle" align=middle><TD width="10%">&nbsp;</TD><TD width="30%">玩家</TD><TD width="20%">称号</TD><TD width="15%">境界</TD><TD width="20%">道行</TD></TR>
${each(vm.members, (m, i) => {
    const no = (vm.page - 1) * 10 + i + 1
    return `<TR class="trbg small" align=middle><TD align=right>${no}.</TD>` +
      `<TD>${playerLink({ id: m.playerId, name: m.name }, 'smallbold')}</TD>` +
      `<TD>${esc(m.job)}</TD><TD>${esc(m.realm)}</TD><TD>${esc(m.dao)}</TD></TR>`
  })}
${memberPager(vm)}
</TBODY></TABLE>`
}

/**
 * 动态/战报流水（攻击页与新闻页共用一张表）。
 * 两个标签各显示什么是缺口，这里都渲染同一份列表；调用方自己筛。
 */
function newsList(vm: AllyVm): string {
  return `<TABLE class="middle tablebg" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle><TD colSpan=4></TD></TR>
<TR class="trbg2 middle" align=middle><TD width="5%">&nbsp;</TD><TD width="35%">玩家</TD><TD width="35%">门派</TD><TD width="25%">日期</TD></TR>
${
    vm.news.length === 0
      ? '<TR class="trbg small" align=middle><TD class=smallgray colSpan=4>目前没有任何事件</TD></TR>'
      : each(vm.news, (n) =>
          `<TR class="trbg small" align=middle><TD>${n.kind}</TD>` +
          `<TD><A class=smallbold onclick="openLWindow('','allymsg.jsp?msg=${n.msgId}')" href="#">${esc(n.text)}</A></TD>` +
          `<TD class=smallgray>${esc(n.fromAlly)} - ${esc(n.toAlly)}</TD>` +
          `<TD>${esc(n.date)}</TD></TR>`)
  }
</TBODY></TABLE>`
}

/**
 * 功能页。基准版把功德 / 门派功法 / 阵法全部排除（都是 2009-06-30 之后的系统），
 * 基准期已有自建、加入、任命与外交；操作表单按同页通式重建，NPC 自动接受。
 */
function feature(vm: AllyVm): string {
  const m = vm.management
  if (!m) return '<DIV class=middle>目前没有可用的门派功能</DIV>'
  const options = (items: readonly AllyLink[]) => items.map(n => `<OPTION value="${n.id}">${esc(n.name)}</OPTION>`).join('')
  return `<DIV class=middle style="width:440px;padding:10px">${!m.joined
    ? `<INPUT id=guildname maxlength=20 aria-label="门派名"><BUTTON onclick="guildAction('create')">自行立派</BUTTON><BR><BR><SELECT id=guildtarget aria-label="门派">${options(m.guilds)}</SELECT><BUTTON onclick="guildAction('join')">加入门派</BUTTON>`
    : `<BUTTON onclick="guildAction('leave')">退出门派</BUTTON>${m.leader
      ? `<BR><BR><SELECT id=guildnpc aria-label="成员">${options(m.recruits)}</SELECT><SELECT id=guildjob aria-label="职位"><OPTION>弟子</OPTION><OPTION>杀手</OPTION><OPTION>护法</OPTION><OPTION>长老</OPTION></SELECT><BUTTON onclick="guildAction('recruit')">招收或任命</BUTTON><BR><BR><SELECT id=guildtarget aria-label="门派">${options(m.guilds)}</SELECT><BUTTON onclick="guildAction('ally')">结盟</BUTTON><BUTTON onclick="guildAction('enemy')">敌对</BUTTON><BUTTON onclick="guildAction('neutral')">中立</BUTTON>` : ''}`}</DIV>`
}

/** 渲染门派页左栏。 */
export function renderAlly(vm: AllyVm): string {
  const body =
    vm.management && !vm.allyId ? feature(vm) : vm.tab === 'member'
      ? members(vm)
      : vm.tab === 'attack' || vm.tab === 'news'
        ? newsList(vm)
        : vm.tab === 'feature'
          ? feature(vm)
          : overview(vm)

  return `${pageHeader('titleally.gif', TABS.map((t) => ({ label: t.label, href: t.href })))}
${body}`
}
