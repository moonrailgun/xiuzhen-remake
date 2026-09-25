/**
 * 读信（L 窗，内容表宽 460）—— 系统战报 / 推算结果 / 普通来信共用一个外壳。
 *
 * 外壳【照原版 DOM】`09 §1.1`（SRC=`forum162/article-95251-p1.html@4106`、
 * `article-95861-p1.html@8673`）：三行表头「主题 / 发信人 / 发信时间」+ 两行按钮位 +
 * `TD colSpan=3 height=200 > DIV#msgcontent`。按钮是原生 `<INPUT type=button>`，不是图片。
 * 头像格：玩家来信有（2008-11 起一直有），**系统信在 2008-12~2009-09 的 12 个样本里整格不存在**，
 * 2009-11 才出现 —— 基准期取「系统信无头像格」，见 `docs/spec/DECISIONS.md` §1.5。
 *
 * 正文四种：
 *  1. 战报（缠斗结果信）—— `docs/research/03` §1.2 + `09 §1.2`。
 *     开场白一字不差（30+ 份独立粘贴逐字相同，前面两个全角空格缩进）；
 *     440px 四列表，每把剑占两行，结果格 `rowSpan=2`，结果只有「完好无损」「惨被斩断」两种。
 *     ★ 半表：官方客服原文「如果您的飞剑被斩断，不管对方飞剑是否被断，您的战报里面，
 *     都不会显示对方的飞剑」→ 败方只渲染己方半张表，所以 `sides` 可以只有一张。
 *  2. 九宫飞星（定位）—— `03 §1.6`：一句定位 + 目标丹田五行真气 + 固本培元等级。
 *     三段文字是【原文】；中间那张真气表【按推断】沿用「被飞剑刺伤失去的真气」表的结构
 *     （`09 §1.1` 末段：`width=400 align=center`，五个 `width="20%"` 图标格 + 五个数字格）。
 *  3. 太乙神数（法宝列表）—— 【照原版 DOM】`09 §1.16`（SRC=`forum162/article-108569-p1.html@11009`）：
 *     `width=440 align=center`，标题 `{玩家}拥有的法宝`，列 名称40% 类型20% 数量15% 状态25%。
 *  4. 紫微斗数（经脉）—— `03 §1.6` 的正文是【原文】（标题「{目标}的经脉修炼情况」、
 *     行写法 `经脉名 Lv.N [属性] N倍`、每组三条只在第一条标属性），但**表结构无 DOM**，
 *     这里按太乙神数表同构【重建】。
 */

import { esc, escJs, each, num, js } from './html.ts'
import {
  MERIDIANS,
  groupElement,
  multiplier,
  type Element,
  type MeridianGroup,
} from '../data/meridian.ts'


/** 五行图标与名称，界面顺序「金木水火土」。 */
const RES = ['gold', 'wood', 'water', 'fire', 'earth'] as const
export type Qi5 = readonly [number, number, number, number, number]

/** 战报开场白 [原文]，前面两个全角空格是原版的缩进。 */
export const BATTLE_INTRO =
  '　　双方的法宝交缠在一起拼斗，破空锐气四散激射，流光四逸。法宝相互绞杀良久，终于分出结果来了！'

/** 结果列实见只有这两种用语（降级等其它用语是缺口）。 */
export type BattleResult = '完好无损' | '惨被斩断'

export type BattleSword = {
  readonly ownerId: number
  readonly owner: string
  /** 全名，含品质与淬炼后缀，如「凡品墨叶血浪剑+6」 */
  readonly name: string
  /** itemmid.jsp?item= 的 id，5XXYY */
  readonly itemId: number
  /** itemmid.jsp?quality= 的淬炼 +N */
  readonly refine: number
  /** 战时实际值（含法术与付费加成），不是面板值 */
  readonly attack: number
  readonly endurance: number
  /** 受到伤害 = min(分摊伤害, 耐久)；等于耐久即被斩断 */
  readonly damage: number
  readonly result: BattleResult
}

export type BattleSide = {
  readonly title: '攻击方' | '防御方'
  readonly swords: readonly BattleSword[]
}

