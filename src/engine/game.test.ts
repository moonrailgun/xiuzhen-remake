import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  newGame,
  tick,
  changeRate,
  currentQiPerHour,
  resourceBarOf,
  saveGame,
  loadGame,
  importGame,
} from './game.ts'
import { acceptEscort, completeEscort, hourlyIncomeOf, type Town } from './town.ts'
import { entryOf, startCoreCompression, CORE_COMPRESS_SECONDS, CORE_QI_POINTS } from './quest.ts'
import { listQi, listArtifact, ctxOf, applyCtx, LISTING_DELAY_SECONDS, NPC_PURCHASE_DELAY_SECONDS, injectSecondsFor } from './market.ts'
import { JINDAN_CHAIN } from '../data/quests.ts'
import { launch } from './battle.ts'
import { startMove } from './move.ts'
import { startCultivate, capacityOf } from './cultivate.ts'
import { DAY, HOUR, WEEK } from './clock.ts'
import { isOutOfProtection } from './state.ts'
import { lootFrom } from './loot.ts'
import type { FiveQi, GameState } from './state.ts'
import { serialize, SAVE_KEYS, SAVE_VERSION, type Storage } from './save.ts'

const qi = (...v: number[]): FiveQi => v as unknown as FiveQi

/** 真正的新号（带初始真气）。 */
const born = (over: Partial<Parameters<typeof newGame>[0]> = {}) =>
  newGame(
    { name: '173小鱼', gender: 'f', element: '木', school: '通天', x: 100, y: 100, seed: 42, ...over },
    0,
  )

/** 结算类测试从 0 真气起算，期望值就是这段时间的产出本身。 */
const fresh = (over: Partial<Parameters<typeof newGame>[0]> = {}) => {
  const s = born(over)
  return { ...s, player: { ...s.player, qi: qi(0, 0, 0, 0, 0) } }
}

test('新号自带初始真气：四行 1000、克我 500，丹田 Lv0 容量 2000（资源条读作 1000/2000）', () => {
  const s = born() // 木属性 → 克我 = 金
  assert.deepEqual(s.player.qi, qi(500, 1000, 1000, 1000, 1000))
  assert.equal(capacityOf(s), 2000)
  // 金属性 → 克我 = 火
  assert.deepEqual(born({ element: '金' }).player.qi, qi(1000, 1000, 1000, 500, 1000))
  // 有了初始真气，新手任务第 1 步「打通经脉」建号后立刻能做
  assert.ok(startCultivate(s, { system: 'meridian', index: 0 }, { hasVip: false }).ok)
})

function memStorage(): Storage & { size(): number } {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    size: () => [...m.values()].reduce((a, b) => a + b.length, 0),
  }
}

test('新号：全 0 级、送 100 附加仙石、筑基期', () => {
  const s = born()
  assert.equal(s.player.realm, '筑基期')
  assert.equal(s.player.bonusCoin, 100, '进游戏送 100 附加仙石（官方指南）')
  assert.equal(s.player.coin, 0)
  assert.deepEqual([...s.player.meridians], Array(12).fill(0))
  assert.deepEqual([...s.player.qi], [500, 1000, 1000, 1000, 1000], '初始真气 1000，克我（木 → 金）减半')
})

test('产量：木属性角色金为 0（五行一缺）', () => {
  const per = currentQiPerHour(fresh({ element: '木' }))
  assert.equal(per[0], 0, '金克木 → 金恒为 0')
  for (const i of [1, 2, 3, 4]) assert.ok(per[i]! > 0, `第 ${i} 种应有产出`)
})

test('产量对齐截图 #2：12 脉全 Lv.2、五个 4 的地块 → 每种 60', () => {
  // 截图显示 59，差的 1 是身上飞剑的耗气（见 meridian.test.ts）
  const s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2) } }
  const per = currentQiPerHour(s)
  assert.equal(per[1], 60, '木')
  assert.equal(per[0], 0, '金（五行一缺）')
})

test('产量随本命属性变化：火属性缺水', () => {
  const per = currentQiPerHour(fresh({ element: '火' }))
  assert.equal(per[2], 0, '水克火 → 水恒为 0')
  assert.ok(per[3]! > 0, '火（本命）应有产出')
})

