import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame, tick } from './game.ts'
import * as quest from './quest.ts'
import * as town from './town.ts'
import * as market from './market.ts'
import { moveDisplay, startMove } from './move.ts'
import type { Artifact, GameState } from './state.ts'

const base = (): GameState => newGame({ name: '修士', element: '金', gender: 'm', school: '蜀山', seed: 123, x: 5, y: 5 }, 0)
const entry = (id: string) => ({ id, acceptedAt: 0, done: false })
const sword: Artifact = { id: 'my-sword', name: '青龙伏魔剑', kind: 'sword', quality: '极品', refine: 0, status: '空闲', count: 1 }
const localTown = (): town.Town => ({ id: 'town:1', kind: '小镇', name: '小镇', x: 5, y: 5, investments: [{ owner: '修士', silver: 1_000_000 }] })

test('新手答题检验本命属性，选线不能绕过进行中的任务', () => {
  const s = base()
  const log = { ...s.quests, entries: [entry('newbie:head:2')] }
  assert.equal(typeof quest.answerQuiz, 'function')
  assert.equal(quest.answerQuiz(log, s, 'newbie:head:2', '水').ok, false)
  const correct = quest.answerQuiz(log, s, 'newbie:head:2', '金')
  assert.ok(correct.ok)
  assert.equal(quest.statusOf(correct.value, s, 'newbie:head:2'), 'ready')
  assert.deepEqual(quest.chooseLine(log, 'newbie:head:3', 'sword'), log)
})

test('实际炼剑与炼丹事件推进通用目标，买到的飞剑不算炼制', () => {
  const s = base()
  const before = { ...s, quests: { ...s.quests, line: 'sword' as const, entries: [entry('newbie:sword:1')] } }
  const after = { ...before, player: { ...before.player, artifacts: [sword] } }
  assert.equal(typeof quest.applyQuestProgress, 'function')
  const event = { id: 'craft:sword', kind: 'craft' as const, finishAt: 1, payload: { kind: 'sword', name: sword.name, count: 1 } }
  const id = quest.activeQuests(before.quests).find(q => q.goal.kind === 'craft')?.id
  assert.ok(id, 'fixture must target the craft quest')
  assert.equal(quest.entryOf(quest.applyQuestProgress(before, after, event).quests, id)?.count, 1)
  assert.equal(quest.entryOf(quest.applyQuestProgress(before, after).quests, id)?.count, undefined)
})

test('产业按时间入账，分段与整段一致，撤资退还本金且不再产出', () => {
  const s = base(), t = localTown()
  const invested = { ...s, player: { ...s.player, silver: 0 }, towns: { [t.id]: t } }
  assert.equal(typeof town.settleTownIncome, 'function')
  const whole = town.settleTownIncome({ ...invested, clock: { ...s.clock, gameT: 3600 } }, 3600)
  assert.equal(whole.player.silver, town.hourlyIncomeOf(t, s.player.name))
  let split = invested
  for (let i = 1; i <= 360; i++) split = town.settleTownIncome({ ...split, clock: { ...s.clock, gameT: i * 10 } }, 10)
  assert.equal(split.player.silver, whole.player.silver)
  const withdrawn = town.withdrawInvestment(whole, t)
  assert.ok(withdrawn.ok)
  assert.equal(withdrawn.state.player.silver, whole.player.silver + 1_000_000)
  assert.equal(town.hourlyIncomeOf(withdrawn.town, s.player.name), 0)
})

test('李员外只为已接任务收银，支持分次交并立即记进度', () => {
  const s = base()
  const rich = { ...s, player: { ...s.player, silver: 1_000_000 } }
  assert.equal(town.payLiYuanwai(rich).ok, false)
  const active = { ...rich, player: { ...rich.player, silver: 400_000 }, quests: { ...s.quests, entries: [entry('realm:qianjin:1')] } }
  const a = town.payLiYuanwai(active)
  assert.ok(a.ok)
  assert.equal(a.state.player.silver, 0)
  assert.equal(quest.entryOf(a.state.quests, 'realm:qianjin:1')?.count, 400_000)
  const b = town.payLiYuanwai({ ...a.state, player: { ...a.state.player, silver: 700_000 } })
  assert.ok(b.ok)
  assert.equal(b.state.player.silver, 100_000)
  assert.equal(quest.statusOf(b.state.quests, b.state, 'realm:qianjin:1'), 'ready')
  assert.equal(town.payLiYuanwai(b.state).ok, false)
})

