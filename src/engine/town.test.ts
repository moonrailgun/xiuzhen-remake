import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESCORT_EVENT_ID,
  MAX_INVESTMENTS,
  acceptEscort,
  canReadFree,
  cancelEscort,
  commerceLevel,
  exchangeNote,
  hourlyIncomeOf,
  invest,
  payLiYuanwai,
  quoteEscort,
  readBook,
  redeemNote,
  renameTown,
  resolveEscort,
  shareOf,
  teleport,
  topInvestor,
  townIncome,
  type Town,
} from './town.ts'
import { createClock } from './clock.ts'
import { advanceTo, emptyTimeline } from './timeline.ts'
import { seedRng } from './rng.ts'
import { ESCORT_SECONDS_PER_CELL, STATION_COST_COIN } from '../data/town.ts'
import { ZERO_QI, type Artifact, type GameState } from './state.ts'

const state = (over: Partial<GameState['player']> = {}): GameState => ({
  v: 1,
  clock: createClock(0),
  timeline: emptyTimeline(),
  rng: seedRng(1),
  worldSeed: 1,
  npc: { bases: [], patches: {} },
  mail: [],
  player: {
    name: '莫函',
    gender: 'm',
    element: '土',
    school: '昆仑',
    realm: '筑基期',
    x: 28,
    y: 106,
    qi: ZERO_QI,
    meridians: Array(12).fill(0),
    body: Array(8).fill(0),
    skills: {},
    daoxing: 0,
    experience: 0,
    silver: 0,
    coin: 0,
    bonusCoin: 0,
    artifacts: [],
    createdAt: 0,
    ...over,
  },
})

const town = (over: Partial<Town> = {}): Town => ({
  id: 't1',
  kind: '小镇',
  name: '地球镇',
  x: 28,
  y: 106,
  investments: [],
  ...over,
})

const book = (name: string, count = 1): Artifact => ({
  id: `b:${name}`,
  kind: 'book',
  name,
  quality: '凡品',
  refine: 0,
  status: '空闲',
  count,
})

// —— 投资与产业 ——

test('投资额决定商业等级：小镇投满 3,300,000 两 = Lv.29（村表 2,200,000 ×1.5）', () => {
  const t = town({ investments: [{ owner: '莫函', silver: 3_300_000 }] })
  assert.equal(commerceLevel(t), 29)
  // Lv.29 小镇产出 = 1400 ×1.5
  assert.equal(townIncome(t), 2100)
})

test('投资扣银两、按份额分利，产业排行榜取每小时收益', () => {
  const r = invest(state({ silver: 1_000_000 }), town({ investments: [{ owner: '别人', silver: 1_000_000 }] }), 1_000_000)
  assert.ok(r.ok)
  assert.equal(r.state.player.silver, 0)
  assert.equal(shareOf(r.town, '莫函'), 0.5)
  // 小镇总投入 200 万 → Lv.27（村表 120 万 ×1.5 = 180 万），产出 1200×1.5 = 1800
  assert.equal(commerceLevel(r.town), 27)
  assert.equal(townIncome(r.town), 1800)
  assert.equal(hourlyIncomeOf(r.town, '莫函'), 900)
})

test('银两不够就投不了', () => {
  const r = invest(state({ silver: 10 }), town(), 100)
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, '银两不足')
})

test(`最多同时投资 ${MAX_INVESTMENTS} 处产业`, () => {
  const others = Array.from({ length: MAX_INVESTMENTS }, (_, i) =>
    town({ id: `t${i}`, investments: [{ owner: '莫函', silver: 100 }] }),
  )
  const r = invest(state({ silver: 10000 }), town({ id: '新的' }), 100, others)
  assert.equal(r.ok, false)
  // 已经投过的那处可以追加
  const again = invest(state({ silver: 10000 }), others[0]!, 100, others)
  assert.ok(again.ok)
  assert.equal(topInvestor(again.town)?.silver, 200)
})

test('本地投资第一名才能改名，且限 2 个字', () => {
  const t = town({ investments: [{ owner: '莫函', silver: 100 }, { owner: '别人', silver: 50 }] })
  assert.equal(topInvestor(t)?.owner, '莫函')

  assert.equal(renameTown(t, '别人', '冰城').ok, false)
  assert.equal(renameTown(t, '莫函', '三个字').ok, false)

  const r = renameTown(t, '莫函', '地球')
  assert.ok(r.ok)
  assert.equal(r.town.name, '地球')
})

// —— 私塾先生：读书 ——

test('读书花 1000 两、加原版阅历值，书读完就没了', () => {
  const r = readBook(state({ silver: 5000, artifacts: [book('三国演义')] }), '三国演义', '村庄')
  assert.ok(r.ok)
  assert.equal(r.state.player.silver, 4000)
  assert.equal(r.state.player.experience, 10000)
  assert.equal(r.state.player.artifacts.length, 0)
})

test('高阅历的书只能在大场景读：聊斋志异村庄读不了，小镇能读', () => {
  const s = state({ silver: 5000, artifacts: [book('聊斋志异')] })
  const no = readBook(s, '聊斋志异', '村庄')
  assert.equal(no.ok, false)
  assert.equal(no.ok === false && no.reason, '村庄读不了聊斋志异')

  const yes = readBook(s, '聊斋志异', '小镇')
  assert.ok(yes.ok)
  assert.equal(yes.state.player.experience, 20000)
})

