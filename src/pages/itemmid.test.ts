import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderItemMid, type ItemMidVm, type StatRange } from './itemmid.ts'
import type { Quality } from '../data/artifacts.ts'

type SwordFixture = {
  readonly name: string
  readonly flavor: readonly string[]
  readonly element: string | null
  readonly tradable: boolean | null
  readonly forgeLevel: number
  readonly wieldLevel: number
  readonly attack: readonly [number, number]
  readonly durability: readonly [number, number]
  readonly absorb: readonly [number, number]
  readonly speed: number | null
  readonly agility: number | null
  readonly knockback: number | null
  readonly upkeepPerHour: readonly number[]
  readonly craftCost: readonly number[] | null
  readonly craftSeconds: number | null
}
const swords: readonly SwordFixture[] = (
  JSON.parse(readFileSync(new URL('../../tools/fixtures/swords.json', import.meta.url), 'utf8')) as {
    swords: readonly SwordFixture[]
  }
).swords

const five = (v: readonly number[]): readonly [number, number, number, number, number] =>
  [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0, v[4] ?? 0]

/** 照原版：品质前缀 + 剑名 + `+N`。 */
function swordVm(name: string, quality: Quality | null, refine: number, over: Partial<ItemMidVm> = {}): ItemMidVm {
  const s = swords.find((x) => x.name === name)
  assert.ok(s, `fixture 里没有 ${name}`)
  const flat = (n: number): StatRange => [n, n]
  return {
    name: `${quality ?? ''}${name}${refine > 0 ? `+${refine}` : ''}`,
    flavor: s.flavor,
    tradable: s.tradable === true,
    element: (s.element ?? '无属性') as ItemMidVm['element'],
    category: '飞剑',
    quality,
    refine,
    forge: { text: `铸剑之术${s.forgeLevel}级`, met: true },
    wield: { text: `御剑术${s.wieldLevel}级`, met: true },
    stats: {
      attack: s.attack,
      durability: s.durability,
      absorb: s.absorb,
      speed: s.speed ?? 0,
      agility: flat(s.agility ?? 0),
      knockback: s.knockback ?? 0,
    },
    upkeep: five(s.upkeepPerHour),
    craftCost: s.craftCost ? five(s.craftCost) : undefined,
    craftSeconds: s.craftSeconds ?? undefined,
    ...over,
  }
}

test('R 窗内容宽 230，四张表齐全，名字不出现在内容里（写在 #rwindowtext）', () => {
  const h = renderItemMid(swordVm('青龙伏魔剑', '极品', 0))
  assert.ok(h.includes('<DIV class=itemmid>'))
  assert.ok(h.includes('基础属性'))
  assert.ok(h.includes('每小时消耗真气'))
  assert.ok(h.includes('炼制消耗'))
  assert.ok(h.includes('需要时间 '))
  assert.ok(!h.includes('极品青龙伏魔剑'), '物品名在 R 窗标题条，不在内容表里')
})

test('标签行 =【可否交易】【五行】【类别】，右对齐（截图 #82）', () => {
  // #82 的极品青龙伏魔剑写【可以交易】，而 fixture 的 tradable 是基础件的标记
  // （05 §3.3 [推断]：极品一律可交易）—— 这条规则不归渲染层，所以由调用方给值
  const h = renderItemMid(swordVm('青龙伏魔剑', '极品', 0, { tradable: true }))
  assert.ok(h.includes('<SPAN align="right">【可以交易】【木】【飞剑】</SPAN>'))
  const untradable = renderItemMid(swordVm('上善若水剑', '上品', 10))
  assert.ok(untradable.includes('【不可交易】【水】【飞剑】'))
})

test('#82 极品青龙伏魔剑：攻击160 耐久80 吸收240 速度7 敏捷3 击退2，0:11:07', () => {
  const h = renderItemMid(swordVm('青龙伏魔剑', '极品', 0))
  assert.ok(h.includes('<TD>160</TD><TD>80</TD><TD>240</TD>'))
  assert.ok(h.includes('<TD>7</TD><TD>3</TD><TD>2</TD>'))
  assert.ok(h.includes('炼制条件:铸剑之术1级'))
  assert.ok(h.includes('使用条件:御剑术1级'))
  assert.ok(h.includes('需要时间 0:11:07'))
})

