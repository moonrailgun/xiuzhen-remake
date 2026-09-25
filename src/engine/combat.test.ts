import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  resolveBattle,
  generationBonus,
  tangleDuration,
  isCountering,
  COUNTER_MULTIPLIER,
  guardHoldSeconds,
  defenseOrder,
  type CombatSword,
} from './combat.ts'

// —— 44 场真实战报（6944 条飞剑记录），来源见 tools/fixtures/parse_battle_reports.py ——
type ReportSword = {
  owner: string
  quality: string
  name: string
  refine: number
  attack: number
  durability: number
  damage_taken: number
  result: string
}
type Report = {
  source: string
  date: string
  attacker_swords: ReportSword[]
  defender_swords: ReportSword[]
  half_table: boolean
}
const reports: Report[] = JSON.parse(
  readFileSync(new URL('../../tools/fixtures/battle-reports.json', import.meta.url), 'utf8'),
)
const allSwords = reports.flatMap((r) => [...r.attacker_swords, ...r.defender_swords])

// —————————————————— 对真实战报的不变量 ——————————————————
// 这些是从 6944 条原版输出里观察到的、零反例的规律。改了结算逻辑若违反，说明改错了。

test('战报夹具规模：44 场 / 6944 条飞剑记录', () => {
  assert.equal(reports.length, 44)
  assert.equal(allSwords.length, 6944)
})

test('不变量①：受到伤害从不超过耐久（说明显示值被截断到耐久）', () => {
  for (const s of allSwords) {
    assert.ok(
      s.damage_taken <= s.durability,
      `${s.quality}${s.name}+${s.refine} 伤害 ${s.damage_taken} > 耐久 ${s.durability}`,
    )
  }
})

test('不变量②：受到伤害 == 耐久 ⇔ 惨被斩断', () => {
  for (const s of allSwords) {
    const atCap = s.damage_taken === s.durability
    const broken = s.result === '惨被斩断'
    assert.equal(atCap, broken, `${s.quality}${s.name}+${s.refine} 伤害${s.damage_taken}/耐久${s.durability} → ${s.result}`)
  }
})

test('不变量③：结果只有「完好无损」「惨被斩断」两种', () => {
  const kinds = new Set(allSwords.map((s) => s.result))
  assert.deepEqual([...kinds].sort(), ['完好无损', '惨被斩断'])
})

test('不变量④：所有数值非负，耐久为正', () => {
  for (const s of allSwords) {
    assert.ok(s.attack >= 0 && s.damage_taken >= 0 && s.durability > 0, JSON.stringify(s))
  }
})

test('战报里出现过的淬炼等级：见到 +15（比归档记录的 +12 更高）', () => {
  const max = Math.max(...allSwords.map((s) => s.refine))
  assert.ok(max >= 15, `实际最高 +${max}`)
})

// —————————————————— 结算逻辑 ——————————————————

const sword = (o: Partial<CombatSword> & { id: string }): CombatSword => ({
  name: '测试剑',
  element: null,
  attack: 100,
  durability: 100,
  agility: 3,
  ...o,
})

test('断剑判定：对方总攻击 ÷ 我方剑数 ≥ 我方单剑耐久 → 断', () => {
  // 原文：「对方飞剑总攻击 ÷ 我方飞剑数 > 我方单把飞剑耐久 → 该剑损坏」
  const a = [sword({ id: 'a1', attack: 200 })]
  const d = [sword({ id: 'd1', durability: 100 }), sword({ id: 'd2', durability: 100 })]
  const r = resolveBattle(a, d)
  // 200 ÷ 2 = 100 ≥ 100 → 都断
  assert.equal(r.defender.every((x) => x.broken), true)
})

test('断剑判定：摊不到耐久就不断，且伤害如实记录', () => {
  const a = [sword({ id: 'a1', attack: 100 })]
  const d = [sword({ id: 'd1', durability: 100 }), sword({ id: 'd2', durability: 100 })]
  const r = resolveBattle(a, d)
  // 100 ÷ 2 = 50 < 100 → 不断，伤害 50
  assert.deepEqual(r.defender.map((x) => x.broken), [false, false])
  assert.deepEqual(r.defender.map((x) => x.damageTaken), [50, 50])
})

