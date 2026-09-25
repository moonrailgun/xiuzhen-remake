import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacityOf, BODY_DANTIAN } from './cultivate.ts'
import type { FiveQi } from './state.ts'
import {
  launch,
  resolveBattleEvent,
  swordsOut,
  swordsOutLimit,
  flightSeconds,
  BASE_SWORDS_OUT,
  BATTLE_INTRO,
  requestHelp,
  reinforce,
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

  // 飞到后缠斗13秒，再排返航
  const arrived = advanceTo(started, started.timeline, flight + 13, (st, ev) => resolveBattleEvent(st, ev))
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
  // 丹田气海拉高：这条考的是「从对方抢走多少」，别被赢家自己的丹田上限挡住
  // （上限是另一条规则，由下面那条专门的测试守）
  const s0 = state()
  const body = [...s0.player.body]; body[BODY_DANTIAN] = 30
  const s: GameState = { ...s0, player: { ...s0.player, body } }
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

// —— 求援与支援（《战斗扫盲》原文）——

test('求援：把战斗事件通过消息发给朋友', () => {
  const s = state()
  const started = (launch(s, skeleton(), [qinglong()]) as { state: GameState }).state
  const eventId = started.timeline.events[0]!.id
  const r = requestHelp(started, eventId, '某友')
  assert.equal(r.ok, true)
  const mail = r.state.mail[0]!
  assert.equal(mail.subject, '173小鱼请求援手')
  assert.equal((mail.body as { kind: string }).kind, '求援')
  assert.equal((mail.body as { eventId: string }).eventId, eventId)
})

test('战斗已结束时无法求援', () => {
  const r = requestHelp(state(), 'nope', '某友')
  assert.equal(r.ok, false)
  assert.match(r.reason ?? '', /已经结束/)
})

test('支援赶得上：并进同一场，并按新剑敏捷延长缠斗（原文）', () => {
  const s = state()
  // 先打一个远目标，留出足够的飞行时间
  const started = (launch(s, skeleton(140, 140), [qinglong('a')]) as { state: GameState }).state
  const before = started.timeline.events[0]!
  const beforeFinish = before.finishAt

  const r = reinforce(started, before.id, [qinglong('b')])
  assert.equal(r.ok, true)
  const after = (r as { state: GameState }).state
  assert.equal(after.timeline.events.length, 1, '并进同一场，不新开事件')
  const ev = after.timeline.events[0]!
  assert.equal((ev.payload['swords'] as unknown[]).length, 2, '两把剑一起战斗')
  assert.equal(ev.finishAt, beforeFinish, '支援不改变先发飞剑的抵达时刻')
  const fighting = advanceTo(after, after.timeline, beforeFinish, resolveBattleEvent)
  assert.equal(fighting.timeline.events[0]!.finishAt, beforeFinish + 16, '双方敏捷总和延长缠斗')
})

test('自己支援自己（原文明确提到的玩法）', () => {
  const s = state()
  const started = (launch(s, skeleton(140, 140), [qinglong('a')]) as { state: GameState }).state
  const r = reinforce(started, started.timeline.events[0]!.id, [qinglong('b'), qinglong('c')])
  assert.equal(r.ok, true)
  const ev = (r as { state: GameState }).state.timeline.events[0]!
  assert.equal((ev.payload['swords'] as unknown[]).length, 3)
})

test('支援也受「同时在外 5 把」的限制', () => {
  const s = state()
  const started = (launch(s, skeleton(140, 140), [
    qinglong('a'), qinglong('b'), qinglong('c'), qinglong('d'), qinglong('e'),
  ]) as { state: GameState }).state
  const r = reinforce(started, started.timeline.events[0]!.id, [qinglong('f')])
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /最多只能同时控制 5 把飞剑/)
})

