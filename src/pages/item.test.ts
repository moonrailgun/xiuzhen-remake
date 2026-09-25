import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  renderItem,
  pillRows,
  ITEM_STATUSES,
  ITEM_TABS,
  PILL_NAMES,
  type CraftRow,
  type ItemVm,
} from './item.ts'

// tools/fixtures/swords.json = 14 把剑的原版数值（SRC: forum162/article-94153-p1，水属性角色视角）
type SwordFixture = {
  readonly name: string
  readonly craftCost: readonly number[] | null
  readonly craftSeconds: number | null
}
const swords: readonly SwordFixture[] = (
  JSON.parse(readFileSync(new URL('../../tools/fixtures/swords.json', import.meta.url), 'utf8')) as {
    swords: readonly SwordFixture[]
  }
).swords

const sword = (name: string): SwordFixture => {
  const s = swords.find((x) => x.name === name)
  assert.ok(s, `fixture 里没有 ${name}`)
  return s
}

// —— 一览页 ——

const listVm = (): ItemVm => ({
  tab: 'list',
  used: 1,
  capacity: 5,
  groups: [
    {
      id: 1,
      items: [
        { name: '上品玉虚桃木剑', itemId: 50003, itemsn: 242407, status: '空闲' },
        // 31:23:08 = 112988 秒（DOM 样本贴的 start=113087 与显示文字差了 99 秒，
        // 是玩家复制页面时倒计时已经走过一段，取显示文字为准）
        { name: '上品太乙金光剑+4', itemId: 50903, quality: 4, status: '绞杀中', seconds: 112988 },
        { name: '太乙金光剑', itemId: 50901, quality: -1, count: 15 },
      ],
    },
    { id: 2, items: [{ name: '一炼碧罗丹', itemId: 201, itemsn: 900, count: 7, status: '空闲' }] },
  ],
})

test('一览页墨迹条写「拥有法宝(1/5)」——对着 2008-10 原生截图 #121', () => {
  const h = renderItem(listVm())
  assert.ok(h.includes('class=titlebg2'))
  assert.ok(h.includes(`hlp('拥有法宝')`))
  assert.ok(h.includes('<SPAN class=smallbold>(1/5)</SPAN>'))
  assert.ok(h.includes('src="img/title/titleitem.gif"'), '一览页横幅是「法 宝」')
})

test('一览页骨架照原版 DOM：tablebg 表 + 分组标题 + radio 单选 + 右侧 20% 操作列', () => {
  const h = renderItem(listVm())
  assert.ok(h.includes('<TABLE class="tablebg middle" cellSpacing=1 cellPadding=2 width=460 border=0>'))
  assert.ok(h.includes(`hlp('飞剑')`) && h.includes(`hlp('护身法宝')`), '分组标题「飞剑与护身法宝」')
  assert.ok(h.includes('name=selectitem1') && h.includes('name=selectitem2'), '分组号即 selectitem{N}')
  assert.ok(h.includes('<TD vAlign=top width="20%">'))
  for (const op of ['提升品质', '全部提升', '出售', '销毁', '修理']) {
    assert.ok(h.includes(`&nbsp;${op}</A>`), `缺操作 ${op}`)
  }
  assert.ok(h.includes('sendUpgradeAllItem()') && h.includes('sendRepairItem()'))
  assert.ok(h.includes('点击物品名称可以查看关于此物品更详细的信息。'), '页脚注意事项')
})

test('忙碌物品 radio value=0，链接退化成 quality= 不给 itemsn', () => {
  const h = renderItem(listVm())
  assert.ok(h.includes('<INPUT type=radio value=242407 name=selectitem1>'), '空闲物品给 itemsn')
  assert.ok(h.includes(`itemmid.jsp?itemsn=242407&item=50003`))
  assert.ok(h.includes('<INPUT type=radio value=0 name=selectitem1>'), '忙碌物品 value=0')
  assert.ok(h.includes(`itemmid.jsp?quality=4&item=50903`))
  // 炼制队列里的成品 quality=-1
  assert.ok(h.includes(`itemmid.jsp?quality=-1&item=50901`))
})

