import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  vaultCapacity,
  lootFrom,
  knockback,
  woundedText,
  absorbText,
  WOUNDED_TABLE_TITLE,
  ABSORB_TABLE_TITLE,
} from './loot.ts'
import { WORLD_SIZE } from '../data/world.ts'
import type { FiveQi } from './state.ts'

const qi = (...v: number[]): FiveQi => v as unknown as FiveQi

test('固本培元暗仓过全部实测锚点', () => {
  assert.equal(vaultCapacity(9), 1000)
  assert.equal(vaultCapacity(12), 1800)
  assert.equal(vaultCapacity(13), 2100)
  assert.equal(vaultCapacity(16), 3700)
  assert.equal(vaultCapacity(20), 8000, '满级；五种合计 4 万')
})

test('没练固本培元就一点也护不住', () => {
  assert.equal(vaultCapacity(0), 0)
})

test('暗仓随等级单调递增，且封顶在满级', () => {
  let prev = -1
  for (let lv = 0; lv <= 20; lv++) {
    const v = vaultCapacity(lv)
    assert.ok(v >= prev, `Lv.${lv}`)
    prev = v
  }
  assert.equal(vaultCapacity(25), vaultCapacity(20), '超过满级不再涨')
})

test('只有超出暗仓的部分会被抢走（原文规则）', () => {
  // 固本 12 级 → 每种护住 1800
  const { taken, left } = lootFrom(qi(5000, 2000, 1800, 1000, 0), 12)
  assert.deepEqual([...taken], [3200, 200, 0, 0, 0], '护住的部分抢不走')
  assert.deepEqual([...left], [1800, 1800, 1800, 1000, 0], '剩下的正好是暗仓内的')
})

test('真气没超过暗仓时一点都抢不到', () => {
  const { taken } = lootFrom(qi(100, 200, 300, 400, 500), 12)
  assert.deepEqual([...taken], [0, 0, 0, 0, 0])
})

test('抢走比例可调，且不会抢成负数', () => {
  const half = lootFrom(qi(5000, 0, 0, 0, 0), 12, 0.5)
  assert.equal(half.taken[0], 1600, '(5000−1800) × 0.5')
  const none = lootFrom(qi(5000, 0, 0, 0, 0), 12, 0)
  assert.equal(none.taken[0], 0)
  for (const v of lootFrom(qi(0, 0, 0, 0, 0), 20).taken) assert.equal(v, 0)
})

test('抢走的 + 剩下的 = 原来的（不凭空多出真气）', () => {
  const before = qi(9999, 5000, 1234, 0, 77)
  const { taken, left } = lootFrom(before, 13)
  before.forEach((v, i) => assert.equal(taken[i]! + left[i]!, v, `第 ${i} 种`))
})

// —— 击退 ——

test('击退距离在 1–4 格（受伤信里的实测范围）', () => {
  for (let i = 0; i < 200; i++) {
    const p = knockback(100, 100, 1, i, 4)
    const d = Math.abs(p.x - 100) + Math.abs(p.y - 100)
    assert.ok(d >= 1 && d <= 4, `距离 ${d}`)
  }
})

test('击退不会把人推出世界外', () => {
  for (const [x, y] of [[0, 0], [199, 199], [0, 199], [199, 0]] as const) {
    for (let i = 0; i < 50; i++) {
      const p = knockback(x, y, 2, i, 4)
      assert.ok(p.x >= 0 && p.x < WORLD_SIZE, `x=${p.x}`)
      assert.ok(p.y >= 0 && p.y < WORLD_SIZE, `y=${p.y}`)
    }
  }
})

test('击退是确定的：同样的输入给同样的落点', () => {
  assert.deepEqual(knockback(50, 50, 7, 'a'), knockback(50, 50, 7, 'a'))
})

test('击退属性越高推得越远', () => {
  const far = Array.from({ length: 100 }, (_, i) => {
    const p = knockback(100, 100, 3, i, 4)
    return Math.abs(p.x - 100) + Math.abs(p.y - 100)
  })
  const near = Array.from({ length: 100 }, (_, i) => {
    const p = knockback(100, 100, 3, i, 1)
    return Math.abs(p.x - 100) + Math.abs(p.y - 100)
  })
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  assert.ok(avg(far) > avg(near), `${avg(far)} 应大于 ${avg(near)}`)
})

// —— 信件文案（原版逐字）——

test('受伤信文案与原文一字不差', () => {
  const text = woundedText({
    attacker: '某狼', quality: '上品', sword: '天雷万磁剑', refine: 6,
    x: 84, y: 81, place: '冰城镇',
  })
  assert.ok(text.includes('某狼的上品天雷万磁剑+6向你飞来，仓促之间，你无从抵挡，受了伤向附近(84,81)的冰城镇中逃去。'))
  assert.ok(text.includes('你感觉到伤口火辣辣的痛，体内的真气不由自主的向外逸去……'))
  assert.equal(WOUNDED_TABLE_TITLE, '被飞剑刺伤失去的真气')
})

test('吸气信文案与原文一字不差，并说明真气要等剑飞回才入丹田', () => {
  const text = absorbText({
    target: '某羊', quality: '极品', sword: '青龙伏魔剑', refine: 3,
    x: 85, y: 77, place: '平原',
  })
  assert.ok(text.includes('你的极品青龙伏魔剑+3向某羊飞去'))
  assert.ok(text.includes('将他因受伤而逸出体外的真气尽数吸入刻于其上的聚灵阵中'))
  assert.ok(text.includes('当它折返回你的身边后，聚灵阵中的真气将自动汇入你的丹田'))
  assert.equal(ABSORB_TABLE_TITLE, '飞剑聚灵阵中吸收的真气')
})

test('没淬炼的剑名里不带 +N', () => {
  const text = absorbText({
    target: '某羊', quality: '凡品', sword: '玉虚桃木剑', refine: 0,
    x: 1, y: 2, place: '平原',
  })
  assert.ok(text.includes('凡品玉虚桃木剑向某羊飞去'), text.slice(0, 30))
  assert.ok(!text.includes('+0'))
})
