/**
 * 任务详情（quest.jsp?questid=N，L 窗，内容表宽 460）。
 *
 * 结构【照原版 DOM】`09 §1.6`（SRC=`forum162/article-95756-p1.html@4174`）：
 * `TABLE.tablebg cellSpacing=1 cellPadding=3 width=460`，**固定 5 列**（为了奖励行五等分），
 * 其余行一律 `colSpan=5`；四段固定为 **任务概要 / 完成情况 / 完成奖励 / 任务描述**，
 * 每段 = `TR.titlebg.middlebold align=middle` 标题行 + `TR.trbg.middle` 内容行；
 * 数值/怪名高亮用 `SPAN.middlestriking`（深蓝粗体，裁决见 `DECISIONS-ui` §5）。
 *
 * 版面与配色【照截图 #83】（`17173-live/20100521102508352/ccvvve3.jpg`，原生 1:1，2010-05，
 * `docs/research/05` §11.1 逐字转录）：墨迹标题条 `《百妖记》第八回(8/100)`；
 * 完成情况整句是「击败 (161,7) 处的 白骷髅 (已完成)」，其中坐标是绿粗体链接、
 * 怪名是深蓝粗体；完成奖励是 5 个等分单元格「[金]800 …[土]800」；
 * 底部两个图片按钮（米灰底、四角回纹）。行高：段标题 22px、内容 22px、奖励 27px、列宽 92px。
 *
 * 底部按钮：DOM 留下的是 `giveupquest.gif` + `closewindows.gif`（含 `MDialogOkCancel` 全文）；
 * 截图 #83 上是「领取奖励」+「关闭窗口」。→ 可领奖时出「领取奖励」，否则出「放弃」。
 * 「领取奖励」的按钮图名与动作名原版没留下，取 `getreward.gif` / `finishquest`，是【重建】。
 */

import { esc, escJs, each, num, js } from './html.ts'
import { ELEMENTS, type Element } from '../data/meridian.ts'

/** 五行图标，界面顺序「金木水火土」。 */
const RES = ['gold', 'wood', 'water', 'fire', 'earth'] as const

export type QuestProgress =
  /** 斩妖类（《百妖记》）：击败 (x,y) 处的 {怪名} */
  | {
      readonly kind: 'slay'
      readonly monster: string
      readonly at: readonly [number, number]
      readonly done: boolean
    }
  /** 其余任务的完成情况是整句文本（境界任务、运镖、文曲星君…） */
  | { readonly kind: 'text'; readonly text: string; readonly done: boolean }

export type QuestReward =
  /** 真气奖励：五行各多少，占满 5 个等分格 */
  | { readonly kind: 'qi'; readonly qi: readonly [number, number, number, number, number] }
  /** 文字奖励，如「境界提升为 金丹期」「0 两白银」 */
  | { readonly kind: 'text'; readonly text: string; readonly striking?: string }

export type QuestVm = {
  readonly id: string
  /** 墨迹标题条整串，如「《百妖记》第八回 (8/100)」 */
  readonly title: string
  /** 任务概要整句，如「白骷髅 攻击:45 敏捷:10 生命:45 属性:无」 */
  readonly summary: string
  readonly progress: QuestProgress
  readonly reward: QuestReward
  /** 任务描述，每段一行（原版段间空一行） */
  readonly description: readonly string[]
  /** 已完成且奖励未领 → 底部出「领取奖励」，否则出「放弃」 */
  readonly claimable: boolean
  /** 放弃要花的仙石数，决定确认框文案；0 或不给则用「确定要放弃此任务吗?」 */
  readonly giveupCoin?: number
  readonly interaction?:
    | { readonly kind: 'quiz' }
    | { readonly kind: 'choice' }
    | { readonly kind: 'goldenCore'; readonly gathered: number; readonly cores: number; readonly compressing: boolean; readonly element?: Element; readonly qiByElement?: readonly number[]; readonly coreElements?: readonly Element[]; readonly purity?: number }
}

/** 《百妖记》任务概要的写法 [原文]（`03 §1.10` 逐回游戏内粘贴格式）。 */
export const monsterSummary = (m: {
  readonly name: string
  readonly attack: number
  readonly agility: number
  readonly life: number
  readonly element: string
}): string => `${m.name} 攻击:${m.attack} 敏捷:${m.agility} 生命:${m.life} 属性:${m.element}`

/** 段：标题行 + 内容行。 */
const section = (title: string, content: string): string =>
  `<TR class="titlebg middlebold" align=middle><TD colSpan=5>${esc(title)}</TD></TR>
<TR class="trbg middle"><TD colSpan=5>${content}</TD></TR>`

