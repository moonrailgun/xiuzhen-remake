/**
 * 战斗事件总览的测试。
 *
 * 这一页的证据等级是 A（10 段原版 DOM），所以测的都是**逐字**的东西：
 * 四种标题句、操作链接的 alt 与 onclick、敌剑的 `???`、`width=900`。
 * 出处见 `docs/research/09-pasted-dom-templates.md` §1.7。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  renderBattleEvent,
  titleLine,
  actionLinks,
  type BattleEventItem,
  type BattleEventSword,
} from './battleevent.ts'

const mySword: BattleEventSword = {
  owner: '173小鱼',
  ownerId: 0,
  name: '上品三阳一煞剑+5',
  itemId: 50400,
  stats: [1728, 3456, 64, 5184, 2],
  seconds: 13788,
  arriveAt: '2009-07-17 05:11:25',
}

/** 看不穿的敌剑：名字与五项全是 `???`。 */
const theirSword: BattleEventSword = {
  owner: '道法自然',
  ownerId: 7,
  seconds: null,
  arriveAt: '2009-07-17 05:11:25',
}

const event = (over: Partial<BattleEventItem> = {}): BattleEventItem => ({
  eventId: 'battle:1:0:道法自然',
  kind: 'outbound',
  who: '道法自然',
  at: [259, 14],
  seconds: 13788,
  when: '2009-07-17 05:11:25',
  left: [mySword],
  right: [],
  ...over,
})

// —— 四种标题句（全部是原文）——

test('★出击标题句逐字：你放去攻击{目标}({x},{y})的{倒计时}后于{时间}到达', () => {
  const html = titleLine(event())
  assert.match(html, /^你放去攻击道法自然\(259,14\)的/)
  assert.match(html, /后于2009-07-17 05:11:25到达$/)
})

test('★来袭标题句逐字：来自{玩家}的{倒计时}后于{时间}到达并攻击你', () => {
  const html = titleLine(event({ kind: 'incoming', who: '小哥来了' }))
  assert.match(html, /^来自小哥来了的/)
  assert.match(html, /后于2009-07-17 05:11:25到达并攻击你$/)
})

test('★相遇标题句逐字：在({x},{y})还有{倒计时}于{时间}相遇', () => {
  const html = titleLine(event({ kind: 'meeting', at: [106, 124] }))
  assert.match(html, /^在\(106,124\)还有/)
  assert.match(html, /于2009-07-17 05:11:25相遇$/)
})

test('★缠斗标题句逐字：在({x},{y})缠斗 剩余{倒计时}于{时间}结束', () => {
  const html = titleLine(event({ kind: 'fighting', at: [163, 83] }))
  assert.match(html, /^在\(163,83\)缠斗 剩余/)
  assert.match(html, /于2009-07-17 05:11:25结束$/)
})

test('返航事件显示回程倒计时，不再提供战斗操作', () => {
  const returning = event({ kind: 'returning' })
  const html = renderBattleEvent({ tab: 3, events: [returning] })
  assert.match(html, /从道法自然\(259,14\)返航/)
  assert.match(html, /后于2009-07-17 05:11:25返回/)
  assert.match(html, /<SPAN class=countdown[^>]*start="13788">/)
  assert.doesNotMatch(html, /求援|支援|还击|战斗地图/)
  assert.equal(actionLinks(returning), '')
})

test('返航标题转义目标名', () => {
  assert.doesNotMatch(titleLine(event({ kind: 'returning', who: '<script>x</script>' })), /<script>/)
})

test('标题句里的倒计时用原版 <SPAN start=秒> 协议', () => {
  assert.match(titleLine(event()), /<SPAN class=countdown[^>]*start="13788">/)
})

// —— 操作链接 ——

