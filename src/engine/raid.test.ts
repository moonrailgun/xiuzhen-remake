/**
 * 来袭的测试。
 *
 * 这个模块的意义是让原版那套「被打」的规则真的跑起来，所以测的重点是**规则**：
 * 保护期、护身先接战、只抢暗仓以外的真气、击退、挂单自动取消。
 * 频率与挑人是重建的，只测「确定性」，不测具体数值。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scheduleRaid, resolveRaid, defenders, RAID_EVENT_ID, RAID_CHANCE_PER_HOUR } from './raid.ts'
import { vaultCapacity } from './loot.ts'
import { newGame, tick } from './game.ts'
import { listQi, ctxOf, applyCtx } from './market.ts'
import { DAY, HOUR } from './clock.ts'
import { PROTECTION_DAYS, type Artifact, type FiveQi, type GameState } from './state.ts'

const base = (): GameState => newGame({
  name: '逆神猪', gender: 'm', element: '水', school: '昆仑', x: 100, y: 100, seed: 7,
}, 0)

/** 把时钟推到出保之后（建号满 10 天）。 */
const outOfProtection = (s: GameState, extraDays = 1): GameState => ({
  ...s,
  clock: { ...s.clock, gameT: (PROTECTION_DAYS + extraDays) * DAY },
})

const withQi = (s: GameState, v: number): GameState => ({
  ...s,
  player: { ...s.player, qi: [v, v, v, v, v] as unknown as FiveQi },
})

const sword = (over: Partial<Artifact> = {}): Artifact => ({
  id: 'sw1', kind: 'sword', name: '玉虚桃木剑', quality: '凡品',
  refine: 0, status: '空闲', count: 1, ...over,
})

const guard = (over: Partial<Artifact> = {}): Artifact => ({
  id: 'gd1', kind: 'guard', name: '指玄道藏碑', quality: '凡品',
  refine: 0, status: '空闲', count: 1, ...over,
})

const raidEvent = (s: GameState, power = 100, count = 2) => ({
  id: RAID_EVENT_ID,
  kind: 'raid' as const,
  finishAt: s.clock.gameT,
  payload: { attacker: '小哥来了', swordPower: power, swords: count, element: '火' },
})

// —— 保护期 ——

test('★保护期内绝不会被打（原版：道行 18 年或建号 10 天，先到者出保）', () => {
  let s = base()
  // 建号后头 10 天，每小时都掷一次，一次都不该中
  for (let h = 0; h < 24 * PROTECTION_DAYS; h++) {
    s = { ...s, clock: { ...s.clock, gameT: h * 3600 } }
    assert.equal(scheduleRaid(s).timeline.events.length, 0, `第 ${h} 小时不该被打`)
  }
})

test('出保之后才可能被盯上', () => {
  let hits = 0
  for (let h = 0; h < 24 * 30; h++) {
    const s = outOfProtection(base())
    const at = { ...s, clock: { ...s.clock, gameT: s.clock.gameT + h * 3600 } }
    if (scheduleRaid(at).timeline.events.some((e) => e.id === RAID_EVENT_ID)) hits++
  }
  assert.ok(hits > 0, '一个月里一次都没被打，概率或挑人条件写错了')
  // 概率是重建的，只保证量级对得上（不做精确断言）
  assert.ok(hits < 24 * 30 * RAID_CHANCE_PER_HOUR * 3, `被打 ${hits} 次，太频繁了`)
})

test('★同一个存档、同一小时，来袭结果恒定（离线补算不会变）', () => {
  const s = outOfProtection(base())
  const a = scheduleRaid(s)
  const b = scheduleRaid(s)
  assert.deepEqual(a.timeline.events, b.timeline.events)
})

test('身上已有来袭事件时不会再叠一个', () => {
  const s = { ...outOfProtection(base()), timeline: { events: [raidEvent(outOfProtection(base()))] } }
  assert.equal(scheduleRaid(s).timeline.events.length, 1)
})

// —— 迎敌顺序 ——