test('tick：按流逝时间补真气', () => {
  const s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 2, 0, 0] } }
  const out = tick(s, 3600_000) // 1 小时
  assert.equal(Math.round(out.state.player.qi[1]!), 60)
  assert.equal(out.state.player.qi[0], 0)
})

test('tick：真气不超过丹田上限', () => {
  const s: GameState = {
    ...fresh(),
    npc: { bases: [], patches: {} },
    player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 2, 0, 0] },
  }
  const out = tick(s, 1000 * 3600_000) // 1000 小时
  assert.equal(out.state.player.qi[1], capacityOf(s), '停在丹田容量（Lv.2 = 2900）')
  assert.equal(capacityOf(s), 2900)
})

test('tick 幂等：同一墙钟时刻重复调用不重复补真气', () => {
  const s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 9, 0, 0] } }
  const once = tick(s, 3600_000).state
  const twice = tick(once, 3600_000).state
  assert.deepEqual([...twice.player.qi], [...once.player.qi])
})

test('tick：离线期间的修炼会被结算掉', () => {
  let s: GameState = {
    ...fresh(),
    player: { ...fresh().player, meridians: Array(12).fill(0), qi: qi(9999, 9999, 9999, 9999, 9999), body: [0, 0, 0, 0, 0, 9, 0, 0] },
  }
  const started = startCultivate(s, { system: 'meridian', index: 0 })
  assert.equal(started.ok, true)
  s = (started as { state: GameState }).state

  // 离线 30 天
  const out = tick(s, 30 * DAY * 1000)
  assert.equal(out.resolved.filter((e) => e.kind === 'cultivate').length, 1, '积压的修炼应被结算')
  assert.equal(out.state.player.meridians[0], 1)
})

test('倍速：改档后产量按游戏时间走，历史不重算', () => {
  const base: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 9, 0, 0] } }
  const afterHour = tick(base, HOUR * 1000).state
  const sped = changeRate(afterHour, HOUR * 1000, 10)
  const out = tick(sped, 2 * HOUR * 1000) // 再过 1 墙钟小时 = 10 游戏小时
  // 总共 1 + 10 = 11 游戏小时
  assert.equal(Math.round(out.state.player.qi[1]!), 60 * 11)
})

test('保护期：新号在保，10 天后出保', () => {
  const s = fresh()
  assert.equal(isOutOfProtection(s.player, 0, DAY), false)
  assert.equal(isOutOfProtection(s.player, 10 * DAY, DAY), true)
})

test('资源条数据：真气取整，容量随丹田等级', () => {
  const s: GameState = { ...fresh(), player: { ...fresh().player, qi: qi(1.7, 2.2, 0, 0, 0), body: [0, 0, 0, 0, 0, 2, 0, 0] } }
  const bar = resourceBarOf(s)
  assert.deepEqual([...bar.current], [1, 2, 0, 0, 0])
  assert.equal(bar.capacity, 2900)
  assert.equal(bar.bonusCoin, 100)
})

// —— 存档往返 ——

test('存档往返：读回来的状态能继续推进', () => {
  const store = memStorage()
  let s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 9, 0, 0] } }
  s = tick(s, 3600_000).state
  saveGame(store, s, 3600_000)

  const loaded = loadGame(store)
  assert.ok(loaded, '应读到存档')
  assert.equal(loaded!.player.name, '173小鱼')
  assert.equal(Math.round(loaded!.player.qi[1]!), 60)

  // 读回来后再过一小时，产量应继续累加而不是从头算
  const next = tick({ ...loaded!, clock: { ...loaded!.clock, wallT: 3600_000 } }, 7200_000)
  assert.equal(Math.round(next.state.player.qi[1]!), 120)
})

test('存档时先结算时钟：关页面再打开不会重复补一段', () => {
  const store = memStorage()
  const s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 9, 0, 0] } }
  // 过了 1 小时才存档
  saveGame(store, s, 3600_000)
  const loaded = loadGame(store)!
  assert.equal(loaded.clock.gameT, 3600, '存档里的游戏时间应已推进')
  assert.equal(loaded.clock.wallT, 3600_000, '墙钟基准也要更新')
  assert.equal(loaded.player.qi[1], 60, '写盘时同一段产出也必须到账')
  assert.equal(tick(loaded, 7200_000).state.player.qi[1], 120)
})

