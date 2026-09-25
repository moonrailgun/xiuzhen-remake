/**
 * 交易页（trade.jsp）四个子标签：购买真气 / 出售真气 / 购买法宝 / 出售法宝。
 *
 * 证据分布很不均匀，逐块标注：
 *  - 页标题横幅用【市 场】：2008 的 #7/#123 都是「市 场」，2010 的 #93 才改「交 易」，
 *    基准取前者，见 `docs/spec/DECISIONS.md` §1.5。
 *  - 购买真气页是【1:1 截图照抄】—— #123（2008-10，原生）与 #7（2008-12）逐字一致，
 *    列宽 137/137/138/47（`05 §7.3` 实测），红字提示、筛选条、分页行都在图上。
 *  - 购买法宝页（tab=3）是【照原版 DOM】——
 *    `all-fragments.html` ← `raw/threads-unknown/61339-p1.html@7596`（表头可排序 + 分页行）
 *    与 `raw/forum162/article-97530-p1.html@4085`（挂单行）。
 *  - 出售法宝页（tab=4）的「我的挂单」表是【照原版 DOM】——
 *    `raw/threads-unknown/21246-p1.html@6611`；上半的出售表单【零证据，是重建】。
 *  - 出售真气页（tab=2）【零截图零 DOM，整页是重建】，按 `05 §18.3` 的通式：
 *    与购买页同构的表 + 「我用 X 数量 换 Y」表单。
 *
 * 货币：真气市场显示挂单实际交换数量，法宝市场一律以仙石计价
 * （实见 2 / 30 / 120 / 220 / 240 / 680–720 仙石）。
 */

import { esc, escJs, each, num, when, js } from './html.ts'
import { pageHeader } from './shell.ts'
import { ELEMENTS, type Element } from '../data/meridian.ts'

export type TradeView = 'buyqi' | 'sellqi' | 'buyitem' | 'sellitem'

/**
 * 五行 → 资源图标文件名。与 `player.ts` / `shell.ts` 同一套 `img/res/*.gif`。
 * 本该放 `shell.ts`（资源条也用），但那份是别人的文件，这里导出给 `payment.ts` 复用。
 */
export const RES_ICON: Record<Element, string> = {
  金: 'gold',
  木: 'wood',
  水: 'water',
  火: 'fire',
  土: 'earth',
}

/** 真气挂单：提供和需求的数量分别显示。 */
export type QiOffer = {
  /** 挂单号（原版参数名 sheet） */
  readonly sheet: number
  /** 提供 —— 卖家拿出来的那一种 */
  readonly give: Element
  /** 需求 —— 卖家想换的那一种 */
  readonly want: Element
  readonly amount: number
  readonly wantAmount?: number
  /**
   * 「需要时间」列：买下后注入丹田要多久（秒）。
   * 速率只取决于买家的经脉，与真气种类无关 —— 同一页所有行速率相同，
   * #7=0.5 秒/点、#123=1.2 秒/点、#93=1.25 秒/点（`05 §7.2`，向下取整）。
   */
  readonly seconds: number
}

/** 法宝挂单。名称点开右窗 `itemmid.jsp`，所以要带 item/quality。 */
export type ItemOffer = {
  readonly sheet: number
  /** 显示名，如「极品古纹青石剑+4」 */
  readonly name: string
  readonly item: number
  readonly quality: number
  /** 仙石 */
  readonly price: number
}

export type Pager = {
  readonly page: number
  readonly pages: number
}

