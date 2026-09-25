import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  startCultivate,
  planUpgrade,
  resolveCultivate,
  cultivateSlots,
  capacityOf,
  gainQi,
  spendCoin,
  speedUp,
  levelOf,
  BODY_DANTIAN,
  BODY_STEEL,
  SPEEDUP_HALF_COST,
  type CultivateTarget,
} from './cultivate.ts'
import { createClock, DAY } from './clock.ts'
import { emptyTimeline, advanceTo, countByKind } from './timeline.ts'
import { seedRng } from './rng.ts'
import { ZERO_QI, type FiveQi, type GameState } from './state.ts'

const qi = (...v: number[]): FiveQi => v as unknown as FiveQi

const state = (over: Partial<GameState['player']> = {}, timeline = emptyTimeline()): GameState => ({
  v: 1,
  clock: createClock(0),
  timeline,
  rng: seedRng(1),
  worldSeed: 1,
  npc: { bases: [], patches: {} },
  quests: { entries: [], line: 'qi' as const, dantianBonus: 0 },
  mail: [],
  player: {
    name: '173小鱼',
    gender: 'f',
    element: '木',
    school: '通天',
    realm: '筑基期',
    x: 100,
    y: 100,
    qi: qi(99999, 99999, 99999, 99999, 99999),
    meridians: Array(12).fill(2),
    body: Array(8).fill(0),
    skills: {},
    daoxing: 0,
    experience: 0,
    silver: 0,
    coin: 0,
    bonusCoin: 100,
    artifacts: [],
    createdAt: 0,
    ...over,
  },
})

const meridian0: CultivateTarget = { system: 'meridian', index: 0 }

test('修炼队列：普通 1 个，VIP 2 个（官方指南原文）', () => {
  assert.equal(cultivateSlots(false), 1)
  assert.equal(cultivateSlots(true), 2)
})

test('队列满时拒绝，提示语照原版截图', () => {
  const s = state()
  const first = startCultivate(s, meridian0)
  assert.equal(first.ok, true)
  const second = startCultivate((first as { state: GameState }).state, { system: 'meridian', index: 1 })
  assert.equal(second.ok, false)
  assert.equal((second as { reason: string }).reason, '修炼队列已满')
})

test('VIP 可以同时修炼两项，第三项才满', () => {
  let s = state()
  for (const i of [0, 1]) {
    const r = startCultivate(s, { system: 'meridian', index: i }, { hasVip: true })
    assert.equal(r.ok, true, `第 ${i + 1} 项`)
    s = (r as { state: GameState }).state
  }
  const third = startCultivate(s, { system: 'meridian', index: 2 }, { hasVip: true })
  assert.equal((third as { reason: string }).reason, '修炼队列已满')
})

test('真气不足时拒绝，提示语照原版截图 #92', () => {
  const r = startCultivate(state({ qi: ZERO_QI }), meridian0)
  assert.equal(r.ok, false)
  assert.equal((r as { reason: string }).reason, '升级所需真气不足')
})

test('开始修炼会扣真气，并按扣掉的量增加道行', () => {
  const s = state()
  const plan = planUpgrade(s, meridian0)
  const r = startCultivate(s, meridian0)
  assert.equal(r.ok, true)
  const after = (r as { state: GameState }).state
  const spent = s.player.qi.map((v, i) => v - after.player.qi[i]!)
  assert.deepEqual(spent, [...plan.cost], '扣的正好是计划里的消耗')
  // 道行 = 累计消耗的真气（1 点 = 1 时辰）
  assert.equal(after.player.daoxing, plan.cost.reduce((a, b) => a + b, 0))
})

test('同一项目不能重复开始', () => {
  const s = state()
  const first = startCultivate(s, meridian0)
  const again = startCultivate((first as { state: GameState }).state, meridian0, { hasVip: true })
  assert.equal(again.ok, false)
  assert.match((again as { reason: string }).reason, /已在修炼中/)
})

test('事件到点：经脉等级 +1', () => {
  const s = state()
  const started = (startCultivate(s, meridian0) as { state: GameState }).state
  const plan = planUpgrade(s, meridian0)
  assert.equal(levelOf(started, meridian0), 2, '开始时还是原等级')

  const out = advanceTo(started, started.timeline, plan.seconds, (st, ev) => ({
    state: resolveCultivate(st, ev),
  }))
  assert.equal(levelOf(out.state, meridian0), 3)
  assert.equal(countByKind(out.timeline, 'cultivate'), 0, '事件应已结算掉')
})