const quiet = (): GameState => {
  const s = fresh()
  return { ...s, npc: { bases: [], patches: {} }, player: { ...s.player, body: [0, 0, 0, 0, 0, 29, 0, 0] } }
}

test('改倍率直接结算尚未入账的真气与到期事件', () => {
  let s = quiet()
  s = { ...s, player: { ...s.player, qi: qi(100, 100, 100, 100, 100) } }
  const started = startCultivate(s, { system: 'meridian', index: 0 })
  assert.ok(started.ok)
  const switched = changeRate(started.state, HOUR * 1000, 10)
  assert.equal(switched.player.meridians[0], 1)
  assert.ok(switched.player.qi[1] > started.state.player.qi[1], '切换前的产出不能丢失')
  const unchanged = changeRate(quiet(), HOUR * 1000, 1)
  assert.equal(unchanged.player.qi[1], 12, '点击当前倍率也要结算')
})

test('离线修炼按完成时刻分段：突破后使用新产量', () => {
  const s = quiet()
  const started = startCultivate({ ...s, player: { ...s.player, qi: qi(100, 100, 100, 100, 100) } }, { system: 'meridian', index: 0 })
  assert.ok(started.ok)
  const due = started.state.timeline.events[0]!.finishAt
  const terrain = () => qi(4, 4, 4, 4, 4)
  const offline = tick(started.state, DAY * 1000, terrain).state
  const online = tick(tick(started.state, due * 1000, terrain).state, DAY * 1000, terrain).state
  assert.ok(Math.abs(offline.player.qi[1] - online.player.qi[1]) < 1e-8)
  assert.ok(offline.player.qi[1] > 400, '突破后的近一天应享受升级产量')
})

test('移动的每段分别使用当时坐标的元气，同刻事件只结算一次', () => {
  const s: GameState = { ...quiet(), timeline: { events: [{
    id: 'move:current', kind: 'move', finishAt: 1800,
    payload: { index: 0, legs: [
      { x: 101, y: 100, terrain: '平原', seconds: 1800 },
      { x: 102, y: 100, terrain: '平原', seconds: 1800 },
    ] },
  }] } }
  const terrain = (x: number) => qi(x === 100 ? 2 : x === 101 ? 4 : 6, 2, 2, x === 100 ? 2 : x === 101 ? 4 : 6, 2)
  const result = tick(s, 2 * HOUR * 1000, terrain)
  assert.equal(result.state.player.x, 102)
  assert.equal(result.state.player.qi[3], 27, '半小时6/h + 半小时12/h + 一小时18/h')
  assert.equal(result.resolved.length, 2)
  assert.equal(tick(result.state, 2 * HOUR * 1000, terrain).resolved.length, 0)
})

test('零耗时/立即完成事件不需要等下一秒才结算', () => {
  const s = quiet()
  const started = startCultivate({ ...s, player: { ...s.player, qi: qi(100, 100, 100, 100, 100) } }, { system: 'meridian', index: 0 })
  assert.ok(started.ok)
  const immediate = { ...started.state, timeline: { events: started.state.timeline.events.map((e) => ({ ...e, finishAt: 0 })) } }
  const result = tick(immediate, 0)
  assert.equal(result.state.player.meridians[0], 1)
  assert.equal(result.state.timeline.events.length, 0)
})

test('跨周工资离线补发，存档重载与重复tick不重复领取', () => {
  const store = memStorage()
  const s = quiet()
  const before = tick(s, (WEEK - 1) * 1000).state
  assert.equal(before.player.bonusCoin, 100)
  const after = tick(before, 2 * WEEK * 1000).state
  assert.equal(after.player.bonusCoin, 140)
  saveGame(store, after, 2 * WEEK * 1000)
  assert.equal(tick(loadGame(store)!, 2 * WEEK * 1000).state.player.bonusCoin, 140)
  assert.equal(tick(loadGame(store)!, 3 * WEEK * 1000).state.player.bonusCoin, 160)
})

