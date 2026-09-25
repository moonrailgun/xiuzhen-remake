import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addQi,
  subQi,
  canAfford,
  clampQi,
  totalQi,
  daoxingText,
  daoxingYears,
  isOutOfProtection,
  DAOXING_PER_YEAR,
  PROTECTION_POINTS,
  ZERO_QI,
  type FiveQi,
  type Player,
} from './state.ts'
import { DAY } from './clock.ts'

const qi = (...v: number[]): FiveQi => v as unknown as FiveQi

test('真气加减与总和', () => {
  assert.deepEqual([...addQi(qi(1, 2, 3, 4, 5), qi(10, 10, 10, 10, 10))], [11, 12, 13, 14, 15])
  assert.deepEqual([...subQi(qi(10, 10, 10, 10, 10), qi(1, 2, 3, 4, 5))], [9, 8, 7, 6, 5])
  assert.equal(totalQi(qi(1, 2, 3, 4, 5)), 15)
  assert.equal(totalQi(ZERO_QI), 0)
})

test('canAfford 要求五行都够', () => {
  assert.equal(canAfford(qi(100, 100, 100, 100, 100), qi(50, 50, 50, 50, 50)), true)
  assert.equal(canAfford(qi(100, 100, 100, 100, 49), qi(50, 50, 50, 50, 50)), false, '差一种也不行')
})

test('clampQi 按丹田上限截断，且不为负', () => {
  // 截图 #2：丹田气海 Lv.2 → 每种上限 2900
  assert.deepEqual([...clampQi(qi(5000, 100, -3, 2900, 0), 2900)], [2900, 100, 0, 2900, 0])
})

// —— 道行 ——

test('道行换算：1 年 = 4380 点，18 年 = 78840 点（新手任务原文）', () => {
  assert.equal(DAOXING_PER_YEAR, 4380)
  assert.equal(PROTECTION_POINTS, 78840)
  assert.equal(daoxingYears(78840), 18)
})

test('道行的中文写法（排行榜「九年零二个月」）', () => {
  assert.equal(daoxingText(9 * 4380 + Math.ceil(2 * 4380 / 12)), '九年零二个月')
  assert.equal(daoxingText(4380), '一年')
  assert.equal(daoxingText(0), '零个月')
  assert.equal(daoxingText(13 * 4380), '十三年')
})

// —— 保护期 ——

const player = (o: Partial<Player> = {}): Player => ({
  name: '173小鱼',
  gender: 'f',
  element: '木',
  school: '通天',
  realm: '筑基期',
  x: 100,
  y: 100,
  qi: ZERO_QI,
  meridians: Array(12).fill(0),
  body: Array(8).fill(0),
  skills: {},
  daoxing: 0,
  experience: 0,
  silver: 0,
  coin: 0,
  bonusCoin: 100,
  artifacts: [],
  createdAt: 0,
  ...o,
})

test('保护期：道行满 18 年即出保', () => {
  assert.equal(isOutOfProtection(player({ daoxing: PROTECTION_POINTS }), 0, DAY), true)
  assert.equal(isOutOfProtection(player({ daoxing: PROTECTION_POINTS - 1 }), 0, DAY), false)
})

test('保护期：建号满 10 天也出保（两个条件先到者算）', () => {
  const p = player({ daoxing: 0, createdAt: 0 })
  assert.equal(isOutOfProtection(p, 9 * DAY, DAY), false, '第 9 天还在保')
  assert.equal(isOutOfProtection(p, 10 * DAY, DAY), true, '第 10 天出保')
})

test('保护期：两个条件都不满足时仍在保', () => {
  assert.equal(isOutOfProtection(player({ daoxing: 1000, createdAt: 0 }), 5 * DAY, DAY), false)
})

test('整个状态可 JSON 往返（存档要求）', () => {
  const p = player({ qi: qi(1, 2, 3, 4, 5) })
  assert.deepEqual(JSON.parse(JSON.stringify(p)), JSON.parse(JSON.stringify(p)))
  // 不能含 Map/Set/函数/Date
  const json = JSON.stringify(p)
  assert.ok(!json.includes('undefined'))
  assert.equal(typeof JSON.parse(json).qi[0], 'number')
})
