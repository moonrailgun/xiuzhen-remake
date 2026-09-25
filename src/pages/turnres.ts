/**
 * 五行互化（turnres.jsp，L 窗）。
 *
 * ⚠ **整页是重建，不是复原。** 已知的只有三条，全在 `02 §3.10`：
 *  1. 入口在顶栏资源条右侧（`#avgres` 的 `turn_1.gif`，截图 #2 上看得见按钮，
 *     `openLWindow('','turnres.jsp')` 是整页 DOM 里的原文）；
 *  2. 要花仙石 —— 付费页那条「自由分配丹田中五种真气的比例 3 仙石」（#80）应当就是本功能；
 *  3. 玩家把它叫「平仓」。
 * **页面布局零截图零 DOM**，报告原文写的是「推测为五个输入框 + 总量守恒」。
 *
 * 这里按同系列页面的通式做成最小可用形态：墨迹条标题 + 当前丹田五行表 +
 * 「把 [源五行] 的 [数量] 化为 [目标五行]」一行表单 + 红字标价。
 * 表格骨架（`tablebg` / `titlebg` / `trbg middle`、宽 460）与列的写法照通式，
 * 是唯一有把握的部分；文案与控件排布随时可被新证据推翻。
 */

import { esc, each, num } from './html.ts'
import { RES_ICON } from './trade.ts'
import { ELEMENTS, type Element } from '../data/meridian.ts'

export type TurnresVm = {
  /** 丹田内金木水火土的当前量，顺序同 `ELEMENTS` */
  readonly current: readonly [number, number, number, number, number]
  /** 丹田容量（五行共用一个上限） */
  readonly capacity: number
  /** 每次互化的仙石开销 */
  readonly cost: number
  /** 表单里预选的源 / 目标五行 */
  readonly from: Element
  readonly to: Element
}

const select = (name: string, value: Element): string =>
  `<SELECT name=${name}>${each(ELEMENTS, (e) => `<OPTION value="${e}"${e === value ? ' selected' : ''}>${e}</OPTION>`)}</SELECT>`

/** 渲染五行互化浮窗内容（L 窗，内容表宽 460）。 */
export function renderTurnres(vm: TurnresVm): string {
  return `<TABLE class="titlebg2 bigbold" cellSpacing=0 cellPadding=0 width=460 border=0><TBODY><TR align=middle><TD>五行互化</TD></TR></TBODY></TABLE>
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>
<TD width=92>金</TD><TD width=92>木</TD><TD width=92>水</TD><TD width=92>火</TD><TD>土</TD></TR>
<TR class="trbg middle" align=middle>
${each(ELEMENTS, (e, i) => `<TD><IMG src="img/res/${RES_ICON[e]}.gif">${num(vm.current[i] ?? 0)}</TD>`)}</TR>
<TR class="trbg middle" align=middle>
<TD colSpan=5><FORM style="DISPLAY: inline" action="turnres.jsp" method=post>把 ${select('from', vm.from)} 的 <INPUT class=small name=amount size=8 value=""> 化为 ${select('to', vm.to)} <INPUT type=submit name=Submit value=确定></FORM></TD></TR>
<TR class="trbg small" align=middle>
<TD class=smallred colSpan=5>注意：每次互化需要花费${num(vm.cost)}个仙石，互化后丹田总量不变，上限仍为${esc(num(vm.capacity))}。</TD></TR>
</TBODY></TABLE>`
}
