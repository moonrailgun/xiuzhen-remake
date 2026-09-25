/**
 * 任务表回归测试。
 *
 * 断言一律对着**原文**：任务名、说明文、奖励数字、怪物属性。
 * 出处：`reference/_session1-scratch/corpus/8096.txt`（练气线）、`8097.txt`（练剑线）、
 * `docs/research/03-forum-verbatim-mining.md` §1.10（百妖记全表）、
 * `corpus/15374.txt` + `reference/text/forum162/article-49677-p9.txt`（境界任务）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BEAST_QUESTS,
  BEAST_RECONSTRUCTED_ROUNDS,
  BEAST_TOTAL,
  BIG_TEST_STONE,
  EXPERIENCE_THRESHOLDS,
  EXPERIENCE_UNIT,
  HEAVENLY_TRIBULATION,
  JINDAN_CHAIN,
  NEWBIE_QI_CHAIN,
  NEWBIE_SWORD_CHAIN,
  NEWBIE_TOTAL,
  QIANJIN_CHAIN,
  QIANJIN_DESCRIPTION,
  REALM_QUESTS,
  SANSHI,
  SANSHI_CHAIN,
  WUYUE,
  XIANTIAN_CHAIN,
  beastReward,
  beastRequire,
  cnNumber,
  isBeastBoss,
  monsterLine,
  newbieChain,
  qiRewardFor,
  questById,
  questTitle,
  questsFor,
  type Quest,
} from './quests.ts'

/** 帖子里的示例角色是金属性（8096.txt #1 楼「你五行缺火」），所以火 = 克我 = 减半那一项。 */
const asPosted = (q: Quest): readonly number[] => {
  const r = q.reward.qi
  assert.ok(r, `${q.name} 应该有真气奖励`)
  return [...qiRewardFor(r, '金')]
}

// ===========================================================================
// 新手任务链
// ===========================================================================

test('新手任务：两条线各 22 步，系列名 4 个', () => {
  for (const [name, chain] of [['练气线', NEWBIE_QI_CHAIN], ['练剑线', NEWBIE_SWORD_CHAIN]] as const) {
    assert.equal(chain.length, NEWBIE_TOTAL, name)
    assert.deepEqual(
      chain.map((q) => q.step),
      Array.from({ length: 22 }, (_, i) => i + 1),
      `${name} 步数应为 1..22`,
    )
    const series = [...new Set(chain.map((q) => q.series))].sort()
    assert.deepEqual(series, ['初入修真', '初涉炼剑', '初涉炼气', '十八年后'].sort(), name)
  }
})

test('新手任务：两条线是同样 22 件事，只有第 4–18 步顺序互换', () => {
  const ids = (c: readonly Quest[]) => c.map((q) => q.id)
  assert.deepEqual(ids(NEWBIE_QI_CHAIN).slice(0, 3), ids(NEWBIE_SWORD_CHAIN).slice(0, 3), '前 3 步相同')
  assert.deepEqual(ids(NEWBIE_QI_CHAIN).slice(18), ids(NEWBIE_SWORD_CHAIN).slice(18), '后 4 步相同')
  assert.deepEqual(
    [...ids(NEWBIE_QI_CHAIN)].sort(),
    [...ids(NEWBIE_SWORD_CHAIN)].sort(),
    '两条线是同一批任务',
  )
  // 练气线第 4 步是「初涉炼气」，练剑线第 4 步是「初涉炼剑」
  assert.equal(NEWBIE_QI_CHAIN[3]!.series, '初涉炼气')
  assert.equal(NEWBIE_SWORD_CHAIN[3]!.series, '初涉炼剑')
  // 「初涉炼气」7 步、「初涉炼剑」8 步
  assert.equal(NEWBIE_QI_CHAIN.filter((q) => q.series === '初涉炼气').length, 7)
  assert.equal(NEWBIE_QI_CHAIN.filter((q) => q.series === '初涉炼剑').length, 8)
})

