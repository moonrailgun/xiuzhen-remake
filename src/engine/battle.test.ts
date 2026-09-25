import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  launch,
  resolveBattleEvent,
  swordsOut,
  swordsOutLimit,
  flightSeconds,
  BASE_SWORDS_OUT,
  BATTLE_INTRO,
  type BattleTarget,
  type LaunchSword,
} from './battle.ts'
import { advanceTo, countByKind } from './timeline.ts'
import { newGame } from './game.ts'
import type { GameState } from './state.ts'

const state = (over: Partial<GameState['player']> = {}): GameState => {
  const s = newGame(
    { name: '173小鱼', gender: 'f', element: '木', school: '通天', x: 100, y: 100, seed: 1 },
    0,
  )
  return { ...s, player: { ...s.player, ...over } }
}

/** 极品青龙伏魔剑（原版数值：攻 16~160、耐 8~80、速 7、敏 3）。 */
const qinglong = (id = 's1', refine = 0): LaunchSword => ({
  id,
  name: '青龙伏魔剑',
  quality: '极品',
  refine,
  attack: [16, 160],
  durability: [8, 80],
  speed: 7,
  agility: 3,
  element: '木',
})

/** 百妖记第八回的白骷髅（原版任务详情页：攻击 45、敏捷 10、生命 45、属性 无）。 */
const skeleton = (x = 101, y = 100): BattleTarget => ({
  kind: 'monster',
  name: '白骷髅',
  x,
  y,
  attack: 45,
  agility: 10,
  hp: 45,
  element: null,
})

test('初期最多 5 把飞剑在外，万剑诀每级 +1（原文）', () => {
  assert.equal(BASE_SWORDS_OUT, 5)
  assert.equal(swordsOutLimit(0), 5)
  assert.equal(swordsOutLimit(3), 8)
})

test('出击生成战斗事件，倒计时是飞过去的时间', () => {
  const s = state()
  const r = launch(s, skeleton(), [qinglong()])
  assert.equal(r.ok, true)
  const after = (r as { state: GameState }).state
  assert.equal(countByKind(after.timeline, 'battle'), 1)
  assert.ok(after.timeline.events[0]!.finishAt > s.clock.gameT, '要飞一会儿')
})

test('飞行耗时随距离增加、随速度减少', () => {
  assert.ok(flightSeconds(10, 7) > flightSeconds(1, 7), '越远越久')
  assert.ok(flightSeconds(10, 15) < flightSeconds(10, 7), '速度越高越快')
  assert.ok(flightSeconds(0, 7) >= 60, '至少要一分钟')
})

test('不选飞剑无法出击', () => {
  const r = launch(state(), skeleton(), [])
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /请选择出击的飞剑/)
})

test('超过同时在外上限时拒绝', () => {
  let s = state()
  for (let i = 0; i < 5; i++) {
    const r = launch(s, skeleton(101 + i, 100), [qinglong(`s${i}`)])
    assert.equal(r.ok, true, `第 ${i + 1} 把`)
    s = (r as { state: GameState }).state
  }
  assert.equal(swordsOut(s), 5)
  const sixth = launch(s, skeleton(110, 100), [qinglong('s9')])
  assert.equal(sixth.ok, false)
  assert.match((sixth as { reason: string }).reason, /最多只能同时控制 5 把飞剑/)
})

test('打玩家要在视野内，打怪物不限距离（原文）', () => {
  const far = { ...skeleton(180, 180) }
  assert.equal(launch(state(), far, [qinglong()]).ok, true, '怪物不限距离')

  const player: BattleTarget = { ...far, kind: 'player', name: '某人' }
  const r = launch(state(), player, [qinglong()], { sightRange: 4 })
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /九宫飞星/)
})

test('打赢白骷髅：剑完好、拿到战利品、生成战报', () => {
  const s = state()
  const started = (launch(s, skeleton(), [qinglong()]) as { state: GameState }).state

  const out = advanceTo(started, started.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))
  // 极品青龙 160 攻 vs 白骷髅 45 生命 → 赢
  assert.ok(out.state.mail.length > 0, '应生成战报')
  const report = out.state.mail[0]!
  assert.equal(report.from, '系统')
  assert.equal(report.kind, 'battle')
  assert.ok(report.subject.includes('攻击'), report.subject)
  assert.equal((report.body as { intro: string }).intro, BATTLE_INTRO)
  assert.equal((report.body as { won: boolean }).won, true)
  assert.ok(out.state.player.qi.some((v) => v > 0), '赢了应有战利品')
})

test('战报开场白与原版一字不差', () => {
  assert.equal(BATTLE_INTRO, '双方的法宝交缠在一起拼斗……终于分出结果来了！')
})

test('战报每把剑一行，结果只有「完好无损」「惨被斩断」两种', () => {
  const s = state()
  const started = (launch(s, skeleton(), [qinglong('a'), qinglong('b')]) as { state: GameState }).state
  const out = advanceTo(started, started.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))
  const rows = (out.state.mail[0]!.body as { rows: { name: string; result: string }[] }).rows
  assert.equal(rows.length, 2)
  for (const r of rows) {
    assert.ok(['完好无损', '惨被斩断'].includes(r.result), r.result)
    assert.ok(r.name.startsWith('极品青龙伏魔剑'), r.name)
  }
})