test('#90 上品上善若水剑+10：panelStat 把区间×品质×2^淬炼算成 36864/73728/73728，敏捷 5120', () => {
  const h = renderItemMid(swordVm('上善若水剑', '上品', 10))
  assert.ok(h.includes('<TD>36864</TD><TD>73728</TD><TD>73728</TD>'))
  // 速度与击退不吃淬炼，仍是 11 与 2；敏捷 5×2^10
  assert.ok(h.includes('<TD>11</TD><TD>5120</TD><TD>2</TD>'))
})

test('#99 极品七星磐龙剑+8：307200/153600/532480，敏捷 256', () => {
  const h = renderItemMid(swordVm('七星磐龙剑', '极品', 8))
  assert.ok(h.includes('<TD>307200</TD><TD>153600</TD><TD>532480</TD>'))
  assert.ok(h.includes('<TD>11</TD><TD>256</TD><TD>2</TD>'))
})

test('图鉴态（原版 quality=-1）属性显示成区间 8~80', () => {
  const h = renderItemMid(swordVm('玉虚桃木剑', null, 0))
  assert.ok(h.includes('<TD>8~80</TD><TD>16~160</TD><TD>12~120</TD>'))
  assert.ok(h.includes('<TD>10</TD><TD>3</TD><TD>2</TD>'), '速度/敏捷/击退区间两端相同则出单值')
})

test('条件不满足时缀红字「(未满足)」（截图 #85）', () => {
  const h = renderItemMid(swordVm('七星磐龙剑', '极品', 0, {
    forge: { text: '铸剑之术20级', met: false },
    wield: { text: '御剑术20级', met: false },
  }))
  assert.equal(h.split('<SPAN class=smallred>(未满足)</SPAN>').length - 1, 2)
  assert.ok(h.includes('炼制条件:铸剑之术20级 <SPAN class=smallred>(未满足)</SPAN>&nbsp;'))
})

test('蓝字特效说明（天雷万磁剑，09 §1.8 原文）', () => {
  const h = renderItemMid(swordVm('天雷万磁剑', '极品', 0, {
    effect: '天雷万磁剑，可以销毁已损坏的飞剑。此剑所需雷电之气惊人，只能在青山中令之出鞘',
  }))
  assert.ok(h.includes('<SPAN class=smallblue>天雷万磁剑，可以销毁已损坏的飞剑。'))
  assert.ok(h.includes('【无属性】【飞剑】'))
})

test('丹药态（截图 #84 [荒]低阶天元丹）：服食增加真气各 8000、炼制消耗只有需要时间 24:00:00、右下「服食丹药」', () => {
  const h = renderItemMid({
    name: '[荒]低阶天元丹',
    flavor: ['以天地元气炼成的丹药，使用后增加五行属性真气各8000点。'],
    tradable: true,
    element: '无属性',
    category: '丹药',
    quality: null,
    refine: 0,
    forge: { text: '炼丹之术21级', met: false },
    gainQi: [8000, 8000, 8000, 8000, 8000],
    craftSeconds: 24 * 3600,
  })
  assert.ok(h.includes('服食增加真气'))
  assert.equal(h.split('<TD>8000</TD>').length - 1, 5)
  assert.ok(h.includes('需要时间 24:00:00'))
  assert.ok(!h.match(/炼制消耗[\s\S]{0,200}img\/res\/gold\.gif/), '丹药没有五行消耗行')
  assert.ok(h.includes('>服食丹药</A>'))
  assert.ok(h.includes('炼制条件:炼丹之术21级 <SPAN class=smallred>(未满足)</SPAN>'))
})

test('秘笈态（截图 #14【御剑飞行】）：学习要求 + 使用后可习得技能', () => {
  const h = renderItemMid({
    name: '【御剑飞行】',
    flavor: ['修为到达一定境界之后，便能修习御剑飞行的法门。习之可以踏剑而行，瞬息千里。'],
    tradable: true,
    element: '无属性',
    category: '秘笈',
    quality: null,
    refine: 0,
    teaches: ['御剑飞行'],
  })
  assert.ok(h.includes('【可以交易】【无属性】【秘笈】'))
  assert.ok(h.includes('学习要求'))
  assert.ok(h.includes('使用后可习得技能'))
  assert.ok(h.includes('>御剑飞行</A>'))
  assert.ok(!h.includes('基础属性'), '秘笈没有基础属性表')
})
