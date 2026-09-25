/**
 * 付费功能 / VIP（payment.jsp，L 窗）。
 *
 * 套餐清单与价格是【1:1 截图照抄】：
 *  - #9 `17173-live/20090205145529452/xz50001.jpg` 464×402（**2009-02，基准期内**）：
 *    五行吸收 5 行 + 法宝三项，表头「描述｜时间｜价格｜操作」，列宽 218/67/87/87；
 *    每项占两行 —— 第一行描述（左对齐），第二行剩余时间（**右对齐**，放大到 3× 复核过）。
 *  - #79 `…20100518115250381/zzxq2.jpg`：通栏标题「VIP功能」的套餐。
 *  - #80 同目录 `zzxq3.jpg`：通栏标题「高级VIP功能」+ 三个「立即生效」项。
 *
 * 行结构是【照原版 DOM】—— `all-fragments.html` ←
 * `raw/forum162/article-106408-p10.html@35017`：
 *   `功能说明(colSpan=2) | 7天(rowSpan=3) | 10仙石(rowSpan=3) | 购买(rowSpan=4)`，
 * 即多条说明用 rowSpan 合并右侧三列，最后再多一行放剩余时间；
 * 套餐最后一条说明**不**带 colSpan（右边空出一格，#79 上能看见那道竖线）。
 * 购买动作 `ajaxPost('paycoin', 'pay=N', openPayment);` 也是原文。
 *
 * `pay` 编号只有 5 个有实证（`09 §1.14`）：8=移动减半、9=移动完成、10=修炼减半、
 * 11=修炼完成、18=VIP 7 天套餐。其余编号是【重建】，刻意避开这 5 个已占号。
 */

import { esc, each, num, when } from './html.ts'
import { RES_ICON } from './trade.ts'
import type { Element } from '../data/meridian.ts'

export type PayItem = {
  /** `ajaxPost('paycoin','pay=N')` 的编号 */
  readonly pay: number
  /** 功能说明，一条或多条（多条 = 一个套餐，右侧三列 rowSpan 合并） */
  readonly lines: readonly string[]
  /** 说明行开头的五行图标，只有「+25% X 真气吸收速度」那五行有 */
  readonly element?: Element
  /** 时间列：`7天` 或 `立即生效` */
  readonly duration: string
  /** 价格列：`5仙石` / `20普通仙石`（高级 VIP 特地写明「普通」） */
  readonly price: string
  /** 操作列链接文字：`购买`，只有自由分配丹田比例那项写`开始分配` */
  readonly action: string
  /** 立即生效的项没有「剩余时间」行 */
  readonly instant?: boolean
  /** 有确认框的项（只有修炼减半/完成两条有原文） */
  readonly confirm?: string
  /** 操作列不是 paycoin 而是打开别的浮窗时用 */
  readonly openWindow?: string
}

export type PaySection = {
  /** 通栏的分节标题，如「VIP功能」；不写则不出这一行 */
  readonly title?: string
  readonly items: readonly PayItem[]
}

/** 五行吸收提速：各 7 天 5 仙石（#9 五行齐全，该角色缺火所以火那行没买）。 */
const absorbItems: readonly PayItem[] = (['金', '木', '水', '火', '土'] as const).map(
  (e, i) => ({
    pay: i + 1,
    lines: [`+25%${e}真气吸收速度`],
    element: e,
    duration: '7天',
    price: '5仙石',
    action: '购买',
  }),
)

/**
 * 整页套餐表。分节顺序按截图先后（#9 在前，是基准期内唯一一张）。
 * 缺口：原版整页到底有几节、节与节之间有没有别的行，没有任何证据（`05 §9` 缺口）。
 */
export const PAY_SECTIONS: readonly PaySection[] = [
  { items: absorbItems },
  {
    items: [
      { pay: 13, lines: ['+10%法宝攻击'], duration: '7天', price: '2仙石', action: '购买' },
      { pay: 14, lines: ['+10%法宝耐久'], duration: '7天', price: '2仙石', action: '购买' },
      { pay: 15, lines: ['+50%法宝击退'], duration: '7天', price: '2仙石', action: '购买' },
    ],
  },
  {
    title: 'VIP功能',
    items: [
      {
        pay: 18,
        lines: ['增加1个修炼事件队列', '拥有法宝数量上限增加5个', '自动淬炼'],
        duration: '7天',
        price: '10仙石',
        action: '购买',
      },
    ],
  },
  {
    title: '高级VIP功能',
    items: [
      {
        pay: 19,
        lines: ['移动范围外自动寻路', '拥有法宝数量上限增加15个', '自动炼制'],
        duration: '7天',
        // #80 原文写的是「20普通仙石」——特地区分普通仙石与附加仙石
        price: '20普通仙石',
        action: '购买',
      },
      {
        pay: 10,
        lines: ['减半所有修炼事件剩余时间'],
        duration: '立即生效',
        price: '2仙石',
        action: '购买',
        instant: true,
        confirm: '减半所有修炼事件剩余时间，需要花费2个仙石',
      },
      {
        pay: 11,
        lines: ['直接完成所有修炼事件'],
        duration: '立即生效',
        price: '10仙石',
        action: '购买',
        instant: true,
        confirm: '直接完成所有修炼事件，需要花费10个仙石',
      },
      {
        pay: 20,
        lines: ['自由分配丹田中五种真气的比例'],
        duration: '立即生效',
        price: '3仙石',
        // 链接文字是「开始分配」而不是「购买」（#80 实测，02 §13c 记错了）
        action: '开始分配',
        instant: true,
        // 这一项就是顶栏「五行互化」入口的付费版（02 §3.10），所以直接开那个浮窗
        openWindow: 'turnres.jsp',
      },
    ],
  },
]