test('★求援用原版那个唯一带输入框的三参数 MDialog，输入框 id 是 gethelpname', () => {
  const html = actionLinks(event())
  assert.match(html, /alt="点此向他人请求援手"/)
  assert.match(html, /MDialog\('请求援手','请输入道友的名字<br><p><\/p><p align=center><input id=gethelpname><\/input><\/p>'/)
  assert.match(html, /sendEventMsg\(/)
})

test('支援走 fight.jsp?type=3，还击走 type=2（原版路由）', () => {
  const normal = actionLinks(event())
  assert.match(normal, /fight\.jsp\?type=3&eventid=/)
  assert.match(normal, /alt="点此帮助左方"/)

  const incoming = actionLinks(event({ kind: 'incoming' }))
  assert.match(incoming, /fight\.jsp\?type=2&eventid=/)
  assert.match(incoming, /alt="点击进行还击"/)
  assert.ok(!incoming.includes('求援'), '来袭事件只有还击与战斗地图')
})

test('战斗地图走 battlemap.jsp?eventid=&side=，窗标题是「战场地图」', () => {
  const html = actionLinks(event())
  assert.match(html, /openLWindow\('战场地图', 'battlemap\.jsp\?eventid=[^']*&side=0'\)/)
})

// —— 表格结构 ——

test('B 窗是 900 宽，页头标题图的 title 照抄原版那个 bug（个人资料）', () => {
  const html = renderBattleEvent({ tab: 2, events: [event()] })
  assert.match(html, /width=900/)
  assert.match(html, /<IMG title=个人资料 height=30 src="img\/title\/titlebattle\.gif" width=150>/)
  assert.match(html, /手动刷新/)
})

test('★看不穿的敌剑，名字与五项属性全是 ???', () => {
  const html = renderBattleEvent({
    tab: 2,
    events: [event({ kind: 'fighting', right: [theirSword] })],
  })
  assert.match(html, /的\?\?\?/, '剑名应是 ???')
  const unknowns = html.match(/<TD>\?\?\?<\/TD>/g) ?? []
  assert.equal(unknowns.length, 5, '攻击/耐久/敏捷/吸收/击退五项都要 ???')
})

test('己方剑显示真实面板值与五列表头', () => {
  const html = renderBattleEvent({ tab: 2, events: [event()] })
  for (const h of ['攻击', '耐久', '敏捷', '吸收', '击退']) assert.ok(html.includes(h))
  for (const v of [1728, 3456, 64, 5184]) assert.ok(html.includes(String(v)), `缺 ${v}`)
  assert.match(html, /剩余时间 .*到达时间 2009-07-17 05:11:25/)
})

test('单边事件另一侧是 TD.trbg width="50%" rowSpan=4（原版写法）', () => {
  const html = renderBattleEvent({ tab: 2, events: [event()] })
  assert.match(html, /<TD class=trbg width="50%" rowSpan=4><\/TD>/)
})

test('双边时每张表 colSpan=10，单边时 colSpan=6（原版写作 {{6|10}}）', () => {
  // 单边不是 5：一侧 5 列之外还有那个 rowSpan=4 的空白占位格，合起来 6 列。
  const one = renderBattleEvent({ tab: 2, events: [event()] })
  assert.match(one, /<TD colSpan=6>你放去攻击/)
  const two = renderBattleEvent({ tab: 2, events: [event({ kind: 'fighting', right: [theirSword] })] })
  assert.match(two, /<TD colSpan=10>在\(259,14\)缠斗/)
})

test('没有事件时显示原版空文案', () => {
  const html = renderBattleEvent({ tab: 2, events: [] })
  assert.match(html, /目前没有任何事件/)
})

test('玩家可控的名字在正文与内联 onclick 里都被转义', () => {
  const evil = "x'\"><script>alert(1)</script>"
  const html = renderBattleEvent({
    tab: 2,
    events: [event({ who: evil, left: [{ ...mySword, owner: evil, name: evil }] })],
  })
  assert.ok(!html.includes('<script>'), '不能有裸 script 标签')
})
