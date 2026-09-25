import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  renderMap,
  cellToScreen,
  cellDistance,
  visibilitySuffix,
  screenCells,
  CELL_W,
  CELL_H,
  VIEW_W,
  VIEW_H,
  ROW_STEP,
  type MapVm,
  type MapCell,
} from './map.ts'

const cell = (o: Partial<MapCell> & { posx: number; posy: number }): MapCell => ({
  name: '益州 森林',
  terrain: 'forest02',
  scene: 'forest02',
  qi: [4, 5, 4, 4, 3],
  playernum: 0,
  ...o,
})

const vm = (over: Partial<MapVm> = {}): MapVm => {
  const cx = 77
  const cy = 57
  return {
    centerX: cx,
    centerY: cy,
    playerX: cx,
    playerY: cy,
    playerDis: 2,
    cells: screenCells(cx, cy).map((p) => cell({ posx: p.x, posy: p.y })),
    selected: cell({ posx: cx, posy: cy }),
    goByDistance: 3,
    ...over,
  }
}

// —— 几何：这些数字全部来自原版 mapData ——

test('菱形格尺寸与可视区（原版 DOM 实数）', () => {
  assert.equal(CELL_W, 64)
  assert.equal(CELL_H, 35)
  assert.equal(VIEW_W, 448, '7 列 × 64')
  assert.equal(VIEW_H, 245, '7 行 × 35')
  assert.equal(ROW_STEP, 17.5, '相邻行错半格')
})

test('一屏正好 113 格（= 原版 mapData 的长度）', () => {
  const cells = screenCells(77, 57)
  assert.equal(cells.length, 113)
  // 偶数行 8 个、奇数行 7 个 → 8×8 + 7×7
  assert.equal(8 * 8 + 7 * 7, 113)
})

test('人物恒在正中：中心格算出的屏幕坐标是 (192,105)', () => {
  assert.deepEqual(cellToScreen(77, 57, 77, 57), { left: 192, top: 105 })
})

test('坐标系方向：+x 朝右下、+y 朝右上', () => {
  const base = cellToScreen(0, 0, 0, 0)
  const px = cellToScreen(1, 0, 0, 0)
  const py = cellToScreen(0, 1, 0, 0)
  assert.deepEqual([px.left - base.left, px.top - base.top], [32, 17.5], 'x+1 → (+32,+17.5)')
  assert.deepEqual([py.left - base.left, py.top - base.top], [32, -17.5], 'y+1 → (+32,−17.5)')
})

test('同一屏幕行上向右一格 = (x+1, y+1)', () => {
  const a = cellToScreen(10, 10, 10, 10)
  const b = cellToScreen(11, 11, 10, 10)
  assert.equal(b.top, a.top, '同一行')
  assert.equal(b.left - a.left, 64, '正好一格宽')
})

test('视野三档按曼哈顿距离分（113 格在原版里零例外）', () => {
  assert.equal(visibilitySuffix(0, 2), 'green')
  assert.equal(visibilitySuffix(2, 2), 'green', '距离 ≤ playerDis 是视野内')
  assert.equal(visibilitySuffix(3, 2), 'blue')
  assert.equal(visibilitySuffix(4, 2), 'blue', '距离 ≤ 2×playerDis 是感应范围')
  assert.equal(visibilitySuffix(5, 2), '', '再远就是视野外')
})

test('视野格数：playerDis=2 时 green 13 格、blue 28 格', () => {
  // 曼哈顿距离 ≤2 的格子共 13 个（1+4+8），≤4 的共 41 个 → blue = 41−13 = 28
  const center = { posx: 0, posy: 0 }
  let green = 0
  let blue = 0
  for (let x = -6; x <= 6; x++) {
    for (let y = -6; y <= 6; y++) {
      const d = cellDistance({ posx: x, posy: y }, center)
      const s = visibilitySuffix(d, 2)
      if (s === 'green') green++
      else if (s === 'blue') blue++
    }
  }
  assert.equal(green, 13)
  assert.equal(blue, 28)
})

test('z-index 按行优先递增（画家算法：越靠下越压在上面）', () => {
  const h = renderMap(vm())
  const zs = [...h.matchAll(/class=tile [^>]*z-index:(\d+)/g)].map((m) => Number(m[1]))
  assert.equal(zs.length, 113)
  for (let i = 1; i < zs.length; i++) {
    assert.ok(zs[i]! > zs[i - 1]!, `第 ${i} 格的 z 应更大`)
  }
  assert.equal(zs[0], 5, '第一格 z = 5×1')
})

// —— 结构：照原版 DOM ——

test('信息栏用原版 id（sceneimg / sname / spos / sgold… / playernum）', () => {
  const h = renderMap(vm())
  for (const id of ['sceneimg', 'smallinfo', 'sname', 'spos', 'sgold', 'swood', 'swater', 'sfire', 'searth', 'playernum']) {
    assert.ok(h.includes(`id=${id}`), `缺少 #${id}`)
  }
  assert.ok(h.includes('height=150 width=150'), '地形插画是 150×150')
  assert.ok(h.includes('width=300'), '信息表宽 300（150+300 = 450，与地图同宽）')
})

test('两个操作链接的文案照截图', () => {
  const h = renderMap(vm())
  assert.ok(h.includes('对选中场景进行推算'))
  assert.ok(h.includes('向选中场景步行移动'))
})

