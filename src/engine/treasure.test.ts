import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame, importGame, tick } from './game.ts'
import { serialize } from './save.ts'
import { startTreasure, claimTreasure, combineSecret, learnSecret, openNoviceBox } from './treasure.ts'
import { startFlight, startMove, cancelMove } from './move.ts'
import { walkingReduction, SECRET_BOOKS } from '../data/secrets.ts'
import type { Artifact } from './state.ts'

const item = (name: string, kind: Artifact['kind'] = 'misc'): Artifact => ({ id: name, name, kind, quality: '凡品', refine: 0, status: '空闲', count: 1 })
const born = () => newGame({ name: '寻宝道友', gender: 'm', element: '木', school: '昆仑', x: 100, y: 100, seed: 42 }, 0)

test('新手玉匣置换为凡品护身，淬炼0–3；满包、叠放与无效选择不丢物', () => {
  const s = born(), box = item('新手玄武玉匣')
  const full = { ...s, player: { ...s.player, artifacts: [box, ...Array.from({ length: 4 }, (_, i) => item(String(i)))] } }
  const opened = openNoviceBox(full, box.id)
  assert.ok(opened.ok)
  assert.equal(opened.state.player.artifacts.length, 5)
  const guard = opened.state.player.artifacts.at(-1)!
  assert.equal(guard.name, '指玄道藏碑')
  assert.equal(guard.kind, 'guard')
  assert.equal(guard.quality, '凡品')
  assert.ok(guard.refine >= 0 && guard.refine <= 3)
  assert.deepEqual(openNoviceBox(full, box.id), opened)
  assert.deepEqual(importGame(serialize(opened.state, 0)).player.artifacts, opened.state.player.artifacts)
  const stacked = { ...full, player: { ...full.player, artifacts: [{ ...box, count: 2 }, ...full.player.artifacts.slice(1)] } }
  const before = JSON.stringify(stacked)
  assert.equal(openNoviceBox(stacked, box.id).ok, false)
  assert.equal(JSON.stringify(stacked), before)
  assert.equal(openNoviceBox(full, 'missing').ok, false)
  assert.equal(openNoviceBox(opened.state, box.id).ok, false)
  const room = { ...s, player: { ...s.player, artifacts: [{ ...box, count: 2 }] } }
  const one = openNoviceBox(room, box.id)
  assert.ok(one.ok)
  assert.equal(one.state.player.artifacts[0]?.count, 1)
})

test('走路掉落预掷入档，分段与一次离线相同，满包也能获得藏宝图；地形秘笈累计减时', () => {
  const s = born()
  const r = startMove({ ...s, rng: [0, 0, 0, 0], player: { ...s.player, artifacts: Array.from({ length: 5 }, (_, i) => item(String(i))) } }, 102, 100)
  assert.ok(r.ok)
  const end = tick(r.state, 10000 * 1000).state
  const part = tick(r.state, r.state.timeline.events[0]!.finishAt * 1000).state
  const restored = tick(importGame(serialize(part, 0)), 10000 * 1000).state
  assert.deepEqual(restored.player.artifacts, end.player.artifacts)
  assert.equal(end.player.artifacts.at(-1)?.name, '藏宝图')
  assert.equal(end.player.artifacts.length, 6)
  assert.equal(walkingReduction('森林', { 三皇内文上: 1, 三皇内文下: 1 }), 80)
  assert.equal(walkingReduction('青山', { 五岳山形图: 1, 五岳真形图: 1 }), 120)
  assert.equal(walkingReduction('江河', { 伏波辟水诀: 1 }), 80)
  assert.equal(walkingReduction('平原', { 三皇内文上: 1 }), 0)
})

test('藏宝图消费一次、目标和奖品入档，未到地点和背包满时不能领，重读不重掷', () => {
  const s = born()
  const start = startTreasure({ ...s, player: { ...s.player, artifacts: [item('藏宝图')] } }, '藏宝图')
  assert.ok(start.ok)
  assert.equal(start.state.player.artifacts.length, 0)
  assert.ok(start.state.treasure)
  assert.equal(claimTreasure(start.state).ok, false)
  assert.deepEqual(importGame(serialize(start.state, 0)).treasure, start.state.treasure)
  const t = start.state.treasure
  const at = { ...start.state, player: { ...start.state.player, x: t.x, y: t.y } }
  assert.equal(claimTreasure({ ...at, player: { ...at.player, artifacts: Array.from({ length: 5 }, (_, i) => item(String(i))) } }).ok, false)
  const end = claimTreasure(at)
  assert.ok(end.ok)
  assert.equal(end.state.treasure, undefined)
  assert.deepEqual(end.state.player.artifacts, [t.reward])
  assert.equal(claimTreasure(end.state).ok, false)
})

test('材料不足不扣物，集齐四物合成一本秘箓；普通书不能学习，重复学习不消费', () => {
  const s = born()
  assert.equal(combineSecret(s).ok, false)
  const r = combineSecret({ ...s, player: { ...s.player, artifacts: ['青玉简页', '夜明珠', '了缘拂尘', '雷音钟'].map(n => item(n)) } })
  assert.ok(r.ok)
  assert.equal(r.state.player.artifacts[0]?.name, '天宫秘箓')
  const b = { ...s, player: { ...s.player, artifacts: [item('御剑飞行', 'book'), item('三国演义', 'book')] } }
  assert.equal(learnSecret(b, '三国演义').ok, false)
  const learned = learnSecret(b, '御剑飞行')
  assert.ok(learned.ok)
  assert.equal(learned.state.player.skills['御剑飞行'], 1)
  assert.equal(learned.state.player.artifacts.length, 1)
  assert.equal(learnSecret({ ...learned.state, player: { ...learned.state.player, artifacts: [item('御剑飞行', 'book')] } }, '御剑飞行').ok, false)
})

