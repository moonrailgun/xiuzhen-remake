/**
 * 人物页（player.jsp）左栏：经脉 / 本体 / 金丹 三视图。
 *
 * 人物信息表是【照原版 DOM】——出处 `all-fragments.html` ←
 * `raw/forum162/article-104797-p1.html@10385`。
 * 12 个经脉节点的坐标是【截图实测】——04 报告自动检测白色圆盘中心，误差 ±1px，
 * 且男女两套人体图的节点坐标完全相同（≤2px），说明节点是固定坐标的绝对定位元素、
 * 人体剪影只是底图。
 */

import { esc, each, js, when } from './html.ts'
import { pageHeader } from './shell.ts'
import {
  MERIDIANS,
  groupElement,
  multiplier,
  type Element,
  type MeridianGroup,
} from '../data/meridian.ts'

export type PlayerView = 'meridian' | 'body' | 'core'

export type PlayerVm = {
  readonly view: PlayerView
  readonly name: string
  readonly element: Element
  readonly gender: 'm' | 'f'
  readonly school: '蜀山' | '昆仑' | '通天'
  readonly realm: string
  /** 有境界突破任务时，境界是绿色链接 */
  readonly realmQuestId?: string
  /** 阅历 当前/目标 */
  readonly experience: readonly [number, number]
  readonly silver: number
  /** 12 条经脉的等级，顺序同 `MERIDIANS` */
  readonly meridianLevels: readonly number[]
  /** 8 项本体的等级 */
  readonly bodyLevels: readonly number[]
  /** 金木水火土 每小时增量 */
  readonly qiPerHour: readonly [number, number, number, number, number]
}

/** 经脉节点的发光色（04 报告在环上取 3/4 分位像素）。土是很深的橄榄褐，不是土黄。 */
export const ELEMENT_GLOW: Record<Element, string> = {
  金: '#fff200',
  木: '#9fd64f',
  水: '#1273b8',
  火: '#f01010',
  土: '#5a5238',
}

/**
 * 12 个节点相对「头顶节点」的偏移。头节点在 #gleft 内容区的位置是 (125, 78)。
 * 每组 3 个节点用 1px 同色细线串成折线 1→2→3。
 */
const NODE_OFFSETS: Record<MeridianGroup, readonly (readonly [number, number])[]> = {
  // A 组：头 → 左肩 → 左手
  手三阳: [[0, 0], [-54, 81], [-64, 175]],
  // B 组：颈下 → 右上臂 → 右前臂
  手三阴: [[16, 50], [59, 91], [57, 153]],
  // C 组：胸腹正中 → 左大腿 → 左脚
  足三阳: [[3, 110], [-23, 222], [-25, 311]],
  // D 组：下腹 → 右大腿 → 右脚
  足三阴: [[4, 165], [33, 246], [32, 337]],
}

const HEAD_ORIGIN = { x: 125, y: 78 } as const
const NODE_D = 19 // 白色圆盘直径
const GLOW_D = 44 // 外圈径向发光直径

const GROUP_ORDER: readonly MeridianGroup[] = ['手三阳', '手三阴', '足三阳', '足三阴']

/** 经脉视图：人体剪影 + 12 节点 + 连线。 */
function meridianFigure(vm: PlayerVm): string {
  const parts: string[] = []

  for (const group of GROUP_ORDER) {
    const el = groupElement(vm.element, group)
    const color = ELEMENT_GLOW[el]
    const offsets = NODE_OFFSETS[group]

    // 连线：折线 1→2→3，压在人体图之上、节点之下
    for (let i = 0; i < offsets.length - 1; i++) {
      const [x1, y1] = offsets[i]!
      const [x2, y2] = offsets[i + 1]!
      const ax = HEAD_ORIGIN.x + x1
      const ay = HEAD_ORIGIN.y + y1
      const bx = HEAD_ORIGIN.x + x2
      const by = HEAD_ORIGIN.y + y2
      const len = Math.hypot(bx - ax, by - ay)
      const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
      parts.push(
        `<DIV class=mline style="left:${ax}px;top:${ay}px;width:${len.toFixed(1)}px;` +
          `transform:rotate(${angle.toFixed(2)}deg);background:${color}"></DIV>`,
      )
    }

    // 节点：白色圆盘 + 径向发光；数字是手写斜体
    offsets.forEach((off, i) => {
      const idx = MERIDIANS.findIndex((m) => m.group === group) + i
      const level = vm.meridianLevels[idx] ?? 0
      const name = MERIDIANS[idx]?.name ?? ''
      const cx = HEAD_ORIGIN.x + off[0]
      const cy = HEAD_ORIGIN.y + off[1]
      parts.push(
        `<DIV class=mglow style="left:${cx - GLOW_D / 2}px;top:${cy - GLOW_D / 2}px;` +
          `width:${GLOW_D}px;height:${GLOW_D}px;` +
          `background:radial-gradient(circle,${color} 0%,${color}00 70%)"></DIV>`,
        `<A class=mnode href="#" title="${esc(name)}" ` +
          `onclick="openRWindow('','skillmid.jsp?type=meridian&idx=${idx}')" ` +
          `style="left:${cx - NODE_D / 2}px;top:${cy - NODE_D / 2}px;border-color:${color}">${level}</A>`,
      )
    })
  }

  return `<DIV class=figure>
<IMG class=body src="img/pipe/body${vm.gender}${elementKey(vm.element)}.gif" alt="">
${parts.join('\n')}
<IMG class=schoolmark src="img/pipe/chrbg${schoolKey(vm.school)}.gif" alt="">
</DIV>`
}

