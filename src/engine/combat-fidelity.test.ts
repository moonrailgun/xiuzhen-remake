import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame } from './game.ts'
import { DAY } from './clock.ts'
import { launch, launchedSwordStats, resolveBattleEvent, type BattleTarget, type LaunchSword } from './battle.ts'
import { resolveRaidEvent, defendRaid, requestRaidAid } from './raid.ts'
import { npcAt, patchNpc } from './npc.ts'
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
  const result = advanceTo(s, s.timeline, s.clock.gameT + 100000, (st, event) => event.kind === 'raid' ? resolveRaidEvent(st, event) : resolveBattleEvent(st, event))
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

test('NPC 战斗读取真实装备、断剑持久、掠夺受胜剑吸收限制且不扣道行', () => {
  const a = artifact('a', { refine: 4 }), s = state([a]), base = s.npc.bases[0]!
  const before = npcAt(s.npc, base, s.clock.gameT, s.worldSeed)
  const enemy = artifact('enemy', { quality: '废品' })
  const patched = { ...s, npc: patchNpc(s.npc, base.id, { artifacts: [enemy], x: s.player.x, y: s.player.y }) }
  const r = launch(patched, { ...monster, kind: 'player', npcId: base.id, name: base.name, attack: 999999, hp: 999999 }, [sword(a)])
  assert.ok(r.ok)
  const done = finish(r.state), after = npcAt(done.npc, base, s.clock.gameT, s.worldSeed)
  assert.equal(done.mail[0]!.body['won'], true, '目标面板快照不能代替真实装备')
  assert.equal(after.artifacts[0]!.status, '损坏')
  assert.equal(after.daoxing, before.daoxing)
  const lost = done.npc.patches[base.id]!.qiLost ?? 0
  assert.ok(lost > 0)
  assert.ok(lost <= launchedSwordStats(sword(a), {}).absorb!)
  assert.notDeepEqual([after.x, after.y], [s.player.x, s.player.y])
})

test('天雷万磁剑只能在青山出鞘，胜后销毁之前已经损坏的剑', () => {
  const a = artifact('thunder', { name: '天雷万磁剑', refine: 8 }), s = state([a])
  assert.equal(launch(s, monster, [sword(a)]).ok, false)
  const mountain = { ...s, player: { ...s.player, x: 115, y: 6 } }, base = s.npc.bases[0]!
  const r = launch({ ...mountain, npc: patchNpc(s.npc, base.id, { artifacts: [artifact('old', { status: '损坏' }), artifact('fresh', { quality: '废品' })], x: 115, y: 6 }) },
    { ...monster, kind: 'player', npcId: base.id, name: base.name, x: 115, y: 6 }, [sword(a)])
  assert.ok(r.ok)
  const after = finish(r.state).npc.patches[base.id]!.artifacts!
  assert.equal(after.some(a => a.id === 'old'), false)
  assert.equal(after.find(a => a.id === 'fresh')!.status, '损坏')
})

test('NPC 天雷守胜同样销毁进攻者旧断剑，本次新断剑仍可修', () => {
  const a = artifact('fresh', { quality: '废品' }), old = artifact('old', { status: '损坏' })
  const s = state([a, old]), base = s.npc.bases[0]!
  const prepared = { ...s, npc: patchNpc(s.npc, base.id, { artifacts: [artifact('thunder', { name: '天雷万磁剑', refine: 8 })], x: 115, y: 6 }) }
  const r = launch(prepared, { ...monster, kind: 'player', npcId: base.id, name: base.name }, [sword(a)])
  assert.ok(r.ok)
  const after = finish(r.state).player.artifacts
  assert.equal(after.some(a => a.id === 'old'), false)
  assert.equal(after.find(a => a.id === 'fresh')!.status, '损坏')
})

test('护身阶段真实等待，玩家可祭剑，已派护法不能重复出援', () => {
  const guard = artifact('guard', { kind: 'guard', name: '指玄道藏碑', quality: '上品', refine: 5 })
  const a = artifact('a', { refine: 4 }), s = state([guard, a]), friend = s.npc.bases[0]!
  const initial = { ...s, social: { guardians: [friend.id], npcGuardians: {}, guilds: [], blacklist: [] },
    npc: patchNpc(s.npc, friend.id, { artifacts: [artifact('helper')], x: s.player.x + 1, y: s.player.y }) }
  const event = { id: 'raid', kind: 'raid' as const, finishAt: s.clock.gameT, payload: { attacker: '敌人', swordPower: 100, swords: 1, element: '火' } }
  const staged = resolveRaidEvent(initial, event)
  assert.equal(staged.follow?.[0]?.payload['phase'], 'guard')
  assert.equal(staged.follow![0]!.finishAt - event.finishAt, 5760)
  assert.equal(staged.state.mail.length, initial.mail.length)
  const waiting = { ...staged.state, timeline: { events: staged.follow! } }
  const raised = defendRaid(waiting, 'raid', [sword(a)])
  assert.ok(raised.ok)
  assert.equal(raised.state.player.artifacts.find(a => a.id === 'a')!.status, '绞杀中')
  const aid = requestRaidAid(raised.state, 'raid', friend.id)
  assert.ok(aid.ok)
  assert.equal(requestRaidAid(aid.state, 'raid', friend.id).ok, false)
  const aidEvent = aid.state.timeline.events.find(e => e.id === 'raid')!
  const helpers = aidEvent.payload['aid'] as { arriveAt: number }[]
  assert.ok(helpers[0]!.arriveAt > s.clock.gameT)
  assert.equal(npcAt(aid.state.npc, friend, s.clock.gameT, s.worldSeed).artifacts[0]!.status, '斩杀中')
})