test('同种物品堆叠显示 ×N，带省略号的状态后面跟倒计时', () => {
  const h = renderItem(listVm())
  assert.ok(h.includes('×15'), '太乙金光剑 ×15')
  assert.ok(h.includes('×7'), '一炼碧罗丹 ×7')
  // DOM 原文的绞杀倒计时显示为 31:23:08
  assert.ok(h.includes('<SPAN class=smallgray>绞杀中...<SPAN class=countdown start="112988">31:23:08</SPAN></SPAN>'))
  assert.ok(h.includes('<SPAN class=smallgray>空闲</SPAN>'), '空闲没有倒计时')
})

test('物品状态文案共 9 种', () => {
  assert.deepEqual([...ITEM_STATUSES], [
    '空闲', '损坏', '斩杀中', '绞杀中', '返回中', '淬炼中', '炼制中', '注入中', '修理中',
  ])
})

// —— 子标签 ——

test('五个子标签；淬炼 = item.jsp?tab=4（DOM 原文），一览是默认页无参数', () => {
  assert.deepEqual(ITEM_TABS.map((t) => t.label), ['一览', '飞剑', '护身', '丹药', '淬炼'])
  assert.equal(ITEM_TABS[0]!.href, 'item.jsp')
  assert.equal(ITEM_TABS[4]!.href, 'item.jsp?tab=4')
  assert.equal(ITEM_TABS[3]!.href, 'item.jsp?tab=3', '丹药：hide=1&tab=3 跳转证据')
  const h = renderItem(listVm())
  assert.ok(h.includes('<A class=skillup href="item.jsp?tab=4">淬炼</A>'))
})

// —— 炼制飞剑 ——

/** 截图 #155 的前四行（05 §2.1 逐字转录），五行顺序金木水火土。 */
const CRAFT_SHOT: readonly (readonly [string, number, readonly [number, number, number, number, number], number | null])[] = [
  ['玉虚桃木剑', 1, [140, 144, 71, 48, 95], 2],
  ['青龙伏魔剑', 1, [130, 146, 71, 54, 89], 2],
  ['乌光玄铁剑', 0, [321, 210, 140, 110, 180], 1],
  ['古纹青石剑', 0, [760, 640, 380, 250, 640], 0],
]

const craftVm = (): ItemVm => ({
  tab: 'sword',
  rows: CRAFT_SHOT.map(([name, owned, cost, craftable], i): CraftRow => ({
    name,
    itemId: 50001 + i,
    owned,
    cost,
    craftSeconds: sword(name).craftSeconds!,
    craftable,
  })),
})

test('炼制飞剑页横幅是「炼 器」，墨迹条「炼制飞剑」带折叠钮', () => {
  const h = renderItem(craftVm())
  assert.ok(h.includes('src="img/title/titleproduce.gif"'))
  assert.ok(h.includes('炼制飞剑'))
  assert.ok(h.includes('item.jsp?hide=1&amp;tab=1'), '折叠钮走 hide=1')
  assert.ok(h.includes('<TD width="30%">名称</TD><TD width="50%">属性</TD><TD width="20%">操作</TD>'))
})

test('炼制飞剑：五行消耗与需要时间对着截图 #155 逐行核对', () => {
  const h = renderItem(craftVm())
  for (const [, , cost] of CRAFT_SHOT) {
    for (const v of cost) assert.ok(h.includes(`<TD>${v}</TD>`), `缺消耗 ${v}`)
  }
  // 需要时间直接由 tools/fixtures/swords.json 的 craftSeconds 算出，与截图一致
  assert.ok(h.includes('需要时间 0:11:07'), '玉虚/青龙 667 秒')
  assert.ok(h.includes('需要时间 0:16:40'), '乌光玄铁 1000 秒')
  assert.ok(h.includes('需要时间 1:06:40'), '古纹青石 4000 秒')
  assert.ok(h.includes('<SPAN class=smallgray>现有:1</SPAN>'))
  assert.ok(h.includes('<SPAN class=smallgray>现有:0</SPAN>'))
})

