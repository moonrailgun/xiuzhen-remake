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
import { applyGm, meridianCapFor, bodyCapFor, skillCaps } from './gm.ts'
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

test('★背包不会被塞到超格；VIP 开着就多 5 格', () => {
  const s0 = fresh()
  const many = Array.from({ length: 40 }, (_, i) => item(`gm:${i}`))

  const noVip = unwrap(applyGm(s0, { artifacts: many, vip: false }))
  assert.ok(artifactSpaceUsed(noVip) <= artifactCapacity(noVip))

  const withVip = unwrap(applyGm(s0, { artifacts: many, vip: true }))
  assert.equal(artifactCapacity(withVip), artifactCapacity(noVip) + 5, 'VIP +5 格')
  assert.ok(artifactSpaceUsed(withVip) <= artifactCapacity(withVip))
  assert.ok(withVip.player.artifacts.length > noVip.player.artifacts.length, 'VIP 能多带几件')

  // 袖里乾坤升级同样在同一次补丁里生效
  const sleeve = unwrap(applyGm(s0, { artifacts: many, body: [0, 0, 0, BODY_MAX_LEVEL, 0, 0, 0, 0] }))
  assert.equal(artifactSpaceUsed(sleeve), artifactCapacity(sleeve))
})

test('★堆叠数量也算格子，不能用 count 绕过去', () => {
  const s = unwrap(applyGm(fresh(), { artifacts: [item('gm:0', { count: 9999 })] }))
  assert.ok(artifactSpaceUsed(s) <= artifactCapacity(s), `占用 ${artifactSpaceUsed(s)}`)
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

test('空补丁是恒等：什么都不填就什么都不改', () => {
  const s = fresh()
  const out = unwrap(applyGm(s, {}))
  assert.deepEqual(JSON.parse(JSON.stringify(out)), JSON.parse(JSON.stringify(s)))
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
