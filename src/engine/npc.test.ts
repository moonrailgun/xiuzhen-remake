import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateNpcs,
  npcAt,
  allNpcsAt,
  npcsAtCell,
  npcsInSight,
  ranking,
  patchNpc,
  type NpcWorld,
} from './npc.ts'
import { DAY } from './clock.ts'
import { WORLD_SIZE } from '../data/world.ts'

const SEED = 20081028
const world = (count = 200): NpcWorld => ({ bases: generateNpcs(SEED, count), patches: {} })

test('生成 NPC：数量受控、名字与画像齐全', () => {
  const w = world(100)
  assert.equal(w.bases.length, 100)
  for (const b of w.bases) {
    assert.ok(b.name.length > 0)
    assert.ok(['羊', '小狼', '大狼'].includes(b.profile))
    assert.ok(b.homeX >= 0 && b.homeX < WORLD_SIZE)
    assert.ok(b.homeY >= 0 && b.homeY < WORLD_SIZE)
  }
})

test('NPC 数量上限 3000（存档体积预算）', () => {
  assert.equal(generateNpcs(SEED, 99999).length, 3000)
})

test('同种子生成同一批 NPC', () => {
  assert.deepEqual(generateNpcs(SEED, 20), generateNpcs(SEED, 20))
})

// —— 一致性：这是本模块最关键的约束 ——

test('★同一时刻，四个入口看到的同一个 NPC 数值完全一致', () => {
  const w = world(50)
  const t = 30 * DAY
  const base = w.bases[7]!

  const direct = npcAt(w, base, t, SEED)
  const fromAll = allNpcsAt(w, t, SEED).find((n) => n.base.id === base.id)!
  const fromCell = npcsAtCell(w, t, SEED, direct.x, direct.y).find((n) => n.base.id === base.id)!
  const fromRank = ranking(w, t, SEED, 'daoxing', 9999).find((n) => n.base.id === base.id)!

  for (const other of [fromAll, fromCell, fromRank]) {
    assert.equal(other.daoxing, direct.daoxing, '道行')
    assert.equal(other.swords, direct.swords, '飞剑数')
    assert.equal(other.swordPower, direct.swordPower, '战力')
    assert.equal(other.qi, direct.qi, '真气')
    assert.equal(other.yijing, direct.yijing, '易经')
    assert.equal(other.x, direct.x, '位置 x')
    assert.equal(other.y, direct.y, '位置 y')
    assert.equal(other.realm, direct.realm, '境界')
  }
})

test('同一游戏日内反复查询结果不变（可离线重放）', () => {
  const w = world(30)
  const base = w.bases[3]!
  const morning = npcAt(w, base, 10 * DAY + 3600, SEED)
  const evening = npcAt(w, base, 10 * DAY + 20 * 3600, SEED)
  assert.deepEqual(morning, evening, '同一天内状态应完全相同')
})

test('跨天会变化（NPC 在成长）', () => {
  const w = world(30)
  const base = w.bases[3]!
  const d10 = npcAt(w, base, 10 * DAY, SEED)
  const d40 = npcAt(w, base, 40 * DAY, SEED)
  assert.ok(d40.daoxing > d10.daoxing, '道行应增长')
})

test('狼比羊长得快（画像差异）', () => {
  const w = world(300)
  const t = 60 * DAY
  const states = allNpcsAt(w, t, SEED)
  const avg = (p: string) => {
    const g = states.filter((n) => n.base.profile === p)
    return g.reduce((s, n) => s + n.daoxing, 0) / Math.max(1, g.length)
  }
  assert.ok(avg('大狼') > avg('小狼'), '大狼 > 小狼')
  assert.ok(avg('小狼') > avg('羊'), '小狼 > 羊')
})

test('羊待在驻点不动，狼会游走', () => {
  const w = world(200)
  const sheep = w.bases.find((b) => b.profile === '羊')!
  const wolf = w.bases.find((b) => b.profile === '大狼')!

  const s1 = npcAt(w, sheep, 10 * DAY, SEED)
  const s2 = npcAt(w, sheep, 50 * DAY, SEED)
  assert.equal(s1.x, sheep.homeX, '羊在驻点')
  assert.equal(s2.x, sheep.homeX, '羊一直在驻点')

  let moved = false
  for (const d of [10, 20, 30, 40, 50]) {
    const a = npcAt(w, wolf, d * DAY, SEED)
    const b = npcAt(w, wolf, (d + 1) * DAY, SEED)
    if (a.x !== b.x || a.y !== b.y) moved = true
  }
  assert.ok(moved, '狼应该会换地方')
})

test('NPC 位置始终在世界内', () => {
  const w = world(300)
  for (const t of [0, 10 * DAY, 100 * DAY]) {
    for (const n of allNpcsAt(w, t, SEED)) {
      assert.ok(n.x >= 0 && n.x < WORLD_SIZE, `x=${n.x}`)
      assert.ok(n.y >= 0 && n.y < WORLD_SIZE, `y=${n.y}`)
    }
  }
})

// —— 状态后缀 ——

