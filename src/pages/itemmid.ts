/**
 * 物品详情弹窗（itemmid.jsp，R 窗，内容区宽 230）。
 *
 * 结构是【照原版 DOM】——09 §1.8，33 段片段，主力是
 * `raw/forum162/article-94153-p1.html`（一帖贴了 11 把剑 ×3 表，@11020–@41577）
 * 与 `raw/forum162/article-106585-p1.html@10442`（09b §1.4 小写粘贴）。
 * R 窗内自上而下 4 张表：
 *   1. 描述表 `TABLE cellSpacing=0 cellPadding=3 width="100%" align=center`，三行 `TR.small`：
 *      描写文案 + `SPAN.smallblue` 特效说明 + `【可否交易】【五行】【类别】`（右对齐）／
 *      `炼制条件:…&nbsp;` ／ `使用条件:…&nbsp;`
 *   2. `TABLE.tablebg cellSpacing=1 cellPadding=1`：`基础属性` 表头 + 攻击/耐久/吸收 + 速度/敏捷/击退
 *   3. `每小时消耗真气` 五行图标表
 *   4. `炼制消耗` 五行图标表 + 末行 `需要时间 H:MM:SS`
 * 物品名写在 R 窗标题条 `#rwindowtext.title3`，**不在内容里**。
 *
 * 数值与「(未满足)」红字是【截图】05 §3.1–§3.3（#82 #85 #89 #90 #99 均 1:1）、
 * 丹药态 #84、秘笈态 #14（05 §6）。
 *
 * 面板数值一律走 `src/data/artifacts.ts` 的 `panelStat(区间, 品质, 淬炼)`：
 * 原版窗口把攻击/耐久/吸收写成「废品~极品」区间（图鉴态 `quality=-1` 直接显示 `8~80`），
 * 实物态才是单值；速度与击退不吃品质也不吃淬炼，直接输出原值（`REFINE_KEEPS`）。
 * 用截图交叉验证过：上品上善若水剑+10 攻击 = floor(24×1.5)×2^10 = 36864 ✓（#90），
 * 极品七星磐龙剑+8 攻击 = 1200×2^8 = 307200 ✓（#99）。
 */

import { esc, escJs, each, num, when } from './html.ts'
import { formatDuration } from '../engine/clock.ts'
import { panelStat, type Quality } from '../data/artifacts.ts'
import type { Element } from '../data/meridian.ts'

/** 随品质变化的三项写成 `[废品, 极品]` 区间；`lo === hi` 表示该项不随品质变化。 */
export type StatRange = readonly [number, number]

export type ItemMidStats = {
  readonly attack: StatRange
  readonly durability: StatRange
  readonly absorb: StatRange
  /** 速度不吃品质也不吃淬炼 */
  readonly speed: number
  readonly agility: StatRange
  /** 击退同速度 */
  readonly knockback: number
}

export type Condition = {
  /** 原文写法如 `铸剑之术20级` */
  readonly text: string
  /** 不满足时原版在后面缀红字 `(未满足)` */
  readonly met: boolean
}

export type ItemMidVm = {
  readonly name: string
  /** 描写文案，可多段 */
  readonly flavor: readonly string[]
  /** 蓝字特效说明（如天雷万磁剑那段） */
  readonly effect?: string
  readonly tradable: boolean
  /** 无属性的物品（丹药/秘笈）写作「无属性」 */
  readonly element: Element | '无属性'
  readonly category: '飞剑' | '护身法宝' | '丹药' | '秘笈' | '书籍' | '任务物品'
  /** 图鉴态（原版 `quality=-1`）为 null，属性显示成区间 `8~80` */
  readonly quality: Quality | null
  readonly refine: number
  readonly forge?: Condition
  readonly wield?: Condition
  readonly stats?: ItemMidStats
  /** 每小时消耗真气，金木水火土 */
  readonly upkeep?: readonly [number, number, number, number, number]
  readonly craftCost?: readonly [number, number, number, number, number]
  readonly craftSeconds?: number
  /** 丹药态：服食增加真气（#84 [荒]低阶天元丹 各 8000） */
  readonly gainQi?: readonly [number, number, number, number, number]
  /** 秘笈态：使用后可习得技能（#14【御剑飞行】） */
  readonly teaches?: readonly string[]
}

const RES = ['gold', 'wood', 'water', 'fire', 'earth'] as const

/** 图鉴态显示区间，实物态按品质 × 2^淬炼。 */
function statText(range: StatRange, vm: ItemMidVm): string {
  const [lo, hi] = range
  if (vm.quality === null) return lo === hi ? num(lo) : `${num(lo)}~${num(hi)}`
  return num(panelStat(range, vm.quality, vm.refine))
}