test('合法JSON但游戏结构损坏时回退备份，后续保存保留健康备份', () => {
  const store = memStorage()
  const backup = serialize(quiet(), 0)
  store.setItem(SAVE_KEYS.backup, backup)
  for (const bad of [{}, { ...quiet(), clock: {} }, { ...quiet(), player: { ...quiet().player, qi: [1] } }]) {
    store.setItem(SAVE_KEYS.main, serialize(bad, 0))
    const recovered = loadGame(store)!
    assert.equal(recovered.player.name, '173小鱼')
    saveGame(store, recovered, 1000)
    assert.equal(store.getItem(SAVE_KEYS.backup), backup, '坏主档不能覆盖好的备份')
  }
})

test('只有备份时仍能恢复角色', () => {
  const store = memStorage()
  store.setItem(SAVE_KEYS.backup, serialize(quiet(), 0))
  assert.equal(loadGame(store)?.player.name, '173小鱼')
})

test('队列负载损坏也回退备份，不能等事件到期才崩溃', () => {
  const store = memStorage()
  const valid = quiet()
  store.setItem(SAVE_KEYS.backup, serialize(valid, 0))
  for (const kind of ['move', 'battle', 'cultivate', 'craft', 'market', 'raid']) {
    store.setItem(SAVE_KEYS.main, serialize({ ...valid, timeline: { events: [{ id: 'bad', kind, finishAt: 1, payload: {} }] } }, 0))
    assert.deepEqual(loadGame(store)?.timeline, valid.timeline, kind)
  }
})

test('导入兼容标准导出与旧裸状态，同时拒绝合法 JSON 坏档', () => {
  const s = quiet()
  assert.deepEqual(importGame(serialize(s, 0)), s)
  assert.deepEqual(importGame(JSON.stringify(s)), s)
  assert.throws(() => importGame(JSON.stringify({ ...s, player: { ...s.player, qi: [1] } })))
})

test('没有时间和事件变化时 tick 保留原状态引用', () => {
  const s = quiet()
  assert.equal(tick(s, 0).state, s)
})

test('v7 原存档可迁移到 v9，寻宝与御剑载荷拒绝越界和损坏数据', () => {
  const s = quiet()
  const old = { ...s, v: 7 }
  assert.deepEqual(importGame(JSON.stringify({ v: 7, savedAt: 0, state: old })), s)
  const reward = { id: 'reward', kind: 'book', name: '御剑飞行', quality: '凡品', refine: 0, status: '空闲', count: 1 }
  const treasure = { source: '藏宝图', x: 100, y: 100, reward }
  for (const bad of [{ ...treasure, x: 200 }, { ...treasure, y: -1 }, { ...treasure, x: 0.5 },
    { ...treasure, reward: { ...reward, count: 2 } }, { ...treasure, source: '任意' }]) {
    assert.throws(() => importGame(JSON.stringify({ ...s, treasure: bad })))
  }
  for (const payload of [{ op: 'flight', x: 200, y: 0, swordId: 'sword' },
    { op: 'flight', x: 1, y: 0 }, { legs: [{ x: 1, y: 0, seconds: 120, terrain: '平原' }], index: 0, treasureDrop: 'yes' }]) {
    assert.throws(() => importGame(JSON.stringify({ ...s, timeline: { events: [{ id: 'move:current', kind: 'move', finishAt: 100, payload }] } })))
  }
})

test('主循环结算全部产业收入，在线小步与离线一致', () => {
  const s = quiet()
  const town: Town = { id: 'town:100,100', name: '长安', kind: '小镇', x: 100, y: 100, investments: [{ owner: s.player.name, silver: 1_000_000 }] }
  const invested = { ...s, towns: { [town.id]: town } }
  const offline = tick(invested, HOUR * 1000).state
  let online = invested
  for (let i = 1; i <= 360; i++) online = tick(online, i * 10_000).state
  assert.equal(offline.player.silver, hourlyIncomeOf(town, s.player.name))
  assert.ok(offline.player.silver > 0)
  assert.equal(online.player.silver, offline.player.silver)
})

