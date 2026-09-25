import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeCurve, cumulative, type Anchor } from './curve.ts'

const A = (level: number, value: number): Anchor => ({ level, value, source: 'test' })

test('曲线严格过每个锚点（锚点是硬证据，不能被平滑掉）', () => {
  const anchors = [A(2, 2900), A(9, 10000), A(35, 1200000), A(36, 1400000)]
  const f = makeCurve(anchors)
  for (const a of anchors) assert.equal(f(a.level), a.value, `Lv.${a.level}`)
})

test('锚点之间保持单调递增（升级消耗不可能中途变便宜）', () => {
  const f = makeCurve([A(0, 1), A(1, 2), A(2, 5), A(3, 8), A(8, 40), A(9, 60), A(13, 200), A(14, 270), A(20, 1000)])
  let prev = -Infinity
  for (let lv = 0; lv <= 20; lv++) {
    const v = f(lv)
    assert.ok(v >= prev, `Lv.${lv} = ${v} 比 Lv.${lv - 1} = ${prev} 小`)
    prev = v
  }
})

test('不在锚点之间产生振荡（相邻增量不出现负数）', () => {
  const f = makeCurve([A(2, 2900), A(9, 10000), A(35, 1200000)])
  for (let lv = 3; lv <= 35; lv++) {
    assert.ok(f(lv) - f(lv - 1) >= 0, `Lv.${lv} 出现回落`)
  }
})

test('cumulative 累加闭区间', () => {
  const f = makeCurve([A(1, 10), A(2, 20)])
  assert.equal(cumulative(f, 1, 2), 30)
})

test('锚点不足或等级重复要报错', () => {
  assert.throws(() => makeCurve([A(1, 10)]), /至少需要 2 个锚点/)
  assert.throws(() => makeCurve([A(1, 10), A(1, 20)]), /等级重复/)
})
