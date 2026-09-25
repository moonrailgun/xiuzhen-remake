import test from 'node:test'
import assert from 'node:assert/strict'
import { newGame } from './game.ts'
import { purchase } from './payment.ts'

const initial = () => newGame({ name: '道友', gender: 'm', element: '木', school: '通天', x: 50, y: 50, seed: 1 }, 0)
test('购买编号只影响对应事件，并按半/完扣款', () => {
  const state = { ...initial(), timeline: { events: [
    { id: 'c', kind: 'cultivate' as const, finishAt: 100, payload: {} },
    { id: 'move', kind: 'move' as const, finishAt: 80, payload: { index: 0, legs: [{ x: 51, y: 50, seconds: 80 }, { x: 52, y: 50, seconds: 120 }] } },
  ] } }
  for (const [pay, c, m, coin] of [[8, 100, 40, 98], [9, 100, 0, 90], [10, 50, 80, 98], [11, 0, 80, 90]] as const) {
    const result = purchase(state, pay)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.state.timeline.events[0]!.finishAt, c)
    assert.equal(result.state.timeline.events[1]!.finishAt, m)
    assert.equal(result.state.player.bonusCoin, coin)
    if (pay < 10) assert.equal((result.state.timeline.events[1]!.payload['legs'] as {seconds:number}[])[1]!.seconds, pay === 8 ? 60 : 0)
  }
})
test('没有待加速事件或未实现的套餐不扣钱', () => {
  const state = initial()
  for (const pay of [1, 13, 18, 19, 8, 9, 10, 11, 999]) assert.equal(purchase(state, pay).ok, false)
  assert.equal(state.player.bonusCoin, 100)
})
