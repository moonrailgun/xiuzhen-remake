import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderPlayerInfo, DELETE_NOTICE, type PlayerInfoVm } from './playerinfo.ts'

const vm = (over: Partial<PlayerInfoVm> = {}): PlayerInfoVm => ({
  // 03 §1.5 的那份样本
  playerId: 365,
  name: '晓风残月',
  avatar: 'tongtianm',
  element: '土',
  rank: 382,
  dao: '五百五十年',
  origin: '通天',
  ally: { id: 875, name: '西昆仑仙将' },
  age: '100',
  gender: '男',
  location: '',
  intro: '本人属性',
  self: false,
  deletingDays: null,
  ...over,
})

test('墨迹标题条写作「玩家：{名字}」', () => {
  const h = renderPlayerInfo(vm())
  assert.ok(h.includes('<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width=460 border=0>'))
  assert.ok(h.includes('<TD>玩家：晓风残月</TD>'))
})

test('左侧头像格 rowSpan=9，带 talk.gif 与 friend.gif', () => {
  const h = renderPlayerInfo(vm())
  assert.ok(h.includes('<TD class=trbg vAlign=center align=middle rowSpan=9>'))
  assert.ok(h.includes('<IMG src="img/avatar/tongtianm.gif">'))
  assert.ok(h.includes('<IMG title=发送消息 src="img/talk.gif">'))
  assert.ok(h.includes('<IMG title=加为护法 src="img/friend.gif">'))
  assert.ok(h.includes("postForm('addpal', 'playerid=365')"))
})

test('右侧 8 行详细资料 + 简介；标点不统一是原版如此（属性是全角冒号）', () => {
  const h = renderPlayerInfo(vm())
  assert.ok(h.includes('<TD class=titlebg colSpan=2>详细资料</TD>'))
  assert.ok(h.includes('<TD width=80>属性：</TD><TD width=200>土</TD>'), '属性用全角冒号')
  for (const label of ['排名:', '道行:', '道源:', '门派:', '年龄:', '性别:', '所在地:']) {
    assert.ok(h.includes(`<TD>${label}</TD>`), `${label} 应为半角冒号`)
  }
  assert.ok(h.includes('五百五十年'), '道行显示为中文数字年')
  assert.ok(h.includes('>简介</TD>'))
  assert.ok(h.includes('本人属性'))
})

test('门派是绿链，无门派时显示 -', () => {
  const h = renderPlayerInfo(vm({ allyTitle: '唯我金仙' }))
  assert.ok(h.includes("allyinfo.jsp?ally=875"))
  assert.ok(h.includes('>西昆仑仙将</A> 唯我金仙'))
  const none = renderPlayerInfo(vm({ ally: null }))
  assert.ok(none.includes('<TD>门派:</TD><TD>-</TD>'))
})

test('别人的资料页没有「编辑资料」与删除角色块', () => {
  const h = renderPlayerInfo(vm())
  assert.ok(!h.includes('编辑资料'))
  assert.ok(!h.includes('删除角色'))
})

test('自己的资料页多「编辑资料」(?tab=2) 与删除角色块，文案一字不差', () => {
  const h = renderPlayerInfo(vm({ self: true }))
  assert.ok(h.includes("openLWindow('','playerinfo.jsp?tab=2')"))
  assert.ok(h.includes('>编辑资料</A>'))
  assert.ok(h.includes('<IMG height=7 src="img/event/mark.gif" width=4>'))
  assert.equal(
    DELETE_NOTICE,
    '你可以在这里删除你的角色。从你开始执行删除命令后，需要3天时间你的角色才会被完全删除。在24小时之内你可以撤回你的删除命令。',
  )
  assert.ok(h.includes(DELETE_NOTICE))
})

test('「角色正在删除中」用内联 COLOR:#ff0000（全站唯一一处字面 #ff0000，照抄原文）', () => {
  const h = renderPlayerInfo(vm({ self: true, deletingDays: 2.99 }))
  assert.ok(
    h.includes('<SPAN style="COLOR:#ff0000">角色正在删除中，离完全删除还有<SPAN class=b>2.99</SPAN>天。你还可以撤回你的删除命令。</SPAN>'),
  )
  assert.ok(h.includes('value=撤回删除'))
  assert.ok(!h.includes('value=删除角色'), '删除中就不再出删除钮')
})

test('玩家名进 writemsg 的内联 onclick 时做了两层转义', () => {
  const h = renderPlayerInfo(vm({ name: "a'b<c" }))
  assert.ok(!h.includes("writemsg.jsp?receiver=a'b"))
  assert.ok(h.includes('&lt;c'), '正文里的 < 被转义')
  assert.ok(h.includes('\\&#39;'), '内联 JS 字符串里的单引号先被转义成 \\\'')
})