test('押镖须亲自行走并手交，等待不传送或发钱，路程按真实位置产气', () => {
  const s = quiet()
  const town: Town = { id: 'town:100,100', name: '长安', kind: '小镇', x: 100, y: 100, investments: [] }
  const started = acceptEscort(s, town, { x: 101, y: 100 })
  assert.ok(started.ok)
  const terrain = (x: number) => qi(4, x === 100 ? 4 : 8, 4, 4, 4)
  const waited = tick(started.state, HOUR * 1000, terrain).state
  assert.equal(waited.player.x, 100)
  assert.equal(waited.player.silver, 0)
  const walk = startMove(waited, 101, 100)
  assert.ok(walk.ok)
  const ev = walk.state.timeline.events.find(e => e.kind === 'move')!
  const out = tick(walk.state, (ev.finishAt + HOUR) * 1000, terrain)
  assert.equal(out.state.player.x, 101)
  assert.equal(out.state.player.silver, 0)
  assert.equal(out.state.player.qi[1], 12 * ev.finishAt / HOUR + 24)
  const handIn = completeEscort(out.state, { x: 101, y: 100 })
  assert.ok(handIn.ok)
  assert.equal(handIn.state.player.silver, started.state.quests.escort!.fee)
  assert.equal(completeEscort(handIn.state, { x: 101, y: 100 }).ok, false)
})

test('主循环把真实炼制完成计入炼制任务，只记一次', () => {
  const s = quiet()
  const active: GameState = {
    ...s,
    quests: { ...s.quests, line: 'sword', entries: [{ id: 'newbie:sword:1', acceptedAt: 0, done: false }] },
    timeline: { events: [{ id: 'craft:sword:1', kind: 'craft', finishAt: 10, payload: { kind: 'sword', name: '青龙伏魔剑', quality: '极品', count: 1 } }] },
  }
  const out = tick(active, 10_000).state
  assert.equal(entryOf(out.quests, 'newbie:sword:1')?.count, 1)
  assert.equal(entryOf(tick(out, 20_000).state.quests, 'newbie:sword:1')?.count, 1)
})

test('主循环在打赢时推进斩杀任务，抵达与返回不提前发奖', () => {
  const base = quiet()
  const s = { ...base, player: { ...base.player, skills: { 御剑术: 1 } } }
  const active: GameState = { ...s, quests: { ...s.quests, entries: [{ id: 'beast:1', acceptedAt: 0, done: false }] } }
  const launched = launch(active,
    { kind: 'monster', name: '三青鸟', x: 100, y: 100, attack: 14, agility: 10, hp: 30, element: null },
    [{ id: 'sword:strong', name: '青龙伏魔剑', quality: '极品', refine: 0, attack: [1000, 1000], durability: [1000, 1000], agility: 100, speed: 100, element: '金' }])
  assert.ok(launched.ok)
  const outbound = launched.state.timeline.events[0]!
  const arrived = tick(launched.state, outbound.finishAt * 1000).state
  assert.equal(entryOf(arrived.quests, 'beast:1')?.cleared, undefined)
  const fight = arrived.timeline.events.find(e => e.payload.phase === 'fighting')!
  assert.ok(fight)
  const won = tick(arrived, fight.finishAt * 1000).state
  assert.equal(entryOf(won.quests, 'beast:1')?.cleared, true)
  assert.equal(tick(won, (fight.finishAt + HOUR) * 1000).state.mail.length, 1)
})

test('没有存档时返回 null', () => {
  assert.equal(loadGame(memStorage()), null)
})

test('离线真气寄卖依次上架、成交和注入，与在线分段结算相同', () => {
  const s = quiet()
  const funded = { ...s, player: { ...s.player, qi: qi(0, 100, 0, 0, 0) } }
  const listed = listQi(ctxOf(funded), { id: 'own:qi', offer: { element: '木', amount: 100 }, want: { element: '金', amount: 100 } })
  assert.ok(listed.ok)
  const initial = applyCtx(listed.ctx)
  const purchasedAt = LISTING_DELAY_SECONDS + NPC_PURCHASE_DELAY_SECONDS
  const finishAt = purchasedAt + injectSecondsFor(initial, 100)
  const offline = tick(initial, finishAt * 1000).state
  let online = tick(initial, LISTING_DELAY_SECONDS * 1000).state
  online = tick(online, purchasedAt * 1000).state
  assert.equal(online.player.qi[0], 0, '成交后需等待注入')
  online = tick(online, finishAt * 1000).state
  assert.equal(offline.player.qi[0], 100)
  assert.equal(online.player.qi[0], 100)
  assert.equal(offline.market.qi.some(o => o.id === 'own:qi'), false)
  assert.equal(offline.timeline.events.length, 0)
  assert.equal(tick(offline, finishAt * 1000).state.player.qi[0], 100)
})