test('飞剑已在返回途中时不能再支援', () => {
  const s = state()
  const started = (launch(s, skeleton(), [qinglong()]) as { state: GameState }).state
  const flight = started.timeline.events[0]!.finishAt
  const arrived = advanceTo(started, started.timeline, flight + 13, (st, ev) => resolveBattleEvent(st, ev))
  const back = { ...arrived.state, timeline: arrived.timeline }
  const r = reinforce(back, back.timeline.events[0]!.id, [qinglong('x')])
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /返回途中/)
})

test('不选飞剑无法支援', () => {
  const s = state()
  const started = (launch(s, skeleton(), [qinglong()]) as { state: GameState }).state
  const r = reinforce(started, started.timeline.events[0]!.id, [])
  assert.equal(r.ok, false)
})

const ownedSword = (id = 's1'): GameState['player']['artifacts'][number] => ({
  id, kind: 'sword', name: '青龙伏魔剑', quality: '极品', refine: 0, status: '空闲', count: 1,
})

test('返航完成恢复空闲，原剑可再次出击', () => {
  const s = state({ artifacts: [ownedSword()] })
  const started = (launch(s, skeleton(), [qinglong()]) as { state: GameState }).state
  assert.equal(started.player.artifacts[0]!.status, '斩杀中')
  const done = advanceTo(started, started.timeline, 10000, resolveBattleEvent)
  assert.equal(done.state.player.artifacts[0]!.status, '空闲')
  assert.equal(launch({ ...done.state, timeline: done.timeline }, skeleton(), [qinglong()]).ok, true)
})

test('到达先缠斗双方敏捷之和，结束后才给战报与战利品', () => {
  const started = (launch(state(), skeleton(), [qinglong()]) as { state: GameState }).state
  const arrival = started.timeline.events[0]!.finishAt
  const fighting = advanceTo(started, started.timeline, arrival, resolveBattleEvent)
  assert.equal(fighting.timeline.events[0]!.payload['phase'], 'fighting')
  assert.equal(fighting.timeline.events[0]!.finishAt, arrival + 13)
  assert.equal(fighting.state.mail.length, 0)
  assert.deepEqual(fighting.state.player.qi, started.player.qi)
  const done = advanceTo(fighting.state, fighting.timeline, arrival + 13, resolveBattleEvent)
  assert.equal(done.state.mail.length, 1)
  assert.equal(done.timeline.events[0]!.payload['phase'], 'returning')
})

test('三大被动作用于出击速度和战报攻耐', () => {
  const skills = { 心剑诀: 20, 身剑诀: 20, 大周天剑法: 20 }
  const plain = (launch(state(), skeleton(), [qinglong()]) as { state: GameState }).state
  const boosted = (launch(state({ skills }), skeleton(), [qinglong()]) as { state: GameState }).state
  assert.ok(boosted.timeline.events[0]!.finishAt < plain.timeline.events[0]!.finishAt)
  const done = advanceTo(boosted, boosted.timeline, 10000, resolveBattleEvent)
  const rows = done.state.mail[0]!.body['rows'] as { attack: number; durability: number }[]
  assert.equal(rows[0]!.attack, 192)
  assert.equal(rows[0]!.durability, 96)
})

test('原战斗失败后迟到支援直接返回，不另打一场或发战利品', () => {
  const boss = { ...skeleton(), attack: 1000, hp: 1000 }
  const started = (launch(state(), boss, [qinglong()]) as { state: GameState }).state
  const supported = (reinforce(started, started.timeline.events[0]!.id, [{ ...qinglong('late', 10), speed: 1 }]) as { state: GameState }).state
  const done = advanceTo(supported, supported.timeline, 10000, resolveBattleEvent)
  assert.equal(done.state.mail.length, 1)
  assert.equal(done.state.mail[0]!.body['won'], false)
  assert.deepEqual(done.state.player.qi, started.player.qi)
})