test('新号带 (n)，满 10 天后出保', () => {
  const w = world(50)
  const base = { ...w.bases[0]!, bornAt: 0 }
  assert.equal(npcAt(w, base, 5 * DAY, SEED).suffix, 'n', '第 5 天还在保')
  const later = npcAt(w, base, 30 * DAY, SEED)
  assert.notEqual(later.suffix, 'n', '出保后不再是 n')
})

test('境界随道行提升', () => {
  const w = world(50)
  const base = { ...w.bases[0]!, bornAt: 0, profile: '大狼' as const }
  const early = npcAt(w, base, 3 * DAY, SEED)
  const late = npcAt(w, base, 300 * DAY, SEED)
  assert.equal(early.realm, '筑基期')
  assert.ok(['心动期', '金丹期', '元婴期'].includes(late.realm), late.realm)
})

test('道行的中文写法（排行榜用）', () => {
  const w = world(20)
  const n = npcAt(w, w.bases[0]!, 100 * DAY, SEED)
  assert.match(n.daoxingText, /年|个月/)
})

// —— 排行榜 ——

test('排行榜按指定字段降序', () => {
  const w = world(100)
  const rows = ranking(w, 50 * DAY, SEED, 'daoxing', 10)
  assert.equal(rows.length, 10)
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1]!.daoxing >= rows[i]!.daoxing, '应降序')
  }
})

test('三种排行榜各自排序', () => {
  const w = world(100)
  const t = 50 * DAY
  for (const kind of ['daoxing', 'estate', 'experience'] as const) {
    const rows = ranking(w, t, SEED, kind, 5)
    assert.equal(rows.length, 5)
  }
})

// —— 视野与格子 ——

test('视野内的 NPC 按曼哈顿距离筛', () => {
  const w = world(500)
  const t = 30 * DAY
  const near = npcsInSight(w, t, SEED, 100, 100, 5)
  for (const n of near) {
    assert.ok(Math.abs(n.x - 100) + Math.abs(n.y - 100) <= 5)
  }
  const wider = npcsInSight(w, t, SEED, 100, 100, 20)
  assert.ok(wider.length >= near.length, '范围越大人越多')
})

// —— 稀疏修正 ——

test('玩家毁掉 NPC 的剑后，各入口都看到变少了', () => {
  const w = world(30)
  const t = 60 * DAY
  const base = w.bases[2]!
  const before = npcAt(w, base, t, SEED)
  assert.ok(before.swords > 0, '先得有剑')

  const patched = patchNpc(w, base.id, { swordsLost: 1 })
  const after = npcAt(patched, base, t, SEED)
  assert.equal(after.swords, before.swords - 1)
  // 排行榜入口也应看到同一个值
  const fromRank = ranking(patched, t, SEED, 'daoxing', 9999).find((n) => n.base.id === base.id)!
  assert.equal(fromRank.swords, after.swords)
})

test('被击退后位置用修正值，不再按日游走', () => {
  const w = world(50)
  const wolf = w.bases.find((b) => b.profile === '大狼')!
  const patched = patchNpc(w, wolf.id, { x: 7, y: 9 })
  for (const d of [10, 20, 30]) {
    const n = npcAt(patched, wolf, d * DAY, SEED)
    assert.equal(n.x, 7)
    assert.equal(n.y, 9)
  }
})

test('抢走真气后道行与真气都下降', () => {
  const w = world(30)
  const t = 60 * DAY
  const base = w.bases[5]!
  const before = npcAt(w, base, t, SEED)
  const after = npcAt(patchNpc(w, base.id, { qiLost: 1000 }), base, t, SEED)
  assert.equal(after.qi, Math.max(0, before.qi - 1000))
  assert.ok(after.daoxing <= before.daoxing)
})

test('数值不会变成负数', () => {
  const w = world(20)
  const base = w.bases[0]!
  const patched = patchNpc(w, base.id, { qiLost: 99999999, swordsLost: 99 })
  const n = npcAt(patched, base, 10 * DAY, SEED)
  assert.ok(n.qi >= 0)
  assert.ok(n.swords >= 0)
  assert.ok(n.daoxing >= 0)
})

test('NPC 世界可 JSON 往返（进存档）', () => {
  const w = patchNpc(world(50), 3, { swordsLost: 1, x: 5, y: 6 })
  const back = JSON.parse(JSON.stringify(w)) as NpcWorld
  assert.equal(back.bases.length, 50)
  assert.deepEqual(back.patches[3], { swordsLost: 1, x: 5, y: 6 })
})


test('NPC易经按共享成长派生，出生为零、逐日单调且封顶500', () => {
  const w = world(1)
  const base = { ...w.bases[0]!, bornAt: 0 }
  assert.equal(npcAt(w, base, 0, SEED).yijing, 0)
  const levels = [1, 10, 30, 60, 300, 1000].map((day) => npcAt(w, base, day * DAY, SEED).yijing)
  assert.ok(levels[1]! > 0)
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i]! >= levels[i - 1]!)
  assert.equal(levels.at(-1), 500)
  const original = npcAt(w, base, 30 * DAY, SEED)
  const looted = npcAt(patchNpc(w, base.id, { qiLost: 100000 }), base, 30 * DAY, SEED)
  assert.equal(looted.yijing, original.yijing, '抢真气不会抹掉已学术数')
})
