/**
 * GM 面板的闸门。
 *
 * 这一组测试的存在理由只有一条：**GM 是第四条能绕过上限的路。**
 * `limits.test.ts` 守住了炼器/购买/换银票/发奖四个入口，要是 GM 面板能直接往
 * state 上糊一个 21 级经脉或者超格的背包，那四条守就白写了。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { newGame, validateGameState } from './game.ts'
import { applyGm, sanshiView, summonSanshi, meridianCapFor, bodyCapFor, skillCaps } from './gm.ts'
import { accept, entryOf } from './quest.ts'
import { DAY, weekdayOf } from './clock.ts'
import { SANSHI_SPAWN_WEEKDAY } from '../data/quests.ts'
import { artifactCapacity, artifactSpaceUsed } from './craft.ts'
import { capacityOf, BODY_DANTIAN, BODY_MAX_LEVEL, DANTIAN_MAX_LEVEL } from './cultivate.ts'
import { MERIDIANS } from '../data/meridian.ts'
import type { Artifact, GameState } from './state.ts'

const fresh = (): GameState =>
  newGame({ name: '玩家甲', gender: 'm', element: '金', school: '蜀山', x: 100, y: 100, seed: 7 }, 0)

const unwrap = (r: ReturnType<typeof applyGm>): GameState => {
  assert.equal(r.ok, true, r.ok ? '' : r.reason)
  return (r as { state: GameState }).state
}

/** 收拢说明。失败的补丁没有 notes，所以取不到就当空。 */
const notesOf = (r: ReturnType<typeof applyGm>): readonly string[] => (r.ok ? r.notes : [])

const item = (id: string, over: Partial<Artifact> = {}): Artifact => ({
  id, kind: 'sword', name: '玉虚桃木剑', quality: '凡品', refine: 0, status: '空闲', count: 1, ...over,
})

test('改完的存档一定过 validateGameState', () => {
  const s = unwrap(applyGm(fresh(), {
    name: '改名道友', realm: '元婴期', element: '水', school: '昆仑',
    silver: 12345, coin: 99, bonusCoin: 7, daoxing: 78840, experience: 50000,
  }))
  validateGameState(JSON.parse(JSON.stringify(s)))
  assert.equal(s.player.name, '改名道友')
  assert.equal(s.player.realm, '元婴期')
  assert.equal(s.player.daoxing, 78840)
})

test('★经脉按境界收拢：心动期之前 13，之后 20', () => {
  const zhuji = applyGm(fresh(), { meridians: Array(12).fill(99) })
  assert.equal(meridianCapFor('筑基期'), 13)
  assert.deepEqual([...unwrap(zhuji).player.meridians], Array(12).fill(13))
  assert.ok(notesOf(zhuji).some((n) => n.includes('13')), '要把收拢的事说出来')

  // 同一次补丁里升境界 + 升经脉：按**新**境界的上限，而不是旧的
  const both = unwrap(applyGm(fresh(), { realm: '心动期', meridians: Array(12).fill(99) }))
  assert.deepEqual([...both.player.meridians], Array(12).fill(20))
})

test('★本体收拢：丹田气海 36，其余 20', () => {
  const s = unwrap(applyGm(fresh(), { body: Array(8).fill(999) }))
  s.player.body.forEach((lv, i) => assert.equal(lv, bodyCapFor(i), `第 ${i} 项`))
  assert.equal(s.player.body[BODY_DANTIAN], DANTIAN_MAX_LEVEL)
  assert.equal(s.player.body[0], BODY_MAX_LEVEL)
})

test('★法术收拢到各自的 cap，未知法术被丢掉', () => {
  const caps = skillCaps()
  const r = applyGm(fresh(), { skills: { 御剑术: 999, 不存在的法术: 5 } })
  const s = unwrap(r)
  assert.equal(s.player.skills['御剑术'], caps.get('御剑术'))
  assert.equal(s.player.skills['不存在的法术'], undefined)
  assert.ok(notesOf(r).some((n) => n.includes('不存在的法术')))
})