const elementKey = (e: Element): string =>
  ({ 金: 'gold', 木: 'wood', 水: 'water', 火: 'fire', 土: 'earth' })[e]
// 门派水印的文件名：蜀山=s(竹) 通天=t(梅) 昆仑=k(荷)
const schoolKey = (s: PlayerVm['school']): string =>
  ({ 蜀山: 's', 昆仑: 'k', 通天: 't' })[s]

/** 8 项本体。位置见 04 §5；名称用篆书图，等级是同款白色圆盘。 */
const BODY_PARTS: readonly { readonly key: string; readonly name: string; readonly at: readonly [number, number] }[] = [
  { key: 'eye', name: '穷千里目', at: [125, 78] },
  { key: 'steel', name: '炼体成钢', at: [63, 128] },
  { key: 'calm', name: '心静通灵', at: [163, 128] },
  { key: 'sleeve', name: '袖里乾坤', at: [55, 205] },
  { key: 'root', name: '固本培元', at: [128, 200] },
  { key: 'dantian', name: '丹田气海', at: [96, 262] },
  { key: 'hand', name: '手熟无他', at: [160, 262] },
  { key: 'walk', name: '行万里路', at: [128, 360] },
]

function bodyFigure(vm: PlayerVm): string {
  return `<DIV class=figure>
<IMG class=body src="img/pipe/body${vm.gender}.gif" width=250 height=430 alt="">
<IMG class=bodylabel src="img/pipe/bodylabel.gif" alt="">
${each(BODY_PARTS, (p, i) => {
    const lv = vm.bodyLevels[i] ?? 0
    return `<A class="mnode bodynode" href="#" title="${esc(p.name)}" ` +
      `onclick="openRWindow('','skillmid.jsp?type=body&idx=${i}')" ` +
      `style="left:${p.at[0] - 10}px;top:${p.at[1] - 10}px">${lv}</A>`
  })}
</DIV>`
}

/** 人物信息表 —— 结构与 class 照原版 DOM。 */
function infoTable(vm: PlayerVm): string {
  const realmCell = vm.realmQuestId
    ? `<A class=skillup href="#" onclick="openLWindow('', 'quest.jsp?questid=${js(vm.realmQuestId)}')">${esc(vm.realm)}</A>`
    : esc(vm.realm)
  const row = (label: string, value: string) =>
    `<TR class="trbg middle" align=middle><TD class=middlebold width=60><A class=help href="#" onclick="hlp('${esc(label)}')">${esc(label)}</A></TD><TD>${value}</TD></TR>`

  return `<TABLE class=tablebg cellSpacing=1 cellPadding=3 width="100%" border=0><TBODY>
<TR><TD class="bigbold titlebg" align=middle colSpan=2>${esc(vm.name)}</TD></TR>
${row('属性', esc(vm.element))}
${row('境界', realmCell)}
${row('阅历', `${vm.experience[0]}/${vm.experience[1]}`)}
${row('银两', `${vm.silver} 两 `)}
<TR class="trbg middlebold" align=middle><TD><A class=help href="#" onclick="hlp('产业')">产业</A></TD><TD><A class=skillup href="#" onclick="openLWindow( '', 'estate.jsp')">点击查看</A></TD></TR>
</TBODY></TABLE>`
}

const RES = ['gold', 'wood', 'water', 'fire', 'earth'] as const
const RES_NAME = ['金', '木', '水', '火', '土'] as const

function qiGrowth(vm: PlayerVm): string {
  return `<TABLE cellSpacing=0 cellPadding=3 width="100%" border=0><TBODY>
<TR><TD class=bigbold colSpan=3><A class=help href="#" onclick="hlp('真气增长')">真气增长</A>：</TD></TR>
${each(RES, (icon, i) => {
    const v = vm.qiPerHour[i]!
    return `<TR class=middle><TD width=20><IMG src="img/res/${icon}.gif"></TD>` +
      `<TD width=40 noWrap>${RES_NAME[i]}: <B>${v}</B></TD><TD noWrap>每小时</TD></TR>`
  })}
</TBODY></TABLE>`
}

/** 渲染人物页左栏。 */
export function renderPlayer(vm: PlayerVm): string {
  const tabs = [
    { label: '经脉', href: 'player.jsp' },
    { label: '本体', href: 'player.jsp?tab=2' },
    // 金丹页要到金丹期才出现（2009-01-13 开放）
    ...(vm.view === 'core' ? [{ label: '金丹', href: 'player.jsp?tab=3' }] : []),
  ]

  const figure =
    vm.view === 'body' ? bodyFigure(vm) : vm.view === 'core' ? coreFigure(vm) : meridianFigure(vm)

  return `${pageHeader('titleplayer.gif', tabs)}
<DIV class=playerbody>
${figure}
<DIV class=playerinfo>
${infoTable(vm)}
${qiGrowth(vm)}
</DIV>
</DIV>`
}

/** 金丹视图：黑色人体剪影 + 丹田处发光金丹。基准版没有，2009-01-13 起才有。 */
function coreFigure(vm: PlayerVm): string {
  return `<DIV class=figure>
<IMG class=body src="img/pipe/body${vm.gender}jindan.gif" width=250 height=430 alt="">
<DIV class=goldencore></DIV>
</DIV>`
}

export { when }