test('本体与法术同样能升级', () => {
  const s = state()
  const body = (startCultivate(s, { system: 'body', index: BODY_STEEL }) as { state: GameState }).state
  const out = advanceTo(body, body.timeline, 1e9, (st, ev) => ({ state: resolveCultivate(st, ev) }))
  assert.equal(out.state.player.body[BODY_STEEL], 1)

  const s2 = state()
  const skill = (startCultivate(s2, { system: 'skill', id: '炼丹之术' }) as { state: GameState }).state
  const out2 = advanceTo(skill, skill.timeline, 1e9, (st, ev) => ({ state: resolveCultivate(st, ev) }))
  assert.equal(out2.state.player.skills['炼丹之术'], 1)
})

test('炼体成钢能缩短经脉升级耗时', () => {
  const plain = planUpgrade(state(), meridian0).seconds
  const boosted = planUpgrade(state({ body: [0, 20, 0, 0, 0, 0, 0, 0] }), meridian0).seconds
  assert.ok(boosted < plain, `${boosted} 应小于 ${plain}`)
})

// —— 真气产出与丹田上限 ——

test('丹田容量随本体等级变化（截图：Lv.2 → 2900）', () => {
  assert.equal(capacityOf(state({ body: [0, 0, 0, 0, 0, 2, 0, 0] })), 2900)
  assert.ok(capacityOf(state({ body: [0, 0, 0, 0, 0, 9, 0, 0] })) > 2900)
})

test('产出真气按丹田上限截断', () => {
  const s = state({ qi: ZERO_QI, body: [0, 0, 0, 0, 0, 2, 0, 0] }) // 上限 2900
  const after = gainQi(s, qi(0, 59, 59, 59, 59), 1000 * 3600)
  assert.equal(after.player.qi[1], 2900, '满了就停在上限')
  assert.equal(after.player.qi[0], 0, '五行一缺那一种始终为 0')
})

test('产出真气按秒数折算（每小时量 × 小时数）', () => {
  const s = state({ qi: ZERO_QI, body: [0, 0, 0, 0, 0, 9, 0, 0] })
  const after = gainQi(s, qi(0, 59, 0, 0, 0), 3600)
  assert.equal(after.player.qi[1], 59)
  const after2 = gainQi(s, qi(0, 59, 0, 0, 0), 1800)
  assert.equal(after2.player.qi[1], 29.5)
})

// —— 仙石 ——

test('仙石扣除：先扣附加，再扣普通（官方指南原文）', () => {
  const s = state({ coin: 50, bonusCoin: 30 })
  const r = spendCoin(s, 40)
  assert.equal(r.ok, true)
  const p = (r as { state: GameState }).state.player
  assert.equal(p.bonusCoin, 0, '附加先扣光')
  assert.equal(p.coin, 40, '剩下的从普通扣')
})

test('只收普通仙石的项目不吃附加仙石', () => {
  const s = state({ coin: 5, bonusCoin: 100 })
  const r = spendCoin(s, 20, { requireNormal: true })
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /普通仙石不足/)
})

test('仙石不够时拒绝', () => {
  const r = spendCoin(state({ coin: 1, bonusCoin: 1 }), 10)
  assert.equal(r.ok, false)
})

test('「半」减半剩余时间并扣 2 仙石', () => {
  const s = state()
  const started = (startCultivate(s, meridian0) as { state: GameState }).state
  const before = started.timeline.events[0]!.finishAt
  const r = speedUp(started, 'half')
  assert.equal(r.ok, true)
  const after = (r as { state: GameState }).state
  assert.equal(after.timeline.events[0]!.finishAt, before / 2)
  assert.equal(after.player.bonusCoin, started.player.bonusCoin - SPEEDUP_HALF_COST)
})

test('「完」直接完成并扣 10 仙石', () => {
  const s = state()
  const started = (startCultivate(s, meridian0) as { state: GameState }).state
  const r = speedUp(started, 'finish')
  const after = (r as { state: GameState }).state
  assert.equal(after.timeline.events[0]!.finishAt, after.clock.gameT, '立即到点')
  assert.equal(after.player.bonusCoin, started.player.bonusCoin - 10)
})

test('加速不影响炼器事件（只作用于修炼队列）', () => {
  const s = state()
  const withCraft: GameState = {
    ...s,
    timeline: { events: [{ id: 'c1', kind: 'craft', finishAt: 10000, payload: {} }] },
  }
  const r = speedUp(withCraft, 'finish')
  const after = (r as { state: GameState }).state
  assert.equal(after.timeline.events[0]!.finishAt, 10000, '炼器事件不受影响')
})

test('离线很久：一次推进把积压的修炼全结算', () => {
  let s = state({ body: Array(8).fill(0) })
  const r = startCultivate(s, meridian0)
  s = (r as { state: GameState }).state
  const out = advanceTo(s, s.timeline, 365 * DAY, (st, ev) => ({ state: resolveCultivate(st, ev) }))
  assert.equal(out.resolved.length, 1)
  assert.equal(levelOf(out.state, meridian0), 3)
})