test('★真气按**改完之后**的丹田上限收拢', () => {
  // 最常见的一次操作：丹田拉满 + 真气拉满。按旧上限算会被砍掉绝大部分。
  const s = unwrap(applyGm(fresh(), {
    body: [0, 0, 0, 0, 0, DANTIAN_MAX_LEVEL, 0, 0],
    qi: Array(5).fill(9e15),
  }))
  const cap = capacityOf(s)
  assert.ok(cap > 1_000_000, `丹田 36 级的上限应该很大，实得 ${cap}`)
  assert.deepEqual([...s.player.qi], Array(5).fill(cap))
  assert.ok(s.player.qi.every((v) => v <= cap), '不能超过丹田上限')
})

test('★背包超格整份拒绝，绝不替使用者销毁法宝', () => {
  const s0 = fresh()
  const many = Array.from({ length: 40 }, (_, i) => item(`gm:${i}`))
  const tooMany = applyGm(s0, { artifacts: many })
  assert.equal(tooMany.ok, false, '塞不下就该拒绝，不是丢掉多余的')
  assert.match((tooMany as { reason: string }).reason, /格/)

  // 正好塞满可以
  const fit = applyGm(s0, { artifacts: many.slice(0, artifactCapacity(s0)) })
  assert.equal(fit.ok, true)
  assert.equal(artifactSpaceUsed(unwrap(fit)), artifactCapacity(s0))

  // VIP 多 5 格
  const vipFit = unwrap(applyGm(s0, { artifacts: many.slice(0, artifactCapacity(s0) + 5), vip: true }))
  assert.equal(artifactCapacity(vipFit), artifactCapacity(s0) + 5)
  assert.equal(artifactSpaceUsed(vipFit), artifactCapacity(vipFit))
})

test('★缩小格数时不会把背包清空后放弃：炼器队列已经超格也得拒绝', () => {
  // 关掉 VIP + 把袖里乾坤降回 0，而炼器队列里 13 件在炼 —— 光队列就超过 5 格。
  // 以前的裁剪循环会把背包 pop 空之后放弃，两件法宝永久销毁，占用依然 13 > 5。
  const s0 = fresh()
  const s: GameState = {
    ...s0,
    player: { ...s0.player, vip: true, body: [0, 0, 0, 10, 0, 0, 0, 0], artifacts: [item('x'), item('y')] },
    timeline: { events: [{ id: 'craft:1', kind: 'craft', finishAt: 9999, payload: { count: 13, kind: 'sword', name: '剑', quality: '凡品' } }] },
  }
  const r = applyGm(s, { vip: false, body: [0, 0, 0, 0, 0, 0, 0, 0] })
  assert.equal(r.ok, false, '做不到就要说做不到')
  assert.match((r as { reason: string }).reason, /炼器队列/)
  assert.equal(s.player.artifacts.length, 2, '原状态一件都不能少')
})

test('★堆叠数量也算格子，不能用 count 绕过去', () => {
  const s0 = fresh()
  assert.equal(applyGm(s0, { artifacts: [item('gm:0', { count: 9999 })] }).ok, false)
  const ok = unwrap(applyGm(s0, { artifacts: [item('gm:0', { count: artifactCapacity(s0) })] }))
  assert.equal(artifactSpaceUsed(ok), artifactCapacity(s0))
})

test('★法宝状态必须是九种之一，重复 id 会被丢掉', () => {
  const bad = applyGm(fresh(), { artifacts: [item('a', { status: '无敌中' })] })
  assert.equal(bad.ok, false)
  assert.match((bad as { reason: string }).reason, /状态/)

  const dup = applyGm(fresh(), { artifacts: [item('a'), item('a', { name: '另一把' })] })
  assert.equal(unwrap(dup).player.artifacts.length, 1)
  assert.ok(notesOf(dup).some((n) => n.includes('重复')))
})