export type PaymentVm = {
  /**
   * 已购项的剩余时间文案，key 是 `pay` 编号。
   * 原版写法：`还有11.82天，到14:10结束` —— 天数两位小数，结束时间只到分。
   * 11.82 天 > 7 天，说明**可以叠加续费**。
   */
  readonly remaining: Readonly<Record<number, string>>
}

/** 操作列的链接。默认走 paycoin；有 confirm 的先弹 M2 窗；openWindow 的改开浮窗。 */
function actionLink(it: PayItem): string {
  if (!it.instant) return '<SPAN class=smallgray title="历史套餐尚未实现；VIP可在怀旧版设置中切换">暂未开放</SPAN>'
  const call = `ajaxPost('paycoin', 'pay=${num(it.pay)}');`
  const onclick = it.openWindow
    ? `openLWindow('', '${it.openWindow}')`
    : it.confirm
      ? `MDialogOkCancel('', ${JSON.stringify(it.confirm)}, function(){${call}})`
      : call
  return `<A class=smallbold onclick="${esc(onclick)}" href="#">${esc(it.action)}</A>`
}

function itemRows(it: PayItem, vm: PaymentVm): string {
  const n = it.lines.length
  const icon = it.element ? `<IMG src="img/res/${RES_ICON[it.element]}.gif">` : ''
  const text = vm.remaining[it.pay]
  // 剩余时间右对齐；未购买时留一个空行占位（#9 的火那一项就是空的，但行高照样 24+24）
  const rest = `<DIV align=right>${text ? esc(text) : '&nbsp;'}</DIV>`

  // 单条说明的项：描述与剩余时间在**同一格**里分两行。
  // 判据是逐像素复核 #9：一个项从 y=25 到 y=73 只有首尾两条网格线（206,206,206），
  // 格内 y=26–72 在描述列、时间列、价格列上都没有横线 —— 所以不是两个 TR。
  if (n === 1) {
    const line = esc(it.lines[0] ?? '')
    return `<TR class="trbg middle" align=middle>
<TD align=left colSpan=2>${icon}${line}${it.instant ? '' : rest}</TD>
<TD>${esc(it.duration)}</TD><TD>${esc(it.price)}</TD><TD>${actionLink(it)}</TD></TR>`
  }

  // 多条说明的套餐：每条一行，右侧三列用 rowSpan 合并 —— 照原版 DOM（pay=18）：
  // 时间/价格 rowSpan=n、操作 rowSpan=n+1。#79 上「购买」确实比「7天」压得更低，
  // 且「7天」下方能看到一条横线（剩余时间那一空行），与这组 rowSpan 完全吻合。
  const rows = it.lines.map((line, i) => {
    const desc =
      i === n - 1
        ? // 套餐最后一条说明不带 colSpan，右边空一格（#79 上那道竖线，DOM 亦如此）
          `<TD align=left>${esc(line)}</TD><TD>&nbsp;</TD>`
        : // 第一条说明末尾那个 <BR> 是 DOM 原文，照抄
          `<TD align=left colSpan=2>${esc(line)}${i === 0 ? '<BR>' : ''}</TD>`
    const merged =
      i === 0
        ? `<TD rowSpan=${n}>${esc(it.duration)}</TD><TD rowSpan=${n}>${esc(it.price)}</TD>` +
          `<TD rowSpan=${n + 1}>${actionLink(it)}</TD>`
        : ''
    return `<TR class="trbg middle" align=middle>${desc}${merged}</TR>`
  })
  rows.push(`<TR class="trbg middle" align=middle><TD align=right colSpan=2>${text ? esc(text) : '&nbsp;'}</TD></TR>`)
  return rows.join('\n')
}

/** 渲染付费功能浮窗内容（L 窗，内容表宽 460；本页没有页标题横幅的任何证据）。 */
export function renderPayment(vm: PaymentVm): string {
  return `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle>
<TD colSpan=2 width=218>描述</TD>
<TD width=67>时间</TD>
<TD width=87>价格</TD>
<TD width=87>操作</TD></TR>
${each(PAY_SECTIONS, (sec, i) =>
    // 节与节之间空 6px（#9 实测）
    `${when(i > 0, () => '<TR class=paygap><TD colSpan=5></TD></TR>\n')}` +
    `${when(sec.title, () => `<TR class="titlebg middlebold" align=middle><TD colSpan=5>${esc(sec.title!)}</TD></TR>\n`)}` +
    `${each(sec.items, (it) => `${itemRows(it, vm)}\n`)}`,
  )}</TBODY></TABLE>`
}