test('新手任务·练气线：逐步的标题与奖励逐字对 8096.txt', () => {
  // [#, 系列, 标题, 金/木/水/火/土]
  const expected: readonly (readonly [number, string, string, number, number])[] = [
    [1, '初入修真', '打通经脉', 150, 75],
    [2, '初入修真', '本命属性', 50, 25],
    [3, '初入修真', '炼气炼剑', 50, 25],
    [4, '初涉炼气', '运转周天', 300, 150],
    [5, '初涉炼气', '丹田气海', 250, 125],
    [6, '初涉炼气', '运转周天', 500, 250],
    [7, '初涉炼气', '炼丹之术', 100, 50],
    [8, '初涉炼气', '开炉炼丹', 50, 25],
    [9, '初涉炼气', '再拓丹田', 1200, 600],
    [10, '初涉炼气', '二转周天', 1000, 500],
    [11, '初涉炼剑', '炼制飞剑', 100, 50],
    [12, '初涉炼剑', '以石试剑', 50, 25],
    [13, '初涉炼剑', '无锤百炼', 300, 150],
    [14, '初涉炼剑', '淬炼飞剑', 50, 25],
    [15, '初涉炼剑', '铸剑之术', 300, 150],
    [16, '初涉炼剑', '青龙伏魔', 100, 50],
    [17, '初涉炼剑', '御剑奇术', 300, 150],
    [18, '初涉炼剑', '合击之法', 1600, 1550],
    [19, '十八年后', '三转周天', 3000, 1500],
    [20, '十八年后', '三拓丹田', 400, 200],
    [21, '十八年后', '未雨绸缪', 100, 50],
    [22, '十八年后', '脱离保护', 2000, 1000],
  ]
  for (const [step, series, name, base, fire] of expected) {
    const q = NEWBIE_QI_CHAIN[step - 1]!
    assert.equal(q.series, series, `第 ${step} 步系列`)
    assert.equal(q.name, name, `第 ${step} 步标题`)
    assert.deepEqual(asPosted(q), [base, base, base, fire, base], `第 ${step} 步奖励`)
  }
})

test('新手任务·练剑线：第 4–11 步是炼剑段、第 12–18 步是炼气段（8097.txt）', () => {
  const names = NEWBIE_SWORD_CHAIN.map((q) => q.name)
  assert.deepEqual(names.slice(3, 11), [
    '炼制飞剑', '以石试剑', '无锤百炼', '淬炼飞剑', '铸剑之术', '青龙伏魔', '御剑奇术', '合击之法',
  ])
  assert.deepEqual(names.slice(11, 18), [
    '运转周天', '丹田气海', '运转周天', '炼丹之术', '开炉炼丹', '再拓丹田', '二转周天',
  ])
  // 8097.txt 第 11 步：「奖励： 金1600 木 1600 水1600 火1550 土1600」
  assert.deepEqual(asPosted(NEWBIE_SWORD_CHAIN[10]!), [1600, 1600, 1600, 1550, 1600])
})

test('新手任务第 18 步：火 = 1550 不是 800（两帖一致，保留原值）', () => {
  const q = NEWBIE_QI_CHAIN[17]!
  assert.equal(q.name, '合击之法')
  assert.equal(q.reward.qi?.base, 1600)
  // 按「克我为一半」的规律应是 800，两帖都写 1550 —— 02 §5 #19 裁决保留原值
  assert.equal(q.reward.qi?.overcomeBy, 1550)
  assert.notEqual(q.reward.qi?.overcomeBy, 800)
  assert.match(q.source, /1550 的异常/)
})

test('新手任务第 18 步的靶子：试剑石(大) 攻击:1 敏捷:60 生命:40 属性:无', () => {
  assert.equal(monsterLine(BIG_TEST_STONE), '试剑石(大) 攻击:1 敏捷:60 生命:40 属性:无')
  const q = NEWBIE_QI_CHAIN[17]!
  assert.equal(q.goal.kind, 'slay')
  assert.equal(q.summary, '试剑石(大) 攻击:1 敏捷:60 生命:40 属性:无')
})

test('新手任务第 22 步：道行 78840 点，奖励带新手玄武玉匣', () => {
  const q = NEWBIE_QI_CHAIN[21]!
  assert.equal(q.name, '脱离保护')
  assert.deepEqual(q.goal, { kind: 'daoxing', points: 78840 })
  assert.equal(
    q.summary,
    '将你的道行（通过各种途径消耗的真气值总和）提升到十八年（共计78840点）以离开新手保护期，你可以在“个人资料”或是“排行榜”中查看你的道行值。',
  )
  assert.deepEqual(q.reward.items, ['新手玄武玉匣'])
})