test('法宝寄卖到期发普通仙石，同刻重复结算不重复发钱', () => {
  const s = quiet()
  const item = { id: 'sword:sale', kind: 'sword', name: '青龙伏魔剑', quality: '极品', refine: 0, status: '空闲', count: 1 } as const
  const listed = listArtifact(ctxOf({ ...s, player: { ...s.player, artifacts: [item] } }), item.id, 2)
  assert.ok(listed.ok)
  const out = tick(applyCtx(listed.ctx), NPC_PURCHASE_DELAY_SECONDS * 1000).state
  assert.equal(out.player.coin, 2)
  assert.equal(out.player.bonusCoin, 100)
  assert.equal(out.market.artifacts.some(o => o.id === item.id), false)
  assert.equal(tick(out, NPC_PURCHASE_DELAY_SECONDS * 1000).state.player.coin, 2)
})

test('旧挂单已过成交与注入时间时同一时刻补结算', () => {
  const s = quiet()
  const legacy: GameState = { ...s, clock: { ...s.clock, gameT: 2 * HOUR }, market: { ...s.market, qi: [
    { id: 'legacy:qi', seller: s.player.name, listed: true, offer: { element: '木', amount: 100 }, want: { element: '金', amount: 100 } },
  ] } }
  const out = tick(legacy, 0).state
  assert.equal(out.player.qi[0], 100)
  assert.equal(out.timeline.events.length, 0)
  assert.equal(tick(out, 0).state, out)
})

test('结丹压缩在主循环完成，每份真元只发一次', () => {
  const s = quiet()
  const id = JINDAN_CHAIN[0]!.id
  const active: GameState = { ...s, quests: { ...s.quests, entries: [{ id, acceptedAt: 0, done: false, coreQi: CORE_QI_POINTS }] } }
  const started = startCoreCompression(active, id)
  assert.ok(started.ok)
  const out = tick(started.value, CORE_COMPRESS_SECONDS * 1000).state
  assert.equal(entryOf(out.quests, id)?.count, 1)
  assert.equal(entryOf(out.quests, id)?.coreEventId, undefined)
  assert.equal(tick(out, CORE_COMPRESS_SECONDS * 1000).state.quests, out.quests)
})

// —— 存档迁移（改 state 结构就必须加一条，否则等于丢档）——

test('v1 老存档能迁移到 v2：进度保留、补上 NPC 世界', () => {
  const store = memStorage()
  // 手写一份 v1 存档（那时还没有 npc 字段）
  const v1Player = { ...fresh().player, name: '老角色', daoxing: 12345, meridians: Array(12).fill(3) }
  store.setItem(
    'xiuzhen.save',
    JSON.stringify({
      v: 1,
      savedAt: 0,
      state: {
        v: 1,
        clock: { gameT: 86400, wallT: 0, rate: 1 },
        timeline: { events: [] },
        rng: [1, 2, 3, 4],
        worldSeed: 42,
        mail: [],
        player: v1Player,
      },
    }),
  )

  const loaded = loadGame(store)
  assert.ok(loaded, '应能读出来')
  assert.equal(loaded!.player.name, '老角色', '进度不丢')
  assert.equal(loaded!.player.daoxing, 12345)
  assert.deepEqual([...loaded!.player.meridians], Array(12).fill(3))
  assert.ok(loaded!.npc, '应补上 NPC 世界')
  assert.ok(loaded!.npc.bases.length > 0, 'NPC 按老存档的世界种子生成')
  assert.deepEqual(loaded!.npc.patches, {})
})

