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
  myYijing: 10,
  theirYijing: 5,
  inSight: true,
  located: true,
  ...over,
})

test('七种术数，含三派独门（官方一句话表）', () => {
  assert.equal(Object.keys(DIVINATIONS).length, 7)
  assert.equal(DIVINATIONS['太乙神数'].school, '通天')
  assert.equal(DIVINATIONS['梅花易数'].school, '蜀山')
  assert.equal(DIVINATIONS['九宫飞星'].school, null, '九宫飞星不是独门')
})

test('术数修为不及对方时推算失败（原文规则）', () => {
  assert.equal(divineSucceeds(10, 5), true)
  assert.equal(divineSucceeds(5, 10), false)
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