test('新手任务：操作路径原文保留（可直接当 UI 导航证据）', () => {
  assert.equal(
    NEWBIE_QI_CHAIN[0]!.path,
    '人物页面->点击任意一条经脉->在弹出的窗口中点击“升级”',
  )
  assert.equal(
    NEWBIE_QI_CHAIN[4]!.path,
    '人物页面->点击“本体”->点击“丹田气海”所指向的小圆圈->在弹出的窗口中点击“升级”',
  )
  assert.equal(
    NEWBIE_QI_CHAIN[16]!.path,
    '法术页面->点击“剑术”->点击“御剑术”->在弹出的窗口中点击“升级”',
  )
})

test('新手任务：完成条件与原文说明文对得上', () => {
  const byName = (name: string) => NEWBIE_QI_CHAIN.find((q) => q.name === name)!
  assert.deepEqual(byName('打通经脉').goal, { kind: 'meridian', level: 1, count: 1 })
  assert.deepEqual(byName('二转周天').goal, { kind: 'meridian', level: 2, count: 12 })
  assert.deepEqual(byName('三转周天').goal, { kind: 'meridian', level: 3, count: 12 })
  assert.deepEqual(byName('再拓丹田').goal, { kind: 'body', index: 5, level: 2 })
  assert.deepEqual(byName('未雨绸缪').goal, { kind: 'body', index: 4, level: 1 })
  assert.deepEqual(byName('炼丹之术').goal, { kind: 'skill', id: '炼丹之术', level: 1 })
  assert.deepEqual(byName('青龙伏魔').goal, { kind: 'craft', item: '青龙伏魔剑', count: 1 })
  assert.deepEqual(byName('淬炼飞剑').goal, { kind: 'refine', count: 1 })
})

// ===========================================================================
// 《百妖记》
// ===========================================================================

test('《百妖记》：100 回，只有 73/74/76 是补的', () => {
  assert.equal(BEAST_QUESTS.length, BEAST_TOTAL)
  assert.deepEqual(BEAST_RECONSTRUCTED_ROUNDS, [73, 74, 76])
  const reconstructed = BEAST_QUESTS.filter((q) => q.source.startsWith('reconstructed'))
  assert.deepEqual(reconstructed.map((q) => q.step), [73, 74, 76])
  assert.equal(BEAST_QUESTS.filter((q) => !q.source.startsWith('reconstructed')).length, 97)
})

test('《百妖记》怪物属性逐条对原文（03 §1.10）', () => {
  const expected: readonly (readonly [number, string, number, number, number, string])[] = [
    [1, '三青鸟', 14, 10, 30, '无'],
    [8, '白骷髅', 45, 10, 45, '无'],
    [10, '混世魔王', 130, 60, 800, '无'],
    [20, '红杏娘娘', 440, 60, 650, '木'],
    [25, '石狮精', 150, 10, 230, '土'], // 主表误作木，03 §1.10 已勘误
    [36, '有去有来', 170, 10, 1100, '无'], // 主表作水，已勘误
    [39, '白鼠精', 440, 10, 650, '无'], // 主表作 400，已勘误
    [43, '古刹铜钟', 230, 10, 1400, '金'],
    [50, '九尾妖狐', 1000, 60, 6500, '无'],
    [60, '青木居士', 3600, 60, 5000, '木'],
    [70, '玉面娘娘', 2800, 60, 17000, '无'],
    [72, '丹青魂', 1900, 10, 2400, '木'],
    [75, '白蛇精', 1400, 10, 1400, '水'],
    [77, '黑螺精', 2100, 10, 13000, '水'],
    [90, '黑山老妖', 8500, 60, 50000, '土'],
    [100, '太岁', 28000, 60, 40000, '土'],
  ]
  for (const [round, name, attack, agility, life, element] of expected) {
    const q = BEAST_QUESTS[round - 1]!
    assert.equal(q.step, round)
    assert.equal(q.goal.kind, 'slay')
    if (q.goal.kind !== 'slay') return
    assert.deepEqual(
      { ...q.goal.monster, element: q.goal.monster.element ?? '无' },
      { name, attack, agility, life, element },
      `第 ${round} 回`,
    )
    assert.equal(q.summary, `${name} 攻击:${attack} 敏捷:${agility} 生命:${life} 属性:${element}`)
  }
})

