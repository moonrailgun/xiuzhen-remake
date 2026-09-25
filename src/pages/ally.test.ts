import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderAlly, type AllyVm } from './ally.ts'

const vm = (over: Partial<AllyVm> = {}): AllyVm => ({
  tab: 'overview',
  // 截图 #122（2008-10，原生 1:1）的门派
  name: '修真人民解放军',
  allyId: 7,
  founder: { id: 1, name: 'Sean_CGOL' },
  leader: { id: 1, name: 'Sean_CGOL' },
  createdAt: '08-09-16',
  size: 1217,
  nature: '-',
  imLabel: 'QQ群',
  im: '47477448',
  forum: 'http://bbs.example/ally7',
  allies: [],
  enemies: [
    { id: 11, name: '封缘會' },
    { id: 12, name: '九天门' },
  ],
  intro: '在《三国风云》S1中建成最大连营的就是我们，欢迎大家来加入。',
  members: [
    { playerId: 365, name: '焱小丫', job: '掌门', realm: '筑基期', dao: '八百一十年' },
    { playerId: 40, name: '清秋', job: '杀手', realm: '辟谷期', dao: '一千二百年' },
  ],
  news: [
    { msgId: 39000, kind: '攻', text: '易水寒攻击天马行空', fromAlly: '〓劍閣〓', toAlly: '【名門】', date: '09-02-06 02:40' },
    { msgId: 38992, kind: '防', text: '风云动攻击謌詪潇洒', fromAlly: '【名門】', toAlly: '〓劍閣〓', date: '09-02-06 02:34' },
    { msgId: 38974, kind: '算', text: '有人推算银lo残泪', fromAlly: '', toAlly: '〓劍閣〓', date: '09-02-06 02:26' },
  ],
  page: 1,
  pages: 1,
  ...over,
})

test('基准版门派页是五个子标签，没有「仙府」', () => {
  const h = renderAlly(vm())
  for (const label of ['概况', '成员', '攻击', '新闻', '功能']) {
    assert.ok(h.includes(`>${label}</A>`), `缺少子标签 ${label}`)
  }
  assert.ok(!h.includes('仙府'), '仙府是 2009-06-30 资料片才有的，基准版不该出现')
  assert.ok(!h.includes('功德'), '功德区是基准外系统')
})

test('概况字段与截图 #122 逐项对齐（含全角冒号与「{n}人」写法）', () => {
  const h = renderAlly(vm())
  for (const label of [
    '门派名称：', '门派ID：', '创始人：', '现任掌门：', '创建时间：',
    '门派规模：', '门派性质：', '门派交流', '门派关系', '同盟：', '敌对：',
  ]) {
    assert.ok(h.includes(label), `缺少字段 ${label}`)
  }
  assert.ok(h.includes('>修真人民解放军</TD>'))
  assert.ok(h.includes('1217人'), '门派规模写作「{n}人」')
  assert.ok(h.includes('QQ群：'), '门派交流首行标签由门派自填')
  assert.ok(h.includes('>点击进入</A>'), '有论坛地址时是一个绿链「点击进入」')
  assert.ok(h.includes('门派简介'))
  // 原版这个格写死 rowSpan=14（比实际行数多 1），照抄
  assert.ok(h.includes('rowSpan=14'), '简介格的 rowSpan 照抄原版的 14')
})

test('概况的门派关系：敌对逐派一行、各自是可点门派链接', () => {
  const h = renderAlly(vm())
  assert.ok(h.includes("allyinfo.jsp?ally=11'"))
  assert.ok(h.includes('>封缘會</A>'))
  assert.ok(h.includes('>九天门</A>'))
})

test('成员页：列宽与分页参数照原版 DOM', () => {
  const h = renderAlly(vm({ tab: 'member', pages: 3, page: 2 }))
  assert.ok(h.includes('<TD width="10%">&nbsp;</TD>'))
  assert.ok(h.includes('<TD width="30%">玩家</TD>'))
  assert.ok(h.includes('<TD width="20%">称号</TD>'))
  assert.ok(h.includes('<TD width="15%">境界</TD>'))
  assert.ok(h.includes('<TD width="20%">道行</TD>'))
  // 第 2 页的第一行序号是 11.
  assert.ok(h.includes('<TD align=right>11.</TD>'))
  assert.ok(h.includes('八百一十年'), '道行显示为中文数字年')
  for (const label of ['首页', '上一页', '下一页', '尾页']) {
    assert.ok(h.includes(`>${label}</A>`), `分页条缺 ${label}`)
  }
  assert.ok(h.includes('per=10&job=-2'), '分页参数照原版 page=&per=10&job=-2')
  assert.ok(h.includes('/3页'))
  assert.ok(h.includes('id=allypage'))
})

test('新闻/动态：首格单字「攻/防/算」，被推算时写「有人推算」不暴露推算者', () => {
  const h = renderAlly(vm({ tab: 'news' }))
  assert.ok(h.includes('<TD>攻</TD>'))
  assert.ok(h.includes('<TD>防</TD>'))
  assert.ok(h.includes('<TD>算</TD>'))
  assert.ok(h.includes('>易水寒攻击天马行空</A>'))
  assert.ok(h.includes('>有人推算银lo残泪</A>'))
  assert.ok(h.includes('<TD class=smallgray>〓劍閣〓 - 【名門】</TD>'))
  assert.ok(h.includes('09-02-06 02:40'), '日期格式 YY-MM-DD HH:MM')
  assert.ok(h.includes("allymsg.jsp?msg=39000"))
})

test('玩家名里的 HTML 元字符被转义', () => {
  const h = renderAlly(vm({ name: '<script>坏蛋', intro: 'a & b' }))
  assert.ok(!h.includes('<script>'))
  assert.ok(h.includes('&lt;script&gt;坏蛋'))
  assert.ok(h.includes('a &amp; b'))
})