test('史记 50000 阅历，只有城池能读', () => {
  const s = state({ silver: 5000, artifacts: [book('史记')] })
  assert.equal(readBook(s, '史记', '小镇').ok, false)
  const r = readBook(s, '史记', '城池')
  assert.ok(r.ok)
  assert.equal(r.state.player.experience, 50000)
})

test('书不在身上就读不了', () => {
  const r = readBook(state({ silver: 5000 }), '西游记', '村庄')
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, '你身上没有这本书')
})

test('本村投资第一名免费读书', () => {
  const t = town({ investments: [{ owner: '莫函', silver: 100 }] })
  assert.ok(canReadFree(t, '莫函'))
  assert.equal(canReadFree(t, '别人'), false)

  const r = readBook(state({ silver: 0, artifacts: [book('红楼梦')] }), '红楼梦', '村庄', { free: true })
  assert.ok(r.ok)
  assert.equal(r.state.player.silver, 0)
  assert.equal(r.state.player.experience, 10000)
})

test('堆叠的书一次只读掉一本', () => {
  const r = readBook(state({ silver: 5000, artifacts: [book('水浒传', 3)] }), '水浒传', '村庄')
  assert.ok(r.ok)
  assert.equal(r.state.player.artifacts[0]!.count, 2)
})

// —— 钱庄掌柜 ——

test('钱庄换银票：扣等额银两，银票进背包；用掉再换回银两', () => {
  const r = exchangeNote(state({ silver: 150_000 }), '十万两银票')
  assert.ok(r.ok)
  assert.equal(r.state.player.silver, 50_000)
  assert.equal(r.state.player.artifacts[0]!.name, '十万两银票')

  const back = redeemNote(r.state, '十万两银票')
  assert.ok(back.ok)
  assert.equal(back.state.player.silver, 150_000)
  assert.equal(back.state.player.artifacts.length, 0)
})

test('银两不够换不出大面额银票', () => {
  const r = exchangeNote(state({ silver: 100 }), '五百万两银票')
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, '银两不足')
})

// —— 镖局：押镖 ——

test('运镖报价还原原文算例：Lv.1 村 → 105 格 = 3465 两', () => {
  const village = town({ kind: '村庄', investments: [{ owner: '别人', silver: 100 }] })
  const q = quoteEscort(village, { x: village.x + 105, y: village.y })
  assert.equal(commerceLevel(village), 1)
  assert.equal(q.distance, 105)
  assert.equal(q.fee, 3465)
  assert.equal(q.seconds, 105 * ESCORT_SECONDS_PER_CELL)
})

test('接镖到点：人到目的地，佣金入账', () => {
  const village = town({ kind: '村庄', x: 0, y: 0, investments: [{ owner: '别人', silver: 100 }] })
  const r = acceptEscort(state(), village, { x: 105, y: 0 })
  assert.ok(r.ok)

  const out = advanceTo<GameState>(r.state, r.state.timeline, 999_999, (s, ev) => ({
    state: ev.id === ESCORT_EVENT_ID ? resolveEscort(s, ev) : s,
  }))
  assert.equal(out.state.player.silver, 3465)
  assert.equal(out.state.player.x, 105)
  assert.equal(out.state.player.y, 0)
})

test('一次只能接一趟镖', () => {
  const village = town({ kind: '村庄', x: 0, y: 0, investments: [{ owner: '别人', silver: 100 }] })
  const first = acceptEscort(state(), village, { x: 10, y: 0 })
  assert.ok(first.ok)
  const second = acceptEscort(first.state, village, { x: 20, y: 0 })
  assert.equal(second.ok, false)
  assert.equal(second.ok === false && second.reason, '你已经有一趟镖在身上了')
})

test('花 1 仙石取消跑镖', () => {
  const village = town({ kind: '村庄', x: 0, y: 0, investments: [{ owner: '别人', silver: 100 }] })
  const accepted = acceptEscort(state({ coin: 1 }), village, { x: 10, y: 0 })
  assert.ok(accepted.ok)

  const r = cancelEscort(accepted.state)
  assert.ok(r.ok)
  assert.equal(r.state.player.coin, 0)
  assert.equal(r.state.timeline.events.length, 0)

  assert.equal(cancelEscort(state()).ok, false)
})

// —— 驿站 ——

test('驿站传送扣仙石并挪位置', () => {
  const r = teleport(state({ coin: 10 }), { x: 200, y: 50 }, { fromKind: '城池' })
  assert.ok(r.ok)
  assert.equal(r.state.player.coin, 10 - STATION_COST_COIN)
  assert.equal(r.state.player.x, 200)
  assert.equal(r.state.player.y, 50)
})

test('被攻击时不能使用驿站传送', () => {
  const r = teleport(state({ coin: 10 }), { x: 200, y: 50 }, { fromKind: '城池', underAttack: true })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, '你正在被攻击，无法使用驿站')
})

test('只有城池有驿站', () => {
  const r = teleport(state({ coin: 10 }), { x: 1, y: 1 }, { fromKind: '村庄' })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, '只有城池才有驿站')
})

// —— 李员外 ——

test('心动任务「千金散尽」交 100 万两给李员外', () => {
  assert.equal(payLiYuanwai(state({ silver: 999_999 })).ok, false)
  const r = payLiYuanwai(state({ silver: 1_000_000 }))
  assert.ok(r.ok)
  assert.equal(r.state.player.silver, 0)
})