test('★坐标夹在世界内，钱与道行不能是负数', () => {
  const s = unwrap(applyGm(fresh(), { x: -5, y: 9999, silver: -1, coin: -1, daoxing: -1 }))
  assert.equal(s.player.x, 0)
  assert.equal(s.player.y, 199)
  assert.equal(s.player.silver, 0)
  assert.equal(s.player.coin, 0)
  assert.equal(s.player.daoxing, 0)
})

test('非法身份整份拒绝，不是悄悄改成别的', () => {
  const s = fresh()
  for (const patch of [
    { name: '   ' },
    { element: '风' as never },
    { school: '少林' as never },
    { realm: '大罗金仙' as never },
    { qi: [1, 2, 3] },
    { meridians: Array(11).fill(1) },
  ]) {
    const r = applyGm(s, patch)
    assert.equal(r.ok, false, `${JSON.stringify(patch)} 应当被拒`)
  }
  // 被拒时原状态一点没动
  assert.equal(s.player.name, '玩家甲')
})

test('★空补丁是恒等：什么都不填就什么都不改（真气是浮点，不能顺手取整）', () => {
  // 夹具必须带小数。以前这条用的是新号（真气全 0），于是
  // 「打开面板什么都不改直接点应用，每种真气少 1 点」这个 bug 一直没被抓到。
  const s0 = fresh()
  const s: GameState = {
    ...s0,
    player: { ...s0.player, body: [0, 0, 0, 0, 0, 36, 0, 0], qi: Array(5).fill(17279.99999999274) as unknown as GameState['player']['qi'] },
  }
  assert.ok(s.player.qi.every((v) => !Number.isInteger(v)), '前提：夹具的真气确实是小数')

  const out = unwrap(applyGm(s, {}))
  assert.deepEqual(JSON.parse(JSON.stringify(out)), JSON.parse(JSON.stringify(s)))
  assert.deepEqual([...out.player.qi], [...s.player.qi], '真气一丝都不许动')

  // 只改一个无关字段，真气同样不许动
  const other = unwrap(applyGm(s, { silver: 999 }))
  assert.deepEqual([...other.player.qi], [...s.player.qi])
  assert.equal(other.player.silver, 999)

  // 道行也是浮点累加出来的，同样不许被顺手取整
  const frac: GameState = { ...s, player: { ...s.player, daoxing: 78840.75 } }
  assert.equal(unwrap(applyGm(frac, {})).player.daoxing, 78840.75)
  assert.equal(unwrap(applyGm(frac, { daoxing: 100 })).player.daoxing, 100, '给了就按给的来')

  // 法术表里没有的法术、以及背包，空补丁时连「顺手清理」都不该做
  const legacy: GameState = {
    ...s,
    player: { ...s.player, skills: { 御剑术: 5, 某个老法术: 3 } },
  }
  assert.deepEqual(unwrap(applyGm(legacy, {})).player.skills, { 御剑术: 5, 某个老法术: 3 })
  assert.deepEqual(
    unwrap(applyGm(legacy, { skills: { 御剑术: 5, 某个老法术: 3 } })).player.skills,
    { 御剑术: 5 },
    '显式给了才清理',
  )
})

test('清空事件只清时间线，不动别的', () => {
  const s = fresh()
  const busy: GameState = {
    ...s,
    timeline: { events: [{ id: 'x', kind: 'cultivate', finishAt: 999, payload: { system: 'body', index: 0, toLevel: 1 } }] },
  }
  const out = unwrap(applyGm(busy, { clearEvents: true }))
  assert.equal(out.timeline.events.length, 0)
  assert.equal(out.player.name, busy.player.name)
  // 不勾就不清
  assert.equal(unwrap(applyGm(busy, {})).timeline.events.length, 1)
})

