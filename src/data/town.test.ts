import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BANK_NOTES,
  BOOKS,
  MAX_COMMERCE_LEVEL,
  READ_BOOK_SILVER,
  TOWN_SCENE,
  VILLAGE_COMMERCE,
  booksReadableIn,
  commerceLevelOf,
  commerceRow,
  escortDialog,
  escortFee,
  distanceOf,
  npcsIn,
  payoutIndex,
} from './town.ts'

// —— 商业等级表（[原文-玩家整理] article-103871-p1.txt）——

test('村庄商业等级表逐条对原文：1 级 100 两→100 两/小时，30 级 2900000 两→1500 两/小时', () => {
  assert.equal(VILLAGE_COMMERCE.length, MAX_COMMERCE_LEVEL)
  assert.deepEqual(commerceRow('村庄', 1), { level: 1, invest: 100, income: 100 })
  assert.deepEqual(commerceRow('村庄', 2), { level: 2, invest: 1000, income: 110 })
  assert.deepEqual(commerceRow('村庄', 15), { level: 15, invest: 41000, income: 370 })
  assert.deepEqual(commerceRow('村庄', 29), { level: 29, invest: 2200000, income: 1400 })
  assert.deepEqual(commerceRow('村庄', 30), { level: 30, invest: 2900000, income: 1500 })
})

test('城市 30 级 = 5,800,000 两→3000 两/小时（原文给出的×2 核对点）', () => {
  assert.deepEqual(commerceRow('城池', 30), { level: 30, invest: 5_800_000, income: 3000 })
})

test('小镇 = 村庄 ×1.5，城市 = 村庄 ×2', () => {
  for (const row of VILLAGE_COMMERCE) {
    assert.equal(commerceRow('小镇', row.level).invest, row.invest * 1.5)
    assert.equal(commerceRow('小镇', row.level).income, row.income * 1.5)
    assert.equal(commerceRow('城池', row.level).invest, row.invest * 2)
    assert.equal(commerceRow('城池', row.level).income, row.income * 2)
  }
})

test('商业等级上限 30，投得再多也不涨', () => {
  assert.equal(commerceLevelOf('村庄', 99), 0)
  assert.equal(commerceLevelOf('村庄', 100), 1)
  assert.equal(commerceLevelOf('村庄', 999), 1)
  assert.equal(commerceLevelOf('村庄', 1000), 2)
  assert.equal(commerceLevelOf('村庄', 2_900_000), 30)
  assert.equal(commerceLevelOf('村庄', 99_999_999), 30)
})

// —— 镖局（[原文] article-101916 / article-102765）——

test('运镖报价还原原文算例：Lv.1 村 → 约 105 格 = 3465 两', () => {
  assert.equal(payoutIndex('村庄', 1), 33)
  assert.equal(escortFee('村庄', 1, 105), 3465)
})

test('镖局老板对话里的收益指数还原原文：Lv.29 镇 = 262', () => {
  assert.equal(payoutIndex('小镇', 29), 262)
})

test('镖局老板对话逐字照原版（地球镇 Lv.29）', () => {
  const said = escortDialog({ kind: '小镇', name: '地球镇', x: 28, y: 106, level: 29 })
  assert.equal(
    said,
    [
      '地球镇(28,106)镖局老板：',
      '　　欢迎来到地球镇(28,106)的镖局，俺是本镇的镖局老板，负责管理本镇的镖货往来。',
      '　　本镇目前商业等级为Lv.29，运镖的收益指数为262。',
      '　　你同意的话，那就在下面的列表中选择好你愿意去的州县，俺再告诉你具体的方位。',
      '　　[领取运镖任务]',
    ].join('\n'),
  )
})

test('村版对话把「本镇」换成「本村」', () => {
  const said = escortDialog({ kind: '村庄', name: '无名村', x: 1, y: 2, level: 1 })
  assert.match(said, /俺是本村的镖局老板，负责管理本村的镖货往来。/)
  assert.match(said, /本村目前商业等级为Lv\.1，运镖的收益指数为33。/)
})

test('两地距离按直线算', () => {
  assert.equal(Math.round(distanceOf({ x: 0, y: 0 }, { x: 3, y: 4 })), 5)
})

