import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  startCraft,
  startRepair,
  repairPlan,
  artifactSpaceUsed,
  usePill,
  resolveCraft,
  craftSeconds,
  refineArtifact,
  artifactSlots,
  REFINE_FAIL_TEXT,
  CRAFT_QUEUE_ID,
  BODY_HAND,
  type CraftOrder,
} from './craft.ts'
import { advanceTo, countByKind } from './timeline.ts'
import { newGame } from './game.ts'
import type { FiveQi, GameState, Artifact } from './state.ts'

const qi = (...v: number[]): FiveQi => v as unknown as FiveQi

test('服丹只消费一颗，单行丹与五行丹按炼数恢复，并受丹田上限约束', () => {
  const pill = (name: string): Artifact => ({ id: 'pill', kind: 'pill', name, quality: '凡品', refine: 0, status: '空闲', count: 2 })
  const s = state({ qi: qi(0, 0, 0, 0, 0), artifacts: [pill('二炼碧罗丹')] })
  const single = usePill(s, 'pill')
  assert.ok(single.ok)
  assert.deepEqual(single.state.player.qi, qi(0, 2000, 0, 0, 0))
  assert.equal(single.state.player.artifacts[0]?.count, 1)
  const all = usePill({ ...s, player: { ...s.player, artifacts: [pill('二十炼五行丹')] } }, 'pill')
  assert.ok(all.ok)
  assert.deepEqual(all.state.player.qi, qi(2000, 2000, 2000, 2000, 2000))
  const unknown = { ...s, player: { ...s.player, artifacts: [pill('不明丹药')] } }
  assert.equal(usePill(unknown, 'pill').ok, false)
  assert.equal(unknown.player.artifacts[0]?.count, 2)
  assert.deepEqual(s.player.qi, qi(0, 0, 0, 0, 0))
})

const state = (over: Partial<GameState['player']> = {}): GameState => {
  const s = newGame(
    { name: '173小鱼', gender: 'f', element: '木', school: '通天', x: 100, y: 100, seed: 7 },
    0,
  )
  return { ...s, player: { ...s.player, qi: qi(99999, 99999, 99999, 99999, 99999), ...over } }
}

/** 玉虚桃木剑：原版炼制消耗 140/144/71/48/95，耗时 0:11:07 = 667 秒。 */
const swordOrder = (count = 1): CraftOrder => ({
  kind: 'sword',
  name: '玉虚桃木剑',
  count,
  cost: qi(140, 144, 71, 48, 95),
  baseSeconds: 667,
  quality: '凡品',
})

const pillOrder = (): CraftOrder => ({
  kind: 'pill',
  name: '一炼紫金丹',
  count: 1,
  cost: qi(100, 100, 100, 100, 100),
  baseSeconds: 22 * 3600 + 30 * 60, // 22:30:00
  quality: '凡品',
})

test('炼器事件不占修炼队列（官方指南原文）', () => {
  const s = state()
  const r = startCraft(s, swordOrder())
  assert.equal(r.ok, true)
  const after = (r as { state: GameState }).state
  assert.equal(countByKind(after.timeline, 'craft'), 1)
  assert.equal(countByKind(after.timeline, 'cultivate'), 0, '炼器不占修炼队列')
})

test('飞剑与护身可以并行炼制（官方攻略《护身揭密》原文）', () => {
  let s = state()
  s = (startCraft(s, swordOrder()) as { state: GameState }).state
  const guard = startCraft(s, { ...swordOrder(), kind: 'guard', name: '指玄道藏碑' })
  assert.equal(guard.ok, true, '护身应能与飞剑同时炼')
  s = (guard as { state: GameState }).state
  assert.equal(countByKind(s.timeline, 'craft'), 2)
})

test('同类法宝一次只能炼一炉', () => {
  const s = state()
  const first = (startCraft(s, swordOrder()) as { state: GameState }).state
  const again = startCraft(first, swordOrder())
  assert.equal(again.ok, false)
  assert.match((again as { reason: string }).reason, /正在炼制中/)
})

test('丹药一次一炉（否则会浪费一个 CD）', () => {
  const s = state()
  const first = (startCraft(s, pillOrder()) as { state: GameState }).state
  const again = startCraft(first, pillOrder())
  assert.equal(again.ok, false)
  assert.match((again as { reason: string }).reason, /丹炉正在炼制中/)
})

test('真气不足时拒绝', () => {
  const r = startCraft(state({ qi: qi(0, 0, 0, 0, 0) }), swordOrder())
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /炼制所需真气不足/)
})

