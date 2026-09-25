import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyTimeline,
  schedule,
  cancel,
  countByKind,
  sorted,
  nextFinishAt,
  advanceTo,
  type GameEvent,
  type Timeline,
} from './timeline.ts'

const ev = (id: string, finishAt: number, kind: GameEvent['kind'] = 'cultivate'): GameEvent => ({
  id,
  kind,
  finishAt,
  payload: {},
})

const collect =
  () =>
  (state: string[], e: GameEvent) => ({ state: [...state, e.id] })

test('按完成时刻结算，不按插入顺序', () => {
  let tl = emptyTimeline()
  tl = schedule(tl, ev('c', 300))
  tl = schedule(tl, ev('a', 100))
  tl = schedule(tl, ev('b', 200))
  const out = advanceTo<string[]>([], tl, 1000, collect())
  assert.deepEqual(out.state, ['a', 'b', 'c'])
  assert.equal(out.timeline.events.length, 0)
})

test('只结算到期的，未到期的留着', () => {
  let tl = emptyTimeline()
  tl = schedule(tl, ev('a', 100))
  tl = schedule(tl, ev('b', 500))
  const out = advanceTo<string[]>([], tl, 200, collect())
  assert.deepEqual(out.state, ['a'])
  assert.deepEqual(out.timeline.events.map((e) => e.id), ['b'])
})

test('边界：finishAt 正好等于 until 要结算', () => {
  const tl = schedule(emptyTimeline(), ev('a', 100))
  assert.deepEqual(advanceTo<string[]>([], tl, 100, collect()).state, ['a'])
})

test('离线很久：一次推进结算掉全部积压事件', () => {
  let tl = emptyTimeline()
  for (let i = 0; i < 500; i++) tl = schedule(tl, ev(`e${i}`, i * 60))
  const out = advanceTo<string[]>([], tl, 999_999, collect())
  assert.equal(out.resolved.length, 500)
  assert.equal(out.timeline.events.length, 0)
})

test('结算可产生后续事件（多段移动的下一段）', () => {
  // 三段路径：每段完成后排下一段
  const tl = schedule(emptyTimeline(), { ...ev('leg0', 100, 'move'), payload: { leg: 0 } })
  const out = advanceTo<string[]>([], tl, 1000, (state, e) => {
    const leg = e.payload['leg'] as number
    const next = leg < 2 ? [{ ...ev(`leg${leg + 1}`, e.finishAt + 100, 'move'), payload: { leg: leg + 1 } }] : []
    return { state: [...state, e.id], follow: next }
  })
  assert.deepEqual(out.state, ['leg0', 'leg1', 'leg2'])
  assert.equal(out.timeline.events.length, 0)
})

test('后续事件超过 until 时留在时间线上', () => {
  const tl = schedule(emptyTimeline(), { ...ev('leg0', 100, 'move'), payload: { leg: 0 } })
  const out = advanceTo<string[]>([], tl, 150, (state, e) => ({
    state: [...state, e.id],
    follow: [ev('leg1', e.finishAt + 100, 'move')],
  }))
  assert.deepEqual(out.state, ['leg0'])
  assert.deepEqual(out.timeline.events.map((e) => e.id), ['leg1'])
})

test('结算是纯函数：同样输入重复结算得到同样结果', () => {
  let tl = emptyTimeline()
  tl = schedule(tl, ev('a', 100))
  tl = schedule(tl, ev('b', 200))
  const a = advanceTo<string[]>([], tl, 1000, collect())
  const b = advanceTo<string[]>([], tl, 1000, collect())
  assert.deepEqual(a.state, b.state)
  assert.deepEqual(a.timeline, b.timeline)
})

test('同一时刻的多个事件按 id 稳定排序', () => {
  let tl = emptyTimeline()
  tl = schedule(tl, ev('z', 100))
  tl = schedule(tl, ev('a', 100))
  assert.deepEqual(advanceTo<string[]>([], tl, 100, collect()).state, ['a', 'z'])
})

test('事件 id 不允许重复', () => {
  const tl = schedule(emptyTimeline(), ev('a', 100))
  assert.throws(() => schedule(tl, ev('a', 200)), /id 重复/)
})

test('死循环保护：结算时不断产生立刻到期的新事件会报错而不是挂死', () => {
  const tl = schedule(emptyTimeline(), ev('a0', 0))
  let n = 0
  assert.throws(
    () => advanceTo<null>(null, tl, 100, () => ({ state: null, follow: [ev(`a${++n}`, 0)] })),
    /超过 100000 步/,
  )
})

test('countByKind 支持"修炼队列已满"判断（普通 1 个、VIP 2 个）', () => {
  let tl: Timeline = emptyTimeline()
  assert.equal(countByKind(tl, 'cultivate'), 0)
  tl = schedule(tl, ev('m1', 100, 'cultivate'))
  tl = schedule(tl, ev('craft1', 100, 'craft'))
  assert.equal(countByKind(tl, 'cultivate'), 1, '炼器事件不计入修炼队列')
  assert.equal(countByKind(tl, 'craft'), 1)
})

test('cancel 移除事件（原版移动事件可点红 × 取消）', () => {
  let tl = schedule(emptyTimeline(), ev('m', 100, 'move'))
  tl = cancel(tl, 'm')
  assert.equal(tl.events.length, 0)
  assert.doesNotThrow(() => cancel(tl, '不存在'))
})

test('sorted / nextFinishAt', () => {
  let tl = emptyTimeline()
  assert.equal(nextFinishAt(tl), null)
  tl = schedule(tl, ev('b', 200))
  tl = schedule(tl, ev('a', 100))
  assert.deepEqual(sorted(tl).map((e) => e.id), ['a', 'b'])
  assert.equal(nextFinishAt(tl), 100)
})