// —— 书籍（[原文] 游戏内指南截图 #112）——

test('书籍阅历表照原版：四档场景、五档阅历、共 18 本', () => {
  assert.equal(BOOKS.length, 18)
  const byName = (n: string) => BOOKS.find((b) => b.name === n)!

  for (const n of ['三国演义', '西游记', '水浒传', '红楼梦']) {
    assert.equal(byName(n).experience, 10000)
    assert.deepEqual(byName(n).scenes, ['村庄', '小镇', '城池'])
  }
  for (const n of ['聊斋志异', '搜神记', '镜花缘', '封神演义']) {
    assert.equal(byName(n).experience, 20000)
    assert.deepEqual(byName(n).scenes, ['小镇', '城池'])
  }
  for (const n of ['警世通言', '醒世恒言', '喻世明言']) {
    assert.equal(byName(n).experience, 30000)
    assert.deepEqual(byName(n).scenes, ['城池'])
  }
  for (const n of ['菜根谭', '围炉夜话', '小窗幽记']) {
    assert.equal(byName(n).experience, 40000)
    assert.deepEqual(byName(n).scenes, ['城池'])
  }
  for (const n of ['世说新语', '三国志', '资治通鉴', '史记']) {
    assert.equal(byName(n).experience, 50000)
    assert.deepEqual(byName(n).scenes, ['城池'])
  }
})

test('书籍物品 id 是 1101–1118 的连号（原版 itemmid 编码）', () => {
  assert.deepEqual(
    BOOKS.map((b) => b.id),
    Array.from({ length: 18 }, (_, i) => 1101 + i),
  )
  assert.equal(BOOKS[0]!.name, '三国演义')
  assert.equal(BOOKS[17]!.name, '史记')
})

test('私塾先生只列出本场景读得了的书：村庄 4 本、小镇 8 本、城池 18 本', () => {
  assert.equal(booksReadableIn('村庄').length, 4)
  assert.equal(booksReadableIn('小镇').length, 8)
  assert.equal(booksReadableIn('城池').length, 18)
})

test('读一本书约 1000 两', () => {
  assert.equal(READ_BOOK_SILVER, 1000)
})

// —— 银票 ——

test('银票恰好 9 种面额，一万两到五百万两', () => {
  assert.equal(BANK_NOTES.length, 9)
  assert.deepEqual(
    BANK_NOTES.map((n) => n.name),
    [
      '一万两银票',
      '两万两银票',
      '五万两银票',
      '十万两银票',
      '二十万两银票',
      '五十万两银票',
      '一百万两银票',
      '二百万两银票',
      '五百万两银票',
    ],
  )
  assert.deepEqual(
    BANK_NOTES.map((n) => n.value),
    [10000, 20000, 50000, 100000, 200000, 500000, 1000000, 2000000, 5000000],
  )
})

// —— NPC 与场景 ——

test('驿站与李员外只在城池，其余 NPC 三种场景都有', () => {
  assert.deepEqual(npcsIn('村庄').map((n) => n.id), ['escort', 'school', 'bank', 'chief'])
  assert.deepEqual(npcsIn('小镇').map((n) => n.id), ['escort', 'school', 'bank', 'chief'])
  assert.deepEqual(npcsIn('城池').map((n) => n.id), ['escort', 'school', 'bank', 'chief', 'station', 'li'])
})

test('村长 / 镇长 / 太守随场景改称呼', () => {
  const chief = npcsIn('城池').find((n) => n.id === 'chief')!
  assert.equal(chief.nameOf('村庄'), '村长')
  assert.equal(chief.nameOf('小镇'), '镇长')
  assert.equal(chief.nameOf('城池'), '太守')
})

test('场景移动耗时与开服出现周照官方 FAQ：村庄 20 分/1 周、小镇 30 分/2 周、城池 40 分/3 周', () => {
  assert.deepEqual(TOWN_SCENE['村庄'], { moveSeconds: 1200, openWeek: 1 })
  assert.deepEqual(TOWN_SCENE['小镇'], { moveSeconds: 1800, openWeek: 2 })
  assert.deepEqual(TOWN_SCENE['城池'], { moveSeconds: 2400, openWeek: 3 })
})