function progressHtml(p: QuestProgress): string {
  const suffix = p.done ? '(已完成)' : '(未完成)'
  if (p.kind === 'text') return `${esc(p.text)}${suffix}`
  // 坐标是绿粗体链接（点了跳地图），怪名是 middlestriking 深蓝粗体
  return (
    `击败<A class=middlebold href="map.jsp?x=${p.at[0]}&y=${p.at[1]}">(${p.at[0]},${p.at[1]})</A>处的` +
    `<SPAN class=middlestriking>${esc(p.monster)}</SPAN>${suffix}` +
    (p.done ? '' : `　<A href="#" onclick="openLWindow('', 'fight.jsp?target=${js(encodeURIComponent(p.monster))}')">出击</A>`)
  )
}

/** 完成奖励行。真气奖励占满 5 个等分格，所以这一行不走 `section()` 的 colSpan=5。 */
function rewardRows(r: QuestReward): string {
  const head = '<TR class="titlebg middlebold" align=middle><TD colSpan=5>完成奖励</TD></TR>'
  if (r.kind === 'text') {
    const body = r.striking
      ? `${esc(r.text)}<SPAN class=middlestriking>${esc(r.striking)}</SPAN>`
      : esc(r.text)
    return `${head}\n<TR class="trbg middle"><TD colSpan=5>${body}</TD></TR>`
  }
  return `${head}\n<TR class="trbg middle">${each(RES, (icon, i) =>
    `<TD width="20%"><IMG src="img/res/${icon}.gif">${num(r.qi[i] ?? 0)}</TD>`)}</TR>`
}

/** 底部按钮行。`MDialogOkCancel` 的三参数写法与 alt 文案都是原版原文。 */
function buttons(vm: QuestVm): string {
  const giveupText =
    vm.giveupCoin && vm.giveupCoin > 0
      ? `放弃此任务，需要花费${vm.giveupCoin}个仙石`
      : '确定要放弃此任务吗?'
  const left = vm.claimable
    ? `<A onclick="ajaxPost('finishquest','questid=${js(vm.id)}',refleshRight);closeLWindow();closeRWindow();" href="#"><IMG alt=点击领取任务奖励 src="img/getreward.gif"></A>`
    : `<A onclick="MDialogOkCancel('', '${js(giveupText)}', function(){ajaxPost('cancelquest','questid=${js(vm.id)}',refleshRight);closeLWindow();closeRWindow();})" href="#"><IMG alt=点击放弃任务，慎重考虑哦~ src="img/giveupquest.gif"></A>`
  return `<TR class="trbg middle" align=middle><TD colSpan=5>${left}　<A onclick=closeLWindow() href="#"><IMG alt=点击关闭任务窗口 src="img/closewindows.gif"></A></TD></TR>`
}

function interactionRows(vm: QuestVm): string {
  const action = vm.interaction
  if (!action || vm.claimable) return ''
  const button = (label: string, handler: string): string => `<BUTTON type=button onclick="${esc(handler)}">${esc(label)}</BUTTON>`
  const id = escJs(vm.id)
  if (action.kind === 'quiz') return section('请作答', '你的本命属性是什么？（可在人物页面查看）<BR>' + each(ELEMENTS, e => button(e, `questAnswer('${id}','${e}')`)))
  if (action.kind === 'choice') return section('选择修炼路线', button('先炼气', `questChooseLine('${id}','qi')`) + '　' + button('先炼剑', `questChooseLine('${id}','sword')`))
  const select = (id: string) => `<SELECT id=${id} aria-label="${id === 'core-qi-element' ? '汇聚属性' : '压缩属性'}">${each(ELEMENTS, e => `<OPTION value="${e}"${e === action.element ? ' selected' : ''}>${e}</OPTION>`)}</SELECT>`
  return section('汇聚真气与压缩真元', `已得真元：${num(action.cores)}/10（${esc(action.coreElements?.join('、') ?? '')}）；已汇聚：${num(action.gathered)}/286000<BR>` +
    `金木水火土：${action.qiByElement?.map(num).join(' / ') ?? '0 / 0 / 0 / 0 / 0'}<BR>` +
    `同属性压缩12小时；混气会增加耗时。十份真元的本命纯度影响结丹成功率，汇聚后不能退回丹田。<BR>` +
    `${select('core-qi-element')} <INPUT id=core-qi-amount aria-label="汇聚数量" type=number min=1 step=1 value="${Math.max(1, 286000 - action.gathered)}"> ${button('汇聚真气', `questGatherCore('${id}')`)}<BR>` +
    `${select('core-output-element')} ${action.compressing ? '正在压缩真元' : button('压缩真元', `questCompressCore('${id}')`)}`)

}

/** 渲染任务详情。 */
export function renderQuest(vm: QuestVm): string {
  return `<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width=460 border=0><TBODY>
<TR class=bigbold align=middle><TD>${esc(vm.title)}</TD></TR></TBODY></TABLE>
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
${section('任务概要', esc(vm.summary))}
${section('完成情况', progressHtml(vm.progress))}
${interactionRows(vm)}
${rewardRows(vm.reward)}
${section('任务描述', each(vm.description, (p, i) => `${i > 0 ? '<BR><BR>' : ''}${esc(p)}`))}
${buttons(vm)}
</TBODY></TABLE>`
}
