/**
 * 选择器的单测。
 *
 * 守的是「七个主标签接的是真实存档，不是夹具」这条线：
 * 每个页面的关键字段都要能从 `GameState` 推出来，改了引擎这里就该红。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  skillVm,
  skillLevels,
  skillNodeById,
  itemVm,
  itemListGroups,
  swordCraftRows,
  guardCraftRows,
  refineRows,
  tradeVm,
  allyVm,
  msgVm,
  artifactLabel,
  TRADE_PAGE_SIZE,
  townHere,
  townKey,
  sceneNpcNames,
  refinePairAt,
  REFINE_ROW_BASE,
} from './vm.ts'
import { newGame } from '../engine/game.ts'
import { refillNpcOrders } from '../engine/market.ts'
import { SWORDS } from '../data/swords.ts'
import { terrainAt } from '../data/world.ts'
import type { Artifact, FiveQi, GameState } from '../engine/state.ts'

const base = (): GameState => newGame({
  name: '逆神猪', gender: 'm', element: '水', school: '昆仑', x: 100, y: 100, seed: 7,
}, 0)

const withQi = (s: GameState, v: number): GameState => ({
  ...s,
  player: { ...s.player, qi: [v, v, v, v, v] as unknown as FiveQi },
})

const item = (over: Partial<Artifact>): Artifact => ({
  id: 'a1', kind: 'sword', name: '玉虚桃木剑', quality: '凡品',
  refine: 0, status: '空闲', count: 1, ...over,
})

const withItems = (s: GameState, items: Artifact[]): GameState =>
  ({ ...s, player: { ...s.player, artifacts: items } })

// —— 法术页 ——

test('法术等级按名字存、按节点 id 取，两边对得上', () => {
  const s = { ...base(), player: { ...base().player, skills: { 铸剑之术: 5 } } }
  const levels = skillLevels(s)
  const node = skillNodeById(103)!
  assert.equal(node.name, '铸剑之术')
  assert.equal(levels[103], 5)
  assert.equal(levels[102], 0, '没学过的法术是 0，不是 undefined')
})

test('法术页三棵树的节点全部有等级条目', () => {
  const vm = skillVm(base(), 'produce')
  // 炼器 6 + 剑术 6 + 术数 6
  assert.equal(Object.keys(vm.levels).length, 18)
  assert.equal(vm.school, '昆仑')
})

// —— 法宝页 ——

test('法宝一览按种类分组，忙碌的物品不给 itemsn（radio 会变 value=0）', () => {
  const s = withItems(base(), [
    item({ id: 'a1' }),
    item({ id: 'a2', status: '斩杀中' }),
    item({ id: 'a3', kind: 'pill', name: '一炼紫金丹', count: 3 }),
  ])
  const groups = itemListGroups(s)
  assert.deepEqual(groups.map((g) => g.id), [1, 2])

  const swords = groups[0]!.items
  assert.equal(swords[0]!.itemsn, 1, '空闲的给 itemsn')
  assert.equal(swords[1]!.itemsn, undefined, '忙碌的不给 itemsn')
  assert.equal(swords[1]!.status, '斩杀中')
  assert.equal(groups[1]!.items[0]!.count, 3, '堆叠数量要带上')
})

test('显示名 = 品质 + 名称 + 淬炼后缀（照原版物品窗）', () => {
  assert.equal(artifactLabel(item({ quality: '极品', refine: 4 })), '极品玉虚桃木剑+4')
  assert.equal(artifactLabel(item({ quality: '凡品', refine: 0 })), '凡品玉虚桃木剑')
})

test('★炼制飞剑页列全 14 把剑，消耗按本命属性重投影', () => {
  const s = withQi(base(), 100000) // 水属性角色
  const rows = swordCraftRows(s)
  assert.equal(rows.length, 14)

  const yuxu = rows.find((r) => r.name === '玉虚桃木剑')!
  // 夹具本身就是水属性读数，所以水属性角色应原样吻合
  assert.deepEqual([...yuxu.cost!], [...SWORDS[0]!.craftCost!])

  // 换成木属性：总量不变，只是按生克关系换位
  const wood = swordCraftRows(withQi({ ...s, player: { ...s.player, element: '木' } }, 100000))
  const woodYuxu = wood.find((r) => r.name === '玉虚桃木剑')!
  assert.notDeepEqual([...woodYuxu.cost!], [...yuxu.cost!])
  assert.equal(
    woodYuxu.cost!.reduce((a, b) => a + b, 0),
    yuxu.cost!.reduce((a, b) => a + b, 0),
    '换属性只换位，总量不变',
  )
})

test('★转录不全的剑列出来但不可炼（不编数值）', () => {
  const rows = swordCraftRows(withQi(base(), 10 ** 9))
  const broken = rows.find((r) => r.name === '三阴绝脉剑')!
  assert.equal(broken.craftable, null, '缺配方的剑不能炼')
  assert.equal(broken.cost, undefined)
})

test('炼制数量 = 当前真气能撑几件；级别不够是 null', () => {
  const rich = swordCraftRows(withQi(base(), 1000)).find((r) => r.name === '玉虚桃木剑')!
  // 玉虚桃木剑水属性消耗 金95 木95 水140 火120 土48 → 1000/140 = 7
  assert.equal(rich.craftable, 7)
  const poor = swordCraftRows(base()).find((r) => r.name === '玉虚桃木剑')!
  assert.equal(poor.craftable, 0, '真气为 0 时是 0，不是 null（等级够就不写未满足）')
})

test('护身页：有数值的可炼，只知道名字的列出来但不可炼', () => {
  const s = { ...withQi(base(), 10 ** 6), player: { ...base().player, skills: { 灵宝真经: 1 }, qi: [10 ** 6, 10 ** 6, 10 ** 6, 10 ** 6, 10 ** 6] as unknown as FiveQi } }
  const rows = guardCraftRows(s)
  assert.equal(rows[0]!.name, '指玄道藏碑')
  assert.ok((rows[0]!.craftable ?? 0) > 0)
  assert.ok(rows.slice(1).every((r) => r.craftable === null), '无数值的一律不可炼')
})

test('淬炼页只列出凑得出一对的法宝', () => {
  const one = refineRows(withItems(base(), [item({ id: 'a1' })]))
  assert.equal(one.length, 0, '只有一把淬不了')

  const pair = refineRows(withItems(base(), [item({ id: 'a1' }), item({ id: 'a2' })]))
  assert.equal(pair.length, 1)
  assert.equal(pair[0]!.craftable, 1)

  // 品质不同的凑不成一对（原版要求「完全相同」）
  const mixed = refineRows(withItems(base(), [item({ id: 'a1' }), item({ id: 'a2', quality: '上品' })]))
  assert.equal(mixed.length, 0)

  // 忙碌中的不能淬
  const busy = refineRows(withItems(base(), [item({ id: 'a1' }), item({ id: 'a2', status: '斩杀中' })]))
  assert.equal(busy.length, 0)
})

test('法宝一览的已用格数按堆叠数算', () => {
  const vm = itemVm(withItems(base(), [item({ count: 3 }), item({ id: 'a2' })]), 'list')
  assert.equal(vm.tab, 'list')
  assert.equal(vm.tab === 'list' ? vm.used : -1, 4)
  assert.equal(vm.tab === 'list' ? vm.capacity : -1, 5, '袖里乾坤 0 级 = 5 格')
})

// —— 交易页 ——

test('★交易页只显示别人已上架的单，自己的单归「我的挂单」', () => {
  const s = refillNpcOrders(base())
  const mine = {
    id: 'me:1', seller: s.player.name, listed: true,
    offer: { element: '金' as const, amount: 100 },
    want: { element: '木' as const, amount: 100 },
  }
  const withMine = { ...s, market: { ...s.market, qi: [...s.market.qi, mine] } }
  const { vm, sheets } = tradeVm(withMine, 'buyqi', 1)
  assert.ok(vm.qiOffers.length > 0)
  assert.ok(!sheets.ids.includes('me:1'), '自己的单不出现在购买页')
  assert.equal(vm.myQiOffers.length, 1)
})

test('交易页每页 10 行，sheet 号能反查回真实挂单 id', () => {
  const s = refillNpcOrders(base())
  const { vm, sheets } = tradeVm(s, 'buyqi', 1)
  assert.equal(vm.qiOffers.length, TRADE_PAGE_SIZE)
  assert.equal(sheets.ids.length, TRADE_PAGE_SIZE)
  assert.equal(vm.pager.pages, 2, '12 单 → 2 页')

  const second = tradeVm(s, 'buyqi', 2)
  assert.equal(second.vm.qiOffers.length, 2)
  assert.notEqual(second.sheets.ids[0], sheets.ids[0])
})

test('交易页筛选「我用 X 换 Y」站在买家角度（X 对应挂单的需求列）', () => {
  const s = refillNpcOrders(base())
  const { vm } = tradeVm(s, 'buyqi', 1, { give: '金', want: '' })
  assert.ok(vm.qiOffers.every((o) => o.want === '金'))
})

test('只有空闲的极品法宝能挂到出售法宝页', () => {
  const s = withItems(base(), [
    item({ id: 'a1', quality: '极品' }),
    item({ id: 'a2', quality: '极品', status: '斩杀中' }),
    item({ id: 'a3', quality: '上品' }),
  ])
  const { vm } = tradeVm(s, 'sellitem', 1)
  assert.equal(vm.sellable.length, 1)
  assert.equal(vm.sellable[0]!.name, '极品玉虚桃木剑')
})

// —— 门派页 / 收件箱 ——

test('门派 = 道源，成员只收同道源的人，掌门是道行最高的那个', () => {
  const s = base() // 昆仑
  const vm = allyVm(s, 'member', 1)
  assert.equal(vm.name, '昆仑派')
  assert.ok(vm.members.length > 0)
  assert.equal(vm.members[0]!.job, '掌门')
  assert.equal(vm.leader.name, vm.members[0]!.name)
  assert.ok(vm.intro.includes('昆仑'))
})

test('收件箱分页，未读标记跟着存档走', () => {
  const mail = Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`, subject: `战报${i}`, from: '系统', at: i * 60,
    read: i % 2 === 0, body: {}, kind: 'battle' as const,
  }))
  const vm = msgVm({ ...base(), mail }, 1)
  assert.equal(vm.rows.length, 10)
  assert.equal(vm.pages, 2)
  assert.equal(vm.rows[0]!.unread, false)
  assert.equal(vm.rows[1]!.unread, true)
  assert.match(vm.rows[0]!.sentAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
})

// —— 城镇 ——

test('★不在城镇上时场景里没有 NPC；踩到城镇上才有', () => {
  const s = base()
  // 找一格村/镇/城，把人挪过去
  let found: { x: number; y: number } | null = null
  for (let x = 0; x < 60 && !found; x++) {
    for (let y = 0; y < 60; y++) {
      const t = terrainAt(s.worldSeed, x, y, 99)
      if (t === '村庄' || t === '小镇' || t === '城池') { found = { x, y }; break }
    }
  }
  assert.ok(found, '世界里应该有城镇')

  const wild = { ...s, player: { ...s.player, x: 1, y: 1 } }
  if (!['村庄', '小镇', '城池'].includes(terrainAt(s.worldSeed, 1, 1, 99))) {
    assert.equal(townHere(wild), null)
    assert.deepEqual([...sceneNpcNames(wild)], [])
  }

  const inTown = {
    ...s,
    clock: { ...s.clock, gameT: 40 * 86400 }, // 开服 4 周后城镇才全开
    player: { ...s.player, x: found!.x, y: found!.y },
  }
  const here = townHere(inTown)
  assert.ok(here, '站在城镇上应该取到镇')
  assert.equal(here!.fresh, true, '第一次踩上去是新生成的')
  assert.ok(sceneNpcNames(inTown).includes('镖局老板'))
  assert.ok(sceneNpcNames(inTown).includes('私塾先生'))
})

test('城镇一旦入档就不再重新生成（投资不会被抹掉）', () => {
  const s = base()
  const town = {
    id: '10,10', kind: '小镇' as const, name: '地球镇', x: 10, y: 10,
    investments: [{ owner: '逆神猪', silver: 5000 }],
  }
  const saved = {
    ...s,
    clock: { ...s.clock, gameT: 40 * 86400 },
    player: { ...s.player, x: 10, y: 10 },
    towns: { [townKey(10, 10)]: town },
  }
  if (townHere(saved)) {
    const here = townHere(saved)!
    assert.equal(here.fresh, false)
    assert.equal(here.town.investments.length, 1)
  }
})

// —— 淬炼的行号反查 ——

test('★淬炼页的行号能反查回那一对法宝（不能当成炼制的物品号）', () => {
  const s = withItems(base(), [
    item({ id: 'a1' }),
    item({ id: 'a2' }),
    item({ id: 'b1', name: '青龙伏魔剑' }),
    item({ id: 'b2', name: '青龙伏魔剑' }),
  ])
  const rows = refineRows(s)
  assert.equal(rows.length, 2)
  // 行号落在专用区间，不会和飞剑(501xx)/护身(601xx)/丹药(3 位)撞
  assert.ok(rows.every((r) => r.itemId >= REFINE_ROW_BASE))

  assert.deepEqual(refinePairAt(s, rows[0]!.itemId), ['a1', 'a2'])
  assert.deepEqual(refinePairAt(s, rows[1]!.itemId), ['b1', 'b2'])
  assert.equal(refinePairAt(s, REFINE_ROW_BASE + 99), null, '越界要返回 null')
})

test('淬炼行号与炼制物品号不会互相误认', () => {
  const s = withItems(base(), [item({ id: 'a1' }), item({ id: 'a2' })])
  const swordIds = swordCraftRows(s).map((r) => r.itemId)
  const refineIds = refineRows(s).map((r) => r.itemId)
  for (const id of refineIds) assert.ok(!swordIds.includes(id), `${id} 与炼制页撞号`)
})
