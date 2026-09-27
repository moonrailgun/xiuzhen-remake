import { test } from 'node:test'
import assert from 'node:assert/strict'
import { divine, divineSucceeds, flyingStar, taiyi, ziwei, DIVINATIONS } from './divine.ts'
import type { DivinationKind } from './divine.ts'
import { generateNpcs, npcAt } from './npc.ts'
import { DAY } from './clock.ts'

const SEED = 20081028
const world = { bases: generateNpcs(SEED, 20), patches: {} }
const target = npcAt(world, world.bases[0]!, 60 * DAY, SEED)

const opts = (over = {}) => ({
  at: 1000,
  byName: '173小鱼',
  skills: { 先天神数: 1, 九宫飞星法: 1, 太乙神数: 1, 紫微斗数: 1, 水镜玄光: 1, 梅花易数: 1, 六壬神定: 1, 诰命真经: 1 },
  myYijing: 10,
  theirYijing: 5,
  inSight: true,
  located: true,
  ...over,
})

test('八种术数，包括1月4日开放的先天神数', () => {
  assert.equal(Object.keys(DIVINATIONS).length, 8)
  assert.equal(DIVINATIONS['太乙神数'].school, '通天')
  assert.equal(DIVINATIONS['梅花易数'].school, '蜀山')
  assert.equal(DIVINATIONS['九宫飞星'].school, null, '九宫飞星不是独门')
})

test('易经每高一级降低对方推算成功率10%，同级可推算', () => {
  assert.equal(divineSucceeds(10, 5), true)
  assert.equal(divineSucceeds(5, 5, 0.99), true)
  assert.equal(divineSucceeds(5, 6, 0.89), true)
  assert.equal(divineSucceeds(5, 6, 0.9), false)
  const r = divine('九宫飞星', target, opts({ myYijing: 1, theirYijing: 9 }))
  assert.equal(r.ok, false)
  assert.match((r as { reason: string }).reason, /术数修为不及对方/)
})

test('九宫飞星：结果文案与原文一字不差', () => {
  const mail = flyingStar(target, 1000, '173小鱼')
  const line = (mail.body as { line: string }).line
  assert.equal(line, `你掐指一算，发现${target.base.name}正位于(${target.x},${target.y})。`)
  assert.equal(mail.from, '系统')
  assert.equal(mail.kind, 'divine')
})

test('消息主题格式：{推算者}推算{目标}（原文）', () => {
  const mail = flyingStar(target, 1000, '173小鱼')
  assert.equal(mail.subject, `173小鱼推算${target.base.name}`)
})

test('九宫飞星附带丹田真气与固本培元等级', () => {
  const body = flyingStar(target, 1000, '我').body as { qi: number[]; rootLevel: number }
  assert.equal(body.qi.length, 5)
  assert.ok(body.rootLevel >= 0)
})

test('太乙神数：标题与四列表照原文', () => {
  const mail = taiyi(target, 1000, '我')
  const body = mail.body as { title: string; rows: { name: string; type: string; count: number; status: string }[] }
  assert.equal(body.title, `${target.base.name}拥有的法宝`)
  for (const r of body.rows) {
    assert.match(r.type, /^【.+】$/, '类型写作【飞剑】这种格式')
    assert.ok(['空闲', '损坏', '淬炼'].includes(r.status), r.status)
  }
})

test('太乙神数要先看到人或先定位（技能弹窗 Tips 原文）', () => {
  const blocked = divine('太乙神数', target, opts({ inSight: false, located: false }))
  assert.equal(blocked.ok, false)
  assert.match((blocked as { reason: string }).reason, /先看到对方|九宫飞星/)

  assert.equal(divine('太乙神数', target, opts({ inSight: false, located: true })).ok, true, '定位过就行')
})

test('紫微斗数：12 行，每组三条只在第一条标属性（原文格式）', () => {
  const levels = [14, 14, 14, 13, 13, 13, 13, 13, 13, 13, 13, 14]
  const body = ziwei(target, 1000, '我', levels).body as {
    title: string
    rows: { name: string; level: number; element: string; multiplier: number }[]
  }
  assert.equal(body.title, `${target.base.name}的经脉修炼情况`)
  assert.equal(body.rows.length, 12)
  // 每组三条：第一条有属性，后两条为空
  const withElement = body.rows.filter((r) => r.element !== '')
  assert.equal(withElement.length, 4, '四组各标一次')
  assert.equal(body.rows[0]!.element !== '', true)
  assert.equal(body.rows[1]!.element, '')
  assert.equal(body.rows[2]!.element, '')
  assert.equal(body.rows[3]!.element !== '', true, '下一组重新标')
})

