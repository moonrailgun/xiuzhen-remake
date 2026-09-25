/**
 * 几条「谁都得守」的上限，以前只有一部分入口在查。
 *
 * 背景：两轮审查各自独立撞到同一类问题 —— 规则写在一个地方，但绕过它的路不止一条。
 * 所以这里按「不变量 + 每条入口」来守，而不是按「某个函数」来守。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { newGame } from './game.ts'
import { artifactCapacity, artifactSpaceUsed, canAcquireArtifacts, refineArtifact } from './craft.ts'
import { startCultivate, BODY_DANTIAN, BODY_MAX_LEVEL, DANTIAN_MAX_LEVEL } from './cultivate.ts'
import { exchangeNote } from './town.ts'
import { claim, emptyQuestLog } from './quest.ts'
import { subQi, type Artifact, type FiveQi, type GameState } from './state.ts'

const qi = (...v: number[]): FiveQi => v as unknown as FiveQi

const base = (over: Partial<GameState['player']> = {}): GameState => {
  const s = newGame({ name: '守则道友', gender: 'm', element: '金', school: '蜀山', x: 100, y: 100, seed: 7 }, 0)
  return { ...s, player: { ...s.player, ...over } }
}

const filler = (n: number): Artifact[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `fill:${i}`, kind: 'sword' as const, name: '玉虚桃木剑',
    quality: '凡品' as const, refine: 0, status: '空闲', count: 1,
  }))

/** 背包正好塞满。 */
const full = (over: Partial<GameState['player']> = {}): GameState => {
  const s = base(over)
  return { ...s, player: { ...s.player, artifacts: filler(artifactCapacity(s)) } }
}

const used = (s: GameState): number => artifactSpaceUsed(s)

test('★袖里乾坤上限：换银票这条路以前不查', () => {
  const s = full({ silver: 100_000_000 })
  assert.equal(canAcquireArtifacts(s, 1), false, '前提：已经满格')
  const r = exchangeNote(s, '十万两银票')
  assert.equal(r.ok, false, '满格时不该换出银票')
  assert.match((r as { reason: string }).reason, /上限/)

  // 腾出一格就换得动，且正好顶到上限不越界
  const room = { ...s, player: { ...s.player, artifacts: s.player.artifacts.slice(1) } }
  const ok = exchangeNote(room, '十万两银票')
  assert.equal(ok.ok, true)
  assert.equal(used((ok as { state: GameState }).state), artifactCapacity(s))
})

test('★袖里乾坤上限：任务发奖这条路以前不查，满格领奖会顶成 6/5', () => {
  // 「脱离保护」是唯一带物品奖励的任务（新手玄武玉匣，2009-03-24 加入）。
  const s = full({ daoxing: 78840 })
  const log = { ...emptyQuestLog('qi'), entries: [{ id: 'newbie:tail:4', acceptedAt: 0, done: false }] }
  const r = claim(log, s, 'newbie:tail:4')
  assert.equal(r.ok, false, '满格时应当挡在领取这一步，奖励留着不丢')
  assert.match((r as { reason: string }).reason, /上限/)

  const room = { ...s, player: { ...s.player, artifacts: s.player.artifacts.slice(1) } }
  const ok = claim(log, room, 'newbie:tail:4')
  assert.equal(ok.ok, true)
  assert.equal(used((ok as { value: { state: GameState } }).value.state), artifactCapacity(s))
})

test('★经脉 / 本体不再能升到数据表定义域之外', () => {
  const rich = { qi: qi(9e9, 9e9, 9e9, 9e9, 9e9) }
  // 心动期之前经脉封顶 13（原文）
  const zhuji = base({ ...rich, meridians: Array(12).fill(13), realm: '筑基期' })
  assert.equal(startCultivate(zhuji, { system: 'meridian', index: 0 }).ok, false)
  // 心动期之后到 20
  const xindong = base({ ...rich, meridians: Array(12).fill(13), realm: '心动期' })
  assert.equal(startCultivate(xindong, { system: 'meridian', index: 0 }).ok, true)
  const maxed = base({ ...rich, meridians: Array(12).fill(20), realm: '心动期' })
  assert.equal(startCultivate(maxed, { system: 'meridian', index: 0 }).ok, false)

  // 本体：丹田 36，其余 20
  const body = Array(8).fill(BODY_MAX_LEVEL)
  body[BODY_DANTIAN] = DANTIAN_MAX_LEVEL
  const capped = base({ ...rich, body })
  assert.equal(startCultivate(capped, { system: 'body', index: 3 }).ok, false, '袖里乾坤 20 级封顶')
  assert.equal(startCultivate(capped, { system: 'body', index: BODY_DANTIAN }).ok, false, '丹田 36 级封顶')
  const almost = base({ ...rich, body: body.map((v, i) => (i === BODY_DANTIAN ? DANTIAN_MAX_LEVEL - 1 : v)) })
  assert.equal(startCultivate(almost, { system: 'body', index: BODY_DANTIAN }).ok, true, '35 级还能再升一级')
})

test('★扣真气夹在 0：canAfford 的容差不该留下 -5e-7', () => {
  const left = subQi(qi(1, 2, 3, 4, 5), qi(1 + 5e-7, 1, 1, 1, 1))
  assert.equal(left[0], 0, '卡在成本上扣完就是 0，不是 -5e-7')
  assert.deepEqual([...left].slice(1), [1, 2, 3, 4])
  assert.ok(left.every((v) => v >= 0), 'validateGameState 要求真气恒 ≥ 0')
})

test('★淬炼只吃空闲的法宝', () => {
  const s = base()
  const two: Artifact[] = [
    { id: 'a', kind: 'sword', name: '玉虚桃木剑', quality: '凡品', refine: 0, status: '斩杀中', count: 1 },
    { id: 'b', kind: 'sword', name: '玉虚桃木剑', quality: '凡品', refine: 0, status: '空闲', count: 1 },
  ]
  const r = refineArtifact({ ...s, player: { ...s.player, artifacts: two } }, ['a', 'b'])
  assert.equal(r.ok, false, '在外面打架的剑不能被淬掉')
  assert.equal((r as { reason: string }).reason, '只能淬炼空闲的法宝')

  const idle = two.map((a) => ({ ...a, status: '空闲' }))
  assert.equal(refineArtifact({ ...s, player: { ...s.player, artifacts: idle } }, ['a', 'b']).ok, true)
})