export type TradeVm = {
  readonly view: TradeView
  /** 购买真气页的挂单列表；每页 10 行（`05 §7.1`） */
  readonly qiOffers: readonly QiOffer[]
  /** 购买法宝页的挂单列表 */
  readonly itemOffers: readonly ItemOffer[]
  readonly pager: Pager
  /** 筛选「我用 X 换 Y」：空串 = 全部。X 对应挂单的「需求」列，Y 对应「提供」列 */
  readonly filterGive: Element | ''
  readonly filterWant: Element | ''
  /** 购买法宝页的筛选参数（原版 `type/level/order/page/search`） */
  readonly search: string
  /** 品质：0 全部 / 1 废品 / 2 凡品 / 3 上品 / 4 极品 */
  readonly level: number
  /** 排序：1 按名称 / 2 按价格 */
  readonly order: number
  /** 出售真气页：我挂出去的真气单 */
  readonly myQiOffers: readonly QiOffer[]
  /** 出售法宝页：我挂出去的法宝单 */
  readonly myItemOffers: readonly ItemOffer[]
  /** 出售法宝页表单里可选的法宝（空闲的才能挂） */
  readonly sellable: readonly { readonly id: number; readonly name: string; readonly npcPrice?: number }[]
}

/** 「需要时间」列的格式：h:mm:ss，小时不补零也不进位（#93 见过 454:51:40）。 */
const hms = (total: number): string => {
  const t = Math.max(0, Math.floor(total))
  const h = Math.floor(t / 3600)
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  const s = String(t % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/** 单元格写法：`[图标]金: 25000`（`05 §7.1`，图标 + 属性名 + 冒号 + 数量，居中）。 */
const qiCell = (e: Element, n: number): string =>
  `<IMG src="img/res/${RES_ICON[e]}.gif">${e}: ${num(n)}`

/** 五行下拉。空值 = 全部（截图 #123 的两个下拉默认都显示「全部」）。 */
const elementSelect = (name: string, value: Element | '', withAll: boolean): string =>
  `<SELECT name=${name}>${when(withAll, () => `<OPTION value=""${value === '' ? ' selected' : ''}>全部</OPTION>`)}` +
  `${each(ELEMENTS, (e) => `<OPTION value="${e}"${e === value ? ' selected' : ''}>${e}</OPTION>`)}</SELECT>`

/**
 * 分页行 —— 表格的最后一行，通栏。
 * 写法照原版 DOM：左边四个链接用全角空格分隔，「首页」不带 page 参数、「尾页」是 page=0。
 * 右边的「第1/2页」只有截图有（#7/#123 都是第1/2页，#93 是第1/28页）。
 */
function pagerRow(href: (page: number | null) => string, p: Pager, cols: number): string {
  const link = (label: string, page: number | null) =>
    `<A href="${esc(href(page))}">${label}</A>`
  return `<TR class=trbg><TD colSpan=${cols}>
<TABLE cellSpacing=0 cellPadding=0 width="100%" border=0><TBODY><TR>
<TD class=smallbold>${link('首页', null)}　${link('上一页', Math.max(1, p.page - 1))}　${link('下一页', Math.min(p.pages, p.page + 1))}　${link('尾页', 0)}</TD>
<TD class=small align=right>第${num(p.page)}/${num(p.pages)}页</TD>
</TR></TBODY></TABLE></TD></TR>`
}

/** 市场的确认框。法宝页的文案是【原文】：`MDialogOkCancel('', '确定购买?', …)`。 */
const confirmBuy = (endpoint: string, sheet: number): string =>
  `MDialogOkCancel('', '确定购买?',function(){ajaxPost('${endpoint}', 'sheet=${num(sheet)}', refleshAll);})`

// ───────────────────────── 购买真气（默认 tab）─────────────────────────

/** 顶部一行：左红字提示 + 右筛选条。两者在同一水平带上（#123 y≈55–70）。 */
function buyQiFilter(vm: TradeVm): string {
  return `<TABLE cellSpacing=0 cellPadding=3 width=460 border=0><TBODY><TR>
<TD class=smallred>注意：购买真气注入丹田的时间与经脉有关</TD>
<TD class=small align=right><FORM style="DISPLAY: inline" action="trade.jsp" method=get>我用 ${elementSelect('give', vm.filterGive, true)} 换 ${elementSelect('want', vm.filterWant, true)} <INPUT type=submit name=Submit value=搜索></FORM></TD>
</TR></TBODY></TABLE>`
}

function buyQi(vm: TradeVm): string {
  // 筛选参数名 give/want 是【重建】：原版只留下了 tab=3 的参数名，真气页的没留存。
  const href = (page: number | null): string => {
    const q = [`give=${vm.filterGive}`, `want=${vm.filterWant}`]
    if (page !== null) q.push(`page=${page}`)
    return `trade.jsp?${q.join('&')}`
  }
  // 表头「提供」「需求」是绿色可点排序链接，「需要时间」「操作」是黑字（#123 实测）
  return `${buyQiFilter(vm)}
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>
<TD width=137><A href="${esc(href(null))}&order=1">提供</A></TD>
<TD width=137><A href="${esc(href(null))}&order=2">需求</A></TD>
<TD width=138>需要时间</TD>
<TD width=47 noWrap>操作</TD></TR>
${each(vm.qiOffers, (o) => `<TR class="trbg middle" align=middle>
<TD>${qiCell(o.give, o.amount)}</TD>
<TD>${qiCell(o.want, o.wantAmount ?? o.amount)}</TD>
<TD>${hms(o.seconds)}</TD>
<TD noWrap><A class=skillup onclick="${confirmBuy('buyqi', o.sheet)}" href="#">购买</A></TD></TR>`)}
${pagerRow(href, vm.pager, 4)}
</TBODY></TABLE>`
}

// ───────────────────────── 出售真气（tab=2，整页重建）─────────────────────────

function sellQi(vm: TradeVm): string {
  // 【重建】按 `05 §18.3`：借购买页的「我用…换…」措辞 + 法宝出售页的撤销表。
  // 原版这页的红字提示文案没有任何留存，所以宁可不写，不编。
  return `<TABLE cellSpacing=0 cellPadding=3 width=460 border=0><TBODY><TR>
<TD class=middle><FORM id=sellqiform style="DISPLAY: inline" action="trade.jsp" method=get><INPUT type=hidden name=tab value=2>我用 ${elementSelect('give', vm.filterGive, false)} <INPUT class=small name=amount size=8 value=""> 换 ${elementSelect('want', vm.filterWant, false)} 等量 <INPUT type=submit name=Submit value=出售></FORM></TD>
</TR></TBODY></TABLE>
<TABLE class="titlebg2 bigbold" cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR align=middle><TD>我的挂单</TD></TR></TBODY></TABLE>
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>
<TD width=180>提供</TD>
<TD width=180>需求</TD>
<TD>操作</TD></TR>
${each(vm.myQiOffers, (o) => `<TR class="trbg middle" align=middle>
<TD>${qiCell(o.give, o.amount)}</TD>
<TD>${qiCell(o.want, o.wantAmount ?? o.amount)}</TD>
<TD><A class=middlebold onclick="ajaxPost('unsellqi', 'sheet=${num(o.sheet)}', refleshAll);" href="#">撤销</A></TD></TR>`)}
</TBODY></TABLE>`
}

// ───────────────────────── 购买法宝（tab=3）─────────────────────────

/** 品质下拉：原版参数 `level`，0 全部 …… 4 极品（`05 §18.1`）。 */
const LEVELS = ['全部', '废品', '凡品', '上品', '极品'] as const

function buyItemFilter(vm: TradeVm): string {
  // 【重建】：筛选区控件外观没有截图，参数名与取值是 DOM 里的 query string 实证。
  return `<TABLE cellSpacing=0 cellPadding=3 width=460 border=0><TBODY><TR>
<TD class=small align=right><FORM style="DISPLAY: inline" action="trade.jsp" method=get><INPUT type=hidden name=tab value=3>品质 <SELECT name=level>${each(LEVELS, (label, i) => `<OPTION value="${i}"${i === vm.level ? ' selected' : ''}>${label}</OPTION>`)}</SELECT> 名称 <INPUT class=small name=search size=10 value="${esc(vm.search)}"> <INPUT type=submit name=Submit value=搜索></FORM></TD>
</TR></TBODY></TABLE>`
}

function buyItem(vm: TradeVm): string {
  const href = (page: number | null, order = vm.order): string => {
    const q = [`tab=3`, `type=0`, `order=${order}`, `level=${vm.level}`]
    if (page !== null) q.push(`page=${page}`)
    q.push(`search=${encodeURIComponent(vm.search)}`)
    return `trade.jsp?${q.join('&')}`
  }
  // 表头两列可点排序（order=1 按名称、order=2 按价格），第三列「操作」不可点 —— 照 DOM
  return `${buyItemFilter(vm)}
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>
<TD width=180><A href="${esc(href(1, 1))}">名称</A></TD>
<TD width=180><A href="${esc(href(1, 2))}">价格</A></TD>
<TD>操作</TD></TR>
${each(vm.itemOffers, (o) => `<TR class="trbg middle" align=middle>
<TD class=skillup><A onclick="openRWindow('${js(o.name)}', 'itemmid.jsp?item=${num(o.item)}&quality=${num(o.quality)}')" href="#">${esc(o.name)}</A></TD>
<TD>${num(o.price)}仙石</TD>
<TD><A class=middlebold onclick="${confirmBuy('buyitem', o.sheet)}" href="#">购买</A></TD></TR>`)}
${pagerRow((p) => href(p), vm.pager, 3)}
</TBODY></TABLE>`
}

// ───────────────────────── 出售法宝（tab=4）─────────────────────────

function sellItem(vm: TradeVm): string {
  // 上半的出售表单【零证据，重建】；下半的「我的挂单」表是【照原版 DOM】。
  return `<TABLE cellSpacing=0 cellPadding=3 width=460 border=0><TBODY><TR>
<TD class=middle><FORM id=sellitemform style="DISPLAY: inline" action="trade.jsp" method=get><INPUT type=hidden name=tab value=4>出售 <SELECT name=item>${each(vm.sellable, (it) => `<OPTION value="${num(it.id)}">${esc(it.name)}${it.npcPrice === undefined ? '' : `（NPC最高收购${num(it.npcPrice)}仙石）`}</OPTION>`)}</SELECT> 售价 <INPUT class=small name=price size=6 value=""> 仙石 <INPUT type=submit name=Submit value=出售></FORM><BR><SPAN class=small>NPC在挂牌一小时后收购合理标价的法宝；高于收购价的挂单可撤销重挂。</SPAN></TD>
</TR></TBODY></TABLE>
<TABLE class="titlebg2 bigbold" cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR align=middle><TD>我的挂单</TD></TR></TBODY></TABLE>
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>
<TD width=180>名称</TD>
<TD width=180>价格</TD>
<TD>操作</TD></TR>
${each(vm.myItemOffers, (o) => `<TR class="trbg middle" align=middle>
<TD><A class=middlebold onclick="openRWindow('${js(o.name)}', 'itemmid.jsp?item=${num(o.item)}&quality=${num(o.quality)}')" href="#">${esc(o.name)}</A></TD>
<TD>${num(o.price)}仙石 </TD>
<TD><A class=middlebold onclick="ajaxPost('unsellitem', 'sheet=${num(o.sheet)}', refleshAll);" href="#">撤销</A></TD></TR>`)}
</TBODY></TABLE>`
}

/** 渲染交易页左栏。四个子标签一直都在，当前页不高亮（页头通式）。 */
export function renderTrade(vm: TradeVm): string {
  const tabs = [
    { label: '购买真气', href: 'trade.jsp' },
    { label: '出售真气', href: 'trade.jsp?tab=2' },
    { label: '购买法宝', href: 'trade.jsp?tab=3' },
    { label: '出售法宝', href: 'trade.jsp?tab=4' },
  ]
  const body =
    vm.view === 'buyqi'
      ? buyQi(vm)
      : vm.view === 'sellqi'
        ? sellQi(vm)
        : vm.view === 'buyitem'
          ? buyItem(vm)
          : sellItem(vm)
  // 横幅用「市 场」（titletrade.gif 就是这三个字），2010 才改「交 易」
  return `${pageHeader('titletrade.gif', tabs)}
${body}`
}