test('「准备炼制」输入框后的 (N) 是可炼数量链接，条件不满足时显示红字「(未满足)」', () => {
  const h = renderItem(craftVm())
  assert.ok(h.includes('准备炼制: <INPUT class=craftnum id=craft50001 size=4>'))
  assert.ok(h.includes(`onclick="$('craft50001').value=2">(2)</A>`))
  assert.ok(h.includes('>(0)</A>'), '古纹青石剑可炼 0 把')
  const blocked = renderItem({
    tab: 'sword',
    rows: [{ name: '七星磐龙剑', itemId: 51401, owned: 0, cost: [1080, 610, 1100, 920, 460], craftSeconds: 4286, craftable: null }],
  })
  assert.ok(blocked.includes('<SPAN class=smallred>(未满足)</SPAN>'))
  assert.ok(blocked.includes('需要时间 1:11:26'), '七星磐龙 4286 秒 = 1:11:26')
})

test('fixture 里 14 把剑都能渲染出名称与时间', () => {
  assert.equal(swords.length, 14)
  const rows = swords
    .filter((s) => s.craftSeconds !== null && s.craftCost !== null)
    .map((s, i): CraftRow => ({
      name: s.name,
      itemId: 50001 + i,
      owned: 0,
      cost: s.craftCost as unknown as readonly [number, number, number, number, number],
      craftSeconds: s.craftSeconds!,
      craftable: 0,
    }))
  const h = renderItem({ tab: 'sword', rows })
  for (const r of rows) assert.ok(h.includes(`>${r.name}</A>`), `缺 ${r.name}`)
})

// —— 炼制丹药 ——

test('炼制丹药只列当前炼丹之术等级对应的那一档，六种丹', () => {
  const rows = pillRows(9, () => 0)
  assert.equal(rows.length, 6)
  assert.deepEqual(rows.map((r) => r.name), PILL_NAMES.map((n) => `九炼${n}`))
  const h = renderItem({ tab: 'pill', rows, alchemyLevel: 9 })
  // #68 九炼：五种丹 22:30:00，五行丹 24:00:00；全部 (0)
  assert.ok(h.includes('需要时间 22:30:00'))
  assert.ok(h.includes('需要时间 24:00:00'))
  assert.ok(h.includes('>九炼碧罗丹</A>'))
  assert.ok(!h.includes('一炼'), '不该把其它档也列出来')
  // 丹药行不显示五行消耗（05 §5.2）
  assert.ok(!h.includes('img/res/gold.gif'))
})

test('一炼那一档换成「一炼…」，时间不变（截图 #71）', () => {
  const h = renderItem({ tab: 'pill', rows: pillRows(1, () => 1), alchemyLevel: 1 })
  assert.ok(h.includes('>一炼紫金丹</A>'))
  assert.ok(h.includes('>一炼五行丹</A>'))
  assert.ok(h.includes('需要时间 22:30:00') && h.includes('需要时间 24:00:00'))
  assert.ok(!h.includes('九炼'))
})

test('「正在炼制中」表：丹药｜剩余时间｜完成时间（截图 #68）', () => {
  const h = renderItem({
    tab: 'pill',
    rows: pillRows(9, () => 0),
    brewing: [{ name: '九炼碧罗丹', itemId: 209, seconds: 15 * 3600 + 51 * 60, finishAt: '2008-12-04 09:02:08' }],
  })
  assert.ok(h.includes('正在炼制中'))
  assert.ok(h.includes('<TD width="40%">丹药</TD><TD width="30%">剩余时间</TD><TD width="30%">完成时间</TD>'))
  assert.ok(h.includes('15:51:00'))
  assert.ok(h.includes('2008-12-04 09:02:08'))
})

test('护身与淬炼两页是同系列推出来的，标题条各自不同', () => {
  const guard = renderItem({ tab: 'guard', rows: [] })
  assert.ok(guard.includes('炼制护身法宝'))
  assert.ok(guard.includes('item.jsp?hide=1&amp;tab=2'))
  const refine = renderItem({
    tab: 'refine',
    rows: [{ name: '上品太乙金光剑', itemId: 50903, owned: 2, craftSeconds: 310, craftable: 1 }],
    brewing: [{ name: '上品太乙金光剑+1', itemId: 50903, seconds: 310, finishAt: '2008-12-04 09:02:08' }],
  })
  assert.ok(refine.includes('淬炼法宝'))
  assert.ok(refine.includes('正在淬炼中'))
  // 一览页状态词 `淬炼中... 0:05:10` = 310 秒，两处对得上
  assert.ok(refine.includes('0:05:10'))
})
