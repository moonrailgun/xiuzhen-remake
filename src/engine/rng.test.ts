import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rand, randInt, pick, weightedPick, seedRng, next, roll } from './rng.ts'

test('无状态随机：同样的键永远得到同样的值', () => {
  assert.equal(rand(42, 'terrain', 100, 50), rand(42, 'terrain', 100, 50))
  assert.equal(rand(42, 'npc', 'abc', 7), rand(42, 'npc', 'abc', 7))
})

test('无状态随机：不依赖调用顺序（地图可以跳到任意坐标查看）', () => {
  const a = rand(1, 'x', 5)
  rand(1, 'y', 9) // 中间穿插别的查询
  rand(1, 'z', 3)
  assert.equal(rand(1, 'x', 5), a)
})

test('不同种子 / 不同键给出不同值', () => {
  assert.notEqual(rand(1, 'a'), rand(2, 'a'))
  assert.notEqual(rand(1, 'a'), rand(1, 'b'))
  assert.notEqual(rand(1, 'x', 1), rand(1, 'x', 2))
})

test('值域在 [0,1)', () => {
  for (let i = 0; i < 5000; i++) {
    const v = rand(7, 'k', i)
    assert.ok(v >= 0 && v < 1, `越界 ${v}`)
  }
})

test('相邻坐标不相关（地形生成不能出现条带）', () => {
  // 简单检查：相邻格的值差的分布不应集中
  let sameBucket = 0
  for (let x = 0; x < 200; x++) {
    const a = Math.floor(rand(3, 'terrain', x, 10) * 8)
    const b = Math.floor(rand(3, 'terrain', x + 1, 10) * 8)
    if (a === b) sameBucket++
  }
  // 8 个桶，随机情况下约 1/8 ≈ 25 次；放宽到 60 以内即可发现明显相关
  assert.ok(sameBucket < 60, `相邻格同桶 ${sameBucket} 次，疑似相关`)
})

test('分布大致均匀', () => {
  const buckets = new Array(10).fill(0)
  for (let i = 0; i < 100_000; i++) buckets[Math.floor(rand(99, i) * 10)]!++
  for (const [i, n] of buckets.entries()) {
    assert.ok(n > 8500 && n < 11500, `桶 ${i} 有 ${n} 个，偏斜`)
  }
})

test('randInt 值域正确', () => {
  for (let i = 0; i < 1000; i++) {
    const v = randInt(5, 11, i)
    assert.ok(Number.isInteger(v) && v >= 0 && v < 5)
  }
})

test('pick 确定性；空数组报错', () => {
  const items = ['平原', '森林', '青山', '江河']
  assert.equal(pick(items, 5, 'x', 1), pick(items, 5, 'x', 1))
  assert.throws(() => pick([], 1, 'a'), /空数组/)
})

test('weightedPick 按权重倾斜', () => {
  // 地块元气分布类型：纯13 / 7+7 / 5+5+5 / 5+4+4+4 / 五个4，优先级从高到低
  const types = ['纯13', '7+7', '5+5+5', '5+4+4+4', '五个4']
  const weights = [1, 2, 4, 8, 16]
  const count = new Map<string, number>()
  for (let i = 0; i < 31_000; i++) {
    const t = weightedPick(types, weights, 1, 'cell', i)
    count.set(t, (count.get(t) ?? 0) + 1)
  }
  assert.ok(count.get('五个4')! > count.get('5+4+4+4')!)
  assert.ok(count.get('5+4+4+4')! > count.get('5+5+5')!)
  assert.ok(count.get('5+5+5')! > count.get('7+7')!)
  assert.ok(count.get('7+7')! > count.get('纯13')!)
})

test('weightedPick 参数校验', () => {
  assert.throws(() => weightedPick(['a'], [1, 2], 1, 'k'), /长度不一致/)
  assert.throws(() => weightedPick(['a'], [0], 1, 'k'), /权重和必须/)
})

test('有状态 RNG：同种子产生同序列', () => {
  const seq = (n: number) => {
    let s = seedRng(123)
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      const r = next(s)
      out.push(r.value)
      s = r.state
    }
    return out
  }
  assert.deepEqual(seq(20), seq(20))
})

test('有状态 RNG：状态不可变，可存档后原地重放', () => {
  const s0 = seedRng(7)
  const a = next(s0)
  const b = next(s0) // 用同一个旧状态再掷一次
  assert.equal(a.value, b.value, '旧状态不应被修改')
  assert.notEqual(next(a.state).value, a.value)
})

test('roll 按概率判定', () => {
  let s = seedRng(2024)
  let hits = 0
  for (let i = 0; i < 20_000; i++) {
    const r = roll(s, 0.3)
    if (r.hit) hits++
    s = r.state
  }
  assert.ok(hits > 5400 && hits < 6600, `命中 ${hits}/20000，偏离 30% 太多`)
})

test('roll 概率 0 与 1 的边界', () => {
  let s = seedRng(1)
  for (let i = 0; i < 200; i++) {
    const never = roll(s, 0)
    assert.equal(never.hit, false)
    const always = roll(s, 1)
    assert.equal(always.hit, true)
    s = never.state
  }
})