test('法宝撤单完整归还原物，重复撤单不复制，NPC买入只能结算一次', () => {
  const s = base()
  const artifact = { ...sword, kind: 'guard' as const, name: '指玄道藏碑' }
  const r = market.listArtifact(market.ctxOf({ ...s, player: { ...s.player, artifacts: [artifact] } }), artifact.id, 2)
  assert.ok(r.ok)
  assert.equal(typeof market.cancelArtifactOrders, 'function')
  const returned = market.cancelArtifactOrders(r.ctx, [artifact.id])
  assert.deepEqual(returned.state.player.artifacts, [artifact])
  assert.deepEqual(market.cancelArtifactOrders(returned, [artifact.id]), returned)
  const listed = market.applyCtx(r.ctx)
  const due = market.nextNpcPurchaseAt(listed)
  assert.ok(due !== null)
  const sold = market.settleNpcPurchases({ ...listed, clock: { ...listed.clock, gameT: due } })
  assert.equal(sold.player.coin, listed.player.coin + 2)
  assert.equal(sold.market.artifacts.length, 0)
  assert.deepEqual(market.settleNpcPurchases(sold), sold)
})

test('驿站拒绝世界外坐标、非整数和来袭中传送且不扣仙石', () => {
  const s = base()
  assert.equal(town.teleport(s, { x: -1, y: 5 }).ok, false)
  assert.equal(town.teleport(s, { x: 1.5, y: 5 }).ok, false)
  const attacked = { ...s, timeline: { events: [{ id: 'raid:x', kind: 'raid' as const, finishAt: 100, payload: {} }] } }
  assert.equal(town.teleport(attacked, { x: 5, y: 5 }).ok, false)
})

test('押镖显示目的地与倒计时，并和普通移动互斥', () => {
  const s = base(), destination = { x: 7, y: 5 }
  const accepted = town.acceptEscort(s, localTown(), destination)
  assert.ok(accepted.ok)
  const event = accepted.state.timeline.events.find(e => e.id === town.ESCORT_EVENT_ID)!
  assert.deepEqual(moveDisplay(accepted.state), { current: { ...destination, seconds: event.finishAt } })
  assert.equal(startMove(accepted.state, 6, 5).ok, false)
  const moving = startMove(s, 6, 5)
  assert.ok(moving.ok)
  assert.equal(town.acceptEscort(moving.state, localTown(), destination).ok, false)
})


test('金丹可分批汇聚，压缩事件到点获得真元，十份后可交付', () => {
  const s = base()
  const id = 'realm:jindan:1'
  let current = { ...s, player: { ...s.player, realm: '金丹期' as const, qi: [286000, 0, 0, 0, 0] as const }, quests: { ...s.quests, entries: [entry(id)] } }
  assert.equal(typeof quest.gatherCoreQi, 'function')
  const gather = quest.gatherCoreQi(current, id, 100000)
  assert.ok(gather.ok)
  assert.equal(gather.value.player.qi[0], 186000)
  assert.equal(quest.startCoreCompression(gather.value, id).ok, false)
  const rest = quest.gatherCoreQi(gather.value, id, 186000)
  assert.ok(rest.ok)
  const start = quest.startCoreCompression(rest.value, id)
  assert.ok(start.ok)
  const event = start.value.timeline.events.find(e => e.payload['op'] === 'goldenCore')!
  assert.equal(event.finishAt, 12 * 3600)
  assert.equal(quest.startCoreCompression(start.value, id).ok, false)
  const ninth = { ...start.value, quests: { ...start.value.quests, entries: [{ ...start.value.quests.entries[0]!, count: 9 }] } }
  const completed = quest.applyQuestProgress(ninth, ninth, event)
  assert.equal(quest.statusOf(completed.quests, completed, id), 'ready')
})


test('玩家真气成交到账走注入计时，不合理标价不会被NPC收购', () => {
  const initial = base()
  const s = { ...initial, player: { ...initial.player, qi: [100, 100, 100, 100, 100] as const } }
  const listed = market.listQi(market.ctxOf(s), { id: 'mine:qi', offer: { element: '金', amount: 10 }, want: { element: '木', amount: 15 } })
  assert.ok(listed.ok)
  const ev = listed.ctx.state.timeline.events[0]!
  let current = market.applyCtx(market.resolveMarketEvent(listed.ctx, ev))
  const due = market.nextNpcPurchaseAt(current)!
  assert.equal(due, ev.finishAt + 3600)
  current = { ...current, clock: { ...current.clock, gameT: due } }
  const sold = market.settleNpcPurchases(current)
  assert.equal(sold.market.qi.length, 0)
  assert.equal(sold.player.qi[1], current.player.qi[1])
  const injection = sold.timeline.events.find(e => e.payload['op'] === 'inject')!
  assert.equal(injection.finishAt, due + market.injectSecondsFor(current, 15))
  assert.equal(market.resolveMarketEvent(market.ctxOf(sold), injection).state.player.qi[1], current.player.qi[1] + 15)
  assert.deepEqual(market.settleNpcPurchases(sold), sold)
  const expensive = market.listArtifact(market.ctxOf({ ...s, player: { ...s.player, artifacts: [sword] } }), sword.id, 1_000_000)
  assert.ok(expensive.ok)
  assert.equal(market.nextNpcPurchaseAt(market.applyCtx(expensive.ctx)), null)
})

