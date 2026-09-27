import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import {
  terrainAt,
  terrainVariant,
  terrainScene,
  TERRAIN_KEY,
  qiAt,
  sceneName,
  provinceOf,
  inWorld,
  distance,
  LANDMARKS,
  MOVE_SECONDS,
  UNLOCK_WEEKS,
  WORLD_SIZE,
  PROVINCE_BY_POSI,
  type Terrain,
} from './world.ts'

const SEED = 20081028

test('地图插画均存在，四种平原共用原版插画，福地沿用占位', () => {
  for (let variant = 0; variant < 4; variant++) assert.equal(terrainScene('平原', variant), 'plain01')
  assert.equal(terrainScene('福地', 0), 'plain01')
  for (const terrain of Object.keys(TERRAIN_KEY) as Terrain[]) {
    for (let x = 0; x < 100; x++) {
      const scene = terrainScene(terrain, terrainVariant(SEED, x, 50, terrain))
      assert.ok(existsSync(new URL(`../../public/img/scene/${scene}.gif`, import.meta.url)), scene)
    }
  }
})

test('世界 200×200（基准期；2009-06-30 才扩到 300×300）', () => {
  assert.equal(WORLD_SIZE, 200)
  assert.equal(inWorld(0, 0), true)
  assert.equal(inWorld(199, 199), true)
  assert.equal(inWorld(200, 0), false)
  assert.equal(inWorld(-1, 5), false)
})

test('移动耗时按目标地形（官方指南原文）', () => {
  assert.equal(MOVE_SECONDS['平原'], 600, '10 分钟')
  assert.equal(MOVE_SECONDS['森林'], 1200, '20 分钟')
  assert.equal(MOVE_SECONDS['青山'], 1800, '30 分钟')
  assert.equal(MOVE_SECONDS['江河'], 2400, '40 分钟')
  assert.equal(MOVE_SECONDS['村庄'], 1200)
  assert.equal(MOVE_SECONDS['小镇'], 1800)
  assert.equal(MOVE_SECONDS['城池'], 2400)
  assert.equal(MOVE_SECONDS['福地'], 1800)
  assert.equal(MOVE_SECONDS['洞天'], 1800)
})

test('场景按开服周龄解锁（官方 FAQ 2009-02-03）', () => {
  assert.equal(UNLOCK_WEEKS['村庄'], 1)
  assert.equal(UNLOCK_WEEKS['小镇'], 2)
  assert.equal(UNLOCK_WEEKS['福地'], 2)
  assert.equal(UNLOCK_WEEKS['城池'], 3)
  assert.equal(UNLOCK_WEEKS['洞天'], 4)
})

test('开服第一周不会出现村镇城与福地洞天', () => {
  const found = new Set<Terrain>()
  for (let x = 0; x < 120; x++) {
    for (let y = 0; y < 120; y++) {
      found.add(terrainAt(SEED, x, y, 0))
    }
  }
  for (const t of ['村庄', '小镇', '城池', '福地', '洞天'] as const) {
    assert.ok(!found.has(t), `开服第 0 周不应有${t}`)
  }
  assert.ok(found.has('平原') && found.has('森林'))
})

test('开服满 4 周后各种场景都会出现', () => {
  const found = new Set<Terrain>()
  for (let x = 0; x < 200; x++) {
    for (let y = 0; y < 200; y++) {
      found.add(terrainAt(SEED, x, y, 4))
    }
  }
  for (const t of ['平原', '森林', '青山', '江河', '村庄', '小镇', '城池', '福地', '洞天'] as const) {
    assert.ok(found.has(t), `应能生成${t}`)
  }
})

test('地形分布以平原为主（对照原版那一屏 113 格：平原约 79%）', () => {
  let plain = 0
  let total = 0
  for (let x = 0; x < 150; x++) {
    for (let y = 0; y < 150; y++) {
      if (terrainAt(SEED, x, y, 0) === '平原') plain++
      total++
    }
  }
  const ratio = plain / total
  assert.ok(ratio > 0.7 && ratio < 0.85, `平原占比 ${(ratio * 100).toFixed(1)}%`)
})

test('世界生成是确定的：同种子同坐标永远一样', () => {
  for (const [x, y] of [[10, 20], [150, 80], [3, 197]] as const) {
    assert.equal(terrainAt(SEED, x, y), terrainAt(SEED, x, y))
    assert.deepEqual([...qiAt(SEED, x, y)], [...qiAt(SEED, x, y)])
  }
})

test('不同种子生成不同世界', () => {
  let diff = 0
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      if (terrainAt(1, x, y) !== terrainAt(2, x, y)) diff++
    }
  }
  assert.ok(diff > 200, `只有 ${diff} 格不同`)
})

// —— 实测地名钉死 ——

test('五岳落在实测坐标上，且都是青山', () => {
  const peaks = [
    [168, 198, '玉皇顶'], [41, 59, '落雁峰'], [53, 181, '天峰岭'],
    [194, 17, '祝融峰'], [100, 89, '峻极峰'],
  ] as const
  for (const [x, y, name] of peaks) {
    assert.equal(terrainAt(SEED, x, y), '青山', name)
    assert.ok(sceneName(SEED, x, y).includes(name), `${name} 的场景名`)
  }
})

