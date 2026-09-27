/**
 * 地图页（map.jsp）。
 *
 * 几何与数据协议是【照原版】——依据是玩家粘贴的 2009-02-13 s14 服整页 DOM，
 * 里面连同 `mapData[113]` 一起留了下来（`docs/research/09-pasted-dom-templates.md` §3）：
 *
 *  - 地块图 64×120，菱形只占**底部 64×35**，上方 85px 透明区留给山/树「长高」；
 *  - 相邻行错开半格 32px，行距 17.5px（DOM 里取整交替 17/18）；
 *  - 可视区 448×245，共 15 行：偶数行 = 半块 + 6 整块 + 半块（8 个），奇数行 = 7 整块，
 *    合计 8×8 + 7×7 = 113 格，正好等于 `mapData` 的长度；
 *  - 屏幕坐标 `imgx = 192 + 32((x−cx) + (y−cy))`、`imgy = 105 + 17.5((x−cx) − (y−cy))`，
 *    也就是 +x 朝屏幕右下、+y 朝右上；人物恒在正中那一格；
 *  - z-index = 5 × 序号（画家算法，越靠下越压在上面）；
 *  - 「迷雾」不是遮罩层，而是同一地块的三套染色：green = 曼哈顿距离 ≤ playerDis（视野内）、
 *    blue = ≤ 2×playerDis（感应范围）、无后缀 = 视野外。113 格全部吻合，无例外。
 */

import { esc, each, num } from './html.ts'
import { pageHeader } from './shell.ts'

/** 一格的数据，字段照原版 `mapData` 的结构。 */
export type MapCell = {
  /** 「益州 森林」这样的州名 + 地形名 */
  readonly name: string
  readonly posx: number
  readonly posy: number
  /** 地块图基名，如 `forest02`；实际文件为 `img/map/{base}[blue|green].gif` */
  readonly terrain: string
  /** 顶部 150×150 大插画，如 `forest02` → `img/scene/forest02.gif` */
  readonly scene: string
  /** 天地元气 金木水火土 */
  readonly qi: readonly [number, number, number, number, number]
  readonly playernum: number
  readonly revealed?: boolean
}

export type MapVm = {
  /** 视野中心（通常是人物所在格） */
  readonly centerX: number
  readonly centerY: number
  /** 人物所在格（可能与中心不同，例如用坐标跳转查看别处） */
  readonly playerX: number
  readonly playerY: number
  /** 可视范围半径，新号为 2（穷千里目可提升） */
  readonly playerDis: number
  /** 113 格，行优先 */
  readonly cells: readonly MapCell[]
  /** 当前选中的格（右侧信息栏显示它） */
  readonly selected: MapCell
  /** 滚屏距离，原版默认 3 */
  readonly goByDistance: number
  /** 自己的性别：小人图 player1（男）/ player2（女，[推断]）。缺省按男 */
  readonly playerGender?: 'm' | 'f'
  readonly canFly?: boolean
}

// —— 几何常量（全部来自原版 DOM）——
export const CELL_W = 64
export const CELL_H = 35
export const TILE_IMG_H = 120 // 地块图总高，上方 85px 是透明的"长高"区
export const VIEW_W = 448
export const VIEW_H = 245
export const ROW_STEP = 17.5
const CENTER_IMGX = 192
const CENTER_IMGY = 105

/** 屏幕坐标：+x 朝右下，+y 朝右上。 */
export function cellToScreen(
  x: number,
  y: number,
  cx: number,
  cy: number,
): { left: number; top: number } {
  return {
    left: CENTER_IMGX + 32 * (x - cx + (y - cy)),
    top: CENTER_IMGY + ROW_STEP * (x - cx - (y - cy)),
  }
}

/** 曼哈顿距离（原版按它分视野三档）。 */
export const cellDistance = (a: { posx: number; posy: number }, b: { posx: number; posy: number }): number =>
  Math.abs(a.posx - b.posx) + Math.abs(a.posy - b.posy)

/** 视野档 → 地块图后缀。 */
export function visibilitySuffix(distance: number, playerDis: number): '' | 'blue' | 'green' {
  if (distance <= playerDis) return 'green'
  if (distance <= playerDis * 2) return 'blue'
  return ''
}

