import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGame, importGame } from './game.ts'
import { socialOf, changeGuardian, canRequestAid, createGuild, joinGuild, setGuildRelation } from './social.ts'

const fresh = () => newGame({ name: '测试', gender: 'm', element: '金', school: '蜀山', x: 10, y: 10, seed: 1 }, 0)
test('护法关系持久保存，陌生人不能应邀参战，解除后立即失去权限', () => {
  const s = fresh(), id = s.npc.bases[0]!.id
  assert.equal(canRequestAid(s, id), false)
  const r = changeGuardian(s, id, true)
  assert.ok(r.ok)
  assert.equal(canRequestAid(importGame(JSON.stringify(r.state)), id), true)
  const removed = changeGuardian(r.state, id, false)
  assert.ok(removed.ok)
  assert.equal(canRequestAid(removed.state, id), false)
  assert.equal(changeGuardian(s, 99999, true).ok, false)
})
test('玩家门派独立于道源，加入与外交均检查成员和掌门权限', () => {
  const s = fresh()
  assert.equal(socialOf(s).guilds.some(g => g.members.includes(0)), false)
  const made = createGuild(s, '清风阁')
  assert.ok(made.ok)
  const guild = socialOf(made.state).guilds.find(g => g.members.includes(0))!
  assert.equal(guild.leader, 0)
  assert.equal(createGuild(made.state, '第二派').ok, false)
  const allied = setGuildRelation(made.state, 1, 'ally')
  assert.ok(allied.ok)
  assert.ok(socialOf(allied.state).guilds.find(g => g.id === 1)!.allies.includes(guild.id))
  const joined = joinGuild(s, 1)
  assert.ok(joined.ok)
  assert.equal(setGuildRelation(joined.state, 2, 'enemy').ok, false)
  assert.equal(joined.state.player.school, '蜀山')
})
