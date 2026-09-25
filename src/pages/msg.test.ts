import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMsg, type MsgVm } from './msg.ts'

const vm = (over: Partial<MsgVm> = {}): MsgVm => ({
  rows: [],
  page: 1,
  pages: 1,
  ...over,
})

test('顶部是「收件箱 | 写消息」两个绿链，写消息开 L 窗', () => {
  const h = renderMsg(vm())
  assert.ok(h.includes('>收件箱</A>'))
  assert.ok(h.includes('>写消息</A>'))
  assert.ok(h.includes("openRWindow( '消息', 'msg.jsp')"), '括号后那个空格是原版写法')
  assert.ok(h.includes("openLWindow( '写消息', 'writemsg.jsp')"))
  assert.ok(h.includes('class=skillup'))
})

test('空收件箱逐字复刻原版：表头 colSpan=2、cellPadding=2、宽 230', () => {
  const h = renderMsg(vm())
  assert.ok(h.includes('<FORM id=msgform>'))
  assert.ok(h.includes('<TABLE class=tablebg cellSpacing=1 cellPadding=2 width=230 align=center border=0>'))
  assert.ok(h.includes('<INPUT onclick=selectAllMsg(this.checked) type=checkbox>'))
  assert.ok(h.includes('<TD colSpan=2>收件箱</TD>'))
  assert.ok(!h.includes('主题'), '空表时不出列头行（样本收件箱就是这样）')
})

test('底栏：删除按钮 + 「第1页 / 共1页」 + 四个分页图', () => {
  const h = renderMsg(vm())
  assert.ok(h.includes('<INPUT onclick=removeSelectMsg(1); type=button value=删除>'))
  assert.ok(h.includes('第1页 / 共1页'), '分页文案含 / 两侧的空格')
  for (const [img, alt] of [['top.gif', '首页'], ['ahead.gif', '前一页'], ['back.gif', '后一页'], ['bottom.gif', '尾页']]) {
    assert.ok(h.includes(`alt=${alt} src="img/${img}"`), `缺分页图 ${alt}`)
  }
})

test('有信时按表头通式补出「主题 / 发信人 / 发信时间」三列', () => {
  const h = renderMsg(
    vm({
      rows: [
        { id: 39000, subject: '秦羽攻击无@痕', sender: '系统', sentAt: '2009-04-19 15:03:32', unread: true },
        { id: 38999, subject: 'Re:你也真可怜', sender: '晓风残月', sentAt: '2009-04-19 14:00:00' },
      ],
    }),
  )
  assert.ok(h.includes('<TD>主题</TD><TD>发信人</TD><TD>发信时间</TD>'))
  assert.ok(h.includes('<TD colSpan=3>收件箱</TD>'), '有行时表头跨 3 列')
  assert.ok(h.includes('>秦羽攻击无@痕</A>'), '战报主题写作 {攻}攻击{防}')
  assert.ok(h.includes('>Re:你也真可怜</A>'), '玩家回信主题带 Re: 前缀')
  assert.ok(h.includes('>系统</TD>'), '系统信的发信人是字面量「系统」')
  assert.ok(h.includes('name=ids value=39000'))
})

test('分页目标页号会被夹在 1..共N 之间', () => {
  const h = renderMsg(vm({ page: 3, pages: 5 }))
  assert.ok(h.includes('第3页 / 共5页'))
  assert.ok(h.includes("msg.jsp?page=2"), '前一页')
  assert.ok(h.includes("msg.jsp?page=4"), '后一页')
  assert.ok(h.includes("msg.jsp?page=5"), '尾页')
})

test('主题里的 HTML 元字符被转义', () => {
  const h = renderMsg(vm({ rows: [{ id: 1, subject: '<b>x', sender: '系统', sentAt: '2009-01-01 00:00:00' }] }))
  assert.ok(!h.includes('<b>x'))
  assert.ok(h.includes('&lt;b&gt;x'))
})
