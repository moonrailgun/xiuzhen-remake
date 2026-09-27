import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pathTo,
  planMove,
  startMove,
  cancelMove,
  resolveMove,
  moveDisplay,
  moveRange,
  sightRange,
  BASE_MOVE_RANGE,
  BASE_SIGHT_RANGE,
  BODY_WALK,
  MOVE_EVENT_ID,
} from './move.ts'
import { advanceTo, countByKind } from './timeline.ts'
import { purchase } from './payment.ts'
import { newGame } from './game.ts'
import { MOVE_SECONDS, terrainAt } from '../data/world.ts'
import type { GameState } from './state.ts'

const SEED = 20081028

const state = (over: Partial<GameState['player']> = {}): GameState => {
  const s = newGame(
    { name: '173小鱼', gender: 'f', element: '木', school: '通天', x: 100, y: 100, seed: SEED },
    0,
  )
  return { ...s, worldSeed: SEED, player: { ...s.player, ...over } }
}

test('新号一次移动 2 格、观察 4 格（官方新手指南原文）', () => {
  assert.equal(BASE_MOVE_RANGE, 2)
  assert.equal(BASE_SIGHT_RANGE, 4)
  assert.equal(moveRange(0), 2)
  assert.equal(sightRange(0), 4)
})

test('移动入口拒绝非整数坐标，不能把小数交给逐格寻路', () => {
  const result = startMove(state(), 1.5, 100)
  assert.equal(result.ok, false)
  assert.match(result.ok ? '' : result.reason, /坐标/)
  for (const x of [100.5, NaN, Infinity, -1, 200]) assert.equal(startMove(state(), x, 100).ok, false)
})

test('行万里路增加移动距离，穷千里目增加视野', () => {
  assert.equal(moveRange(5), 7)
  assert.equal(sightRange(10), 14)
})

test('路径是曼哈顿直线：先走 x 再走 y', () => {
  assert.deepEqual(pathTo(0, 0, 2, 0), [{ x: 1, y: 0 }, { x: 2, y: 0 }])
  assert.deepEqual(pathTo(0, 0, 1, 1), [{ x: 1, y: 0 }, { x: 1, y: 1 }])
  assert.deepEqual(pathTo(5, 5, 5, 5), [], '原地不动没有路径')
  assert.deepEqual(pathTo(2, 0, 0, 0), [{ x: 1, y: 0 }, { x: 0, y: 0 }], '能往回走')
})

test('每段耗时按目标格地形（官方指南原文）', () => {
  const legs = planMove(SEED, 100, 100, 102, 100)
  assert.equal(legs.length, 2)
  for (const leg of legs) {
    assert.equal(leg.seconds, MOVE_SECONDS[leg.terrain], `${leg.terrain}`)
    assert.equal(leg.terrain, terrainAt(SEED, leg.x, leg.y, 99))
  }
})

test('开始移动会生成一个移动事件，倒计时是第一段的耗时', () => {
  const s = state()
  const r = startMove(s, 102, 100)
  assert.equal(r.ok, true)
  const after = (r as { state: GameState }).state
  assert.equal(countByKind(after.timeline, 'move'), 1)
  const legs = planMove(SEED, 100, 100, 102, 100)
  assert.equal(after.timeline.events[0]!.finishAt, legs[0]!.seconds)
})

test('超出移动范围时拒绝', () => {
  const r = startMove(state(), 110, 100)
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /超出移动范围（最多 2 格）/)
})

test('行万里路够高时可以走更远', () => {
  const s = state({ body: [0, 0, 0, 0, 0, 0, 0, 8] }) // 行万里路 8 → 10 格
  assert.equal(moveRange(s.player.body[BODY_WALK]!), 10)
  assert.equal(startMove(s, 108, 100).ok, true)
})

test('目标超出世界范围时拒绝', () => {
  assert.equal(startMove(state({ x: 1, y: 1 }), -1, 1).ok, false)
  assert.equal(startMove(state({ x: 198, y: 1 }), 201, 1).ok, false)
})

test('已在移动中时不能再发起移动', () => {
  const first = startMove(state(), 101, 100)
  const second = startMove((first as { state: GameState }).state, 100, 101)
  assert.equal(second.ok, false)
  assert.match((second as { reason: string }).reason, /正在移动中/)
})

test('原地不动会被拒绝', () => {
  const r = startMove(state(), 100, 100)
  assert.equal(r.ok, false)
})

test('多段移动：逐段结算，每段走一格', () => {
  const s = state()
  const started = (startMove(s, 102, 100) as { state: GameState }).state
  const legs = planMove(SEED, 100, 100, 102, 100)

  // 只推进到第一段结束
  const step1 = advanceTo(started, started.timeline, legs[0]!.seconds, (st, ev) => resolveMove(st, ev))
  assert.equal(step1.state.player.x, 101, '走到第一格')
  assert.equal(countByKind(step1.timeline, 'move'), 1, '第二段已排上')
  assert.equal(step1.state.player.experience, legs[0]!.seconds, '只结算已走完这一段的阅历')

  // 推进到全部结束
  const step2 = advanceTo(step1.state, step1.timeline, 1e9, (st, ev) => resolveMove(st, ev))
  assert.equal(step2.state.player.x, 102, '走到终点')
  assert.equal(countByKind(step2.timeline, 'move'), 0, '没有残留事件')
  assert.equal(step2.state.player.experience, legs.reduce((sum, leg) => sum + leg.seconds, 0))
})

