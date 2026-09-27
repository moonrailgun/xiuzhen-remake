/**
 * 法宝页（item.jsp）：一览 / 飞剑 / 护身 / 丹药 / 淬炼 五个子标签。
 *
 * **一览页是【照原版 DOM】** —— 出处 `round2-fragments.html` ←
 * `raw/forum162/article-105987-p2.html@35718`（墨迹条）与 `@36040`（整张物品表），
 * 另见 `raw/forum162/article-110861-p2.html@10942`（09 §1.5 / 09b §1.3 / 05 §18.6）：
 *   墨迹条 `拥有法宝(31/39)` → `TABLE.tablebg.middle cellSpacing=1 cellPadding=2 width=460`
 *   → 每个分组一行 `TR.titlebg.middlebold` 标题 + 一行 `TR.trbg`：
 *      左格 `TD vAlign=top` 内嵌两列网格（radio 5% + 名称/状态 45%），
 *      右格 `TD vAlign=top width="20%"` 是整组共用的操作列。
 *   忙碌中的物品 radio `value=0`，链接退化成 `itemmid.jsp?quality={n}&item={id}`（不给 itemsn）；
 *   炼制队列里的成品 `quality=-1`、名字不带品质前缀、后缀 `×15`。
 * 一览页页脚「注意：…」与单列版是 2008-10 截图 #121 [截图]。
 *
 * **炼制飞剑 / 炼制丹药两页只有截图，无 DOM**（05 §2 / §5，PAGE-INDEX 记 B / A 档），
 * 表格骨架按 09 §1.1 的表格通式 + 05 §2.1/§5.1 的逐字转录重建。
 * **护身页与淬炼页既无截图也无 DOM（C 档）**，按 05 §18.4 / §18.5 的同构推断做，见各函数注释。
 *
 * 子标签编号：`item.jsp?tab=4` = 淬炼是【照原版 DOM】——玩家帖里直接贴了原版链接
 * `<A href="…/item.jsp?tab=4">淬炼</A>`（`raw/forum162/article-78920-p1.html@219`）。
 * `hide=1&tab=3` 是「从炼器事件跳到炼丹 tab」（09 §1.18，13 次）→ tab=3 = 丹药。
 * 一览页自身的 `href` 是 `item.jsp#`（无参）→ 一览 = 默认页。
 * 余下的飞剑 / 护身按截图 #121 的子标签顺序「一览|飞剑|护身|丹药|淬炼」补成 tab=1 / tab=2
 * —— 正好与 09 §1.18 只枚举到 `tab=1|2|3|4` 吻合。**tab=1/2 记 [推断]。**
 */

import { esc, escJs, each, num, when, js } from './html.ts'
import { pageHeader, countdown } from './shell.ts'
import { formatDuration } from '../engine/clock.ts'
import { PILL_NAMES, PILL_TIERS, pillRecipe } from '../data/pills.ts'
export { PILL_NAMES, PILL_TIERS, PILL_SECONDS, WUXING_PILL_SECONDS } from '../data/pills.ts'

export type ItemTab = 'list' | 'sword' | 'guard' | 'pill' | 'refine'

/**
 * 物品状态文案全集（`SPAN.smallgray`）。9 种，出处 09 §1.5 / 03 §1.12 [原文]。
 * 带省略号的后面跟倒计时 span；不带的只有 空闲 / 损坏 / 注入中。
 * （09 §1.5 另记过一个 `使用中...`，与「修理中」同属操作进行态，这里按任务给的 9 种登记。）
 */
export const ITEM_STATUSES = [
  '空闲', '损坏', '斩杀中', '绞杀中', '返回中', '淬炼中', '炼制中', '注入中', '修理中', '御剑飞行中',
] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

const STATUS_WITHOUT_TIMER: readonly ItemStatus[] = ['空闲', '损坏', '注入中']

export type ItemRow = {
  /** 全名，含品质前缀与 `+N` 淬炼后缀 */
  readonly name: string
  /** `item=` 的物品 id */
  readonly itemId: number
  /** 空闲物品才有；忙碌物品 radio `value=0` 且链接改用 `quality=` */
  readonly itemsn?: number
  /** 忙碌态 / 图鉴态用；炼制队列里的成品是 -1 */
  readonly quality?: number
  /** 同种未淬炼的成批剑折叠显示 `×7` */
  readonly count?: number
  /** 炼制队列里的成品没有状态行（DOM 里是空的 `<BR>`） */
  readonly status?: ItemStatus
  /** 带省略号的状态跟的剩余秒数；null = 原版的 `???` */
  readonly seconds?: number | null
}