test('《百妖记》：非 BOSS 回敏捷恒为 10，BOSS 回恒为 60', () => {
  for (const q of BEAST_QUESTS) {
    if (q.goal.kind !== 'slay') continue
    assert.equal(q.goal.monster.agility, isBeastBoss(q.step) ? 60 : 10, `第 ${q.step} 回敏捷`)
  }
})

test('《百妖记》奖励规律：第 N 回五行各 N×100，逢十 BOSS 克我翻倍', () => {
  // 03 §1.10 原文：「第 N 回 = 五行各 N×100；逢十 BOSS 回 = 克我那一行 2N×100」
  const checks = [1, 5, 8, 10, 17, 20, 33, 40, 50, 66, 73, 80, 99, 100]
  for (const n of checks) {
    const r = beastReward(n)
    assert.equal(r.base, n * 100, `第 ${n} 回常规项`)
    assert.equal(r.overcomeBy, n % 10 === 0 ? n * 200 : n * 100, `第 ${n} 回克我项`)
    assert.deepEqual(BEAST_QUESTS[n - 1]!.reward.qi, r, `第 ${n} 回挂到任务上`)
  }
  // 02 §2.6 写死的两个 BOSS：第 10 回 2000+1000×4、第 20 回 4000+2000×4（金属性角色，克我=火）
  assert.deepEqual(qiRewardFor(beastReward(10), '金'), [1000, 1000, 1000, 2000, 1000])
  assert.deepEqual(qiRewardFor(beastReward(20), '金'), [2000, 2000, 2000, 4000, 2000])
  // 换个本命属性，翻倍的位置跟着变：水的克我是土（第 5 位）
  assert.deepEqual(qiRewardFor(beastReward(10), '水'), [1000, 1000, 1000, 1000, 2000])
})

test('《百妖记》领取条件按境界分段', () => {
  assert.equal(beastRequire(1), undefined)
  assert.equal(beastRequire(5), undefined)
  assert.deepEqual(beastRequire(6), { outOfProtection: true })
  assert.deepEqual(beastRequire(20), { outOfProtection: true })
  assert.deepEqual(beastRequire(21), { realm: '辟谷期' })
  assert.deepEqual(beastRequire(40), { realm: '辟谷期' })
  assert.deepEqual(beastRequire(41), { realm: '心动期' })
  assert.deepEqual(beastRequire(60), { realm: '心动期' })
  assert.deepEqual(beastRequire(61), { realm: '金丹期' })
  assert.deepEqual(beastRequire(80), { realm: '金丹期' })
  assert.deepEqual(beastRequire(81), { realm: '元婴期' })
  assert.deepEqual(beastRequire(100), { realm: '元婴期' })
})

test('《百妖记》标题：第八回(8/100)（截图 #83 的墨迹标题条）', () => {
  assert.equal(questTitle(BEAST_QUESTS[7]!), '《百妖记》第八回(8/100)')
  assert.equal(questTitle(BEAST_QUESTS[0]!), '《百妖记》第一回(1/100)')
  assert.equal(questTitle(BEAST_QUESTS[99]!), '《百妖记》第一百回(100/100)')
  assert.equal(cnNumber(10), '十')
  assert.equal(cnNumber(21), '二十一')
  assert.equal(cnNumber(60), '六十')
})

// ===========================================================================
// 境界任务
// ===========================================================================

test('境界任务：共 16 条（7 + 4 + 2 + 3）', () => {
  assert.equal(XIANTIAN_CHAIN.length, 7)
  assert.equal(SANSHI_CHAIN.length, 4)
  assert.equal(QIANJIN_CHAIN.length, 2)
  assert.equal(JINDAN_CHAIN.length, 3)
  assert.equal(REALM_QUESTS.length, 16)
})