test('8 个滚屏箭头，位置与 goBy 参数照原版', () => {
  const h = renderMap(vm())
  const arrows = [...h.matchAll(/goBy\((-?\d+),(-?\d+)\)/g)].map((m) => `${m[1]},${m[2]}`)
  assert.equal(arrows.length, 8)
  assert.deepEqual(new Set(arrows), new Set(['-1,0', '-1,1', '0,1', '-1,-1', '1,1', '0,-1', '1,-1', '1,0']))
  assert.ok(h.includes('left:0px;top:154px'), '左上箭头')
  assert.ok(h.includes('left:463px;top:414px'), '右下箭头')
  assert.ok(h.includes("img/pos/lto.gif"), 'hover 换 *o.gif')
})

test('底部坐标栏：x/y 输入框、查看、滚屏距离默认 3、返回人物所在', () => {
  const h = renderMap(vm())
  assert.ok(h.includes('id=viewposx'))
  assert.ok(h.includes('id=viewposy'))
  assert.ok(h.includes('id=gobydis size=4 value="3"'), '滚屏距离默认 3')
  assert.ok(h.includes('返回人物所在'))
})

test('地块图按视野染色：中心格是 green，远处无后缀', () => {
  const h = renderMap(vm())
  assert.ok(h.includes('img/map/forest02green.gif'), '视野内用 green')
  assert.ok(h.includes('img/map/forest02.gif'), '视野外用原色')
  assert.ok(h.includes('img/map/forest02blue.gif'), '感应范围用 blue')
})

test('有人的格子叠人物图标，自己那格叠 player1', () => {
  const v = vm()
  const withPeople = {
    ...v,
    cells: v.cells.map((c, i) => (i === 10 ? { ...c, playernum: 2 } : c)),
  }
  const h = renderMap(withPeople)
  assert.ok(/img\/people\d\d\.gif/.test(h), '应有人物覆盖图标')
  assert.ok(h.includes('id=playermark'), '自己那格有 player1')
  assert.ok(h.includes('img/player1.gif'))
})

test('地块图上移 85px：菱形在 120 高图的底部', () => {
  const h = renderMap(vm())
  // 中心格菱形顶在 y=105，图要画在 105−(120−35) = 20
  assert.ok(h.includes('left:192px;top:20px'), '中心格的图应落在 top=20')
})

test('选中格与悬停格各有一个光标罩', () => {
  const h = renderMap(vm())
  assert.ok(h.includes('id=selmapcover'))
  assert.ok(h.includes('id=overmapcover'))
  assert.ok(h.includes('maptarget2.gif'), '选中框')
  assert.ok(h.includes('maptarget.gif'), '悬停框')
})

test('地名与坐标转义（州名来自数据，不应能注入）', () => {
  const v = vm()
  const evil = { ...v, selected: { ...v.selected, name: '<img onerror=alert(1)>' } }
  const h = renderMap(evil)
  assert.ok(!h.includes('<img onerror'))
  assert.ok(h.includes('&lt;img'))
})

// —— 用原版真实 mapData 回归：我们的坐标公式必须能重现原版算出的 imgx/imgy ——

test('坐标公式重现原版 mapData 的 113 个 imgx/imgy', async () => {
  const { readFileSync } = await import('node:fs')
  const raw = JSON.parse(
    readFileSync(new URL('../../tools/fixtures/mapdata.json', import.meta.url), 'utf8'),
  ) as {
    cells: { posx: number; posy: number; imgx: number; imgy: number; zindex: number }[]
    meta: { curMapX: number; curMapY: number; playerX: number; playerY: number; playerDis: number }
  }
  assert.equal(raw.cells.length, 113)

  let mismatch = 0
  raw.cells.forEach((c, i) => {
    const got = cellToScreen(c.posx, c.posy, raw.meta.curMapX, raw.meta.curMapY)
    // 原版 imgy 取整（行距 17.5 交替 17/18），允许 ±1
    if (got.left !== c.imgx || Math.abs(got.top - c.imgy) > 1) {
      mismatch++
      if (mismatch <= 3) {
        console.error(`第 ${i} 格 (${c.posx},${c.posy})：算得 ${got.left},${got.top} 原版 ${c.imgx},${c.imgy}`)
      }
    }
  })
  assert.equal(mismatch, 0, `${mismatch} 格与原版坐标不符`)
})

test('原版 mapData 的 zindex = 5×(序号+1)+1（光标罩用的那一层）', async () => {
  const { readFileSync } = await import('node:fs')
  const raw = JSON.parse(
    readFileSync(new URL('../../tools/fixtures/mapdata.json', import.meta.url), 'utf8'),
  ) as { cells: { zindex: number }[] }
  raw.cells.forEach((c, i) => {
    assert.equal(c.zindex, 5 * (i + 1) + 1, `第 ${i} 格`)
  })
})

test('原版这一屏的普通格五行总和恒为 20', async () => {
  const { readFileSync } = await import('node:fs')
  const raw = JSON.parse(
    readFileSync(new URL('../../tools/fixtures/mapdata.json', import.meta.url), 'utf8'),
  ) as { cells: { gold: number; wood: number; water: number; fire: number; earth: number }[] }
  const sums = raw.cells.map((c) => c.gold + c.wood + c.water + c.fire + c.earth)
  const normal = sums.filter((s) => s === 20).length
  // 少数特殊格总和为 15 或 13（09 §3.7 记录过）
  assert.ok(normal >= 100, `只有 ${normal}/113 格总和为 20`)
  for (const s of sums) assert.ok([20, 15, 13].includes(s), `出现意外的总和 ${s}`)
})