/** 分组号 = DOM 里 `selectitem{N}` 的 N。1 与 5 是原文，2/3 是 09 §1.5 的 [推断]。 */
export type ItemGroupId = 1 | 2 | 3 | 5

export type ItemGroup = {
  readonly id: ItemGroupId
  readonly items: readonly ItemRow[]
}

export type ItemListVm = {
  /** 墨迹条 `拥有法宝(已用/上限)`；截图 #121 是 `(1/5)`，DOM 样本是 `(31/39)` */
  readonly used: number
  readonly capacity: number
  readonly groups: readonly ItemGroup[]
}

/** 炼制飞剑 / 炼制护身法宝的一行（05 §2.1 逐字转录的结构）。 */
export type CraftRow = {
  readonly name: string
  readonly itemId: number
  /** 名称下方灰字 `现有:N` */
  readonly owned: number
  /** 金木水火土 炼制消耗；丹药行不显示五行消耗（05 §5.2） */
  readonly cost?: readonly [number, number, number, number, number]
  readonly craftSeconds: number
  /** 输入框后的 `(N)` = 当前真气最多可炼数量；null = 条件不满足，显示红字「(未满足)」 */
  readonly craftable: number | null
}

/** 「正在炼制中」/「正在淬炼中」表的一行（截图 #68）。 */
export type BrewRow = {
  readonly name: string
  readonly itemId: number
  readonly seconds: number | null
  /** 完成时间 `YYYY-MM-DD HH:MM:SS` */
  readonly finishAt: string
}

export type ItemVm =
  | ({ readonly tab: 'list' } & ItemListVm)
  | {
      readonly tab: 'sword' | 'guard' | 'pill' | 'refine'
      readonly rows: readonly CraftRow[]
      readonly brewing?: readonly BrewRow[]
      /** 炼丹之术等级：丹药页只列这一档（05 §5.2） */
      readonly alchemyLevel?: number
    }

// —— 子标签 ——

export const ITEM_TABS: readonly { readonly tab: ItemTab; readonly label: string; readonly href: string }[] = [
  { tab: 'list', label: '一览', href: 'item.jsp' },
  { tab: 'sword', label: '飞剑', href: 'item.jsp?tab=1' },
  { tab: 'guard', label: '护身', href: 'item.jsp?tab=2' },
  { tab: 'pill', label: '丹药', href: 'item.jsp?tab=3' },
  { tab: 'refine', label: '淬炼', href: 'item.jsp?tab=4' },
]

/** 一览页横幅是「法 宝」；四个炼制子页的横幅原版写的是「炼 器」（05 §2.1 / §5.1 原文）。 */
const TITLE_IMG: Record<ItemTab, string> = {
  list: 'titleitem.gif',
  sword: 'titleproduce.gif',
  guard: 'titleproduce.gif',
  pill: 'titleproduce.gif',
  refine: 'titleproduce.gif',
}

const RES = ['gold', 'wood', 'water', 'fire', 'earth'] as const

const helpLink = (topic: string): string =>
  `<A class=help href="#" onclick="hlp('${js(topic)}')">${esc(topic)}</A>`

/** 墨迹标题条。`hide` 给的是折叠钮的目标 tab 号（原版 `item.jsp?hide=1&tab=N`）。 */
function inkBar(inner: string, hideTab?: number): string {
  return `<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR>
<TD class=bigbold align=middle>${inner}</TD>${hideTab === undefined ? '' :
    `<TD width=16 align=right><A class=hidebtn href="item.jsp?hide=1&amp;tab=${num(hideTab)}" title="折叠">-</A></TD>`}
</TR></TBODY></TABLE>`
}

// —— 一览页 ——

/** 分组标题与操作列。1 与 5 是 DOM 原文；2（丹药）、3（书籍）是 09 §1.5 的 [推断]。 */
const GROUPS: Record<ItemGroupId, { readonly title: string; readonly ops: readonly (readonly [string, string])[] }> = {
  1: {
    title: `${helpLink('飞剑')}与${helpLink('护身法宝')}`,
    ops: [
      ['提升品质', 'sendUpgradeItem()'],
      ['全部提升', 'sendUpgradeAllItem()'],
      ['出售', 'sendSellItem1()'],
      ['销毁', 'sendDestroyItem1()'],
      ['修理', 'sendRepairItem()'],
    ],
  },
  2: {
    title: helpLink('丹药'),
    ops: [['使用', 'sendUseItem2()'], ['出售', 'sendSellItem2()'], ['销毁', 'sendDestroyItem2()']],
  },
  3: {
    title: helpLink('书籍'),
    ops: [['使用', 'sendUseItem3()'], ['出售', 'sendSellItem3()'], ['销毁', 'sendDestroyItem3()']],
  },
  5: {
    title: helpLink('任务物品'),
    ops: [
      ['使用', 'sendUseItem5()'],
      ['出售', 'sendSellItem5()'],
      ['销毁', 'sendDestroyItem5()'],
      ['全部销毁', 'sendDestroyAllItem(-5)'],
    ],
  },
}