export type MsgBody =
  /** 普通正文，每段一行；原版段首常带两个全角空格 */
  | { readonly kind: 'text'; readonly paragraphs: readonly string[] }
  | { readonly kind: 'battle'; readonly sides: readonly BattleSide[] }
  | {
      readonly kind: 'spy-locate'
      readonly target: string
      readonly at: readonly [number, number]
      readonly qi: Qi5
      /** 固本培元等级 */
      readonly rootLevel: number
    }
  | { readonly kind: 'spy-items'; readonly target: string; readonly items: readonly SpyItem[] }
  | {
      readonly kind: 'spy-meridian'
      readonly target: string
      /** 目标本命属性，决定每组经脉炼化哪一种真气 */
      readonly element: Element
      /** 12 条经脉等级，顺序同 `MERIDIANS` */
      readonly levels: readonly number[]
    }

export type SpyItem = {
  readonly name: string
  readonly itemId: number
  readonly refine: number
  /** 原版写成【丹药】【飞剑】【书籍】【任务】（含方头括号） */
  readonly type: '丹药' | '飞剑' | '书籍' | '任务' | '护身'
  readonly count: number
  /** 实见「空闲 / 损坏 / 淬炼」；低等级太乙神数没有这一列 */
  readonly status?: string
}

export type MsgDetailVm = {
  readonly id: number
  readonly subject: string
  /** 系统信恒为字面量「系统」 */
  readonly sender: string
  /** 发信人头像基名，如 `tongtianf`；系统信为 null（基准期系统信没有头像格） */
  readonly avatar: string | null
  /** YYYY-MM-DD HH:MM:SS */
  readonly sentAt: string
  readonly body: MsgBody
}

const itemLink = (name: string, itemId: number, refine: number, cls: string): string =>
  `<A class=${cls} onclick="openRWindow('${js(name)}', 'itemmid.jsp?item=${itemId}&quality=${refine}')" href="#">${esc(name)}</A>`

// —— 战报 ——

/** 一方的战报表。每把剑两行：名称行（colSpan=3）+ 数值行；结果格 rowSpan=2。 */
function battleTable(side: BattleSide): string {
  return `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=440 align=center border=0><TBODY>
<TR><TD class="titlebg middlebold" align=middle colSpan=4>${side.title}</TD></TR>
<TR class="trbg2 middle" align=middle><TD width="25%">攻击</TD><TD width="25%">耐久</TD><TD width="25%">受到伤害</TD><TD width="25%">结果</TD></TR>
${each(side.swords, (s) =>
    `<TR class="trbg middlebold" align=middle>` +
    `<TD colSpan=3>来自<A onclick="openLWindow('', 'playerinfo.jsp?playerid=${s.ownerId}')" href="#">${esc(s.owner)}</A>的${itemLink(s.name, s.itemId, s.refine, 'middlebold')}</TD>` +
    `<TD rowSpan=2>${s.result} </TD></TR>` +
    `<TR class="trbg small" align=middle><TD>${num(s.attack)}</TD><TD>${num(s.endurance)}</TD><TD>${num(s.damage)}</TD></TR>`)}
</TBODY></TABLE>`
}

// —— 推算 ——

/**
 * 五行真气表：`width=400 align=center`，一行五个 16×16 图标 + 一行五个数字。
 * 结构来自「被飞剑刺伤失去的真气」表（`09 §1.1`），推算结果与任务奖励都复用它。
 */
function qiTable(title: string, qi: Qi5): string {
  return `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=400 align=center border=0><TBODY>
<TR class="titlebg middlebold" align=middle><TD colSpan=5>${esc(title)}</TD></TR>
<TR class=trbg align=middle>${each(RES, (icon) => `<TD width="20%"><IMG src="img/res/${icon}.gif"></TD>`)}</TR>
<TR class="trbg middle" align=middle>${each(RES, (_, i) => `<TD>${num(qi[i] ?? 0)}</TD>`)}</TR>
</TBODY></TABLE>`
}

/** 太乙神数：目标的法宝清单。低等级版本没有「状态」列，这里按 `status` 是否给出决定。 */
function spyItemsTable(target: string, items: readonly SpyItem[]): string {
  const withStatus = items.some((i) => i.status !== undefined)
  const cols = withStatus ? 4 : 3
  return `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=440 align=center border=0><TBODY>
<TR><TD class="titlebg middlebold" align=middle colSpan=${cols}>${esc(target)}拥有的法宝</TD></TR>
<TR class="trbg2 middlebold" align=middle><TD width="40%">名称</TD><TD width="20%">类型</TD><TD width="15%">数量</TD>${withStatus ? '<TD width="25%">状态</TD>' : ''}</TR>
${each(items, (it) =>
    `<TR class="trbg small" align=middle><TD class=smallbold>${itemLink(it.name, it.itemId, it.refine, 'smallbold')}</TD>` +
    `<TD>【${esc(it.type)}】</TD><TD>${num(it.count)}</TD>` +
    `${withStatus ? `<TD class=smallgray>${esc(it.status ?? '')}</TD>` : ''}</TR>`)}
</TBODY></TABLE>`
}

