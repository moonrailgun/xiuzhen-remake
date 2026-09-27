import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSkill, isUnlocked, SKILL_TABS, SKILL_TREES, type SkillVm } from './skill.ts'

const vm = (over: Partial<SkillVm> = {}): SkillVm => ({
  tab: 'produce',
  school: '昆仑',
  levels: {},
  ...over,
})

test('四个子标签与原版路由一致，且没有选中态', () => {
  const h = renderSkill(vm())
  // DOM 原文：炼器 tab=2 | 剑术 tab=1 | 术数 tab=3 | 秘笈 tab=6，用 ` | ` 分隔
  assert.ok(h.includes('<A class=skillup href="skill.jsp?tab=2">炼器</A> | '))
  assert.ok(h.includes('<A class=skillup href="skill.jsp?tab=1">剑术</A> | '))
  assert.ok(h.includes('<A class=skillup href="skill.jsp?tab=3">术数</A> | '))
  assert.ok(h.includes('<A class=skillup href="skill.jsp?tab=6">秘笈</A>'))
  // 当前页（炼器）也是普通绿链，没有任何选中类名
  assert.equal(SKILL_TABS.length, 4)
})

test('炼器页用 titleproduce.gif 与 bgproducek.gif（昆仑）', () => {
  const h = renderSkill(vm({ school: '昆仑' }))
  assert.ok(h.includes('src="img/title/titleproduce.gif"'))
  assert.ok(h.includes('url(img/skill/bgproducek.gif)'))
  // 蜀山/通天换背景图尾字母
  assert.ok(renderSkill(vm({ school: '蜀山' })).includes('bgproduces.gif'))
  assert.ok(renderSkill(vm({ school: '通天' })).includes('bgproducet.gif'))
})

test('图标按 3×4 网格绝对定位：列 58/198/338、行 0/120/240/360，每格 64×64', () => {
  const h = renderSkill(vm())
  // 炼丹之术 c0r0、铸剑之术 c1r0、炼器总纲 c1r2
  assert.ok(h.includes('style="left:58px;top:0px"'))
  assert.ok(h.includes('style="left:198px;top:0px"'))
  assert.ok(h.includes('style="left:198px;top:240px"'))
  assert.ok(h.includes('height=64 width=64'))
})

test('每个图标下方显示 (当前/上限)，上限对着截图逐格读数', () => {
  // #8 炼器：炼丹之术 1/20（#118 是 0/20）；04 §7.3 记 c1r2 上限是 4
  const h = renderSkill(vm({ levels: { 102: 1 } }))
  assert.ok(h.includes('(1/20)'), '炼丹之术 1/20')
  assert.ok(h.includes('(0/4)'), '炼器总纲 0/4')
  // #120 剑术：万剑诀 0/10、门派剑诀 0/1
  const sword = renderSkill(vm({ tab: 'sword' }))
  assert.ok(sword.includes('(0/10)'), '万剑诀 0/10')
  assert.ok(sword.includes('(0/1)'), '门派剑诀 0/1')
  // #119 术数：易经 0/500、九宫飞星法 0/2
  const math = renderSkill(vm({ tab: 'math' }))
  assert.ok(math.includes('(0/500)'), '易经 0/500')
  assert.ok(math.includes('(0/2)'), '九宫飞星法 0/2')
})

test('未解锁的格子显示原版的「?」图标，解锁后换成 img/skill/{id}.gif', () => {
  const locked = renderSkill(vm())
  assert.ok(locked.includes('src="img/skill/unknown.gif"'), '未解锁用 ? 图标')
  // 百炼之法要铸剑之术 Lv.1（04 §7.3 的 c1r0 ─Lv.1↓→ c1r1）
  assert.ok(!locked.includes('src="img/skill/104.gif"'))
  const open = renderSkill(vm({ levels: { 103: 1 } }))
  assert.ok(open.includes('src="img/skill/104.gif"'))
})

test('前置要全部满足才解锁（大周天剑法要心剑诀与身剑诀各 Lv.3）', () => {
  const node = SKILL_TREES.sword.find((n) => n.name === '大周天剑法')!
  assert.equal(isUnlocked(node, { 202: 3 }), false)
  assert.equal(isUnlocked(node, { 202: 3, 203: 2 }), false)
  assert.equal(isUnlocked(node, { 202: 3, 203: 3 }), true)
})

test('门派专属法术前置满足后仍按门派解锁', () => {
  const levels = { 301: 64, 302: 1, 104: 5 }
  for (const [name, school, other] of [['梅花易数', '蜀山', '通天'], ['太乙神数', '通天', '昆仑'], ['炼器总纲', '昆仑', '蜀山']] as const) {
    const node = [...SKILL_TREES.math, ...SKILL_TREES.produce].find(n => n.name === name)!
    assert.equal(isUnlocked(node, levels, school), true)
    assert.equal(isUnlocked(node, levels, other), false)
  }
  const html = renderSkill(vm({ tab: 'math', school: '昆仑', levels }))
  assert.ok(!html.includes('src="img/skill/303.gif"'))
  assert.ok(!html.includes('src="img/skill/304.gif"'))
})

test('点图标打开 R 窗，参数照原版 skillmid.jsp?skill={id}，标题带 Lv.N', () => {
  const h = renderSkill(vm({ levels: { 102: 3 } }))
  assert.ok(h.includes(`openRWindow('炼丹之术 Lv.3','skillmid.jsp?skill=102')`))
  // 09b §1.2 的三个 DOM 原文 id
  assert.ok(h.includes('skillmid.jsp?skill=101'), '灵宝真经 101')
  assert.ok(h.includes('skillmid.jsp?skill=106'), '御宝秘录 106')
  assert.ok(h.includes('skillmid.jsp?skill=107'), '炼器总纲 107')
})

test('秘笈标签无树，走同系列推出来的列表（空态有文案）', () => {
  const empty = renderSkill(vm({ tab: 'book' }))
  assert.ok(empty.includes('src="img/title/titlebook.gif"'))
  assert.ok(!empty.includes('class=skilltree'))
  assert.ok(empty.includes('目前没有任何秘笈'))

  const one = renderSkill(vm({ tab: 'book', books: [{ name: '【御剑飞行】', itemId: 701, count: 1 }] }))
  assert.ok(one.includes(`openRWindow('【御剑飞行】','itemmid.jsp?item=701')`))
  assert.ok(one.includes('>学习</A>'))
})