/** 一件物品的两格（radio 5% + 名称/状态 45%）。 */
function itemCells(row: ItemRow, groupId: ItemGroupId): string {
  const busy = row.itemsn === undefined
  const query = busy
    ? `itemmid.jsp?quality=${num(row.quality ?? 0)}&item=${num(row.itemId)}`
    : `itemmid.jsp?itemsn=${num(row.itemsn!)}&item=${num(row.itemId)}`
  const stack = row.count !== undefined && row.count > 1 ? ` ×${num(row.count)}` : ''
  return `<TD width="5%"><INPUT type=radio value=${busy ? 0 : num(row.itemsn!)} name=selectitem${groupId}></TD>` +
    `<TD width="45%"><A class=middlebold href="#" ` +
    `onclick="openRWindow('${js(row.name)}','${query}')">${esc(row.name)}</A>${stack} <BR>` +
    `${statusSpan(row)}</TD>`
}

function statusSpan(row: ItemRow): string {
  if (row.status === undefined) return ''
  const timed = !STATUS_WITHOUT_TIMER.includes(row.status)
  const tail = timed ? `...${countdown(row.seconds ?? null)}` : ''
  return `<SPAN class=smallgray>${esc(row.status)}${tail}</SPAN> `
}

function groupBlock(group: ItemGroup): string {
  const def = GROUPS[group.id]
  // 两列网格：一行放两件，落单的一格补空
  const rows: string[] = []
  for (let i = 0; i < group.items.length; i += 2) {
    const a = group.items[i]!
    const b = group.items[i + 1]
    rows.push(
      `<TR>${itemCells(a, group.id)}${b ? itemCells(b, group.id) : '<TD width="5%"></TD><TD width="45%"></TD>'}</TR>`,
    )
  }
  return `<TR class="titlebg middlebold" align=middle><TD colSpan=2>${def.title}</TD></TR>
<TR class=trbg>
<TD vAlign=top><TABLE cellSpacing=0 cellPadding=2 width="100%" border=0><TBODY>
${rows.join('\n')}
</TBODY></TABLE></TD>
<TD vAlign=top width="20%">${def.ops
    .map(([label, fn]) =>
      `&nbsp;<A class=smallbold href="#" onclick=${fn}><IMG src="img/event/mark.gif">&nbsp;${esc(label)}</A>`)
    .join('<BR>\n')}</TD></TR>`
}

function listPage(vm: ItemListVm): string {
  return `${inkBar(`${helpLink('拥有法宝')}<SPAN class=smallbold>(${num(vm.used)}/${num(vm.capacity)})</SPAN>`)}
<TABLE class="tablebg middle" cellSpacing=1 cellPadding=2 width=460 border=0><TBODY>
${each(vm.groups, groupBlock)}
</TBODY></TABLE>
<DIV class=smallgray>注意：<BR>点击物品名称可以查看关于此物品更详细的信息。</DIV>`
}

// —— 炼制页（飞剑 / 护身 / 丹药）——

/** 五行消耗的图标行 + 数值行（与人物页真气表同一套 `img/res/*.gif`）。 */
function costRows(cost: readonly [number, number, number, number, number]): string {
  return `<TR align=middle>${each(RES, (icon) => `<TD width="20%"><IMG src="img/res/${icon}.gif"></TD>`)}</TR>
<TR class=small align=middle>${each(cost, (v) => `<TD>${num(v)}</TD>`)}</TR>`
}

/**
 * 炼制表。05 §2.1：表头 `名称｜属性｜操作`；每行的「属性」格是一张三行小表
 * ①五行图标 ②数值 ③`需要时间 H:MM:SS 准备炼制: [输入框] (N)`。
 * 丹药行没有 ①②（05 §5.2：丹药行不显示五行消耗）。
 */