test('NPC 抢气同样受胜剑吸收限制，返航后入账，损坏与降级保持实体', () => {
  const s = state([artifact('weak', { quality: '废品' })]), base = s.npc.bases[0]!
  const enemy = artifact('enemy', { refine: 4 })
  const prepared = { ...s, npc: patchNpc(s.npc, base.id, { artifacts: [enemy], x: 116, y: 52 }) }
  const incoming = { id: 'raid', kind: 'raid' as const, finishAt: s.clock.gameT, payload: { phase: 'outbound', attackerId: base.id, attacker: base.name, returnSeconds: 300 } }
  const fighting = resolveRaidEvent(prepared, incoming)
  const fight = fighting.follow![0]!
  const ended = resolveRaidEvent(fighting.state, fight)
  const taken = totalQi(prepared.player.qi) - totalQi(ended.state.player.qi)
  assert.ok(taken > 0 && taken <= launchedSwordStats(sword(enemy), {}).absorb!)
  assert.equal(ended.state.player.artifacts[0]!.status, '损坏')
  assert.equal(ended.state.npc.patches[base.id]!.qiGained ?? 0, 0, '返航前不能入账')
  const home = ended.follow![0]!
  assert.equal(home.finishAt - fight.finishAt, 300)
  assert.equal(ended.state.npc.patches[base.id]!.artifacts![0]!.status, '返回中')
  const returned = resolveRaidEvent(ended.state, home).state
  assert.equal(returned.npc.patches[base.id]!.qiGained, taken)
  assert.equal(returned.npc.patches[base.id]!.artifacts![0]!.status, '空闲')
})

test('来袭祭剑计入同时控制上限，拒绝援助不会占用 NPC 装备', async () => {
  const { swordsOut } = await import('./battle.ts')
  const a = artifact('a'), s = state([a]), friend = s.npc.bases[0]!
  const event = { id: 'raid', kind: 'raid' as const, finishAt: s.clock.gameT + 10, payload: { phase: 'guard', guards: [], attackers: [], defending: [sword(a)] } }
  const waiting = { ...s, timeline: { events: [event] }, npc: patchNpc(s.npc, friend.id, { artifacts: [artifact('helper')], x: 0, y: 0 }) }
  assert.equal(swordsOut(waiting), 1)
  const rejected = requestRaidAid(waiting, 'raid', friend.id)
  assert.equal(rejected.ok, false)
  assert.equal(npcAt(waiting.npc, friend, s.clock.gameT, s.worldSeed).artifacts[0]!.status, '空闲')
  const accepted = { ...waiting, social: { guardians: [friend.id], npcGuardians: {}, guilds: [], blacklist: [] } }
  const tooLate = requestRaidAid(accepted, 'raid', friend.id)
  assert.equal(tooLate.ok, false)
  assert.equal(npcAt(accepted.npc, friend, s.clock.gameT, s.worldSeed).artifacts[0]!.status, '空闲')
})

test('旧存档出击快照缺吸收时仍沿用同剑品质淬炼的搬运容量', () => {
  const a = artifact('a', { refine: 4 }), s = state([a]), base = s.npc.bases[0]!
  const r = launch({ ...s, npc: patchNpc(s.npc, base.id, { artifacts: [] }) }, { ...monster, kind: 'player', npcId: base.id, name: base.name }, [sword(a)])
  assert.ok(r.ok)
  const event = r.state.timeline.events[0]!
  const stored = event.payload['swords'] as LaunchSword[]
  const { absorb: _absorb, ...oldStats } = stored[0]!.launchedStats!
  const old = { ...r.state, timeline: { events: [{ ...event, payload: { ...event.payload, swords: [{ ...stored[0]!, launchedStats: oldStats }] } }] } }
  assert.ok((finish(old).npc.patches[base.id]?.qiLost ?? 0) > 0)
})