test('炼剑检查铸剑等级，拒绝时不扣费；无需提前学习御剑', () => {
  const order = { ...swordOrder(), name: '青龙伏魔剑' }
  const before = state()
  const snapshot = structuredClone(before)
  const blocked = startCraft(before, order)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.match(blocked.reason, /铸剑之术1级/)
  assert.deepEqual(before, snapshot)
  assert.equal(startCraft(state({ skills: { 铸剑之术: 1 } }), order).ok, true)
})

test('炼制扣真气并计入道行', () => {
  const s = state()
  const after = (startCraft(s, swordOrder(2)) as { state: GameState }).state
  // 两件：140×2 = 280 金
  assert.equal(s.player.qi[0]! - after.player.qi[0]!, 280)
  const totalCost = (140 + 144 + 71 + 48 + 95) * 2
  assert.equal(after.player.daoxing, totalCost, '炼制消耗同样算道行')
})

test('手熟无他缩短炼制时间：20 级为基准的 1/5（截图交叉验证）', () => {
  // 七星磐龙剑 1:11:26（4286 秒）→ 0:14:17（857 秒），正好 1/5
  assert.equal(craftSeconds(4286, 'sword', 0), 4286)
  assert.equal(craftSeconds(4286, 'sword', 20), Math.round(4286 / 5))
})

test('炼丹不吃手熟无他（技能弹窗 Tips 原文）', () => {
  const base = 22 * 3600 + 30 * 60
  assert.equal(craftSeconds(base, 'pill', 0), base)
  assert.equal(craftSeconds(base, 'pill', 20), base, '炼丹时间与手熟无他无关')
})

test('炼制耗时 = 单件耗时 × 数量', () => {
  const s = state({ body: [0, 0, 0, 0, 0, 0, 0, 0] })
  const after = (startCraft(s, swordOrder(3)) as { state: GameState }).state
  assert.equal(after.timeline.events[0]!.finishAt, 667 * 3)
})

test('炼制完成后成品进背包', () => {
  const s = state()
  const started = (startCraft(s, swordOrder(2)) as { state: GameState }).state
  const out = advanceTo(started, started.timeline, 1e9, (st, ev) => ({ state: resolveCraft(st, ev) }))
  assert.equal(out.state.player.artifacts.length, 2)
  assert.equal(out.state.player.artifacts[0]!.name, '玉虚桃木剑')
  assert.equal(out.state.player.artifacts[0]!.kind, 'sword')
  assert.equal(out.state.player.artifacts[0]!.refine, 0)
  assert.equal(countByKind(out.timeline, 'craft'), 0)
})

test('三条炼器队列各自独立', () => {
  assert.equal(CRAFT_QUEUE_ID.sword, 'craft:sword')
  assert.equal(CRAFT_QUEUE_ID.guard, 'craft:guard')
  assert.equal(CRAFT_QUEUE_ID.pill, 'craft:pill')
  assert.equal(new Set(Object.values(CRAFT_QUEUE_ID)).size, 3)
})

test('法宝携带上限：基础 5，袖里乾坤 +N，VIP +5，高级 VIP +15', () => {
  assert.equal(artifactSlots(0), 5, '截图 #121「拥有法宝 (1/5)」')
  assert.equal(artifactSlots(3), 8)
  assert.equal(artifactSlots(0, true), 10)
  assert.equal(artifactSlots(0, false, true), 20)
})

// —— 淬炼 ——

const sword = (id: string, refine = 0, quality: Artifact['quality'] = '上品'): Artifact => ({
  id,
  kind: 'sword',
  name: '玉虚桃木剑',
  quality,
  refine,
  status: '空闲',
  count: 1,
})

test('淬炼需要两件完全相同的法宝', () => {
  const s = state({ artifacts: [sword('a'), sword('b', 1)] })
  const r = refineArtifact(s, ['a', 'b'])
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /完全相同/)
})

test('淬炼：百炼满级时 +1 必成，两件合成一件 +1', () => {
  const s = state({ artifacts: [sword('a'), sword('b')] })
  const r = refineArtifact(s, ['a', 'b'], { baihuanLevel: 20 })
  assert.equal(r.ok, true)
  const out = r as { state: GameState; success: boolean }
  assert.equal(out.success, true)
  assert.equal(out.state.player.artifacts.length, 1, '两件变一件')
  assert.equal(out.state.player.artifacts[0]!.refine, 1)
})

test('花 2 仙石保必成（即使成功率不足）', () => {
  const s = state({ artifacts: [sword('a', 14), sword('b', 14)] })
  const r = refineArtifact(s, ['a', 'b'], { baihuanLevel: 0, protect: 'sure' })
  const out = r as { success: boolean; state: GameState }
  assert.equal(out.success, true)
  assert.equal(out.state.player.artifacts[0]!.refine, 15)
})