test('境界任务名格式：斩却三尸-上尸彭踞(1/4)（任务栏原文）', () => {
  assert.equal(questTitle(SANSHI_CHAIN[0]!), '斩却三尸-上尸彭踞(1/4)')
  assert.equal(questTitle(QIANJIN_CHAIN[1]!), '千金散尽-境界提升(2/2)')
  assert.equal(questTitle(JINDAN_CHAIN[0]!), '金丹大道-境界提升(1/3)')
  assert.equal(questTitle(XIANTIAN_CHAIN[0]!), '先天境界-先天大圆满(1/7)')
})

test('筑基任务(1/7)：丹田气海 20 级；(2–6/7)：五岳', () => {
  assert.deepEqual(XIANTIAN_CHAIN[0]!.goal, { kind: 'body', index: 5, level: 20 })
  const wuyue = XIANTIAN_CHAIN.slice(1, 6)
  assert.equal(wuyue.length, 5)
  for (const q of wuyue) {
    assert.equal(q.name, '剑斩五岳')
    assert.equal(q.goal.kind, 'slay')
    if (q.goal.kind !== 'slay') return
    assert.equal(q.goal.monster.attack, 2000)
    assert.equal(q.goal.monster.life, 500)
    assert.equal(q.goal.monster.agility, 3600, '敏捷 3600 = 缠斗至少一小时')
  }
  // 五属性各一，不重不漏
  const elements = wuyue.map((q) => (q.goal.kind === 'slay' ? q.goal.monster.element : null))
  assert.equal(new Set(elements).size, 5)
})

test('五岳五把锁：地名与坐标对 guides/66877-p1.txt', () => {
  const byPeak = new Map(WUYUE.map((y) => [y.peak, y]))
  assert.deepEqual(
    [byPeak.get('玉皇顶')!.province, byPeak.get('玉皇顶')!.at, byPeak.get('玉皇顶')!.monster.name],
    ['徐州', [168, 198], '肝木藏魂锁'],
  )
  assert.deepEqual(
    [byPeak.get('落雁峰')!.province, byPeak.get('落雁峰')!.at, byPeak.get('落雁峰')!.monster.name],
    ['雍州', [41, 59], '肺金伏魄锁'],
  )
  assert.deepEqual(
    [byPeak.get('天峰岭')!.province, byPeak.get('天峰岭')!.at, byPeak.get('天峰岭')!.monster.name],
    ['并州', [53, 181], '肾水固精锁'],
  )
  assert.deepEqual(
    [byPeak.get('祝融峰')!.province, byPeak.get('祝融峰')!.at, byPeak.get('祝融峰')!.monster.name],
    ['荆州', [194, 17], '心火固气锁'],
  )
  assert.deepEqual(
    [byPeak.get('峻极峰')!.province, byPeak.get('峻极峰')!.at, byPeak.get('峻极峰')!.monster.name],
    ['冀州', [100, 89], '脾土定意锁'],
  )
  assert.deepEqual(byPeak.get('玉皇顶')!.monster.element, '木')
  assert.deepEqual(byPeak.get('落雁峰')!.monster.element, '金')
})

test('斩三尸：上尸 1000/4000、中尸 4000/1000、下尸 4000/4000，敏捷均 3600', () => {
  assert.deepEqual(
    SANSHI.map((m) => [m.name, m.attack, m.life, m.agility, m.element]),
    [
      ['上尸彭踞', 1000, 4000, 3600, null],
      ['中尸彭踬', 4000, 1000, 3600, null],
      ['下尸彭蹻', 4000, 4000, 3600, null],
    ],
  )
  // 「上尸彭踞」有任务栏原文，中尸/下尸的名字是推断的
  assert.match(SANSHI_CHAIN[0]!.source, /任务栏原文/)
  assert.match(SANSHI_CHAIN[1]!.source, /reconstructed/)
})

test('千金散尽：交 100 万两给李员外（不是封测的 10 万）', () => {
  assert.deepEqual(QIANJIN_CHAIN[0]!.goal, { kind: 'silver', amount: 1_000_000, npc: '李员外' })
})