test('★v1 老存档一路迁到最新版：任务簿与市场都补齐', () => {
  const store = memStorage()
  store.setItem(
    'xiuzhen.save',
    JSON.stringify({
      v: 1,
      savedAt: 0,
      state: {
        v: 1,
        clock: { gameT: 86400, wallT: 0, rate: 1 },
        timeline: { events: [] },
        rng: [1, 2, 3, 4],
        worldSeed: 42,
        mail: [],
        player: { ...fresh().player, name: '老角色' },
      },
    }),
  )
  const loaded = loadGame(store)!
  assert.equal(loaded.player.name, '老角色')
  assert.ok(loaded.quests, 'v2→v3 补任务簿')
  assert.ok(loaded.market, 'v3→v4 补市场')
  // 迁移给的是空市场，但读档时会按存档自己的 gameT 播一次种，
  // 免得玩家要等到下一个游戏整点才看得到挂单
  assert.ok(loaded.market.qi.length > 0, '读档后市场应有挂单')
})

test('新档自带 NPC 世界', () => {
  const s = fresh()
  assert.ok(s.npc.bases.length > 0)
  assert.equal(s.npc.bases.length, 300)
})

test('存档体积：带 300 个 NPC 仍远小于 1.5MB 预算', () => {
  const store = memStorage()
  saveGame(store, fresh(), 0)
  assert.ok(store.size() < 200_000, `存档 ${store.size()} 字节`)
})

test('★v5 老存档迁到 v6：补上 VIP 开关，默认关（等同原版没充值）', () => {
  const store = memStorage()
  const s = fresh()
  const { vip: _drop, ...playerWithoutVip } = s.player
  store.setItem(
    'xiuzhen.save',
    JSON.stringify({ v: 5, savedAt: 0, state: { ...s, v: 5, player: playerWithoutVip } }),
  )
  const loaded = loadGame(store)!
  assert.equal(loaded.player.vip, false, '老档默认没 VIP')
  assert.equal(loaded.player.name, s.player.name, '其余进度不受影响')
})

test('v6 旧挂单从迁移时刻开始等待买家，标准存档与裸导出兼容', () => {
  const s = quiet()
  const old = {
    ...s, v: 6, clock: { ...s.clock, gameT: 2 * HOUR },
    market: {
      qi: [{ id: 'old:qi', seller: s.player.name, listed: true,
        offer: { element: '木', amount: 100 }, want: { element: '金', amount: 100 } }],
      artifacts: [{ id: 'old:sword', seller: s.player.name, name: '青龙伏魔剑', refine: 0, priceCoin: 2 }],
    },
  }
  const store = memStorage()
  store.setItem(SAVE_KEYS.main, JSON.stringify({ v: 6, savedAt: old.clock.gameT, state: old }))
  const loaded = loadGame(store)!
  assert.equal(loaded.v, SAVE_VERSION)
  assert.equal(loaded.market.qi[0]!.listedAt, old.clock.gameT)
  assert.equal(loaded.market.artifacts[0]!.listedAt, old.clock.gameT)
  assert.deepEqual(importGame(JSON.stringify(old)), loaded)
  assert.equal(tick(loaded, 0).state.player.coin, 0, '不能追溯旧版未实现的成交')
  const sold = tick(loaded, NPC_PURCHASE_DELAY_SECONDS * 1000).state
  assert.equal(sold.player.coin, 2)
  assert.equal(sold.player.qi[0], 0, '真气成交仍需等待注入')
  const delivered = tick(sold, (NPC_PURCHASE_DELAY_SECONDS + injectSecondsFor(sold, 100)) * 1000).state
  assert.equal(delivered.player.qi[0], 100)
})

