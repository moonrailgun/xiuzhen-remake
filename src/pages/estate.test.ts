import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderEstate, type EstateVm } from './estate.ts'

/**
 * 地球镇(28,106) 是论坛原文里的真实城镇（`03 §1.13` 镖局老板对话，商业等级 Lv.29）；
 * Lv.29 村庄总产出 1400 两/小时，小镇 ×1.5 = 2100 —— 占 30% 份额即 630。
 */
const vm = (over: Partial<EstateVm> = {}): EstateVm => ({
  rows: [
    { name: '地球镇', x: 28, y: 106, level: 29, invested: 990000, share: 30, income: 630 },
    { name: '无名村', x: 154, y: 102, level: 5, invested: 720, share: 30, income: 45 },
  ],
  slotCap: 5,
  ...over,
})

test('墨迹条写「俗世产业 (已投/上限)」，表宽 460', () => {
  const h = renderEstate(vm())
  assert.ok(h.includes('class="titlebg2 bigbold"'))
  assert.ok(h.includes('>俗世产业 (2/5)</TD>'))
  assert.ok(h.includes('width=460'))
})

test('六列：产业｜商业等级｜我的投资｜份额｜收益｜操作', () => {
  const h = renderEstate(vm())
  for (const label of ['产业', '商业等级', '我的投资', '份额', '收益', '操作']) {
    assert.ok(h.includes(`>${label}</TD>`), `缺少列 ${label}`)
  }
})

test('地名写成「名字(x,y)」且链到地图；等级写 Lv.29（镖局原文的格式）', () => {
  const h = renderEstate(vm())
  assert.ok(h.includes('>地球镇(28,106)</A>'))
  assert.ok(h.includes('href="map.jsp?x=28&y=106"'))
  assert.ok(h.includes('<TD>Lv.29</TD>'))
  assert.ok(h.includes('<TD>Lv.5</TD>'))
})

test('收益写作「630两/小时」（与产业排行榜同一写法），并给出合计', () => {
  const h = renderEstate(vm())
  assert.ok(h.includes('<TD>630两/小时</TD>'))
  assert.ok(h.includes('<TD>45两/小时</TD>'))
  assert.ok(h.includes('合计 675两/小时'))
  assert.ok(h.includes('990000 两'), '投资额用银两，写法同人物信息表')
})

test('撤资走确认框；红字写明 5 处上限与「投得多的能把你挤出去」', () => {
  const h = renderEstate(vm())
  assert.ok(h.includes('>撤资</A>'))
  assert.ok(h.includes('确定撤资?'))
  assert.ok(h.includes('class=smallred'))
  assert.ok(h.includes('最多只能同时持有5处产业'))
  assert.ok(h.includes('挤出去'))
})

test('没有产业时显示空态（沿用事件栏「目前没有任何…」的口吻）', () => {
  const h = renderEstate(vm({ rows: [] }))
  assert.ok(h.includes('目前没有任何产业'))
  assert.ok(h.includes('合计 0两/小时'))
  assert.ok(h.includes('(0/5)'))
})

test('城镇名被转义（城镇名疑似由最大股东命名，是玩家可控文本）', () => {
  const h = renderEstate(
    vm({ rows: [{ name: '<b>x</b>', x: 1, y: 2, level: 1, invested: 0, share: 0, income: 0 }] }),
  )
  assert.ok(!h.includes('<b>x</b>'))
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;'))
})
