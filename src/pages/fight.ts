/**
 * 出击 / 支援 / 还击（`fight.jsp?type=1|2|3`，L 窗）。
 *
 * **既无截图也无 DOM**（`docs/spec/PAGE-INDEX.md` §35，`09 §6` 明列
 * 「fight.jsp / battlemap.jsp 本体 DOM 未留存」）。台账记 **只能重建**。
 *
 * 手上的硬证据只有三条，全部落进了这一页：
 *  1. **流程**（`02 §3.1` 官方攻略《飞剑压秒普及》原文）：
 *     「点攻击图标 → 选择法术 → 选择飞剑 → 进入**攻击预览**页」；
 *  2. **攻击预览页右下角那一行小字是逐字的**：`需要时间 0:21:39 到达时间 06:45:54。`
 *     （注意句尾有句号，且「到达时间」是绝对时刻不是倒计时）；
 *  3. **出击上限默认 5 把，万剑诀每级 +1**。
 *
 * 其余（表单布局、剑列表列宽、法术选择控件）按 `09 §1.10` 的页头通式 +
 * `09 §1.1` 的表格通式重建，与法宝一览页同构：`TABLE.tablebg cellSpacing=1 width=460`。
 * 「选择法术」这一步基准期只有被动剑诀（`artifacts.ts` 的 `PASSIVE_SWORD_ARTS`），
 * 没有可选项，所以这里只显示已生效的被动加成，不做下拉 —— 不编造不存在的控件。
 */

import { esc, escJs, each, num, when, js } from './html.ts'
import { pageHeader } from './shell.ts'
import { formatDuration } from '../engine/clock.ts'

export type FightKind = 'attack' | 'reinforce' | 'counter'

/** 一行可选的飞剑。数值是**面板值**（已经乘过品质与淬炼）。 */
export type FightSword = {
  readonly id: string
  /** 全名，含品质前缀与 `+N` */
  readonly name: string
  readonly itemId: number
  readonly itemsn?: number
  readonly attack: number
  readonly durability: number
  readonly agility: number
  readonly speed: number
  readonly element: string
  /** 飞过去要多久（秒）。整批取最慢的一把，所以逐行显示各自的 */
  readonly seconds: number
}

export type FightVm = {
  readonly kind: FightKind
  readonly targetName: string
  readonly at: readonly [number, number]
  /** 目标概要，如「白骷髅 攻击:45 敏捷:10 生命:45 属性:无」；玩家目标时是境界/道行 */
  readonly summary: string
  readonly swords: readonly FightSword[]
  /** 同时在外的上限（5 + 万剑诀等级） */
  readonly limit: number
  /** 已经在外面的把数 */
  readonly out: number
  /** 生效中的被动剑诀，`名称 Lv.N` */
  readonly passives: readonly string[]
  /** 没有剑可派时的原因 */
  readonly blocked?: string
}

const TITLE: Record<FightKind, string> = {
  attack: '出击',
  reinforce: '支援',
  counter: '还击',
}

/** 页头横幅。战斗系列共用「战 斗」条（与事件总览页同一张）。 */
const TITLE_IMG = 'titlefight.gif'

/**
 * 攻击预览的那一行小字。**格式逐字照原文**：
 * `需要时间 0:21:39 到达时间 06:45:54。`（`02 §3.1`）
 */
export const previewLine = (seconds: number, arriveClock: string): string =>
  `需要时间 ${formatDuration(seconds)} 到达时间 ${arriveClock}。`

/** 渲染出击页（L 窗内容，表宽 460）。 */
export function renderFight(vm: FightVm): string {
  const head = pageHeader(TITLE_IMG, [])
  const canSend = vm.swords.length > 0 && !vm.blocked

  return `${head}
<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR>
<TD class=bigbold align=middle>${esc(TITLE[vm.kind])} ${esc(vm.targetName)}</TD>
</TR></TBODY></TABLE>
<TABLE class="tablebg middle" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="trbg middle"><TD colSpan=2>${esc(vm.summary)}</TD>
<TD align=right class=small noWrap>(${num(vm.at[0])},${num(vm.at[1])})</TD></TR>
${when(vm.passives.length > 0, () =>
    `<TR class="trbg middle"><TD colSpan=3 class=smallgray>已生效：${each(vm.passives, (p, i) => `${i ? '　' : ''}${esc(p)}`)}</TD></TR>`)}
</TBODY></TABLE>
<DIV style="height:6px"></DIV>
<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR>
<TD class=bigbold align=middle>选择飞剑<SPAN class=smallbold>(${num(vm.out)}/${num(vm.limit)})</SPAN></TD>
</TR></TBODY></TABLE>
<FORM id=fightform>
<TABLE class="tablebg middle" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>
<TD width="8%"><INPUT onclick=selectAllSwords(this.checked) type=checkbox></TD>
<TD width="34%">飞剑</TD><TD width="14%">攻击</TD><TD width="14%">耐久</TD><TD width="14%">敏捷</TD><TD width="16%">需要时间</TD></TR>
${when(
    vm.swords.length === 0,
    () => `<TR class="trbg middle" align=middle><TD colSpan=6><SPAN class=smallgray>${
      esc(vm.blocked ?? '没有可以出击的飞剑')}</SPAN></TD></TR>`,
    () => each(vm.swords, (s) =>
      `<TR class="trbg middle" align=middle>
<TD><INPUT type=checkbox name=sword value="${esc(s.id)}"></TD>
<TD align=left><A class=middlebold href="#" onclick="openRWindow('${js(s.name)}','itemmid.jsp?item=${num(s.itemId)}${s.itemsn === undefined ? '' : `&itemsn=${num(s.itemsn)}`}')">${esc(s.name)}</A></TD>
<TD>${num(s.attack)}</TD><TD>${num(s.durability)}</TD><TD>${num(s.agility)}</TD>
<TD class=small noWrap>${formatDuration(s.seconds)}</TD></TR>`),
  )}
</TBODY></TABLE></FORM>
<TABLE cellSpacing=0 cellPadding=3 width=460 border=0><TBODY><TR>
<TD class=small><SPAN id=fightpreview class=smallgray></SPAN></TD>
<TD align=right>${when(
    canSend,
    () => `<A class=skillup href="#" onclick="sendFight('${js(vm.targetName)}')">${esc(TITLE[vm.kind])}</A>`,
    () => `<SPAN class=smallgray>${esc(TITLE[vm.kind])}</SPAN>`,
  )}</TD></TR></TBODY></TABLE>`
}