test('淬炼只在两件同阶原物合成后推进，失败和购买不算', () => {
  const s = base(), id = 'newbie:sword:4'
  const before = { ...s, quests: { ...s.quests, entries: [entry(id)] }, player: { ...s.player, artifacts: [sword, { ...sword, id: 'second' }] } }
  assert.equal(quest.activeQuests(before.quests)[0]?.goal.kind, 'refine')
  const after = { ...before, player: { ...before.player, artifacts: [{ ...sword, id: 'refined', refine: 1 }] } }
  assert.equal(quest.entryOf(quest.applyQuestProgress(before, after).quests, id)?.count, 1)
  const failed = { ...before, player: { ...before.player, artifacts: [] } }
  assert.equal(quest.entryOf(quest.applyQuestProgress(before, failed).quests, id)?.count, undefined)
})

for (const action of ['撤单', '成交'] as const) {
  test(`从NPC买入的法宝隔日重新寄卖后保留原物并可${action}，不重复发放`, () => {
    const initial = base()
    let current = market.refillNpcOrders({ ...initial, npc: { bases: [], patches: {} }, player: { ...initial.player, coin: 1000 } })
    const offer = current.market.artifacts[0]!
    const bought = market.buyArtifact(market.ctxOf(current), offer.id)
    assert.ok(bought.ok)
    current = market.applyCtx(bought.ctx)
    const artifact = current.player.artifacts.find(a => a.id === offer.id)!
    const paidCoin = current.player.coin
    current = tick(current, (market.NPC_ORDER_TTL + 3600) * 1000).state
    const listed = market.listArtifact(market.ctxOf(current), artifact.id, offer.priceCoin)
    assert.ok(listed.ok)
    current = market.applyCtx(listed.ctx)
    current = tick(current, current.clock.wallT + 1000).state
    assert.ok(current.market.artifacts.some(o => o.id === artifact.id && o.seller === current.player.name), '刚重新上架的自有法宝不能按旧NPC编号过期')
    assert.equal(current.player.coin, paidCoin)
    assert.equal(current.player.artifacts.some(a => a.id === artifact.id), false)

    if (action === '撤单') {
      const returned = market.cancelArtifactOrders(market.ctxOf(current), [artifact.id])
      assert.deepEqual(returned.state.player.artifacts.find(a => a.id === artifact.id), artifact)
      assert.equal(returned.state.player.coin, paidCoin)
      assert.equal(returned.market.artifacts.some(o => o.id === artifact.id), false)
      assert.deepEqual(market.cancelArtifactOrders(returned, [artifact.id]), returned)
    } else {
      current = tick(current, current.clock.wallT + (market.NPC_PURCHASE_DELAY_SECONDS - 1) * 1000).state
      assert.equal(current.market.artifacts.some(o => o.id === artifact.id), false)
      assert.equal(current.player.artifacts.some(a => a.id === artifact.id), false)
      assert.equal(current.player.coin, paidCoin + offer.priceCoin)
      assert.deepEqual(market.settleNpcPurchases(current), current)
    }
  })
}

test('买入NPC法宝立即重新寄卖不占用NPC补货数量，编号不重复', () => {
  const initial = base()
  const stocked = market.refillNpcOrders({ ...initial, player: { ...initial.player, coin: 1000 } })
  const offer = stocked.market.artifacts[0]!
  const bought = market.buyArtifact(market.ctxOf(stocked), offer.id)
  assert.ok(bought.ok)
  const listed = market.listArtifact(bought.ctx, offer.id, offer.priceCoin)
  assert.ok(listed.ok)
  const refilled = market.refillNpcOrders(market.applyCtx(listed.ctx))
  assert.equal(refilled.market.artifacts.filter(o => o.seller !== refilled.player.name).length, 3)
  assert.equal(refilled.market.artifacts.filter(o => o.seller === refilled.player.name).length, 1)
  assert.equal(new Set(refilled.market.artifacts.map(o => o.id)).size, 4)
})