test('御剑飞行需要元婴、秘笈和可驾驭的空闲飞剑，抵达与取消均归还飞剑', () => {
  const s = born()
  const a = item('玉虚桃木剑', 'sword')
  const ready = { ...s, player: { ...s.player, realm: '元婴期' as const, skills: { 御剑飞行: 1, 御剑术: 20 }, artifacts: [a] } }
  for (const p of [{ realm: '金丹期' as const }, { skills: {} }, { artifacts: [{ ...a, status: '损坏' }] }]) {
    assert.equal(startFlight({ ...ready, player: { ...ready.player, ...p } }, 110, 110, a.id).ok, false)
  }
  const r = startFlight(ready, 110, 110, a.id)
  assert.ok(r.ok)
  assert.equal(r.state.player.artifacts[0]?.status, '御剑飞行中')
  assert.equal(startFlight(r.state, 111, 111, a.id).ok, false)
  const restored = importGame(serialize(r.state, 0))
  const end = tick(restored, r.state.timeline.events[0]!.finishAt * 1000).state
  assert.deepEqual([end.player.x, end.player.y], [110, 110])
  assert.equal(end.player.artifacts[0]?.status, '空闲')
  const cancelled = cancelMove(r.state)
  assert.deepEqual([cancelled.player.x, cancelled.player.y], [100, 100])
  assert.equal(cancelled.player.artifacts[0]?.status, '空闲')
  assert.equal(cancelled.timeline.events.length, 0)
})


test('基准版19本秘笈均可学习，高级寻宝奖池覆盖新增五本', () => {
  assert.equal(SECRET_BOOKS.length, 19)
  const rewards = new Set<string>()
  for (let seed = 1; seed <= 1500; seed++) {
    const s = newGame({ name: '寻宝', gender: 'm', element: '木', school: '昆仑', x: 100, y: 100, seed }, 0)
    const r = startTreasure({ ...s, player: { ...s.player, artifacts: [item('天宫秘箓')] } }, '天宫秘箓')
    assert.ok(r.ok)
    rewards.add(r.state.treasure!.reward.name)
  }
  for (const name of SECRET_BOOKS) {
    const s = born()
    const r = learnSecret({ ...s, player: { ...s.player, artifacts: [item(name, 'book')] } }, name)
    assert.ok(r.ok)
    assert.equal(r.state.player.skills[name], 1)
    if (name !== '物理通明') assert.ok(rewards.has(name), name)
  }
})

test('请神香每自然周一次、一小时书籍换气循环，失败不吞书不重掷奖励', async () => {
  const { useWenchangIncense, claimWenchang, requestWenchang } = await import('./treasure.ts')
  const s = born()
  const incense = item('请神香·文曲星君')
  const ready = { ...s, rng: [0, 0, 0, 0] as const, player: { ...s.player, artifacts: [{ ...incense, count: 2 }] } }
  const called = useWenchangIncense(ready, incense.id)
  assert.ok(called.ok)
  const task = called.state.quests.wenchang!
  assert.equal(task.expiresAt, 3600)
  assert.ok(task.reward)
  assert.equal(useWenchangIncense(called.state, incense.id).ok, false)
  const withBook = { ...called.state, player: { ...called.state.player, x: task.at[0], y: task.at[1], artifacts: [item(task.book, 'book')] } }
  const done = claimWenchang(withBook)
  assert.ok(done.ok)
  assert.deepEqual(done.state.player.qi, withBook.player.qi, '稀有秘笈与真气是二选一奖励')
  assert.equal(done.state.player.artifacts[0]?.name, task.reward)
  const qiReward = claimWenchang({ ...withBook, player: { ...withBook.player, qi: [0, 0, 0, 0, 0] }, quests: { ...withBook.quests, wenchang: { ...task, reward: undefined } } })
  assert.ok(qiReward.ok)
  assert.ok(qiReward.state.player.qi.every(n => n > 0))
  assert.ok(done.state.quests.wenchang)
  assert.deepEqual(claimWenchang(withBook), done)
  const expired = { ...withBook, clock: { ...withBook.clock, gameT: 3600 } }
  assert.equal(claimWenchang(expired).ok, false)
  assert.equal(requestWenchang(expired).ok, false)
  const before = JSON.stringify(expired)
  assert.equal(JSON.stringify(expired), before)
  const nextWeek = { ...called.state, clock: { ...called.state.clock, gameT: 6 * 86400 } }
  assert.equal(useWenchangIncense(nextWeek, incense.id).ok, true)
})

test('普通藏宝图奖池可获得请神香', () => {
  const s = born()
  let found = false
  for (let seed = 1; seed <= 300 && !found; seed++) {
    const base = newGame({ name: '香', gender: 'm', element: '木', school: '昆仑', x: 100, y: 100, seed }, 0)
    const r = startTreasure({ ...base, player: { ...base.player, artifacts: [item('藏宝图')] } }, '藏宝图')
    found = r.ok && r.state.treasure?.reward.name === '请神香·文曲星君'
  }
  assert.ok(found)
})
