import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderWriteMsg, replySubject } from './writemsg.ts'

test('三个字段 + 发送/关闭钮（零证据页，按 L 窗 460 通式重建）', () => {
  const h = renderWriteMsg({ receiver: '', subject: '', replyTo: null })
  assert.ok(h.includes('<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=460 border=0>'))
  for (const label of ['收件人：', '主题：', '正文：']) {
    assert.ok(h.includes(label), `缺字段 ${label}`)
  }
  assert.ok(h.includes('<TEXTAREA'))
  assert.ok(h.includes('value=发送'))
  assert.ok(h.includes('value=关闭'))
  assert.ok(h.includes('onclick=closeLWindow();'))
})

test('从 ?receiver= 进来时预填收件人', () => {
  const h = renderWriteMsg({ receiver: '晓风残月', subject: '', replyTo: null })
  assert.ok(h.includes('name=receiver value="晓风残月"'))
})

test('回复时主题带 Re: 前缀，并回传原信 id', () => {
  assert.equal(replySubject('你也真可怜'), 'Re:你也真可怜')
  const h = renderWriteMsg({ receiver: '晓风残月', subject: replySubject('你也真可怜'), replyTo: 39000 })
  assert.ok(h.includes('name=subject value="Re:你也真可怜"'))
  assert.ok(h.includes('<INPUT type=hidden name=remsg value=39000>'))
})

test('预填值里的引号被转义，不会撑破 value 属性', () => {
  const h = renderWriteMsg({ receiver: 'a"b', subject: "c'd", replyTo: null })
  assert.ok(h.includes('value="a&quot;b"'))
  assert.ok(h.includes('value="c&#39;d"'))
})