function craftTable(title: string, hideTab: number, rows: readonly CraftRow[]): string {
  return `${inkBar(esc(title), hideTab)}
<TABLE class="tablebg middle" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle><TD width="30%">名称</TD><TD width="50%">属性</TD><TD width="20%">操作</TD></TR>
${each(rows, (r) => {
    const box = `craft${num(r.itemId)}`
    const hint = r.craftable === null
      ? '<SPAN class=smallred>(未满足)</SPAN>'
      : `<A class=skillup href="#" onclick="$('${box}').value=${num(r.craftable)}">(${num(r.craftable)})</A>`
    return `<TR class=trbg>
<TD vAlign=top width="30%"><A class=skillup href="#" onclick="openRWindow('${js(r.name)}','itemmid.jsp?item=${num(r.itemId)}')">${esc(r.name)}</A><BR><SPAN class=smallgray>现有:${num(r.owned)}</SPAN></TD>
<TD width="50%"><TABLE cellSpacing=0 cellPadding=1 width="100%" border=0><TBODY>
${r.cost ? costRows(r.cost) : ''}
<TR class=small><TD colSpan=5 noWrap>需要时间 ${formatDuration(r.craftSeconds)} 准备炼制: <INPUT class=craftnum id=${box} size=4> ${hint}</TD></TR>
</TBODY></TABLE></TD>
<TD vAlign=middle align=middle width="20%"><A class=skillup href="#" onclick="sendMakeItem(${num(r.itemId)})">炼制</A></TD></TR>`
  })}
</TBODY></TABLE>`
}

/** 「正在炼制中」表（截图 #68：丹药｜剩余时间｜完成时间；墨迹条无折叠钮）。 */
function brewTable(title: string, head: string, rows: readonly BrewRow[]): string {
  return `${inkBar(esc(title))}
<TABLE class="tablebg middle" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle><TD width="40%">${esc(head)}</TD><TD width="30%">剩余时间</TD><TD width="30%">完成时间</TD></TR>
${each(rows, (r) =>
    `<TR class="trbg middle" align=middle>` +
    `<TD><A class=skillup href="#" onclick="openRWindow('${js(r.name)}','itemmid.jsp?item=${num(r.itemId)}')">${esc(r.name)}</A></TD>` +
    `<TD>${countdown(r.seconds)}</TD><TD>${esc(r.finishAt)}</TD></TR>`)}
</TBODY></TABLE>`
}

// —— 丹药 ——

/**
 * 按炼丹之术等级取那一档的六行。丹药 item id 规律见 09 §1.16
 * （`202` 二炼碧罗丹、`401` 一炼烈炎丹）→ 百位=丹种(1..6)、个位=炼数。
 */
export function pillRows(alchemyLevel: number, craftable: (name: string) => number | null): readonly CraftRow[] {
  const tierIdx = Math.min(PILL_TIERS.length, Math.max(1, Math.floor(alchemyLevel))) - 1
  const tier = PILL_TIERS[tierIdx]!
  return PILL_NAMES.map((kind, i) => {
    const name = `${tier}${kind}`
    return {
      name,
      itemId: (i + 1) * 100 + (tierIdx + 1),
      owned: 0,
      craftSeconds: pillRecipe(name)!.baseSeconds,
      craftable: craftable(name),
    }
  })
}

// —— 淬炼（C 档，按 05 §18.5 推）——

/**
 * 淬炼页。**既无截图也无 DOM**，台账记 **按同系列推**：
 * 墨迹条「淬炼法宝」+ 与炼制页同构的表（这里「属性」格放淬炼消耗与时间）+
 * 下方「正在淬炼中」表（仿丹药页的「正在炼制中」）。
 * 唯一硬证据是一览页状态词 `淬炼中... 0:05:10` 与路由 `item.jsp?tab=4`。
 */
function refinePage(rows: readonly CraftRow[], brewing: readonly BrewRow[]): string {
  return `${craftTable('淬炼法宝', 4, rows)}
${when(brewing.length > 0, () => brewTable('正在淬炼中', '法宝', brewing))}`
}

/** 渲染法宝页左栏（`#gleft` 的内容）。 */
export function renderItem(vm: ItemVm): string {
  const tabs = ITEM_TABS.map((t) => ({ label: t.label, href: t.href }))
  const head = pageHeader(TITLE_IMG[vm.tab], tabs)

  if (vm.tab === 'list') return `${head}\n${listPage(vm)}`

  const brewing = vm.brewing ?? []
  if (vm.tab === 'refine') return `${head}\n${refinePage(vm.rows, brewing)}`

  // 护身页无截图无 DOM（C 档），按 05 §18.4 与炼制飞剑页同构
  const title = vm.tab === 'sword' ? '炼制飞剑' : vm.tab === 'guard' ? '炼制护身法宝' : '炼制丹药'
  const hideTab = vm.tab === 'sword' ? 1 : vm.tab === 'guard' ? 2 : 3
  const brewHead = vm.tab === 'pill' ? '丹药' : '法宝'
  return `${head}
${craftTable(title, hideTab, vm.rows)}
${when(brewing.length > 0, () => brewTable('正在炼制中', brewHead, brewing))}`
}