test('剑多可以分摊伤害（原版「以剑数摊伤害」的战术基础）', () => {
  const a = [sword({ id: 'a1', attack: 300 })]
  const few = resolveBattle(a, [sword({ id: 'd1', durability: 200 })])
  const many = resolveBattle(a, [
    sword({ id: 'd1', durability: 200 }),
    sword({ id: 'd2', durability: 200 }),
  ])
  assert.equal(few.defender[0]!.broken, true, '一把剑硬吃 300 → 断')
  assert.equal(many.defender.every((x) => x.broken), false, '两把剑各摊 150 → 不断')
})

test('相克：判定断剑时额外 ×150%', () => {
  assert.equal(isCountering('金', '木'), true, '金克木')
  assert.equal(isCountering('木', '金'), false)
  assert.equal(COUNTER_MULTIPLIER, 1.5)

  // 攻击 70 对耐久 100：不克不断；相克后 70×1.5=105 ≥ 100 → 断
  const atk = (el: 'null' | '金') => [sword({ id: 'a1', attack: 70, element: el === '金' ? '金' : null })]
  const def = () => [sword({ id: 'd1', durability: 100, element: '木' })]
  assert.equal(resolveBattle(atk('null'), def()).defender[0]!.broken, false)
  assert.equal(resolveBattle(atk('金'), def()).defender[0]!.broken, true)
})

test('混合属性攻击只给克制目标的那部分伤害加成', () => {
  // 官方算例按单一属性攻击分摊后判断相克，不能把不相克的火剑一起乘 150%。
  const result = resolveBattle([
    sword({ id: 'gold', element: '金', attack: 100 }),
    sword({ id: 'fire', element: '火', attack: 100 }),
  ], [sword({ id: 'wood', element: '木', durability: 260 })])
  assert.equal(result.defender[0]!.damageTaken, 250)
  assert.equal(result.defender[0]!.broken, false)
})

test('相生：把自身攻击与耐久的一半加给所生属性的剑，按数量平分', () => {
  // 金生水：金剑 100/100 → 给水剑 +50 攻 +50 耐
  const swords = [
    sword({ id: 'jin', element: '金', attack: 100, durability: 100 }),
    sword({ id: 'shui', element: '水', attack: 10, durability: 10 }),
  ]
  const b = generationBonus(swords)
  assert.deepEqual(b.get('shui'), { attack: 50, durability: 50 })
  assert.deepEqual(b.get('jin'), { attack: 0, durability: 0 }, '金剑自己不受益')
})

test('相生：被生的剑有多把时平分加成', () => {
  const swords = [
    sword({ id: 'jin', element: '金', attack: 100, durability: 100 }),
    sword({ id: 's1', element: '水' }),
    sword({ id: 's2', element: '水' }),
  ]
  const b = generationBonus(swords)
  assert.deepEqual(b.get('s1'), { attack: 25, durability: 25 })
  assert.deepEqual(b.get('s2'), { attack: 25, durability: 25 })
})

test('相生加成计入总攻击（影响对方断剑判定）', () => {
  const plain = resolveBattle(
    [sword({ id: 'a', element: '水', attack: 100 })],
    [sword({ id: 'd', durability: 120 })],
  )
  const boosted = resolveBattle(
    [sword({ id: 'a', element: '水', attack: 100 }), sword({ id: 'g', element: '金', attack: 100, durability: 0 })],
    [sword({ id: 'd', durability: 120 })],
  )
  assert.equal(plain.defender[0]!.broken, false, '100 < 120 不断')
  // 金剑自身 100 + 给水剑的 +50 → 总攻击 250 ≥ 120
  assert.equal(boosted.defender[0]!.broken, true)
})

test('缠斗时长 = 双方敏捷之和（秒）', () => {
  const a = [sword({ id: 'a1', agility: 100 }), sword({ id: 'a2', agility: 200 })]
  const d = [sword({ id: 'd1', agility: 50 })]
  assert.equal(tangleDuration(a, d), 350)
  assert.equal(resolveBattle(a, d).tangleSeconds, 350)
})

test('空场：一方没有剑时不报错', () => {
  const r = resolveBattle([sword({ id: 'a' })], [])
  assert.deepEqual(r.defender, [])
  assert.equal(r.attacker[0]!.damageTaken, 0, '没有对手就不受伤')
  assert.equal(r.attacker[0]!.broken, false)
})

test('结算结果里每把剑都有对应记录', () => {
  const a = [sword({ id: 'a1' }), sword({ id: 'a2' })]
  const d = [sword({ id: 'd1' })]
  const r = resolveBattle(a, d)
  assert.deepEqual(r.attacker.map((x) => x.id), ['a1', 'a2'])
  assert.deepEqual(r.defender.map((x) => x.id), ['d1'])
})

