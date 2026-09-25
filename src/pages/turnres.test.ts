import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderTurnres, type TurnresVm } from './turnres.ts'

/** 资源条截图 #2 的五行读数，丹田上限 2900。 */
const vm = (over: Partial<TurnresVm> = {}): TurnresVm => ({
  current: [1132, 1364, 2164, 2071, 1401],
  capacity: 2900,
  cost: 3,
  from: '金',
  to: '火',
  ...over,
})

test('墨迹条标题「五行互化」，表宽 460（L 窗通式）', () => {
  const h = renderTurnres(vm())
  assert.ok(h.includes('class="titlebg2 bigbold"'))
  assert.ok(h.includes('>五行互化</TD>'))
  assert.ok(h.includes('width=460'))
})

test('五行当前量一行五格，图标与顶栏资源条同一套', () => {
  const h = renderTurnres(vm())
  for (const [icon, n] of [
    ['gold', 1132],
    ['wood', 1364],
    ['water', 2164],
    ['fire', 2071],
    ['earth', 1401],
  ] as const) {
    assert.ok(h.includes(`<IMG src="img/res/${icon}.gif">${n}</TD>`), `缺少 ${icon} 的当前量`)
  }
})

test('表单：把 [源五行] 的 [数量] 化为 [目标五行] → 确定', () => {
  const h = renderTurnres(vm())
  assert.ok(h.includes('把 <SELECT name=from>'))
  assert.ok(h.includes('化为 <SELECT name=to>'))
  assert.ok(h.includes('name=amount'))
  assert.ok(h.includes('value=确定'))
  assert.ok(h.includes('value="金" selected'), '源五行预选金')
  assert.ok(h.includes('value="火" selected'), '目标五行预选火')
})

test('红字标明仙石开销与总量守恒（付费页「自由分配…比例」是 3 仙石）', () => {
  const h = renderTurnres(vm())
  assert.ok(h.includes('class=smallred'))
  assert.ok(h.includes('需要花费3个仙石'))
  assert.ok(h.includes('丹田总量不变'))
  assert.ok(h.includes('2900'))
})

test('源与目标下拉都是五行全集，且不含「全部」（互化必须指定两端）', () => {
  const h = renderTurnres(vm())
  assert.ok(!h.includes('>全部</OPTION>'))
  for (const e of ['金', '木', '水', '火', '土']) {
    assert.ok(h.includes(`value="${e}"`), `下拉缺少 ${e}`)
  }
})
