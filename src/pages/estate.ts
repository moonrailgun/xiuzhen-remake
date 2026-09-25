/**
 * 产业（estate.jsp，L 窗）。
 *
 * ⚠ **整页是重建，不是复原。** 页面本身零截图零 DOM，唯一的实证是入口：
 * 人物信息表里「产业」那一行的值是 `点击查看`，链接写法
 * `openLWindow( '', 'estate.jsp')`（原版 DOM，见 `player.ts` 的 `infoTable`）。
 *
 * 内容按规则报告里的产业玩法拼出来（这些是【原文】，只是没有页面证据）：
 *  - 村/镇/城可投资，按份额分利；投得多的可以把小投资人「踢出」（`02 §1.8`）；
 *  - 玩家经验：最多同时投 5 处，「尽可能投资等级低的城市，分散成 5 个最好」（`02 §3.7`）；
 *  - 商业等级 1–30，村庄 30 级总投入 290 万两 → 1500 两/小时；
 *    小镇 = 村庄 ×1.5，城池 = 村庄 ×2（`03 §1.13`，玩家整理的全表）；
 *  - 产业排行榜把收益写作 `11786两/小时`（`03 §1.13` 原文）—— 本页沿用同一写法。
 *
 * 表格骨架（`tablebg` 宽 460、`titlebg middlebold` 表头、`trbg middle` 数据行、
 * 地名写成 `名字(x,y)`、坐标链到 `map.jsp?x=&y=`）照同系列通式，是有把握的部分。
 */

import { esc, each, num, when } from './html.ts'

export type EstateRow = {
  /** 城镇名，如「地球镇」 */
  readonly name: string
  readonly x: number
  readonly y: number
  /** 商业等级 1–30 */
  readonly level: number
  /** 我投进去的银两 */
  readonly invested: number
  /** 我占的份额，百分数（已算好） */
  readonly share: number
  /** 我每小时分到的银两 */
  readonly income: number
}

export type EstateVm = {
  readonly rows: readonly EstateRow[]
  /** 可同时持有的产业数上限（玩家经验：5 处） */
  readonly slotCap: number
}

/** 渲染产业浮窗内容（L 窗，内容表宽 460）。 */
export function renderEstate(vm: EstateVm): string {
  const total = vm.rows.reduce((s, r) => s + r.income, 0)
  return `<TABLE class="titlebg2 bigbold" cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR align=middle><TD>俗世产业 (${num(vm.rows.length)}/${num(vm.slotCap)})</TD></TR></TBODY></TABLE>
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>
<TD width=140>产业</TD>
<TD width=70>商业等级</TD>
<TD width=80>我的投资</TD>
<TD width=60>份额</TD>
<TD width=70>收益</TD>
<TD>操作</TD></TR>
${each(vm.rows, (r) => `<TR class="trbg middle" align=middle>
<TD class=skillup><A href="map.jsp?x=${num(r.x)}&y=${num(r.y)}">${esc(r.name)}(${num(r.x)},${num(r.y)})</A></TD>
<TD>Lv.${num(r.level)}</TD>
<TD>${num(r.invested)} 两</TD>
<TD>${esc(r.share.toFixed(1))}%</TD>
<TD>${num(r.income)}两/小时</TD>
<TD class=smallbold><A onclick="MDialogOkCancel('', '确定撤资?',function(){ajaxPost('unestate', 'town=${num(r.x)},${num(r.y)}', refleshAll);})" href="#">撤资</A></TD></TR>`)}
${when(
    vm.rows.length === 0,
    () => `<TR class="trbg middle" align=middle><TD class=smallgray colSpan=6>目前没有任何产业</TD></TR>`,
  )}
<TR class=trbg>
<TD class=smallbold colSpan=6 align=right>合计 ${num(total)}两/小时</TD></TR>
<TR class=trbg>
<TD class=smallred colSpan=6>注意：最多只能同时持有${num(vm.slotCap)}处产业。收益随游戏时间入账，撤资退还本金。到村庄、小镇或城池找村长投资。</TD></TR>
</TBODY></TABLE>`
}