test('多段移动的总耗时 = 各段之和', () => {
  const s = state({ body: [0, 0, 0, 0, 0, 0, 0, 5] })
  const started = (startMove(s, 104, 102) as { state: GameState }).state
  const legs = planMove(SEED, 100, 100, 104, 102)
  const total = legs.reduce((sum, l) => sum + l.seconds, 0)

  const out = advanceTo(started, started.timeline, total - 1, (st, ev) => resolveMove(st, ev))
  assert.ok(out.state.player.x !== 104 || out.state.player.y !== 102, '差 1 秒还没到')

  const done = advanceTo(started, started.timeline, total, (st, ev) => resolveMove(st, ev))
  assert.equal(done.state.player.x, 104)
  assert.equal(done.state.player.y, 102)
})

test('取消移动：人停在当前格，不回退', () => {
  const s = state()
  const started = (startMove(s, 102, 100) as { state: GameState }).state
  const legs = planMove(SEED, 100, 100, 102, 100)
  const midway = advanceTo(started, started.timeline, legs[0]!.seconds, (st, ev) => resolveMove(st, ev))
  assert.equal(midway.state.player.x, 101)

  const cancelled = cancelMove({ ...midway.state, timeline: midway.timeline })
  assert.equal(countByKind(cancelled.timeline, 'move'), 0)
  assert.equal(cancelled.player.x, 101, '停在已走到的格子')
  assert.equal(cancelled.player.experience, legs[0]!.seconds, '取消不奖励未完成路段')
})

test('事件栏显示当前段与下个目标（照截图 #114）', () => {
  const s = state({ body: [0, 0, 0, 0, 0, 0, 0, 5] })
  const started = (startMove(s, 103, 100) as { state: GameState }).state
  const d = moveDisplay(started)
  assert.ok(d, '应有移动显示')
  assert.equal(d!.current.x, 101, '当前段目标是下一格')
  assert.ok(d!.next, '应有下个目标')
  assert.equal(d!.next!.x, 102)
  assert.ok(d!.next!.seconds > d!.current.seconds, '下个目标的倒计时更长（累加）')
})

test('最后一段时没有下个目标', () => {
  const started = (startMove(state(), 101, 100) as { state: GameState }).state
  const d = moveDisplay(started)
  assert.equal(d!.next, undefined)
})

test('没在移动时 moveDisplay 返回 null', () => {
  assert.equal(moveDisplay(state()), null)
})

test('移动事件 id 唯一（原版事件栏只显示一条移动事件）', () => {
  const started = (startMove(state(), 101, 100) as { state: GameState }).state
  assert.equal(started.timeline.events[0]!.id, MOVE_EVENT_ID)
})

test('离线很久：整条路径一次走完', () => {
  const s = state({ body: [0, 0, 0, 0, 0, 0, 0, 10] })
  const started = (startMove(s, 106, 104) as { state: GameState }).state
  const out = advanceTo(started, started.timeline, 30 * 86400, (st, ev) => resolveMove(st, ev))
  assert.equal(out.state.player.x, 106)
  assert.equal(out.state.player.y, 104)
  assert.equal(countByKind(out.timeline, 'move'), 0)
  assert.equal(out.state.player.experience, planMove(SEED, 100, 100, 106, 104)
    .reduce((sum, leg) => sum + leg.seconds, 0), '离线只奖励实际行走时间，不奖励到达后的闲置时间')
})


test('仙石完成移动仍按所有已完成路段计阅历，不因后续路段秒数清零而丢失', () => {
  const s = state({ bonusCoin: 10 })
  const started = startMove(s, 102, 100)
  assert.ok(started.ok)
  const paid = purchase(started.state, 9)
  assert.ok(paid.ok)
  const out = advanceTo(paid.state, paid.state.timeline, paid.state.clock.gameT, resolveMove)
  assert.equal(out.state.player.x, 102)
  assert.equal(out.state.player.experience, planMove(SEED, 100, 100, 102, 100).reduce((n, leg) => n + MOVE_SECONDS[leg.terrain], 0))
})

test('福地、洞天的移动和传送入口执行境界门槛', async () => {
  const { DAY } = await import('./clock.ts')
  const { teleport } = await import('./town.ts')
  for (const [kind, realm] of [['福地', '辟谷期'], ['洞天', '心动期']] as const) {
    let at: readonly [number, number] | undefined
    for (let x = 1; x < 200 && !at; x++) for (let y = 0; y < 200; y++) {
      if (terrainAt(SEED, x, y, 4) === kind) { at = [x, y]; break }
    }
    assert.ok(at)
    const base = state({ x: at[0] - 1, y: at[1], coin: 100 })
    const s = { ...base, clock: { ...base.clock, gameT: 4 * 7 * DAY } }
    assert.equal(startMove(s, ...at).ok, false)
    assert.equal(teleport(s, { x: at[0], y: at[1] }, { fromKind: '城池' }).ok, false)
    const qualified = { ...s, player: { ...s.player, realm } }
    assert.equal(startMove(qualified, ...at).ok, true)
    assert.equal(teleport(qualified, { x: at[0], y: at[1] }, { fromKind: '城池' }).ok, true)
  }
})