test('★护身排在飞剑前面迎敌（原文：来袭时护身先接战）', () => {
  const s = { ...base(), player: { ...base().player, artifacts: [sword(), guard()] } }
  const order = defenders(s)
  assert.equal(order.length, 2)
  assert.equal(order[0]!.defensiveOnly, true, '护身要排第一个')
  assert.equal(order[1]!.name, '玉虚桃木剑')
})

test('损坏的法宝不参加迎敌', () => {
  const s = { ...base(), player: { ...base().player, artifacts: [sword({ status: '损坏' })] } }
  assert.equal(defenders(s).length, 0)
})

test('在外飞剑和淬炼修理中的法宝不能同时在家迎敌', () => {
  for (const status of ['斩杀中', '绞杀中', '返回中', '淬炼中', '修理中']) {
    const s = { ...base(), player: { ...base().player, artifacts: [sword({ status }), guard({ status })] } }
    assert.equal(defenders(s).length, 0, status)
  }
})

function nearWolf(): GameState {
  const s = outOfProtection(base())
  return {
    ...s,
    npc: { bases: [{ id: 1, name: '测试狼', profile: '小狼', school: '通天', element: '木', bornAt: 0, homeX: 100, homeY: 100 }], patches: { 1: { x: 100, y: 100 } } },
    player: { ...s.player, body: [0, 0, 0, 0, 0, 29, 0, 0], artifacts: [guard({ quality: '极品', refine: 10 })] },
  }
}

test('离线七天与逐小时在线的来袭数量和时间相同', () => {
  const s = nearWolf()
  const offline = tick(s, 7 * DAY * 1000).state
  let online = s
  for (let hour = 1; hour <= 7 * 24; hour++) online = tick(online, hour * HOUR * 1000).state
  assert.ok(offline.mail.length > 0, '离线不能跳过每小时的来袭判定')
  assert.deepEqual(offline.mail, online.mail)
  assert.deepEqual(offline.timeline, online.timeline)
})

test('一次来袭结束后同一小时不会再次掷中同一只狼', () => {
  const s = nearWolf()
  let running = scheduleRaid({ ...s, clock: { ...s.clock, gameT: 266 * HOUR } })
  assert.equal(running.timeline.events.length, 1, '固定种子的已知命中小时')
  for (let minute = 1; minute <= 5; minute++) running = tick(running, minute * 60_000).state
  assert.equal(running.mail.length, 1)
  assert.equal(running.timeline.events.length, 0)
})

test('离线来袭只抢到达时刻的积蓄，之后的产出保留', () => {
  const s = outOfProtection(base())
  const start: GameState = { ...s, npc: { bases: [], patches: {} }, player: { ...s.player, body: [0, 0, 0, 0, 0, 29, 0, 0] }, timeline: { events: [{ ...raidEvent(s), finishAt: s.clock.gameT + 60 }] } }
  const result = tick(start, DAY * 1000, () => [4, 4, 4, 4, 4]).state
  assert.equal(result.mail[0]!.at, s.clock.gameT + 60)
  assert.ok(result.player.qi.some((v) => v > 280), '被抢后余下近24小时仍应正常产出')
})

// —— 掠夺 ——

test('★只有超出固本暗仓的真气抢得走', () => {
  const rootLevel = 9 // 暗仓 1000/种
  const vault = vaultCapacity(rootLevel)
  const body = Array(8).fill(0) as number[]
  body[4] = rootLevel

  const s = {
    ...withQi(outOfProtection(base()), vault + 5000),
    player: { ...withQi(outOfProtection(base()), vault + 5000).player, body, artifacts: [] },
  }
  const after = resolveRaid(s, raidEvent(s, 9999, 5))
  for (const v of after.player.qi) {
    assert.equal(v, vault, `暗仓里的 ${vault} 必须留下，实得 ${v}`)
  }
})

test('暗仓没满时一点都抢不走', () => {
  const body = Array(8).fill(0) as number[]
  body[4] = 20 // 满级暗仓 8000/种
  const s0 = withQi(outOfProtection(base()), 500)
  const s = { ...s0, player: { ...s0.player, body, artifacts: [] } }
  const after = resolveRaid(s, raidEvent(s, 9999, 5))
  assert.deepEqual([...after.player.qi], [500, 500, 500, 500, 500])
})

