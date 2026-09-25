/**
 * 排行榜（rank.jsp，L 窗）。
 *
 * 表体与列定义是【照原版 DOM】—— `all-fragments.html` ←
 * `raw/forum162/article-105987-p1.html@10483`（道行榜整表，排名写作 `1.`，玩家名在
 * `TD.skillup > A` 里点开 `playerinfo.jsp`）；页头那段在
 * `round2-fragments.html` ← `raw/forum162/article-127848-p1.html`（`titlerank.gif` + 五个 tab）。
 * 副标题条「道行高深 / 俗世产业」是【原文】（`09 §1.11`、`03 §1.13`）。
 *
 * 版本取舍（`docs/spec/DECISIONS.md` §1.5）：
 *  - 基准版只有 **4 个标签**（道行 / 门派 / 产业 / 阅历）。功德榜是 2009-06-30
 *    「仙府开光」资料片才有的，DOM 里的 `rank.jsp?tab=2` 不在基准里，**不做**。
 *  - 不用 `trbg3` 斑马纹（2010-03 才出现），数据行一律 `trbg middle`。
 *  - 玩家名也不带合服后的 `#服号` 后缀。
 *
 * 截图 #74 / #158 都是缩放图（450×325 与 400×289 是同一张），只能比区块比例：
 * 三列宽 66/216/152 ≈ 15% / 50% / 35%，与 DOM 的百分比吻合。
 */

import { esc, each, num, when } from './html.ts'
import { pageHeader } from './shell.ts'

export type RankTab = 'power' | 'ally' | 'estate' | 'exp'

/**
 * 一行榜单。四个榜共用一个结构：
 *  - 道行榜：name=玩家、value=「九年零二个月」
 *  - 门派榜：name=门派、leader=掌门、value=道行
 *  - 产业榜：name=玩家、value=「11786两/小时」
 *  - 阅历榜：name=玩家、realm=境界、value=阅历
 */
export type RankRow = {
  /** 玩家 id 或门派 id，决定点开哪个浮窗 */
  readonly id: number
  readonly name: string
  /** 门派榜的掌门列 */
  readonly leader?: { readonly id: number; readonly name: string }
  /** 阅历榜的境界列 */
  readonly realm?: string
  /** 末列的值，已经格式化好（道行是中文数字年，产业带「两/小时」） */
  readonly value: string
}

export type RankVm = {
  readonly tab: RankTab
  readonly rows: readonly RankRow[]
}

/**
 * tab 编号沿用原版 DOM 的编号（道行无参数、门派=3、产业=4、阅历=5），
 * **中间空出的 2 就是功德榜**。基准版不显示它，但编号不重排 —— 重排是没有证据的改动。
 */
const TABS: readonly { readonly tab: RankTab; readonly label: string; readonly href: string }[] = [
  { tab: 'power', label: '道行', href: 'rank.jsp' },
  { tab: 'ally', label: '门派', href: 'rank.jsp?tab=3' },
  { tab: 'estate', label: '产业', href: 'rank.jsp?tab=4' },
  { tab: 'exp', label: '阅历', href: 'rank.jsp?tab=5' },
]

/**
 * 副标题条（`TABLE.titlebg2.bigbold width=460`）。
 * 「道行高深」「俗世产业」是原文；门派榜与阅历榜的没有任何留存，这两条是【重建】。
 */
const SUBTITLE: Record<RankTab, string> = {
  power: '道行高深',
  ally: '门派兴旺',
  estate: '俗世产业',
  exp: '阅历深厚',
}

/** 列定义：宽度用百分比，照 DOM。门派榜与阅历榜的宽度 DOM 只给了阅历榜。 */
const COLUMNS: Record<RankTab, readonly { readonly label: string; readonly width: string }[]> = {
  power: [
    { label: '排名', width: '15%' },
    { label: '玩家', width: '50%' },
    { label: '道行', width: '35%' },
  ],
  // 门派榜四列的宽度无证据，按 15/30/30/25 分【重建】
  ally: [
    { label: '排名', width: '15%' },
    { label: '门派', width: '30%' },
    { label: '掌门', width: '30%' },
    { label: '道行', width: '25%' },
  ],
  estate: [
    { label: '排名', width: '15%' },
    { label: '玩家', width: '50%' },
    { label: '产业收益', width: '35%' },
  ],
  exp: [
    { label: '排名', width: '15%' },
    { label: '玩家', width: '40%' },
    { label: '境界', width: '20%' },
    { label: '阅历', width: '25%' },
  ],
}

/** 玩家链接：绿色粗体，点开 L 窗个人资料。门派则是 `allyinfo.jsp`。 */
const playerLink = (id: number, name: string): string =>
  `<A onclick="openLWindow('', 'playerinfo.jsp?playerid=${num(id)}')" href="#">${esc(name)}</A>`

const allyLink = (id: number, name: string): string =>
  `<A onclick="openLWindow('', 'allyinfo.jsp?ally=${num(id)}')" href="#">${esc(name)}</A>`

function row(tab: RankTab, r: RankRow, i: number): string {
  // 排名写作 `1.`（数字 + 英文句点，居中）；每页 10 行
  const cells =
    tab === 'ally'
      ? `<TD class=skillup>${allyLink(r.id, r.name)}</TD>` +
        `<TD class=smallbold>${when(r.leader, () => playerLink(r.leader!.id, r.leader!.name))}</TD>` +
        `<TD class=small>${esc(r.value)}</TD>`
      : tab === 'exp'
        ? `<TD class=skillup>${playerLink(r.id, r.name)}</TD>` +
          `<TD>${esc(r.realm ?? '')}</TD>` +
          `<TD>${esc(r.value)}</TD>`
        : `<TD class=skillup>${playerLink(r.id, r.name)}</TD><TD>${esc(r.value)}</TD>`
  return `<TR class="trbg middle" align=middle><TD>${num(i + 1)}.</TD>${cells}</TR>`
}

/** 渲染排行榜浮窗内容（L 窗，内容表宽 460）。 */
export function renderRank(vm: RankVm): string {
  const cols = COLUMNS[vm.tab]
  return `${pageHeader(
    'titlerank.gif',
    TABS.map((t) => ({ label: t.label, onclick: `openLWindow('', '${t.href}')` })),
  )}
<TABLE class="titlebg2 bigbold" cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR align=middle><TD>${SUBTITLE[vm.tab]}</TD></TR></TBODY></TABLE>
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>${each(cols, (c) => `<TD width="${c.width}">${c.label}</TD>`)}</TR>
${each(vm.rows, (r, i) => row(vm.tab, r, i))}
</TBODY></TABLE>`
}

export { TABS as RANK_TABS }