test('结算是纯函数：重复调用结果一致', () => {
  const a = [sword({ id: 'a1', element: '火' })]
  const d = [sword({ id: 'd1', element: '金' })]
  assert.deepEqual(resolveBattle(a, d), resolveBattle(a, d))
})

// —— 护身迎敌（官方攻略《护身揭密》原文）——

test('护身先迎敌，飞剑排在后面', () => {
  const guard = sword({ id: 'g', defensiveOnly: true, agility: 5760 })
  const blade = sword({ id: 'b', agility: 3 })
  const order = defenseOrder([blade, guard])
  assert.equal(order[0]!.id, 'g', '护身应排在最前')
  assert.equal(order[1]!.id, 'b')
})

test('护身抵挡时长 = 护身敏捷之和，飞剑不计入', () => {
  const guard = sword({ id: 'g', defensiveOnly: true, agility: 5760 })
  const blade = sword({ id: 'b', agility: 300 })
  assert.equal(guardHoldSeconds([guard, blade]), 5760, '只算护身')
  assert.equal(guardHoldSeconds([blade]), 0, '没有护身就撑不住')
})

test('护身能撑到护法赶来，飞剑撑不住（攻略里的对比）', () => {
  // 攻略：飞剑 +6/+7 敏捷不过 300 多（约 5 分钟）；+5 的最低级护身能撑 1.6 小时
  const blade = sword({ id: 'b', agility: 384 })
  const guard = sword({ id: 'g', defensiveOnly: true, agility: 180 * 32 }) // 上品指玄道藏碑 +5
  assert.ok(guardHoldSeconds([blade]) / 60 < 1, '只有飞剑时几乎没有缓冲')
  const hours = guardHoldSeconds([guard]) / 3600
  assert.ok(hours > 1.5 && hours < 1.7, `护身撑 ${hours.toFixed(2)} 小时`)
})

test('★断一把就重新分摊：102139#L45 四把古纹青石剑全断', () => {
  // 真实战报（2009-07-01）：攻方单剑攻击 108748，守方四把同款极品古纹青石剑
  // 耐久 640/2560/20480/40960，四把**全部**「惨被斩断」。
  // 同名 ⇒ 同属性 ⇒ 守方内部无相生、攻方对四把的相克倍率一致，所以这是个
  // 与五行无关的干净反例：一次性均摊最多算出 108748×1.5/4 = 40780 < 40960。
  const sword = (id: string, durability: number) => ({
    id, name: '古纹青石剑', element: null, attack: 0, durability, agility: 1,
  })
  const attacker = [{ id: 'a', name: '三阳一煞剑', element: null, attack: 108748, durability: 221184, agility: 1 }]
  const defenders = [sword('d0', 640), sword('d1', 2560), sword('d2', 20480), sword('d3', 40960)]
  const r = resolveBattle(attacker, defenders)
  assert.deepEqual(r.defender.map((o) => o.broken), [true, true, true, true])
  assert.deepEqual(r.defender.map((o) => o.damageTaken), [640, 2560, 20480, 40960], '断了就是打满耐久')
})

test('★战报打印的攻击/耐久含相生，不会出现「伤害 > 同一行的耐久」', () => {
  // 金生水：金剑把自身一半加给水剑。以前战报打面板值、伤害按有效值截断，
  // 于是能印出「耐久 100 / 受到伤害 130 / 完好无损」这种自相矛盾的行。
  const gold = { id: 'g', name: '金剑', element: '金' as const, attack: 0, durability: 100, agility: 1 }
  const water = { id: 'w', name: '水剑', element: '水' as const, attack: 0, durability: 100, agility: 1 }
  const enemy = [{ id: 'e', name: '敌剑', element: null, attack: 260, durability: 1e9, agility: 1 }]
  const r = resolveBattle([gold, water], enemy)
  for (const o of r.attacker) {
    assert.ok(o.damageTaken <= o.durability, `受到伤害 ${o.damageTaken} 不该超过耐久 ${o.durability}`)
    assert.equal(o.damageTaken === o.durability, o.broken, '伤害 == 耐久 ⇔ 惨被斩断')
  }
  assert.equal(r.attacker[1]!.durability, 150, '水剑有效耐久 = 100 + 金剑 100/2')
})