test('紫微斗数的倍率对齐原版推算信（Lv.13=200、Lv.14=270）', () => {
  const levels = Array(12).fill(13)
  levels[0] = 14
  const rows = (ziwei(target, 1000, '我', levels).body as { rows: { multiplier: number }[] }).rows
  assert.equal(rows[0]!.multiplier, 270, 'Lv.14 = 270 倍')
  assert.equal(rows[1]!.multiplier, 200, 'Lv.13 = 200 倍')
})

// —— 另外四种：机制照官方说明，文案是 [重建] ——
// 全项目对「有机制说明、没文案存档」的东西一律是「照说明重建 + 标注」
// （逐级消耗表、世界地形、NPC 生态都是这么办的），术数不该另立一套标准。

test('★七种术数全部可用，不再有「后续版本开放」', () => {
  for (const kind of Object.keys(DIVINATIONS) as DivinationKind[]) {
    const r = divine(kind, target, opts({ spot: { x: 5, y: 5 } }))
    assert.equal(r.ok, true, `${kind} 应该能推算：${(r as { reason?: string }).reason ?? ''}`)
  }
})

test('水镜玄光按坐标列出该地的人；没选坐标时给提示', () => {
  const none = divine('水镜玄光', target, { ...opts(), spot: undefined })
  assert.equal(none.ok, false)

  const r = divine('水镜玄光', target, { ...opts(), spot: { x: 12, y: 34 }, here: [target] })
  assert.equal(r.ok, true)
  const body = (r as { mail: { body: Record<string, unknown> } }).mail.body
  assert.equal(body['kind'], '水镜玄光')
  // 首句沿用九宫飞星的原文句式「你掐指一算，…」
  assert.match(String(body['lead']), /^你掐指一算/)
  assert.match(String(body['title']), /\(12,34\)/)
  assert.equal((body['rows'] as unknown[]).length, 1)
})

test('梅花易数报当前位置与去向；原地不动时说「原地未动」', () => {
  const still = divine('梅花易数', target, { ...opts(), tomorrow: { x: target.x, y: target.y } })
  const rows = (still as unknown as { mail: { body: { rows: { note: string }[] } } }).mail.body.rows
  assert.equal(rows[1]!.note, '原地未动')

  const moved = divine('梅花易数', target, { ...opts(), tomorrow: { x: 9, y: 9 } })
  const rows2 = (moved as unknown as { mail: { body: { rows: { note: string }[] } } }).mail.body.rows
  assert.equal(rows2[1]!.note, '(9,9)')
})

test('六壬神定列护法；没有护法时给空表文案', () => {
  const empty = divine('六壬神定', target, { ...opts(), pals: [] })
  const body = (empty as unknown as { mail: { body: Record<string, unknown> } }).mail.body
  assert.equal((body['rows'] as unknown[]).length, 0)
  assert.match(String(body['empty']), /并无护法/)

  const some = divine('六壬神定', target, { ...opts(), pals: [target] })
  const rows = (some as unknown as { mail: { body: { rows: unknown[] } } }).mail.body.rows
  assert.equal(rows.length, 1)
})

test('诰命真经列正往该地去的人，按剩余距离排', () => {
  const r = divine('诰命真经', target, {
    ...opts(),
    spot: { x: 50, y: 50 },
    inbound: [{ npc: target, distance: 7 }],
  })
  assert.equal(r.ok, true)
  const body = (r as unknown as { mail: { body: { rows: { note: string }[]; title: string } } }).mail.body
  assert.match(body.title, /\(50,50\)/)
  assert.equal(body.rows[0]!.note, '尚有 7 格')
})

test('★三种有原文的术数，文案不受这次补写影响', () => {
  // 九宫飞星的首句是逐字原文，补写四种时不能顺手改了它
  const r = divine('九宫飞星', target, opts())
  const body = (r as { mail: { body: Record<string, unknown> } }).mail.body
  assert.equal(body['kind'], '九宫飞星')
  assert.match(String(body['line'] ?? body['lead'] ?? ''), /^你掐指一算，发现.*正位于\(\d+,\d+\)。$/)
})