test('法宝名格式：品质 + 名称 + 淬炼（原版格式）', () => {
  const s = state()
  const started = (launch(s, skeleton(), [qinglong('a', 6)]) as { state: GameState }).state
  const out = advanceTo(started, started.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))
  const rows = (out.state.mail[0]!.body as { rows: { name: string }[] }).rows
  assert.equal(rows[0]!.name, '极品青龙伏魔剑+6')
})

test('打不过时飞剑被斩断，并从背包移除', () => {
  // 废品剑 攻 16 耐 8 打 攻 4000 生命 9999 的强敌 → 必断
  const weak: LaunchSword = { ...qinglong('weak'), quality: '废品' }
  const boss: BattleTarget = { kind: 'monster', name: '天雷', x: 101, y: 100, attack: 9999, agility: 1, hp: 9999, element: null }
  const s: GameState = {
    ...state(),
    player: {
      ...state().player,
      artifacts: [{ id: 'weak', kind: 'sword', name: '青龙伏魔剑', quality: '废品', refine: 0, status: '空闲', count: 1 }],
    },
  }
  const started = (launch(s, boss, [weak]) as { state: GameState }).state
  const out = advanceTo(started, started.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))

  const rows = (out.state.mail[0]!.body as { rows: { result: string }[] }).rows
  assert.equal(rows[0]!.result, '惨被斩断')
  assert.equal(out.state.player.artifacts.length, 0, '断掉的剑应从背包移除')
})

test('剑没断的话会飞回来（返回事件）', () => {
  const s = state()
  const started = (launch(s, skeleton(), [qinglong()]) as { state: GameState }).state
  const flight = started.timeline.events[0]!.finishAt

  // 只推进到「飞到了」这一刻
  const arrived = advanceTo(started, started.timeline, flight, (st, ev) => resolveBattleEvent(st, ev))
  assert.equal(countByKind(arrived.timeline, 'battle'), 1, '应排上返回事件')
  assert.equal(arrived.timeline.events[0]!.payload['phase'], 'returning')

  // 再推进到底
  const done = advanceTo(arrived.state, arrived.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))
  assert.equal(countByKind(done.timeline, 'battle'), 0, '飞剑归位后事件结束')
})

test('剑全断了就没有返回事件', () => {
  const weak: LaunchSword = { ...qinglong('weak'), quality: '废品' }
  const boss: BattleTarget = { kind: 'monster', name: '天雷', x: 101, y: 100, attack: 99999, agility: 1, hp: 99999, element: null }
  const started = (launch(state(), boss, [weak]) as { state: GameState }).state
  const out = advanceTo(started, started.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))
  assert.equal(countByKind(out.timeline, 'battle'), 0)
})

test('收件箱最多留 200 封（存档体积预算）', () => {
  let s = state()
  s = { ...s, mail: Array.from({ length: 200 }, (_, i) => ({
    id: `m${i}`, subject: 's', from: '系统', at: 0, read: false, kind: 'system' as const, body: {},
  })) }
  const started = (launch(s, skeleton(), [qinglong()]) as { state: GameState }).state
  const out = advanceTo(started, started.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))
  assert.equal(out.state.mail.length, 200, '不超过上限')
  assert.equal(out.state.mail[0]!.kind, 'battle', '最新的在最前')
})

test('离线期间的战斗会被一次性结算', () => {
  const s = state()
  const started = (launch(s, skeleton(150, 150), [qinglong()]) as { state: GameState }).state
  const out = advanceTo(started, started.timeline, 30 * 86400, (st, ev) => resolveBattleEvent(st, ev))
  assert.equal(countByKind(out.timeline, 'battle'), 0, '全部结算完')
  assert.ok(out.state.mail.length > 0)
})

// —— 掠夺（打玩家时按固本培元暗仓规则）——

test('打赢玩家时只抢走超出对方暗仓的部分（原文规则）', () => {
  const s = state()
  const victim: BattleTarget = {
    kind: 'player', name: '某羊', x: 101, y: 100,
    attack: 1, agility: 1, hp: 1, element: null,
  }
  // 对方丹田 5000/各，固本 12 级 → 每种护住 1800 → 可抢 3200
  const r = launch(s, victim, [qinglong()], { sightRange: 10 })
  const started = (r as { state: GameState }).state
  const withVictimInfo: GameState = {
    ...started,
    timeline: {
      events: started.timeline.events.map((e) => ({
        ...e,
        payload: { ...e.payload, targetQi: [5000, 5000, 5000, 5000, 5000], targetRootLevel: 12 },
      })),
    },
  }
  const out = advanceTo(withVictimInfo, withVictimInfo.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))
  assert.equal(out.state.player.qi[0], 3200, '5000 − 1800 = 3200')
})

test('对方真气都在暗仓里时一点也抢不到', () => {
  const s = state()
  const victim: BattleTarget = {
    kind: 'player', name: '某羊', x: 101, y: 100,
    attack: 1, agility: 1, hp: 1, element: null,
  }
  const started = (launch(s, victim, [qinglong()], { sightRange: 10 }) as { state: GameState }).state
  const withInfo: GameState = {
    ...started,
    timeline: {
      events: started.timeline.events.map((e) => ({
        ...e,
        payload: { ...e.payload, targetQi: [500, 500, 500, 500, 500], targetRootLevel: 12 },
      })),
    },
  }
  const out = advanceTo(withInfo, withInfo.timeline, 1e9, (st, ev) => resolveBattleEvent(st, ev))
  assert.equal(out.state.player.qi[0], 0, '全在暗仓里，抢不到')
})