/** 人物覆盖图标 `people{A}{B}.gif`：A 区分视野内外，B 区分单人/多人。 */
function peopleIcon(playernum: number, distance: number, playerDis: number): string | null {
  if (playernum <= 0) return null
  const inSight = distance <= playerDis * 2 ? '1' : '2'
  const many = playernum > 1 ? '2' : '1'
  return `people${inSight}${many}.gif`
}

/**
 * 8 个滚屏箭头。goBy 参数照原版 DOM；LEFT/TOP 是 tools/assets/mapcrop.py 从 #106 实测的
 * 三角包围盒（相对 mapdiv 原点 (16,170)），这样箭头就落在原版截图里的位置上。
 */
const ARROWS: readonly { readonly key: string; readonly left: number; readonly top: number; readonly dx: number; readonly dy: number }[] = [
  { key: 'lt', left: 5, top: 159, dx: -1, dy: 0 },
  { key: 'mt', left: 234, top: 158, dx: -1, dy: 1 },
  { key: 'rt', left: 466, top: 158, dx: 0, dy: 1 },
  { key: 'lm', left: 5, top: 288, dx: -1, dy: -1 },
  { key: 'rm', left: 470, top: 286, dx: 1, dy: 1 },
  { key: 'lb', left: 6, top: 417, dx: 0, dy: -1 },
  { key: 'mb', left: 235, top: 420, dx: 1, dy: -1 },
  { key: 'rb', left: 467, top: 416, dx: 1, dy: 0 },
]

const RES_ICONS = ['gold', 'wood', 'water', 'fire', 'earth'] as const
const RES_NAMES = ['金', '木', '水', '火', '土'] as const

/** 选中格的信息栏（150 插画 + 300 信息表 = 450，与 448 的地图同宽）。 */
function sceneInfo(vm: MapVm): string {
  const s = vm.selected
  return `<IMG id=sceneimg height=150 width=150 src="img/scene/${esc(s.scene)}.gif">
<DIV id=smallinfo>
<TABLE height=120 cellSpacing=0 cellPadding=3 width=300 border=0><TBODY>
<TR class="bigbold trbg"><TD><SPAN id=sname>${esc(s.name)}</SPAN><SPAN id=spos>(${num(s.posx)},${num(s.posy)})</SPAN></TD></TR>
<TR><TD class="middle trbg">天地元气：${each(RES_ICONS, (icon, i) =>
    `<IMG title=${RES_NAMES[i]} src="img/res/${icon}.gif"><SPAN id=s${icon}>${num(s.qi[i]!)}</SPAN> `)}</TD></TR>
<TR><TD class="middle trbg">玩家数：<SPAN id=playernum>${num(s.playernum)}</SPAN></TD></TR>
<TR><TD vAlign=top align=right>
<A class=skillup href="#" onclick="spyScene()"><IMG src="img/event/mark.gif">&nbsp;对选中场景进行推算</A><BR>
<A class=skillup href="#" onclick="mapMenuMove()"><IMG src="img/event/mark.gif">&nbsp;向选中场景步行移动</A>
${vm.canFly ? '<BR><A class=skillup href="#" onclick="mapMenuFly()"><IMG src="img/event/mark.gif">&nbsp;向选中场景御剑飞行</A>' : ''}
</TD></TR>
</TBODY></TABLE></DIV>`
}

/**
 * 地块层。被边缘裁切的格子不用 `<IMG src>`，而是照原版的做法：
 * 1×1 透明垫图 + background-image + background-position 来「裁」图。
 */
