import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderQuest, monsterSummary, type QuestVm } from './quest.ts'

/** 截图 #83（2010-05，原生 1:1）的那一份任务描述 [原文]。 */
const DESC_1 =
  '你从怀里掏出下山前师父给的玉瞳简，里面记载着世间百妖的方位。俗世修行，斩妖除魔是少不得的一课。'
const DESC_2 = '今日你恰好在附近发现了白骷髅的踪迹，不如顺手将其除去吧。'

const vm = (over: Partial<QuestVm> = {}): QuestVm => ({
  id: '2201',
  title: '《百妖记》第八回 (8/100)',
  // 03 §1.10：第 8 回 白骷髅 45/10/45/无
  summary: monsterSummary({ name: '白骷髅', attack: 45, agility: 10, life: 45, element: '无' }),
  progress: { kind: 'slay', monster: '白骷髅', at: [161, 7], done: true },
  reward: { kind: 'qi', qi: [800, 800, 800, 800, 800] },
  description: [DESC_1, DESC_2],
  claimable: true,
  ...over,
})

test('墨迹标题条写作《百妖记》第八回 (8/100)', () => {
  const h = renderQuest(vm())
  assert.ok(h.includes('<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width=460 border=0>'))
  assert.ok(h.includes('《百妖记》第八回 (8/100)'))
})

test('四段固定为 任务概要 / 完成情况 / 完成奖励 / 任务描述，顺序不变', () => {
  const h = renderQuest(vm())
  let at = -1
  for (const s of ['任务概要', '完成情况', '完成奖励', '任务描述']) {
    const i = h.indexOf(`>${s}</TD>`)
    assert.ok(i > at, `${s} 缺失或顺序不对`)
    at = i
  }
  // 任务表固定 5 列（为了奖励行五等分），其余行 colSpan=5
  assert.ok(h.includes('<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0>'))
  assert.ok(h.includes('colSpan=5'))
})

test('任务概要照游戏内粘贴格式：怪名 攻击 敏捷 生命 属性', () => {
  const h = renderQuest(vm())
  assert.equal(
    monsterSummary({ name: '白骷髅', attack: 45, agility: 10, life: 45, element: '无' }),
    '白骷髅 攻击:45 敏捷:10 生命:45 属性:无',
  )
  assert.ok(h.includes('白骷髅 攻击:45 敏捷:10 生命:45 属性:无'))
})

test('完成情况：坐标是绿粗体链接、怪名是 middlestriking 深蓝粗体、尾缀 (已完成)', () => {
  const h = renderQuest(vm())
  assert.ok(h.includes('>(161,7)</A>处的'))
  assert.ok(h.includes('<SPAN class=middlestriking>白骷髅</SPAN>(已完成)'))
  const undone = renderQuest(vm({ progress: { kind: 'slay', monster: '白骷髅', at: [161, 7], done: false } }))
  assert.ok(undone.includes('(未完成)'))
})

test('完成奖励：金木水火土各 800，占满 5 个等分格', () => {
  const h = renderQuest(vm())
  for (const icon of ['gold', 'wood', 'water', 'fire', 'earth']) {
    assert.ok(h.includes(`<TD width="20%"><IMG src="img/res/${icon}.gif">800</TD>`), `缺 ${icon} 奖励格`)
  }
})

test('未完成的斩妖任务能从详情直接出击，完成后隐藏入口', () => {
  const h = renderQuest(vm({ claimable: false, progress: { kind: 'slay', monster: '白骷髅', at: [161, 7], done: false } }))
  assert.ok(h.includes(`onclick="openLWindow('', 'fight.jsp?target=${encodeURIComponent('白骷髅')}')"`))
  assert.ok(h.includes('>出击</A>'))
  assert.ok(!renderQuest(vm()).includes('fight.jsp'))
})

test('文字奖励（境界任务）用 middlestriking 高亮境界名', () => {
  const h = renderQuest(
    vm({
      title: '境界突破',
      progress: { kind: 'text', text: '阅历值达到1036800(当前阅历值310940)', done: false },
      reward: { kind: 'text', text: '境界提升为 ', striking: '金丹期' },
    }),
  )
  assert.ok(h.includes('境界提升为 <SPAN class=middlestriking>金丹期</SPAN>'))
  assert.ok(h.includes('阅历值达到1036800(当前阅历值310940)(未完成)'))
})

test('任务描述一字不差', () => {
  const h = renderQuest(vm())
  assert.ok(h.includes(DESC_1))
  assert.ok(h.includes(DESC_2))
  assert.ok(h.includes(`${DESC_1}<BR><BR>${DESC_2}`), '原版段间空一行')
})

test('可领奖时底部是「领取奖励」+「关闭窗口」', () => {
  const h = renderQuest(vm())
  assert.ok(h.includes('src="img/getreward.gif"'))
  assert.ok(h.includes('src="img/closewindows.gif"'))
  assert.ok(h.includes('onclick=closeLWindow()'))
  assert.ok(!h.includes('giveupquest.gif'))
})

test('不可领奖时底部是「放弃」，确认框文案照原版', () => {
  const h = renderQuest(vm({ claimable: false }))
  assert.ok(h.includes('src="img/giveupquest.gif"'))
  assert.ok(h.includes("MDialogOkCancel('', '确定要放弃此任务吗?'"))
  assert.ok(h.includes("function(){ajaxPost('cancelquest'"))
  assert.ok(h.includes("cancelquest"))
  assert.ok(h.includes('questid=2201'))
})

test('要花仙石的任务换另一句确认文案', () => {
  const h = renderQuest(vm({ claimable: false, giveupCoin: 10 }))
  assert.ok(h.includes('放弃此任务，需要花费10个仙石'))
})


test('答题、选线和结丹任务提供实际操作，完成后隐藏操作', () => {
  const quiz = renderQuest(vm({ claimable: false, interaction: { kind: 'quiz' } }))
  assert.ok(quiz.includes('questAnswer('))
  assert.ok(quiz.includes('你的本命属性是什么'))
  const choice = renderQuest(vm({ claimable: false, interaction: { kind: 'choice' } }))
  assert.ok(choice.includes('questChooseLine('))
  assert.ok(choice.includes('先炼气') && choice.includes('先炼剑'))
  const core = renderQuest(vm({ claimable: false, interaction: { kind: 'goldenCore', gathered: 1200, cores: 2, compressing: false } }))
  assert.ok(core.includes('1200/286000'))
  assert.ok(core.includes('questGatherCore(') && core.includes('questCompressCore('))
  assert.ok(!renderQuest(vm({ interaction: { kind: 'quiz' } })).includes('questAnswer('))
})