test('经脉数量与本体项数跟着数据表走，不写死', () => {
  assert.equal(fresh().player.meridians.length, MERIDIANS.length)
})

// ===========================================================================
// 召唤三尸
// ===========================================================================

/** 开服日是周二（weekday=2），所以第 4 天才是周六。 */
const atDay = (s: GameState, day: number): GameState =>
  ({ ...s, clock: { ...s.clock, gameT: day * DAY } })

const pigu = (day = 0): GameState => {
  const s = fresh()
  return atDay({ ...s, player: { ...s.player, realm: '辟谷期' } }, day)
}

test('★召唤三尸：平日也能现身，而正常领取仍然只在周六（保真规则没被动）', () => {
  const wed = pigu(0)
  assert.equal(weekdayOf(wed.clock) === SANSHI_SPAWN_WEEKDAY, false, '前提：今天不是周六')

  // 正常路径照旧被挡 —— 「三尸只在每周六现身」是原文，规则本身不能改
  const normal = accept(wed.quests, wed, 'realm:sanshi:1')
  assert.equal(normal.ok, false)
  assert.equal((normal as { reason: string }).reason, '三尸只在每周六现身')

  // GM 召唤放行
  const r = summonSanshi(wed)
  assert.equal(r.ok, true, r.ok ? '' : r.reason)
  const entry = entryOf((r as { state: GameState }).state.quests, 'realm:sanshi:1')
  assert.ok(entry, '召唤完就该在任务簿里')
  assert.ok(entry.at, '斩杀类任务领取时要把坐标冻结下来')
  assert.match((r as { message: string }).message, /上尸彭踞/)
})

test('★召唤只放行「日子」一条，境界与前置照旧挡着', () => {
  // 境界不够
  const zhuji = fresh()
  const r1 = summonSanshi(zhuji)
  assert.equal(r1.ok, false)
  assert.equal((r1 as { reason: string }).reason, '境界不足，需要辟谷期')

  // 前置未交付：第 1 只还没斩完，不能直接召唤第 2 只
  const s = pigu()
  const first = summonSanshi(s)
  assert.equal(first.ok, true)
  const afterFirst = (first as { state: GameState }).state
  assert.equal(entryOf(afterFirst.quests, 'realm:sanshi:2'), undefined, '第 2 只不该被一起领走')
  // 再召唤只会重复指向第 1 只
  const again = summonSanshi(afterFirst)
  assert.equal(again.ok, true)
  assert.match((again as { message: string }).message, /已经在 \(\d+,\d+\) 等着了/)
  assert.equal(afterFirst.quests.entries.filter((e) => e.id.startsWith('realm:sanshi:')).length, 1)
})

test('★面板显示的拦截原因，和按下去的结果是同一件事', () => {
  // 以前这里自己又推了一遍门槛，平日把「今天不是周六」误报成「前置任务尚未完成」
  for (const s of [fresh(), pigu(0), pigu(4)]) {
    const view = sanshiView(s)
    const r = summonSanshi(s)
    assert.equal(view.blocked, r.ok ? null : r.reason,
      `面板说「${view.blocked}」，实际是「${r.ok ? '可以召唤' : r.reason}」`)
  }
})

test('★三尸都斩完之后没有可召唤的', () => {
  const s = pigu()
  const done = {
    ...s,
    quests: {
      ...s.quests,
      entries: [1, 2, 3].map((n) => ({ id: `realm:sanshi:${n}`, acceptedAt: 0, done: true, cleared: true })),
    },
  }
  assert.equal(sanshiView(done).quest, null)
  const r = summonSanshi(done)
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /斩完/)
})

test('★召唤出来的坐标，和面板上预览的是同一个点', () => {
  const s = pigu()
  const preview = sanshiView(s).at
  const r = summonSanshi(s)
  assert.equal(r.ok, true)
  assert.deepEqual(sanshiView((r as { state: GameState }).state).at, preview)
})