/** 五行图标行 + 数值行，外面套一张带表头的 `tablebg` 表（与人物页真气表同构）。 */
function qiTable(title: string, values: readonly number[], tailRow?: string): string {
  return `<TABLE class=tablebg cellSpacing=1 cellPadding=1 width="100%" align=center border=0><TBODY>
<TR class="small titlebg"><TD class=smallbold colSpan=5>${esc(title)}</TD></TR>
<TR class="trbg small" align=middle>${each(RES, (icon) => `<TD width="20%"><IMG src="img/res/${icon}.gif"></TD>`)}</TR>
<TR class="trbg small" align=middle>${each(values, (v) => `<TD>${num(v)}</TD>`)}</TR>
${tailRow ?? ''}
</TBODY></TABLE>`
}

function condLine(label: string, c: Condition | undefined): string {
  if (!c) return ''
  const bad = c.met ? '' : ' <SPAN class=smallred>(未满足)</SPAN>'
  return `<TR class=small><TD>${esc(label)}:${esc(c.text)}${bad}&nbsp;</TD></TR>`
}

/** 渲染 R 窗内容（标题在 `#rwindowtext`，这里不出名字）。 */
export function renderItemMid(vm: ItemMidVm): string {
  const tags = `【${vm.tradable ? '可以交易' : '不可交易'}】【${esc(vm.element)}】【${esc(vm.category)}】`
  const s = vm.stats

  return `<DIV class=itemmid>
<TABLE cellSpacing=0 cellPadding=3 width="100%" align=center border=0><TBODY>
<TR class=small><TD>${vm.flavor.map(esc).join('<BR>')}${
    when(vm.effect !== undefined, () => `<BR><SPAN class=smallblue>${esc(vm.effect!)}</SPAN>`)
  }<BR><SPAN align="right">${tags}</SPAN></TD></TR>
${condLine('炼制条件', vm.forge)}
${condLine('使用条件', vm.wield)}
</TBODY></TABLE>
${when(s !== undefined, () => `<TABLE class=tablebg cellSpacing=1 cellPadding=1 width="100%" align=center border=0><TBODY>
<TR class="small titlebg"><TD class=smallbold colSpan=3>基础属性</TD></TR>
<TR class="trbg smallbold" align=middle><TD width="33%">攻击</TD><TD width="33%">耐久</TD><TD width="34%">吸收</TD></TR>
<TR class="trbg small" align=middle><TD>${statText(s!.attack, vm)}</TD><TD>${statText(s!.durability, vm)}</TD><TD>${statText(s!.absorb, vm)}</TD></TR>
<TR class="trbg smallbold" align=middle><TD>速度</TD><TD>敏捷</TD><TD>击退</TD></TR>
<TR class="trbg small" align=middle><TD>${num(s!.speed)}</TD><TD>${statText(s!.agility, vm)}</TD><TD>${num(s!.knockback)}</TD></TR>
</TBODY></TABLE>`)}
${when(vm.gainQi !== undefined, () => qiTable('服食增加真气', vm.gainQi!))}
${when(vm.upkeep !== undefined, () => qiTable('每小时消耗真气', vm.upkeep!))}
${when(
    vm.craftCost !== undefined || vm.craftSeconds !== undefined,
    () => craftTable(vm),
  )}
${when(vm.teaches !== undefined, () => teachTable(vm.teaches!))}
${when(vm.category === '丹药', () =>
    `<DIV class=pilluse align=right><A class=skillup href="#" onclick="sendUseItem2()">服食丹药</A></DIV>`)}
</DIV>`
}

/**
 * 炼制消耗表。丹药态只有「需要时间」一行、**没有五行消耗行**（#84 [截图]），
 * 所以五行行按 `craftCost` 是否存在决定。
 */
function craftTable(vm: ItemMidVm): string {
  const timeRow = vm.craftSeconds === undefined
    ? ''
    : `<TR class="trbg small"><TD colSpan=5>需要时间 ${formatDuration(vm.craftSeconds)}</TD></TR>`
  if (vm.craftCost === undefined) {
    return `<TABLE class=tablebg cellSpacing=1 cellPadding=1 width="100%" align=center border=0><TBODY>
<TR class="small titlebg"><TD class=smallbold colSpan=5>炼制消耗</TD></TR>
${timeRow}
</TBODY></TABLE>`
  }
  return qiTable('炼制消耗', vm.craftCost, timeRow)
}

/** 秘笈态：`学习要求`（#14 无要求 → 表头下无内容行）+ `使用后可习得技能`。 */
function teachTable(skills: readonly string[]): string {
  return `<TABLE class=tablebg cellSpacing=1 cellPadding=1 width="100%" align=center border=0><TBODY>
<TR class="small titlebg"><TD class=smallbold>学习要求</TD></TR>
</TBODY></TABLE>
<TABLE class=tablebg cellSpacing=1 cellPadding=1 width="100%" align=center border=0><TBODY>
<TR class="small titlebg"><TD class=smallbold>使用后可习得技能</TD></TR>
${each(skills, (n) => `<TR class="trbg small" align=middle><TD><A class=skillup href="#" onclick="openRWindow('${escJs(n)}','skillmid.jsp?skill=0')">${esc(n)}</A></TD></TR>`)}
</TBODY></TABLE>`
}