test('推算结果是可入收件箱的信件', () => {
  const r = divine('九宫飞星', target, opts())
  assert.equal(r.ok, true)
  const mail = (r as { mail: { id: string; read: boolean; at: number } }).mail
  assert.ok(mail.id.length > 0)
  assert.equal(mail.read, false)
  assert.equal(mail.at, 1000)
})

test('未学术数不能推算，九宫技能名映射九宫飞星法', () => {
  assert.equal(divine('九宫飞星', target, { ...opts(), skills: {} }).ok, false)
  assert.equal(divine('九宫飞星', target, { ...opts(), skills: { 先天神数: 1, 九宫飞星法: 1 } }).ok, true)
})


test('九宫飞星一级只定位，二级才显示真气', () => {
  for (const level of [1, 2]) {
    const r = divine('九宫飞星', target, opts({ skills: { 九宫飞星法: level }, myYijing: 5, theirYijing: 5 }))
    assert.ok(r.ok)
    assert.equal('qi' in r.mail.body, level >= 2)
  }
})

test('先天神数学习后可看法宝，满级显示状态', () => {
  assert.equal(divine('先天神数', target, opts({ skills: {} })).ok, false)
  for (const level of [1, 20]) {
    const r = divine('先天神数', { ...target, swords: 2 }, opts({ skills: { 先天神数: level } }))
    assert.ok(r.ok)
    assert.equal(r.mail.body.kind, '先天神数')
    const rows = r.mail.body.rows as { status?: string }[]
    assert.equal(rows.length, target.artifacts.length)
    assert.equal(rows[0]!.status, level === 20 ? '空闲' : undefined)
  }
})

test('正式推算跨视野定位、目标移动失效、水镜一分钟、独门与随机序列', async () => {
  const { newGame, importGame } = await import('./game.ts')
  const { performDivination, isDivinationVisible } = await import('./divine.ts')
  const base = newGame({ name: '术数测试', gender: 'm', element: '金', school: '通天', x: 0, y: 0, seed: 1 }, 0)
  const s = { ...base, player: { ...base.player, skills: { 九宫飞星法: 2, 水镜玄光: 1, 太乙神数: 1, 梅花易数: 1, 易经: 500 } } }
  const n = npcAt(s.npc, s.npc.bases[0]!, s.clock.gameT, s.worldSeed)
  assert.equal(isDivinationVisible(s, n), false)
  const location = performDivination(s, '九宫飞星', n.base.id)
  assert.ok(location.ok)
  assert.ok(isDivinationVisible(importGame(JSON.stringify(location.state)), n))
  assert.equal(isDivinationVisible(location.state, { ...n, x: n.x + 1 }), false)
  assert.ok(performDivination(location.state, '太乙神数', n.base.id).ok)
  assert.equal(performDivination(location.state, '梅花易数', n.base.id).ok, false)
  const mirror = performDivination(s, '水镜玄光', undefined, n)
  assert.ok(mirror.ok)
  assert.ok(isDivinationVisible(mirror.state, n))
  assert.equal(isDivinationVisible({ ...mirror.state, clock: { ...s.clock, gameT: 60 } }, n), false)
  assert.deepEqual(performDivination(s, '九宫飞星', n.base.id), location)
  assert.notDeepEqual(location.state.rng, s.rng)
})

test('六壬读取已保存的 NPC 护法，并反映玩家建立和解除的互助关系', async () => {
  const { newGame } = await import('./game.ts')
  const { performDivination } = await import('./divine.ts')
  const { changeGuardian } = await import('./social.ts')
  const base = newGame({ name: '守望道友', gender: 'm', element: '金', school: '通天', x: 0, y: 0, seed: 1 }, 0)
  const n = npcAt(base.npc, base.npc.bases[0]!, 0, base.worldSeed)
  const s = { ...base, player: { ...base.player, x: n.x, y: n.y, skills: { 六壬神定: 1, 易经: 500 } } }
  const added = changeGuardian(s, n.base.id, true)
  assert.ok(added.ok)
  const result = performDivination(added.state, '六壬神定', n.base.id)
  assert.ok(result.ok)
  assert.ok((result.state.mail[0]!.body.rows as { name: string }[]).some(row => row.name === s.player.name))
  const removed = changeGuardian(result.state, n.base.id, false)
  assert.ok(removed.ok)
  const again = performDivination(removed.state, '六壬神定', n.base.id)
  assert.ok(again.ok)
  assert.equal((again.state.mail[0]!.body.rows as { name: string }[]).some(row => row.name === s.player.name), false)
})
