import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame } from './game.ts'
import { terrainAt, WORLD_SIZE } from '../data/world.ts'
import { DAY } from './clock.ts'
import { accept, claim, markCleared, questTarget } from './quest.ts'

test('福地洞天境界门槛、石碑神兽和占领后独享元气', async () => {
  const { sanctuaryEntryBlocker, sanctuaryQi } = await import('./sanctuary.ts')
  const born = newGame({ name: '石碑', gender: 'm', element: '金', school: '蜀山', x: 100, y: 100, seed: 8 }, 0)
  for (const [kind, realm, id, qi] of [['福地', '辟谷期', 'sanctuary:blessing', 5], ['洞天', '心动期', 'sanctuary:cave', 6]] as const) {
    let at: readonly [number, number] | undefined
    for (let x = 0; x < WORLD_SIZE && !at; x++) for (let y = 0; y < WORLD_SIZE; y++) if (terrainAt(born.worldSeed, x, y, 4) === kind) { at = [x, y]; break }
    assert.ok(at)
    const s = { ...born, clock: { ...born.clock, gameT: 28 * DAY }, player: { ...born.player, x: at[0], y: at[1] } }
    assert.ok(sanctuaryEntryBlocker(s, ...at))
    const qualified = { ...s, player: { ...s.player, realm } }
    assert.equal(sanctuaryEntryBlocker(qualified, ...at), null)
    assert.deepEqual(sanctuaryQi(qualified, ...at), [0, 0, 0, 0, 0])
    const accepted = accept(qualified.quests, qualified, id)
    assert.ok(accepted.ok)
    assert.deepEqual([questTarget(accepted.value, id)?.x, questTarget(accepted.value, id)?.y], at)
    assert.equal(claim(accepted.value, qualified, id).ok, false)
    const owned = claim(markCleared(accepted.value, id), qualified, id)
    assert.ok(owned.ok)
    const state = { ...owned.value.state, quests: owned.value.log }
    assert.deepEqual(sanctuaryQi(state, ...at), [qi, qi, qi, qi, qi])
    assert.equal(accept(state.quests, state, id).ok, false)
  }
})
