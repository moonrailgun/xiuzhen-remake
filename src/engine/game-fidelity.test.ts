import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame, currentQiPerHour, tick, terrainOf } from './game.ts'
import { DAY, HOUR } from './clock.ts'
import { terrainAt } from '../data/world.ts'
import { artifactUpkeepPerHour } from './craft.ts'
import type { GameState } from './state.ts'

const born = () => newGame({ name: '测试', gender: 'f', element: '木', school: '通天', x: 100, y: 100, seed: 8 }, 0)
const item = { id: 'sword', kind: 'sword', name: '青龙伏魔剑', quality: '凡品', refine: 1, count: 2, status: '空闲' } as const
test('出保才与当地出保NPC平分，保护期从各自建号计时；法宝按真实五气耗费扣除', () => {
  const s = born(), npc = { ...s.npc.bases[0]!, profile: '羊' as const, homeX: 100, homeY: 100, bornAt: 0 }
  const mature: GameState = { ...s, clock: { ...s.clock, gameT: 10 * DAY }, npc: { bases: [npc], patches: {} } }
  const ground = () => [4, 4, 4, 4, 4] as const
  assert.equal(currentQiPerHour(mature, ground)[1], 6)
  assert.equal(currentQiPerHour({ ...mature, player: { ...mature.player, createdAt: DAY } }, ground)[1], 12)
  assert.equal(currentQiPerHour({ ...mature, npc: { bases: [{ ...npc, bornAt: DAY }], patches: {} } }, ground)[1], 12)
  const guard = { ...item, id: 'guard', kind: 'guard' as const, name: '指玄道藏碑', refine: 0, count: 1 }
  const equipped = { ...mature, player: { ...mature.player, artifacts: [item, guard] } }
  const cost = [item, guard].map(a => artifactUpkeepPerHour(a, '木')).reduce((n, q) => n + q[1], 0)
  assert.equal(artifactUpkeepPerHour(guard, '木')[1], 10)
  assert.equal(currentQiPerHour(equipped, ground)[1], 6 - cost)
})

test('保护期边界、三尸跨日和福地占领接入主循环', () => {
  const s = born(), npc = { ...s.npc.bases[0]!, profile: '羊' as const, homeX: 100, homeY: 100, bornAt: 0 }
  const initial: GameState = { ...s, clock: { ...s.clock, gameT: 10 * DAY }, player: { ...s.player, createdAt: 123, qi: [0, 0, 0, 0, 0] }, npc: { bases: [npc], patches: {} } }
  const ground = () => [4, 4, 4, 4, 4] as const
  const offline = tick(initial, HOUR * 1000, ground).state
  const split = tick(tick(initial, 123000, ground).state, HOUR * 1000, ground).state
  assert.deepEqual(offline.player.qi, split.player.qi)
  assert.equal(offline.player.qi[1], 12 * 123 / HOUR + 6 * (HOUR - 123) / HOUR)
  const saturday = { ...s, clock: { ...s.clock, gameT: 4 * DAY }, quests: { ...s.quests, entries: [{ id: 'realm:sanshi:1', acceptedAt: 4 * DAY, done: false }] } }
  assert.equal(tick(saturday, DAY * 1000).state.quests.entries.length, 0)
  let at: [number, number] = [0, 0]
  outer: for (let x = 0; x < 200; x++) for (let y = 0; y < 200; y++) if (terrainAt(8, x, y, 4) === '福地') { at = [x, y]; break outer }
  const sanctuary = { ...s, clock: { ...s.clock, gameT: 4 * 7 * DAY } }
  assert.deepEqual(terrainOf(sanctuary)(...at), [0, 0, 0, 0, 0])
  const owned = { ...sanctuary, quests: { ...s.quests, sanctuaries: [{ x: at[0], y: at[1], kind: '福地' as const, occupiedAt: sanctuary.clock.gameT }] } }
  assert.deepEqual(terrainOf(owned)(...at), [5, 5, 5, 5, 5])
})