test('阅历门槛 = 345600 × {1,2,3,4,5}', () => {
  assert.equal(EXPERIENCE_UNIT, 345600)
  assert.deepEqual(EXPERIENCE_THRESHOLDS, {
    筑基期: 345600,
    辟谷期: 691200,
    心动期: 1036800,
    金丹期: 1382400,
    元婴期: 1728000,
  })
  // 各链末步的阅历条件
  assert.deepEqual(XIANTIAN_CHAIN[6]!.goal, { kind: 'experience', points: 345600 })
  assert.deepEqual(SANSHI_CHAIN[3]!.goal, { kind: 'experience', points: 691200 })
  assert.deepEqual(QIANJIN_CHAIN[1]!.goal, { kind: 'experience', points: 1036800 })
  assert.deepEqual(JINDAN_CHAIN[2]!.goal, { kind: 'experience', points: 1382400 })
})

test('境界任务奖励：境界提升 + 丹田加成', () => {
  assert.deepEqual(XIANTIAN_CHAIN[6]!.reward, { realm: '辟谷期', note: '充满丹田' })
  assert.deepEqual(SANSHI_CHAIN[3]!.reward, { realm: '心动期', dantianBonus: 5000 })
  assert.deepEqual(QIANJIN_CHAIN[1]!.reward, { realm: '金丹期', dantianBonus: 10000 })
  assert.deepEqual(JINDAN_CHAIN[2]!.reward, { realm: '元婴期', dantianBonus: 160000 })
})

test('金丹大道：结丹 → 天劫(天雷 9999/9999) → 阅历 1382400', () => {
  assert.deepEqual(JINDAN_CHAIN[0]!.goal, { kind: 'goldenCore' })
  assert.equal(JINDAN_CHAIN[1]!.goal.kind, 'slay')
  assert.deepEqual(HEAVENLY_TRIBULATION, {
    name: '天雷',
    attack: 9999,
    agility: 3600,
    life: 9999,
    element: null,
  })
  assert.equal(JINDAN_CHAIN[1]!.summary, '天雷 攻击:9999 敏捷:3600 生命:9999 属性:无')
})

test('心动→金丹的任务描述是唯一有原文的境界任务描述', () => {
  assert.equal(
    QIANJIN_DESCRIPTION[0],
    '你将最后的钱财交付李员外之后，他皱起眉头，似乎想要再劝你两句。你哈哈一笑，拂袖飘然直向山中行去。',
  )
  assert.equal(
    QIANJIN_DESCRIPTION[1],
    '在转身离去的那一瞬间，你只觉得心境空明，尘缘俗务皆尽斩断，心中再无烦恼之事。',
  )
  assert.equal(QIANJIN_CHAIN[1]!.summary, '完成任务以提升境界')
})

// ===========================================================================
// 通用不变量
// ===========================================================================

test('每条任务都带 source，id 不重复，总数 138', () => {
  for (const line of ['qi', 'sword'] as const) {
    const all = questsFor(line)
    assert.equal(all.length, 22 + 100 + 16, `${line} 线总数`)
    assert.equal(new Set(all.map((q) => q.id)).size, all.length, `${line} 线 id 不重复`)
    for (const q of all) {
      assert.ok(q.source.length > 0, `${q.id} 缺 source`)
      assert.ok(q.summary.length > 0, `${q.id} 缺任务概要`)
      assert.ok(q.step >= 1 && q.step <= q.total, `${q.id} 步数越界`)
    }
  }
})

test('questById 按线解析：同一 id 在两条线里步数不同', () => {
  assert.equal(questById('newbie:qi:1', 'qi')!.step, 4)
  assert.equal(questById('newbie:qi:1', 'sword')!.step, 12)
  assert.equal(questById('newbie:sword:1', 'qi')!.step, 11)
  assert.equal(questById('newbie:sword:1', 'sword')!.step, 4)
  assert.equal(questById('newbie:head:1', 'qi')!.step, 1)
  assert.equal(questById('newbie:tail:4', 'sword')!.step, 22)
  assert.equal(questById('没有这个任务'), undefined)
})

test('newbieChain 返回的是同一份常量（不每次重建）', () => {
  assert.equal(newbieChain('qi'), NEWBIE_QI_CHAIN)
  assert.equal(newbieChain('sword'), NEWBIE_SWORD_CHAIN)
})
