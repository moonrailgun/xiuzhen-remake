import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  relationOf,
  splitByElement,
  totalCost,
  upgradeCost,
  upgradeSeconds,
  dantianCapacity,
  COST_RATIO,
} from './upgrade.ts'
import { cumulative } from './curve.ts'
import { ELEMENTS } from './meridian.ts'
import { DAOXING_PER_YEAR } from '../engine/state.ts'

test('五行关系：每种本命下五种关系不重不漏', () => {
  for (const self of ELEMENTS) {
    const rels = ELEMENTS.map((e) => relationOf(self, e))
    assert.equal(new Set(rels).size, 5, `${self} 的五种关系应各出现一次`)
  }
})

test('关系判定对照实测样本：木属性角色', () => {
  // 截图 #3 足阳明胃经 Lv2→3：木430(本命) 土360(我克) 水210(生我) 火130(我生) 金0(克我)
  assert.equal(relationOf('木', '木'), '本命')
  assert.equal(relationOf('木', '土'), '我克', '木克土')
  assert.equal(relationOf('木', '水'), '生我', '水生木')
  assert.equal(relationOf('木', '火'), '我生', '木生火')
  assert.equal(relationOf('木', '金'), '克我', '金克木 → 五行一缺')
})

test('经脉配比复现截图 #3 的实测值（木属性 Lv2→3 共 1130）', () => {
  const cost = splitByElement(1130, '木', 'meridian')
  // 原版：金0 木430 水210 火130 土360
  const [gold, wood, water, fire, earth] = cost
  assert.equal(gold, 0, '克我为 0')
  assert.ok(Math.abs(wood - 430) <= 5, `木 ${wood}，原版 430`)
  assert.ok(Math.abs(earth - 360) <= 5, `土 ${earth}，原版 360`)
  assert.ok(Math.abs(water - 210) <= 5, `水 ${water}，原版 210`)
  assert.ok(Math.abs(fire - 130) <= 5, `火 ${fire}，原版 130`)
})

test('本体配比复现丹田 Lv27→28 的实测值（金属性，共 783000）', () => {
  const cost = splitByElement(783000, '金', 'body')
  // 原版：金240000 木190000 水160000 火23000 土170000
  const [gold, wood, water, fire, earth] = cost
  const near = (got: number, want: number, tol = 0.06) =>
    assert.ok(Math.abs(got - want) / want <= tol, `实得 ${got}，原版 ${want}`)
  near(gold, 240000)
  near(wood, 190000)
  near(earth, 170000)
  near(water, 160000)
  near(fire, 23000, 0.35) // 克我那一项占比小，相对误差放宽
})

test('本体配比对另一位角色同样成立（丹田 Lv35→36，水属性）', () => {
  // 原版：金1200000 木1100000 水1800000 火1300000 土170000
  const cost = splitByElement(5570000, '水', 'body')
  const [gold, wood, water, fire, earth] = cost
  assert.ok(water > fire && fire > gold && gold > wood && wood > earth,
    `顺序应为 本命>我克>生我>我生>克我，实得 ${cost.join('/')}`)
  assert.ok(Math.abs(water - 1800000) / 1800000 < 0.06)
})

test('法术配比与经脉不同：生我最多、克我为 0（炼丹之术 Lv3→4）', () => {
  // 原版（金属性）：金120 木160 水93 火0 土250
  const cost = splitByElement(623, '金', 'skill')
  const [gold, wood, water, fire, earth] = cost
  assert.equal(fire, 0, '克我为 0')
  assert.ok(earth > wood && wood > gold && gold > water,
    `应为 生我>我克>本命>我生，实得 ${cost.join('/')}`)
  assert.ok(Math.abs(earth - 250) <= 12, `土 ${earth}，原版 250`)
})

test('配比之和为 1（不会凭空多出或少掉真气）', () => {
  for (const key of ['meridian', 'body', 'skill'] as const) {
    const sum = COST_RATIO[key].reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(sum - 1) < 0.01, `${key} 配比和 = ${sum}`)
  }
})