/**
 * 紫微斗数正文里经脉的出场顺序 [原文]：手三阴 → 足三阴 → 足三阳 → 手三阳，
 * 每组三条、只在第一条标属性。见 `reference/text/forum162/article-96998-p1.txt`。
 */
const SPY_GROUP_ORDER: readonly MeridianGroup[] = ['手三阴', '足三阴', '足三阳', '手三阳']

function spyMeridianTable(target: string, element: Element, levels: readonly number[]): string {
  const rows: string[] = []
  for (const group of SPY_GROUP_ORDER) {
    const el = groupElement(element, group)
    let first = true
    MERIDIANS.forEach((m, idx) => {
      if (m.group !== group) return
      const lv = levels[idx] ?? 0
      rows.push(
        `<TR class="trbg small" align=middle><TD class=smallbold>${esc(m.name)}</TD>` +
          `<TD>Lv.${num(lv)}</TD><TD>${first ? esc(el) : '&nbsp;'}</TD>` +
          `<TD>${num(multiplier(lv))}倍</TD></TR>`,
      )
      first = false
    })
  }
  return `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=440 align=center border=0><TBODY>
<TR><TD class="titlebg middlebold" align=middle colSpan=4>${esc(target)}的经脉修炼情况</TD></TR>
${rows.join('\n')}
</TBODY></TABLE>`
}

// —— 正文分发 ——

function bodyHtml(body: MsgBody): string {
  switch (body.kind) {
    case 'text':
      return each(body.paragraphs, (p) => `${esc(p)}<BR>`)
    case 'battle':
      return `${esc(BATTLE_INTRO)}<BR>${each(body.sides, (s) => battleTable(s))}`
    case 'spy-locate':
      return (
        `${esc(`你掐指一算，发现${body.target}正位于(${body.at[0]},${body.at[1]})。`)}<BR>` +
        qiTable(`${body.target}丹田中的真气情况`, body.qi) +
        `${esc(`${body.target}的本体拥有固本培元Lv.${body.rootLevel}`)}<BR>`
      )
    case 'spy-items':
      return spyItemsTable(body.target, body.items)
    case 'spy-meridian':
      return spyMeridianTable(body.target, body.element, body.levels)
  }
}

/** 渲染一封信。 */
export function renderMsgDetail(vm: MsgDetailVm): string {
  // 系统信没有头像格 → 表头行只剩两格；有头像时头像格 rowSpan=5。
  const avatarCell = vm.avatar
    ? `<TD vAlign=center width=100 rowSpan=5><IMG src="img/avatar/${esc(vm.avatar)}.gif"></TD>`
    : ''
  const bodyCols = vm.avatar ? 3 : 2
  // 只有玩家来信能回复；系统信没有「回复」钮
  const reply = vm.sender === '系统'
    ? ''
    : `<INPUT type=button value=回复 onclick="openLWindow('写消息', 'writemsg.jsp?remsg=${vm.id}')">　`

  return `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class=trbg align=middle>${avatarCell}
<TD class="titlebg bigbold" width=100>主题</TD>
<TD class="titlebg big" width=260>${esc(vm.subject)}</TD></TR>
<TR class="trbg middle" align=middle><TD class=smallbold>发信人</TD><TD class=small>${esc(vm.sender)}</TD></TR>
<TR class="trbg middle" align=middle><TD class=smallbold>发信时间</TD><TD class=small>${esc(vm.sentAt)}</TD></TR>
<TR class="trbg middle" align=middle><TD class=smallbold align=right colSpan=2 height=40>&nbsp;</TD></TR>
<TR class="trbg middle" align=middle><TD class=smallbold align=right colSpan=2 height=20>${reply}<INPUT type=button value=删除 onclick="postForm('removemsg', 'ids=1,${vm.id}');closeLWindow();closeRWindow();">　<INPUT type=button value=关闭 onclick=closeLWindow();></TD></TR>
<TR class="trbg middle"><TD colSpan=${bodyCols} height=200><DIV id=msgcontent>${bodyHtml(vm.body)}</DIV></TD></TR>
</TBODY></TABLE>`
}

export { qiTable }
