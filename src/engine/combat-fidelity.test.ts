import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame } from './game.ts'
import { DAY } from './clock.ts'
import { launch, launchedSwordStats, resolveBattleEvent, type BattleTarget, type LaunchSword } from './battle.ts'
import { advanceTo } from './timeline.ts'
import { totalQi, type Artifact, type GameState } from './state.ts'
import { swordByName } from '../data/swords.ts'

const artifact = (id: string, over: Partial<Artifact> = {}): Artifact => ({ id, kind: 'sword', name: '青龙伏魔剑', quality: '极品', refine: 0, status: '空闲', count: 1, ...over })
const sword = (a: Artifact): LaunchSword => ({ ...a, ...swordByName(a.name)!, id: a.id, name: a.name, quality: a.quality, refine: a.refine, speed: swordByName(a.name)!.speed!, agility: swordByName(a.name)!.agility! })
const state = (items: readonly Artifact[] = []): GameState => {
  const s = newGame({ name: '剑客', gender: 'm', element: '木', school: '通天', x: 116, y: 52, seed: 7 }, 0)
  return { ...s, clock: { ...s.clock, gameT: 60 * DAY }, player: { ...s.player, skills: { 御剑术: 20 }, artifacts: items, qi: [9000, 9000, 9000, 9000, 9000] } }
}
const monster: BattleTarget = { kind: 'monster', name: '试剑', x: 116, y: 52, attack: 1, hp: 1, agility: 1, element: null }
const finish = (s: GameState) => {
  const result = advanceTo(s, s.timeline, s.clock.gameT + 100000, resolveBattleEvent)
  return { ...result.state, timeline: result.timeline }
}

test('三主动剑术按原文调整属性，且须学习后才能出击', () => {
  const sw = sword(artifact('a'))
  const plain = launchedSwordStats(sw, {})
  const smash = launchedSwordStats(sw, {}, '碎玉剑法')
  const circle = launchedSwordStats(sw, {}, '小周天剑法')
  const absorb = launchedSwordStats(sw, {}, '吸星剑法')
  assert.equal(smash.attack, plain.attack * 2)
  assert.equal(smash.noReturn, true)
  assert.equal(circle.attack, Math.floor(plain.attack / 4))
  assert.equal(circle.agility, plain.agility * 2)
  assert.equal(absorb.durability, Math.floor(plain.durability / 4))
  assert.equal(absorb.absorb, plain.absorb! * 2)
  assert.equal(launch(state(), monster, [sw], { swordArt: '碎玉剑法' }).ok, false)
})

test('碎玉出击后留损坏实体，不返航也不搬运战利品', () => {
  const a = artifact('a'), s = state([a])
  const r = launch({ ...s, player: { ...s.player, skills: { ...s.player.skills, 碎玉剑法: 1 } } }, monster, [sword(a)], { swordArt: '碎玉剑法' })
  assert.ok(r.ok)
  const done = finish(r.state)
  assert.equal(done.player.artifacts[0]!.status, '损坏')
  assert.equal(done.timeline.events.length, 0)
  assert.equal(totalQi(done.player.qi), totalQi(s.player.qi))
})

test('伤害严格超过原有耐久一半才降一级淬炼，存活后也保留降级', () => {
  const a = artifact('a', { refine: 2 })
  for (const [attack, refine] of [[160, 2], [161, 1]] as const) {
    const r = launch(state([a]), { ...monster, attack }, [sword(a)])
    assert.ok(r.ok)
    assert.equal(finish(r.state).player.artifacts[0]!.refine, refine)
  }
})