test('总消耗随等级单调递增', () => {
  for (const sys of ['meridian', 'body', 'skill'] as const) {
    let prev = 0
    for (let lv = 1; lv <= 20; lv++) {
      const v = totalCost(sys, lv)
      assert.ok(v >= prev, `${sys} Lv.${lv} = ${v} 比上一级小`)
      prev = v
    }
  }
})

test('总消耗过实测锚点', () => {
  assert.equal(totalCost('meridian', 3), 1130, '足阳明胃经 Lv2→3')
  assert.equal(totalCost('meridian', 4), 1890, '主脉 3→4')
  assert.equal(totalCost('skill', 4), 623, '炼丹之术 Lv3→4')
  assert.equal(totalCost('body', 28), 783000, '丹田 Lv27→28')
  assert.equal(totalCost('body', 35), 4390000)
  assert.equal(totalCost('body', 36), 5570000)
})

test('耗时与总消耗同向，且本体加成能缩短', () => {
  const plain = upgradeSeconds('meridian', 5)
  const boosted = upgradeSeconds('meridian', 5, { steelLevel: 20 })
  assert.ok(boosted < plain, '炼体成钢应缩短经脉升级时间')
  assert.ok(boosted >= plain * 0.2, '不应缩到 20% 以下')

  const skillPlain = upgradeSeconds('skill', 5)
  const skillBoosted = upgradeSeconds('skill', 5, { calmLevel: 20 })
  assert.ok(skillBoosted < skillPlain, '心静通灵应缩短法术修炼时间')
  // 炼体成钢不影响法术
  assert.equal(upgradeSeconds('skill', 5, { steelLevel: 20 }), skillPlain)
})

test('耗时量级对齐截图：足阳明胃经 Lv2→3 约 0:24:01', () => {
  const secs = upgradeSeconds('meridian', 3)
  const want = 24 * 60 + 1
  assert.ok(Math.abs(secs - want) / want < 0.15, `实得 ${secs}s，截图 ${want}s`)
})

test('累计锚点：三转周天时，经脉部分的道行应小于总数 12 年', () => {
  // 玩家帖「三转周天后道行 ≈12 年」。道行 = 累计消耗的真气，1 年 = 4380 点。
  // 但那 12 年是**全部**消耗：做到三转周天时，玩家同时还升了本体、法术、炼了剑。
  // 所以经脉这一项只能占其中一部分 —— 这条断言防的是曲线被拟合得过高或过低。
  const perMeridian = cumulative((lv) => totalCost('meridian', lv), 1, 3)
  const years = (perMeridian * 12) / DAOXING_PER_YEAR
  assert.ok(years > 2, `经脉部分只有 ${years.toFixed(1)} 年，相对 12 年总量偏低`)
  assert.ok(years < 12, `经脉部分已 ${years.toFixed(1)} 年，超过了总量 12 年`)
})

test('丹田容量过实测锚点，且单调递增', () => {
  assert.equal(dantianCapacity(2), 2900, '截图 #2 资源条 /2900')
  assert.equal(dantianCapacity(35), 1200000, '截图 #33')
  assert.equal(dantianCapacity(36), 1400000)
  let prev = 0
  for (let lv = 1; lv <= 36; lv++) {
    const v = dantianCapacity(lv)
    assert.ok(v >= prev, `Lv.${lv} 容量回落`)
    prev = v
  }
})

test('丹田容量：基准版用 2008-11 序列，Lv9 不应是 2010 年的 10000', () => {
  // DECISIONS-rules §5：2009-09「丹田开放到 36 级」时官方改过表
  assert.ok(dantianCapacity(9) < 9000, `Lv.9 应接近 2008 序列，实得 ${dantianCapacity(9)}`)
})

test('upgradeCost 返回五个整数且总和接近总消耗', () => {
  const cost = upgradeCost('meridian', 3, '木')
  assert.equal(cost.length, 5)
  for (const v of cost) assert.ok(Number.isInteger(v) && v >= 0)
  const sum = cost.reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1130) <= 10, `总和 ${sum}`)
})