test('缠斗中的支援按到达时刻加入并延长敏捷时间', () => {
  const started = (launch(state(), { ...skeleton(), agility: 1000 }, [qinglong()]) as { state: GameState }).state
  const arrival = started.timeline.events[0]!.finishAt
  const fighting = advanceTo(started, started.timeline, arrival, resolveBattleEvent)
  const current = { ...fighting.state, clock: { ...fighting.state.clock, gameT: arrival }, timeline: fighting.timeline }
  const before = current.timeline.events[0]!
  const supported = reinforce(current, before.id, [qinglong('support', 1)])
  assert.equal(supported.ok, true)
  const after = (supported as { state: GameState }).state.timeline.events[0]!
  assert.equal(after.finishAt, before.finishAt + 6, '淬炼后的敏捷为6')
  assert.equal((after.payload['swordIds'] as string[]).length, 2)
})

test('攻击真实NPC无需注入战利品，掠夺后消耗其可掠夺库存', async () => {
  const { npcAt } = await import('./npc.ts')
  const base = state()
  const now = 30 * 86400
  const s = { ...base, clock: { ...base.clock, gameT: now } }
  const npc = npcAt(s.npc, s.npc.bases[0]!, now, s.worldSeed)
  const victim: BattleTarget = { ...skeleton(npc.x, npc.y), kind: 'player', name: npc.base.name, npcId: npc.base.id }
  const started = (launch(s, victim, [qinglong()], { sightRange: 999 }) as { state: GameState }).state
  const done = advanceTo(started, started.timeline, now + 1e6, resolveBattleEvent)
  assert.ok(done.state.player.qi.some((v) => v > 0))
  assert.ok((done.state.npc.patches[npc.base.id]?.qiLost ?? 0) > 0)
  const after = npcAt(done.state.npc, npc.base, now, s.worldSeed)
  assert.ok(after.qi < npc.qi)
})


test('战利品在飞剑返航完成前不可使用，返航只入账一次', () => {
  const started = (launch(state(), skeleton(), [qinglong()]) as { state: GameState }).state
  const arrival = started.timeline.events[0]!.finishAt
  const fighting = advanceTo(started, started.timeline, arrival + 13, resolveBattleEvent)
  assert.equal(fighting.state.mail[0]!.body['won'], true)
  assert.deepEqual(fighting.state.player.qi, started.player.qi)
  const backAt = fighting.timeline.events[0]!.finishAt
  const done = advanceTo(fighting.state, fighting.timeline, backAt, resolveBattleEvent)
  assert.deepEqual(done.state.player.qi, [90, 90, 90, 90, 90])
  assert.deepEqual(advanceTo(done.state, done.timeline, backAt + 100, resolveBattleEvent).state.player.qi, done.state.player.qi)
})

test('怪物已被先发飞剑杀死时，迟到支援不能重复获得战利品', () => {
  const started = (launch(state(), skeleton(), [qinglong()]) as { state: GameState }).state
  const supported = (reinforce(started, started.timeline.events[0]!.id, [{ ...qinglong('late'), speed: 1 }]) as { state: GameState }).state
  const done = advanceTo(supported, supported.timeline, 10000, resolveBattleEvent)
  assert.equal(done.state.mail.length, 1)
  assert.deepEqual(done.state.player.qi, [90, 90, 90, 90, 90])
})

test('★吸回来的真气受丹田上限约束（不能先溢出再被静默抹掉）', () => {
  const s0 = state()
  const cap = capacityOf(s0)
  const loot = [cap * 100, cap * 100, cap * 100, cap * 100, cap * 100] as unknown as FiveQi
  const ev = {
    id: 'b1', kind: 'battle' as const, finishAt: s0.clock.gameT,
    payload: { phase: 'returning', target: { name: 'x', x: 1, y: 1 }, swords: [], loot },
  }
  const after = resolveBattleEvent(s0, ev).state
  for (const v of after.player.qi) {
    assert.ok(v <= cap, `真气 ${v} 超过了丹田上限 ${cap}——会在下次 tick 被静默抹掉`)
  }
})