test('新版与旧版出击、返航载荷均可保存，旧返航不会重新补发战利品', () => {
  const base = quiet()
  const s = { ...base, player: { ...base.player, skills: { 御剑术: 1 } } }
  const launched = launch(s,
    { kind: 'player', name: '对手', x: 100, y: 100, attack: 1, agility: 1, hp: 1, element: '火', npcId: 1 },
    [{ id: 'sword:strong', name: '青龙伏魔剑', quality: '极品', refine: 0, attack: [1000, 1000], durability: [1000, 1000], agility: 100, speed: 100, element: '金' }])
  assert.ok(launched.ok)
  assert.deepEqual(importGame(serialize(launched.state, 0)), launched.state)
  const outbound = launched.state.timeline.events[0]!
  const oldSword = { ...(outbound.payload.swords as Record<string, unknown>[])[0] }
  delete oldSword.launchedStats
  const oldReturning: GameState = { ...s, v: 6, timeline: { events: [
    { ...outbound, payload: { ...outbound.payload, phase: 'returning', swords: [oldSword] } },
  ] } }
  const imported = importGame(JSON.stringify(oldReturning))
  assert.equal(tick(imported, outbound.finishAt * 1000).state.player.qi[0], 0)
  const returning: GameState = { ...s, timeline: { events: [
    { ...outbound, payload: { ...outbound.payload, phase: 'returning', loot: qi(100, 0, 0, 0, 0) } },
  ] } }
  const saved = importGame(serialize(returning, 0))
  assert.equal(tick(saved, outbound.finishAt * 1000).state.player.qi[0], 100)
})

test('★顶栏与掠夺量只由 gameT 决定，不受 tick 节奏影响', () => {
  // 真气是逐段累加出来的浮点：同一个 30 天，离线一次推与在线每分钟推，
  // 数学上相等但浮点上差约 1e-6。以前这两处直接 Math.floor，于是
  // 「受伤信里失去多少真气」取决于玩家开没开着页面。
  const s: GameState = {
    ...fresh(),
    // 清掉 NPC：来袭会打乱真气，这条不变量要在「只有产出」的干净场景里验
    npc: { bases: [], patches: {} },
    player: { ...fresh().player, meridians: Array(12).fill(1), body: [0, 0, 0, 0, 0, 36, 0, 0] },
  }
  const terrain = () => qi(4, 4, 4, 4, 4)
  const days = 30
  const offline = tick(s, days * DAY * 1000, terrain).state
  let online = s
  for (let t = 60; t <= days * DAY; t += 60) online = tick(online, t * 1000, terrain).state

  assert.notDeepEqual([...online.player.qi], [...offline.player.qi], '前提：浮点累加确实有差')
  assert.deepEqual(
    [...resourceBarOf(online, terrain).current],
    [...resourceBarOf(offline, terrain).current],
    '顶栏显示的整数必须一致',
  )
  assert.deepEqual(
    [...lootFrom(online.player.qi, 0).taken],
    [...lootFrom(offline.player.qi, 0).taken],
    '被掠夺走的量必须一致',
  )
})

test('★存档往返是恒等：市场被买空过几张也不会读一次多几张', () => {
  const s = fresh()
  // 推到第 2 个游戏小时内（不在整点上），让市场有单
  let cur = tick(s, 4000 * 1000).state
  const before = cur.market.qi.length
  assert.ok(before > 0, '前提：市场里有 NPC 单')
  // 买走 3 张（直接删，重点是「少了几张、还没到补货时刻」这个局面）
  cur = { ...cur, market: { ...cur.market, qi: cur.market.qi.slice(3) } }

  for (const [label, qiOrders] of [
    ['买掉 3 张', cur.market.qi.slice(3)],
    ['整个买空', [] as typeof cur.market.qi],
    ['原样不动', cur.market.qi],
  ] as const) {
    const at = { ...cur, market: { ...cur.market, qi: qiOrders } }
    const store = memStorage()
    saveGame(store, at, at.clock.wallT)
    const back = loadGame(store)
    assert.ok(back)
    assert.equal(back.market.qi.length, qiOrders.length, `${label}：读档不该凭空补货`)
  }
})

test('★v3 老存档迁移过来仍然看得到 NPC 挂单（播种在迁移里做，不在读档时做）', () => {
  const s = fresh()
  const v3 = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
  v3['v'] = 3
  delete v3['market']
  delete v3['towns']
  const store = memStorage()
  store.setItem(SAVE_KEYS.main, JSON.stringify({ v: 3, savedAt: 0, state: v3 }))
  const back = loadGame(store)
  assert.ok(back)
  assert.ok(back.market.qi.length > 0, '迁移完就该有单，不能等到下一个游戏整点')
})