test('★被打穿会被击退到附近 1–4 格', () => {
  const s = { ...withQi(outOfProtection(base()), 50000), player: { ...withQi(outOfProtection(base()), 50000).player, artifacts: [] } }
  const after = resolveRaid(s, raidEvent(s, 9999, 5))
  const d = Math.abs(after.player.x - s.player.x) + Math.abs(after.player.y - s.player.y)
  assert.ok(d >= 1 && d <= 4, `击退了 ${d} 格，原版实见 1–4`)
})

test('挡住了就不掉真气、也不被击退', () => {
  const s0 = withQi(outOfProtection(base()), 50000)
  // 一堆极品 +10 护身，稳稳挡下来
  const artifacts = Array.from({ length: 3 }, (_, i) =>
    guard({ id: `g${i}`, quality: '极品', refine: 10 }))
  const s = { ...s0, player: { ...s0.player, artifacts } }
  const after = resolveRaid(s, raidEvent(s, 10, 1))
  assert.deepEqual([...after.player.qi], [...s.player.qi])
  assert.equal(after.player.x, s.player.x)
  assert.equal(after.player.y, s.player.y)
})

// —— 附带规则 ——

test('★被打时市场挂单自动取消（原文），真气退回丹田', () => {
  const s0 = withQi(outOfProtection(base()), 50000)
  const listed = listQi(ctxOf(s0), {
    id: 'me:1',
    offer: { element: '金', amount: 3000 },
    want: { element: '木', amount: 3000 },
  })
  assert.ok(listed.ok)
  const s = applyCtx(listed.ctx)
  assert.equal(s.market.qi.length, 1)
  assert.ok(s.player.qi[0]! < 50000, '挂单时真气先离开丹田')

  const after = resolveRaid({ ...s, player: { ...s.player, artifacts: [] } }, raidEvent(s, 1, 1))
  assert.equal(after.market.qi.length, 0, '挂单应被取消')
})

test('来袭会写一封受伤信（用原版逐字文案）', () => {
  const s = { ...withQi(outOfProtection(base()), 50000), player: { ...withQi(outOfProtection(base()), 50000).player, artifacts: [] } }
  const after = resolveRaid(s, raidEvent(s, 9999, 5))
  assert.equal(after.mail.length, 1)
  const m = after.mail[0]!
  assert.equal(m.kind, 'battle')
  assert.match(m.subject, /攻击你$/)
  const paras = (m.body as { paragraphs: string[] }).paragraphs.join('')
  assert.ok(paras.includes('无从抵挡'), '要用原版那句「仓促之间，你无从抵挡」')
  assert.ok(paras.includes('火辣辣的痛'))
})

test('打坏的法宝标成「损坏」，不会凭空消失', () => {
  const s0 = withQi(outOfProtection(base()), 50000)
  const s = { ...s0, player: { ...s0.player, artifacts: [sword()] } }
  const after = resolveRaid(s, raidEvent(s, 99999, 5))
  assert.equal(after.player.artifacts.length, 1, '法宝还在背包里')
  assert.equal(after.player.artifacts[0]!.status, '损坏')
})

// —— 接进主循环 ——

test('★tick 会自己安排来袭（不用 UI 主动调用）', () => {
  // 出保 + 身上有真气，跑一年游戏时间，应该被打过至少一次
  const start = withQi(outOfProtection(base()), 50000)
  let s: GameState = start
  let sawRaid = false
  for (let day = 0; day < 60 && !sawRaid; day++) {
    const out = tick(s, s.clock.wallT + (day + 1) * DAY * 1000)
    s = out.state
    if (out.resolved.some((e) => e.kind === 'raid')) sawRaid = true
    if (s.timeline.events.some((e) => e.kind === 'raid')) sawRaid = true
  }
  assert.ok(sawRaid, '两个月里一次来袭都没有，说明没接进主循环')
})