function tiles(vm: MapVm): string {
  const out: string[] = []

  vm.cells.forEach((cell, i) => {
    const { left, top } = cellToScreen(cell.posx, cell.posy, vm.centerX, vm.centerY)
    const z = 5 * (i + 1)
    const dist = cell.revealed ? 0 : cellDistance(cell, { posx: vm.playerX, posy: vm.playerY })
    const suffix = visibilitySuffix(dist, vm.playerDis)
    const url = `img/map/${cell.terrain}${suffix}.gif`

    // 地块图高 120，菱形在底部；所以图的绘制原点要上移 (120-35)
    const imgTop = top - (TILE_IMG_H - CELL_H)

    // 可视区外的部分靠 .mapdiv 的 overflow:hidden 裁掉，这与原版用 background-position
    // 手工裁图等效，但少了几十种特例。
    out.push(
      `<IMG class=tile src="${esc(url)}" style="left:${left}px;top:${imgTop}px;z-index:${z}">` +
        `<A class=mapcell href="#" style="left:${left}px;top:${top}px;z-index:${z + 1}" ` +
        `title="${esc(cell.name)} (${cell.posx},${cell.posy})" ` +
        `aria-label="${esc(cell.name)} (${cell.posx},${cell.posy})" ` +
        `onclick="onMapCellClick(${cell.posx},${cell.posy});return false"></A>`,
    )

    // 头像与小人和地块一样是 64×120、贴底的画布（原版 DOM：people/player 都是 64×120），同一套上移
    const people = peopleIcon(cell.playernum, dist, vm.playerDis)
    if (people) {
      out.push(
        `<IMG class=tilemark src="img/${people}" style="left:${left}px;top:${imgTop}px;z-index:${z + 2}">`,
      )
    }
    if (cell.posx === vm.playerX && cell.posy === vm.playerY) {
      const player = vm.playerGender === 'f' ? 'player2' : 'player1'
      out.push(
        `<IMG class=tilemark id=playermark src="img/${player}.gif" style="left:${left}px;top:${imgTop}px;z-index:${z + 4}">`,
      )
    }
  })

  return out.join('\n')
}

export function renderMap(vm: MapVm): string {
  return `${pageHeader('titlemap.gif')}
${sceneInfo(vm)}
<DIV id=mapbg>
<IMG class=mapframe src="img/map/mapbg.gif" alt="">
${each(ARROWS, (a) =>
    `<A href="#" onclick="goBy(${a.dx},${a.dy})"><IMG class=maparrow src="img/pos/${a.key}.gif" ` +
    `onmouseover="this.src='img/pos/${a.key}o.gif'" onmouseout="this.src='img/pos/${a.key}.gif'" ` +
    `style="left:${a.left}px;top:${a.top}px"></A>`)}
<DIV class=mapdiv id=mapdiv>
${tiles(vm)}
<IMG id=selmapcover src="img/maptarget2.gif" style="display:none">
<IMG id=overmapcover src="img/maptarget.gif" style="display:none">
</DIV>
</DIV>
<DIV id=mapmenu style="display:none"><SPAN id=mapmenumove><A href="#" onclick="mapMenuMove();closeMapMenu();"><IMG title="点击之后向此地移动" src="img/btn/mover1.gif"></A></SPAN></DIV>
<DIV id=mapbar>
<TABLE cellSpacing=0 cellPadding=3 width=460 border=0><TBODY><TR class=middle>
<TD>x <INPUT class=small id=viewposx size=4 value="${num(vm.centerX)}"> y <INPUT class=small id=viewposy size=4 value="${num(vm.centerY)}"> <A href="#" onclick="goToPos()"><SPAN class=skillup>查看</SPAN></A></TD>
<TD>滚屏距离: <INPUT class=small id=gobydis size=4 value="${num(vm.goByDistance)}"></TD>
<TD align=right><A class=skillup href="map.jsp"><IMG src="img/event/mark.gif">&nbsp;返回人物所在</A></TD>
</TR></TBODY></TABLE></DIV>`
}

/**
 * 生成一屏 113 格的坐标（行优先）。
 * 偶数行 = 半块 + 6 整块 + 半块（8 个），奇数行 = 7 整块，合计 8×8 + 7×7 = 113。
 */
export function screenCells(cx: number, cy: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let row = 0; row < 15; row++) {
    const count = row % 2 === 0 ? 8 : 7
    for (let col = 0; col < count; col++) {
      // 屏幕行列 → 世界坐标：同一屏幕行向右一格 = (x+1, y+1)
      const r = row - 7 // 相对中心行
      const c = col - (row % 2 === 0 ? 4 : 3)
      out.push({ x: cx + c + Math.ceil(r / 2), y: cy + c - Math.floor(r / 2) })
    }
  }
  return out
}
