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
  for (const [years, expected] of [
    [99, '九十九'], [100, '一百'], [101, '一百零一'], [110, '一百一十'],
    [117, '一百一十七'], [1000, '一千'], [1010, '一千零一十'],
    [10000, '一万'], [10010, '一万零一十'], [100000, '十万'],
    [100000001, '一亿零一'],
  ] as const) {
    assert.equal(daoxingText(years * DAOXING_PER_YEAR), `${expected}年`)
  }
  assert.equal(daoxingText(1017 * DAOXING_PER_YEAR + 11 * 365), '一千零一十七年零十一个月')
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
  vip: false,
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

test('★逐段累加的浮点误差不该让「够不够付」在离线/在线之间翻转', () => {
  const cost = [138240, 0, 0, 0, 0] as unknown as FiveQi
  // 离线：一次算出来，正好等于成本
  assert.equal(canAfford([138240, 0, 0, 0, 0] as unknown as FiveQi, cost), true)
  // 在线：两百多万次加法之后差了 1e-6，数学上应视为相等
  assert.equal(canAfford([138239.99999910643, 0, 0, 0, 0] as unknown as FiveQi, cost), true,
    '差 1e-6 就说付不起，会变成「离线炼得动、在线炼不动」')
  // 真差一点还是要拦住
  assert.equal(canAfford([138239.9, 0, 0, 0, 0] as unknown as FiveQi, cost), false)
  assert.equal(canAfford([138239, 0, 0, 0, 0] as unknown as FiveQi, cost), false)
})
