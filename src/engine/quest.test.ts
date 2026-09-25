/**
 * 任务引擎测试。
 *
 * 走的是一条完整的玩法路径：领新手第 1 步 → 升经脉 → 可交付 → 领奖 →
 * 第 2 步答题 → 第 3 步选线 → …… → 放弃 → 百妖记按境界解锁 → 境界任务发奖。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  abandon,
  accept,
  acceptBlocker,
  activeQuests,
  availableQuests,
  chooseLine,
  claim,
  emptyQuestLog,
  entryOf,
  goalMet,
  markCleared,
  paySilver,
  questCapacity,
  questLocation,
  questTarget,
  realmReached,
  recordProgress,
  recordSlain,
  resolveQuestBattle,
  statusOf,
  type QuestLog,
} from './quest.ts'
import type { GameEvent } from './timeline.ts'
import { emptyTimeline } from './timeline.ts'
import { seedRng } from './rng.ts'
import { PROTECTION_POINTS, ZERO_QI, type GameState, type Player } from './state.ts'
import { DAY } from './clock.ts'
import { WORLD_SIZE } from '../data/world.ts'
import { BEAST_QUESTS, JINDAN_CHAIN, QIANJIN_CHAIN, SANSHI_CHAIN, XIANTIAN_CHAIN, questById } from '../data/quests.ts'

// —— 夹具 ——
// 不走 newGame()，免得被世界生成/开服日历的改动牵连；这里只需要一个最小的可用 state。

function makeState(patch: Partial<Player> = {}, gameT = 0): GameState {
  const player: Player = {
    name: '测试',
    gender: 'm',
    element: '金',
    school: '蜀山',
    realm: '筑基期',
    x: 100,
    y: 100,
    qi: ZERO_QI,
    meridians: Array<number>(12).fill(0),
    body: Array<number>(8).fill(0),
    skills: {},
    daoxing: 0,
    experience: 0,
    silver: 0,
    coin: 0,
    bonusCoin: 100,
    artifacts: [],
    vip: false,
    createdAt: 0,
    ...patch,
  }
  return {
    v: 1,
    clock: { gameT, wallT: 0, rate: 1 },
    timeline: emptyTimeline(),
    rng: seedRng(1),
    player,
    worldSeed: 12345,
    npc: { bases: [], patches: {} },
    quests: { entries: [], line: 'qi' as const, dantianBonus: 0 },
    market: { qi: [], artifacts: [] },
    towns: {},
    mail: [],
  }
}

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(`本该成功，却失败了：${r.reason}`)
  return r.value
}

const reason = (r: { ok: boolean; reason?: string }): string => {
  assert.equal(r.ok, false, '本该失败')
  return r.reason ?? ''
}

// 新手前三步的 id（两条线共用）
const N1 = 'newbie:head:1'
const N2 = 'newbie:head:2'
const N3 = 'newbie:head:3'

// ===========================================================================
// 四态与放弃
// ===========================================================================

test('任务四态：可领取 → 进行中 → 可交付 → 已完成', () => {
  const state = makeState()
  let log = emptyQuestLog()

  assert.equal(statusOf(log, state, N1), 'available')
  log = unwrap(accept(log, state, N1))
  assert.equal(statusOf(log, state, N1), 'active')

  // 任意一条经脉升到 1 级
  const leveled = makeState({ meridians: [1, ...Array<number>(11).fill(0)] })
  assert.equal(statusOf(log, leveled, N1), 'ready')

  const out = unwrap(claim(log, leveled, N1))
  assert.equal(statusOf(out.log, leveled, N1), 'done')
})

test('同一个任务不能领两次；没领过的不能放弃', () => {
  const state = makeState()
  const log = unwrap(accept(emptyQuestLog(), state, N1))
  assert.equal(reason(accept(log, state, N1)), '该任务已经领取过了')
  assert.equal(reason(abandon(emptyQuestLog(), N1)), '没有领取这个任务')
  assert.equal(reason(accept(emptyQuestLog(), state, '不存在的任务')), '没有这个任务')
})

test('放弃任务：从任务栏消失，可以重新领（原版任务栏的「放弃」链接）', () => {
  const state = makeState()
  let log = unwrap(accept(emptyQuestLog(), state, N1))
  assert.equal(activeQuests(log).length, 1)

  log = unwrap(abandon(log, N1))
  assert.equal(activeQuests(log).length, 0)
  assert.equal(statusOf(log, state, N1), 'available')
  assert.ok(accept(log, state, N1).ok, '放弃后可以重领')
})

test('已交付的任务不能放弃', () => {
  const leveled = makeState({ meridians: [1, ...Array<number>(11).fill(0)] })
  let log = unwrap(accept(emptyQuestLog(), leveled, N1))
  log = unwrap(claim(log, leveled, N1)).log
  assert.equal(reason(abandon(log, N1)), '任务已经完成，无法放弃')
})

test('没完成不能领奖；奖励不能领两次', () => {
  const state = makeState()
  const log = unwrap(accept(emptyQuestLog(), state, N1))
  assert.equal(reason(claim(log, state, N1)), '任务尚未完成')

  const leveled = makeState({ meridians: [1, ...Array<number>(11).fill(0)] })
  const after = unwrap(claim(log, leveled, N1))
  assert.equal(reason(claim(after.log, leveled, N1)), '奖励已经领过了')
})

// ===========================================================================
// 链式解锁
// ===========================================================================

test('一条链一次只放出一个任务；前一步没交付，下一步不出现', () => {
  const state = makeState()
  const log = emptyQuestLog()
  const avail = availableQuests(log, state).map((q) => q.id)
  // 新手第 1 步 + 百妖记第 1 回（1–5 回无门槛）；境界任务第一步也在（筑基期即可领）
  assert.ok(avail.includes(N1))
  assert.ok(avail.includes('beast:1'))
  assert.equal(avail.filter((id) => id.startsWith('newbie:')).length, 1, '新手链一次只出一个')
  assert.equal(avail.filter((id) => id.startsWith('beast:')).length, 1, '百妖链一次只出一个')

  assert.equal(statusOf(log, state, N2), 'locked')
  const accepted = unwrap(accept(log, state, N1))
  assert.equal(statusOf(accepted, state, N2), 'locked', '第 1 步还没交付')
  assert.equal(reason(accept(accepted, state, N2)), '前置任务尚未完成')
})

test('第 3 步选线：选了练剑，第 4 步就变成「初涉炼剑」', () => {
  const state = makeState()
  let log = emptyQuestLog()
  assert.equal(log.line, 'qi')

  // 把前 3 步做完
  for (const [id, ready] of [
    [N1, makeState({ meridians: [1, ...Array<number>(11).fill(0)] })],
    [N2, state],
    [N3, state],
  ] as const) {
    log = unwrap(accept(log, ready, id))
    if (id === N2) log = markCleared(log, id) // 答题
    if (id === N3) log = chooseLine(log, id, 'sword') // 选分支
    log = unwrap(claim(log, ready, id)).log
  }

  assert.equal(log.line, 'sword')
  const next = availableQuests(log, state).find((q) => q.id.startsWith('newbie:'))!
  assert.equal(next.series, '初涉炼剑')
  assert.equal(next.name, '炼制飞剑')
  assert.equal(next.step, 4)
})

// ===========================================================================
// 完成条件
// ===========================================================================

test('完成条件：经脉「其余三种属性各一条」要覆盖 4 种属性', () => {
  const q = questById('newbie:qi:1', 'qi')!
  assert.equal(q.name, '运转周天')
  const entry = { id: q.id, acceptedAt: 0, done: false }

  // 手三阴的三条（0,1,2）都到 1 级 + 第 4 条 —— 只覆盖 2 种属性，不算完成
  assert.equal(
    goalMet(q, entry, makeState({ meridians: [1, 1, 1, 1, ...Array<number>(8).fill(0)] })),
    false,
  )
  // 每组各一条（0/3/6/9）—— 4 组 = 4 种属性 ✓
  const spread = Array<number>(12).fill(0)
  for (const i of [0, 3, 6, 9]) spread[i] = 1
  assert.equal(goalMet(q, entry, makeState({ meridians: spread })), true)
})

test('完成条件：本体 / 法术 / 道行 / 阅历', () => {
  const entry = { id: 'x', acceptedAt: 0, done: false }
  const dantian = questById('newbie:qi:2', 'qi')! // 丹田气海 1 级
  assert.equal(goalMet(dantian, entry, makeState()), false)
  const body = Array<number>(8).fill(0)
  body[5] = 1
  assert.equal(goalMet(dantian, entry, makeState({ body })), true)

  const alchemy = questById('newbie:qi:4', 'qi')! // 炼丹之术 Lv.1
  assert.equal(goalMet(alchemy, entry, makeState({ skills: { 炼丹之术: 1 } })), true)
  assert.equal(goalMet(alchemy, entry, makeState({ skills: { 铸剑之术: 9 } })), false)

  const escape = questById('newbie:tail:4', 'qi')! // 道行 78840
  assert.equal(goalMet(escape, entry, makeState({ daoxing: PROTECTION_POINTS - 1 })), false)
  assert.equal(goalMet(escape, entry, makeState({ daoxing: PROTECTION_POINTS })), true)

  const promote = XIANTIAN_CHAIN[6]! // 阅历 345600
  assert.equal(goalMet(promote, entry, makeState({ experience: 345599 })), false)
  assert.equal(goalMet(promote, entry, makeState({ experience: 345600 })), true)
})

test('完成条件：炼制件数只算对得上的那件法宝', () => {
  const state = makeState()
  let log = emptyQuestLog()
  // 直接把两个炼制任务塞进日志（绕过链式解锁，只测计数）
  log = { ...log, entries: [
    { id: 'newbie:sword:1', acceptedAt: 0, done: false }, // 炼制飞剑 ×1
    { id: 'newbie:sword:6', acceptedAt: 0, done: false }, // 炼制青龙伏魔剑 ×1
  ] }

  log = recordProgress(log, 'craft', 1, '飞剑')
  assert.equal(entryOf(log, 'newbie:sword:1')?.count, 1)
  assert.equal(entryOf(log, 'newbie:sword:6')?.count, undefined, '炼普通剑不推进青龙伏魔')
  assert.equal(statusOf(log, state, 'newbie:sword:1'), 'ready')

  log = recordProgress(log, 'craft', 1, '青龙伏魔剑')
  assert.equal(entryOf(log, 'newbie:sword:6')?.count, 1)
})

test('完成条件：交银两可以分批交，银两不足直接拒绝', () => {
  const id = QIANJIN_CHAIN[0]!.id
  let state = makeState({ realm: '心动期', silver: 600_000 })
  let log: QuestLog = { ...emptyQuestLog(), entries: [{ id, acceptedAt: 0, done: false }] }

  assert.equal(reason(paySilver(state, log, id, 700_000)), '银两不足')

  let out = unwrap(paySilver(state, log, id, 600_000))
  state = out.state
  log = out.log
  assert.equal(state.player.silver, 0)
  assert.equal(entryOf(log, id)?.count, 600_000)
  assert.equal(statusOf(log, state, id), 'active', '才交了 60 万，还不够')

  state = { ...state, player: { ...state.player, silver: 500_000 } }
  out = unwrap(paySilver(state, log, id, 500_000))
  // 只收剩下的 40 万，多的不收
  assert.equal(out.state.player.silver, 100_000)
  assert.equal(entryOf(out.log, id)?.count, 1_000_000)
  assert.equal(statusOf(out.log, out.state, id), 'ready')
})

// ===========================================================================
// 领取门槛
// ===========================================================================

test('百妖记 1–5 回无门槛，6–20 回要出保护期', () => {
  const inside = makeState({}, 5 * DAY) // 建号 5 天、道行 0 → 还在保护期
  const outside = makeState({ daoxing: PROTECTION_POINTS }, 5 * DAY)

  assert.equal(acceptBlocker(BEAST_QUESTS[0]!, inside), null)
  assert.equal(acceptBlocker(BEAST_QUESTS[4]!, inside), null)
  assert.equal(acceptBlocker(BEAST_QUESTS[5]!, inside), '尚未离开新手保护期')
  assert.equal(acceptBlocker(BEAST_QUESTS[5]!, outside), null)

  // 建号满 10 天也算出保
  const tenDays = makeState({}, 10 * DAY)
  assert.equal(acceptBlocker(BEAST_QUESTS[5]!, tenDays), null)
})

test('百妖记 21 回起按境界：辟谷 / 心动 / 金丹 / 元婴', () => {
  const at = (round: number) => BEAST_QUESTS[round - 1]!
  const out = (realm: Player['realm']) => makeState({ realm, daoxing: PROTECTION_POINTS })

  assert.equal(acceptBlocker(at(21), out('筑基期')), '境界不足，需要辟谷期')
  assert.equal(acceptBlocker(at(21), out('辟谷期')), null)
  assert.equal(acceptBlocker(at(41), out('辟谷期')), '境界不足，需要心动期')
  assert.equal(acceptBlocker(at(41), out('心动期')), null)
  assert.equal(acceptBlocker(at(61), out('心动期')), '境界不足，需要金丹期')
  assert.equal(acceptBlocker(at(80), out('金丹期')), null)
  assert.equal(acceptBlocker(at(81), out('金丹期')), '境界不足，需要元婴期')
  assert.equal(acceptBlocker(at(100), out('元婴期')), null)
  // 更高境界也能做低回合
  assert.equal(acceptBlocker(at(21), out('元婴期')), null)
  assert.ok(realmReached(out('元婴期').player, '辟谷期'))
  assert.ok(!realmReached(out('筑基期').player, '辟谷期'))
})

test('斩三尸只在周六现身（开服日 2008-10-28 是周二）', () => {
  const shangshi = SANSHI_CHAIN[0]!
  // weekdayOf 默认 serverOpenWeekday = 2（周二）→ 开服第 4 天是周六
  const saturday = makeState({ realm: '辟谷期' }, 4 * DAY)
  const sunday = makeState({ realm: '辟谷期' }, 5 * DAY)
  assert.equal(acceptBlocker(shangshi, saturday), null)
  assert.equal(acceptBlocker(shangshi, sunday), '三尸只在每周六现身')
  // 第 4 步是阅历任务，不受周六限制
  assert.equal(acceptBlocker(SANSHI_CHAIN[3]!, sunday), null)
})

// ===========================================================================
// 打怪
// ===========================================================================

test('斩妖任务领取时定下坐标，出击目标带怪物属性', () => {
  const state = makeState()
  const log = unwrap(accept(emptyQuestLog(), state, 'beast:1'))
  const at = entryOf(log, 'beast:1')!.at!
  assert.ok(at[0] >= 0 && at[0] < WORLD_SIZE)
  assert.ok(at[1] >= 0 && at[1] < WORLD_SIZE)

  const target = questTarget(log, 'beast:1')!
  assert.deepEqual(target, {
    kind: 'monster',
    name: '三青鸟',
    x: at[0],
    y: at[1],
    attack: 14,
    agility: 10,
    hp: 30,
    element: null,
  })
  assert.equal(questTarget(log, N1), null, '第 1 步不是斩妖任务')
})

test('坐标按 worldSeed 决定，同一存档每次算出来都一样；五岳用原版固定坐标', () => {
  const s1 = makeState()
  const q = BEAST_QUESTS[49]! // 第 50 回 九尾妖狐
  assert.deepEqual(questLocation(s1, q, 0), questLocation(s1, q, 0))
  const s2 = { ...s1, worldSeed: 999 }
  assert.notDeepEqual(questLocation(s1, q, 0), questLocation(s2, q, 0))

  // 五岳坐标写死在数据表里，不随机
  const yushan = XIANTIAN_CHAIN[1]!
  assert.deepEqual(questLocation(s1, yushan, 0), yushan.at)
})

test('新手靶子落在身边 8 格内（原文「附近的山顶有块试剑石」）', () => {
  const state = makeState({ x: 100, y: 100 })
  const q = questById('newbie:sword:2', 'qi')! // 以石试剑
  const [x, y] = questLocation(state, q, 0)
  assert.ok(Math.abs(x - 100) <= 8 && Math.abs(y - 100) <= 8, `落点 (${x},${y}) 应在 8 格内`)
})

test('战斗事件结算：赢了标记已斩，输了不标记', () => {
  const state = makeState()
  const log = unwrap(accept(emptyQuestLog(), state, 'beast:1'))
  const event: GameEvent = {
    id: 'battle:0:三青鸟',
    kind: 'battle',
    finishAt: 100,
    payload: { target: { name: '三青鸟' } },
  }

  assert.equal(entryOf(resolveQuestBattle(log, event, false), 'beast:1')?.cleared, undefined)
  const won = resolveQuestBattle(log, event, true)
  assert.equal(entryOf(won, 'beast:1')?.cleared, true)
  assert.equal(statusOf(won, state, 'beast:1'), 'ready')

  // 名字对不上的怪不影响任务
  const other: GameEvent = { ...event, payload: { target: { name: '白骷髅' } } }
  assert.equal(entryOf(resolveQuestBattle(log, other, true), 'beast:1')?.cleared, undefined)
})

test('recordSlain 同时推进所有盯着这只怪的任务', () => {
  let log: QuestLog = {
    ...emptyQuestLog(),
    entries: [
      { id: 'beast:8', acceptedAt: 0, done: false },
      { id: 'beast:1', acceptedAt: 0, done: false },
    ],
  }
  log = recordSlain(log, '白骷髅')
  assert.equal(entryOf(log, 'beast:8')?.cleared, true)
  assert.equal(entryOf(log, 'beast:1')?.cleared, undefined)
})

// ===========================================================================
// 发奖
// ===========================================================================

test('发奖：真气按本命属性展开，克我那一项减半（新手第 1 步 150/150/150/75/150）', () => {
  const body = Array<number>(8).fill(0)
  body[5] = 3 // 丹田 3 级，容量够装
  const state = makeState({ meridians: [1, ...Array<number>(11).fill(0)], body })
  const log = unwrap(accept(emptyQuestLog(), state, N1))
  const out = unwrap(claim(log, state, N1))
  // 金属性：克我 = 火（第 4 位）
  assert.deepEqual([...out.state.player.qi], [150, 150, 150, 75, 150])

  // 换成水属性：克我 = 土（第 5 位）
  const water = makeState({ element: '水', meridians: [1, ...Array<number>(11).fill(0)], body })
  const wet = unwrap(claim(unwrap(accept(emptyQuestLog(), water, N1)), water, N1))
  assert.deepEqual([...wet.state.player.qi], [150, 150, 150, 150, 75])
})

test('发奖：真气按丹田上限截断', () => {
  const state = makeState({ meridians: [1, ...Array<number>(11).fill(0)] }) // 丹田 0 级 = 1000
  const log = unwrap(accept(emptyQuestLog(), state, N1))
  const out = unwrap(claim(log, state, N1))
  assert.equal(questCapacity(state, out.log), 1000)
  assert.deepEqual([...out.state.player.qi], [150, 150, 150, 75, 150])

  // 三转周天奖励 3000，丹田只有 1000 → 截断
  const big = { ...state, player: { ...state.player, meridians: Array<number>(12).fill(3) } }
  const l2: QuestLog = { ...emptyQuestLog(), entries: [{ id: 'newbie:tail:1', acceptedAt: 0, done: false }] }
  const out2 = unwrap(claim(l2, big, 'newbie:tail:1'))
  assert.deepEqual([...out2.state.player.qi], [1000, 1000, 1000, 1000, 1000])
})

test('发奖：新手末环给「新手玄武玉匣」', () => {
  const state = makeState({ daoxing: PROTECTION_POINTS })
  const log: QuestLog = { ...emptyQuestLog(), entries: [{ id: 'newbie:tail:4', acceptedAt: 0, done: false }] }
  const out = unwrap(claim(log, state, 'newbie:tail:4'))
  const item = out.state.player.artifacts.find((a) => a.name === '新手玄武玉匣')
  assert.ok(item, '应该拿到新手玄武玉匣')
  assert.equal(item.kind, 'misc')
  assert.equal(item.count, 1)
})

test('发奖：境界提升 + 丹田上限加成累加', () => {
  const body = Array<number>(8).fill(0)
  body[5] = 20
  // 辟谷 → 心动：奖励「丹田上限 +5000」
  const state = makeState({ realm: '辟谷期', experience: 691200, body })
  const log: QuestLog = { ...emptyQuestLog(), entries: [{ id: SANSHI_CHAIN[3]!.id, acceptedAt: 0, done: false }] }
  const out = unwrap(claim(log, state, SANSHI_CHAIN[3]!.id))
  assert.equal(out.state.player.realm, '心动期')
  assert.equal(out.log.dantianBonus, 5000)
  assert.equal(questCapacity(out.state, out.log), questCapacity(state, emptyQuestLog()) + 5000)

  // 心动 → 金丹：再 +10000
  const next = { ...out.state, player: { ...out.state.player, experience: 1036800 } }
  const log2: QuestLog = {
    ...out.log,
    entries: [...out.log.entries, { id: QIANJIN_CHAIN[1]!.id, acceptedAt: 0, done: false }],
  }
  const out2 = unwrap(claim(log2, next, QIANJIN_CHAIN[1]!.id))
  assert.equal(out2.state.player.realm, '金丹期')
  assert.equal(out2.log.dantianBonus, 15000)
})

test('发奖：筑基→辟谷「充满丹田」把五行一次加满', () => {
  const body = Array<number>(8).fill(0)
  body[5] = 20
  const state = makeState({ realm: '筑基期', experience: 345600, body })
  const log: QuestLog = { ...emptyQuestLog(), entries: [{ id: XIANTIAN_CHAIN[6]!.id, acceptedAt: 0, done: false }] }
  const out = unwrap(claim(log, state, XIANTIAN_CHAIN[6]!.id))
  assert.equal(out.state.player.realm, '辟谷期')
  const cap = questCapacity(out.state, out.log)
  assert.deepEqual([...out.state.player.qi], [cap, cap, cap, cap, cap])
})

test('金丹大道：结丹是「点一下就算数」的条件，天劫按打怪走', () => {
  const state = makeState({ realm: '金丹期' })
  let log = unwrap(accept(emptyQuestLog(), state, JINDAN_CHAIN[0]!.id))
  assert.equal(statusOf(log, state, JINDAN_CHAIN[0]!.id), 'active')
  log = markCleared(log, JINDAN_CHAIN[0]!.id)
  assert.equal(statusOf(log, state, JINDAN_CHAIN[0]!.id), 'ready')

  log = unwrap(claim(log, state, JINDAN_CHAIN[0]!.id)).log
  log = unwrap(accept(log, state, JINDAN_CHAIN[1]!.id))
  const target = questTarget(log, JINDAN_CHAIN[1]!.id)!
  assert.equal(target.name, '天雷')
  assert.equal(target.attack, 9999)
  assert.equal(target.hp, 9999)
})