test('实测地名的地形与元气都照原版（开服满 4 周后）', () => {
  for (const l of LANDMARKS) {
    assert.equal(terrainAt(SEED, l.x, l.y, 99), l.terrain, l.name)
    if (l.qi) assert.deepEqual([...qiAt(SEED, l.x, l.y)], [...l.qi], `${l.name} 的元气`)
  }
})

test('未解锁时，地名格先当普通地形（洞天不见山要第 4 周才出现）', () => {
  assert.notEqual(terrainAt(SEED, 14, 50, 0), '洞天', '开服第 0 周')
  assert.notEqual(terrainAt(SEED, 14, 50, 3), '洞天', '第 3 周仍未解锁')
  assert.equal(terrainAt(SEED, 14, 50, 4), '洞天', '第 4 周出现')
})

test('原版 DOM 那一格：益州森林 (77,57) 元气 4/5/4/4/3', () => {
  assert.deepEqual([...qiAt(SEED, 77, 57)], [4, 5, 4, 4, 3])
  assert.equal(sceneName(SEED, 77, 57), '益州 森林')
})

test('洞天不见山 (14,50) 属雍州，元气全 4', () => {
  assert.equal(terrainAt(SEED, 14, 50), '洞天')
  assert.equal(sceneName(SEED, 14, 50), '雍州 不见山')
})

// —— 天地元气 ——

test('普通格五行总和恒为 20（原版 113 格实测规律）', () => {
  let checked = 0
  for (let x = 0; x < 100; x++) {
    for (let y = 0; y < 100; y++) {
      const t = terrainAt(SEED, x, y, 0) // 第 0 周只有自然地形
      const sum = qiAt(SEED, x, y, t).reduce((a, b) => a + b, 0)
      assert.equal(sum, 20, `(${x},${y}) ${t} 总和 ${sum}`)
      checked++
    }
  }
  assert.ok(checked > 9000)
})

test('森林木偏高、青山金偏高、江河水偏高', () => {
  const sample = (want: Terrain, idx: number) => {
    for (let x = 0; x < 200; x++) {
      for (let y = 0; y < 200; y++) {
        if (terrainAt(SEED, x, y, 0) === want) {
          const qi = qiAt(SEED, x, y, want)
          assert.equal(qi[idx], 5, `${want} 在 (${x},${y}) 的第 ${idx} 行应为 5`)
          return true
        }
      }
    }
    return false
  }
  assert.ok(sample('森林', 1), '森林 → 木')
  assert.ok(sample('青山', 0), '青山 → 金')
  assert.ok(sample('江河', 2), '江河 → 水')
})

test('城池全 10、福地全 5、洞天全 6（官方 FAQ）', () => {
  // 直接按地形查（不依赖生成器恰好在某坐标放了城池）
  assert.deepEqual([...qiAt(SEED, 5, 5, '城池')], [10, 10, 10, 10, 10])
  assert.deepEqual([...qiAt(SEED, 5, 5, '福地')], [5, 5, 5, 5, 5])
  assert.deepEqual([...qiAt(SEED, 5, 5, '洞天')], [6, 6, 6, 6, 6])
})

test('元气不出现负数', () => {
  for (let x = 0; x < 120; x++) {
    for (let y = 0; y < 120; y++) {
      for (const v of qiAt(SEED, x, y)) assert.ok(v >= 0, `(${x},${y}) 出现负元气`)
    }
  }
})

// —— 九州 ——

test('九州方位与真实地理一致（五岳坐标反推）', () => {
  // 屏幕上北下南左西右东；地理北 = (−x,+y)、东 = (+x,+y)
  assert.equal(provinceOf(100, 89), '冀州', '中岳峻极峰 → 中央冀州')
  assert.equal(provinceOf(53, 181), '并州', '恒山天峰岭 → 北方并州')
  assert.equal(provinceOf(168, 198), '徐州', '泰山玉皇顶 → 东方徐州')
  assert.equal(provinceOf(194, 17), '荆州', '衡山祝融峰 → 南方荆州')
  assert.equal(provinceOf(41, 59), '雍州', '华山落雁峰 → 西方雍州')
})

test('建号页出生方位取值 → 州名（照原版 HTML）', () => {
  assert.equal(PROVINCE_BY_POSI[1], '雍州')
  assert.equal(PROVINCE_BY_POSI[4], '益州')
  assert.equal(PROVINCE_BY_POSI[5], '冀州')
  assert.equal(PROVINCE_BY_POSI[8], '扬州')
  assert.equal(Object.keys(PROVINCE_BY_POSI).length, 9)
})

test('距离用曼哈顿（原版视野与移动都按它算）', () => {
  assert.equal(distance(0, 0, 3, 4), 7)
  assert.equal(distance(10, 10, 10, 10), 0)
})