test('失败时两件俱毁，文案照原版', () => {
  // 百炼 0 级淬 +15，成功率很低；用保证失败的方式检查后果
  let s = state({ artifacts: [sword('a', 14), sword('b', 14)] })
  let failed = false
  for (let i = 0; i < 50 && !failed; i++) {
    const r = refineArtifact(s, ['a', 'b'], { baihuanLevel: 0 })
    const out = r as { success: boolean; state: GameState; message: string }
    if (!out.success) {
      failed = true
      assert.equal(out.message, REFINE_FAIL_TEXT)
      assert.equal(out.state.player.artifacts.length, 0, '两件俱毁')
    } else {
      // 换个 rng 状态再试
      s = { ...s, rng: out.state.rng, player: { ...s.player, artifacts: [sword('a', 14), sword('b', 14)] } }
    }
  }
  assert.ok(failed, '50 次里应至少失败一次')
})

test('花 1 仙石保不毁：失败时两件都留着', () => {
  let s = state({ artifacts: [sword('a', 14), sword('b', 14)] })
  for (let i = 0; i < 50; i++) {
    const r = refineArtifact(s, ['a', 'b'], { baihuanLevel: 0, protect: 'keep' })
    const out = r as { success: boolean; state: GameState; message: string }
    if (!out.success) {
      assert.equal(out.state.player.artifacts.length, 2, '保不毁：两件都还在')
      assert.match(out.message, /法宝无损/)
      return
    }
    s = { ...s, rng: out.state.rng, player: { ...s.player, artifacts: [sword('a', 14), sword('b', 14)] } }
  }
})

test('淬炼是确定的：同 rng 状态给出同结果', () => {
  const s = state({ artifacts: [sword('a', 12), sword('b', 12)] })
  const r1 = refineArtifact(s, ['a', 'b'], { baihuanLevel: 5 }) as { success: boolean }
  const r2 = refineArtifact(s, ['a', 'b'], { baihuanLevel: 5 }) as { success: boolean }
  assert.equal(r1.success, r2.success)
})

test('找不到法宝时报错', () => {
  const r = refineArtifact(state({ artifacts: [] }), ['x', 'y'])
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /找不到/)
})

test('炼器预留法宝位，不得超过携带上限或抢占另一炉位', () => {
  assert.equal(startCraft(state(), swordOrder(6)).ok, false)
  const reserved = (startCraft(state(), swordOrder(5)) as { state: GameState }).state
  assert.equal(startCraft(reserved, pillOrder()).ok, false)
  assert.equal(startCraft(state({ vip: true }), swordOrder(10)).ok, true)
})

test('炼器拒绝小数和非有限数量', () => {
  for (const count of [0.5, NaN, Infinity]) assert.equal(startCraft(state(), swordOrder(count)).ok, false)
})


test('损坏法宝修理扣气、占同类炼器队列，满包原位恢复并保留属性', () => {
  const broken: Artifact = { id: 'broken', name: '玉虚桃木剑', kind: 'sword', quality: '极品', refine: 1, status: '损坏', count: 1 }
  const before = state({ artifacts: Array.from({ length: 5 }, (_, i) => ({ ...broken, id: i ? `other${i}` : broken.id })) })
  const plan = repairPlan(before, broken.id)!
  assert.deepEqual(plan.cost, [64, 187, 127, 127, 160])
  assert.equal(plan.seconds, 1334)
  const r = startRepair(before, broken.id)
  assert.ok(r.ok)
  assert.equal(r.state.player.artifacts[0]!.status, '修理中')
  assert.equal(artifactSpaceUsed(r.state), 5)
  assert.deepEqual(r.state.player.qi, before.player.qi.map((q, i) => q - plan.cost[i]!))
  assert.equal(startRepair(r.state, 'other1').ok, false)
  assert.equal(startCraft(r.state, swordOrder()).ok, false)
  const event = r.state.timeline.events.find(e => e.id === CRAFT_QUEUE_ID.sword)!
  const after = resolveCraft(r.state, event)
  assert.equal(after.player.artifacts.length, 5)
  assert.deepEqual(after.player.artifacts[0], { ...broken, status: '空闲' })
  assert.equal(startRepair(after, broken.id).ok, false)
  const poor = state({ artifacts: [broken], qi: qi(0, 0, 0, 0, 0) })
  assert.equal(startRepair(poor, broken.id).ok, false)
  assert.equal(poor.player.artifacts[0]!.status, '损坏')
  assert.equal(startRepair(before, 'missing').ok, false)
})
