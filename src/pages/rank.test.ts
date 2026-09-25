import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderRank, RANK_TABS, type RankVm } from './rank.ts'

/** 截图 #158 / #74（2010-04）道行榜的前四行，逐字照抄。 */
const powerRows = [
  { id: 1, name: '流氓天尊', value: '九年零二个月' },
  { id: 2, name: 'Mistake', value: '七年零一个月' },
  { id: 3, name: '万世封魂', value: '六年零二个月' },
  { id: 4, name: '鬥轉星移', value: '五年零二个月' },
]

const vm = (over: Partial<RankVm> = {}): RankVm => ({ tab: 'power', rows: powerRows, ...over })

test('基准版只有 4 个标签，没有 2009-06-30 才上线的「功德」', () => {
  const h = renderRank(vm())
  assert.equal(RANK_TABS.length, 4)
  for (const label of ['道行', '门派', '产业', '阅历']) {
    assert.ok(h.includes(`>${label}</A>`), `缺少标签 ${label}`)
  }
  assert.ok(!h.includes('功德'), '功德榜是基准外内容，不应出现')
  assert.ok(!h.includes('trbg3'), '斑马纹 trbg3 是 2010-03 才有的，不应出现')
})

test('四个标签都用 openLWindow 打开，编号沿用原版（门派3 产业4 阅历5）', () => {
  const h = renderRank(vm())
  assert.ok(h.includes("openLWindow('', 'rank.jsp')"))
  assert.ok(h.includes("openLWindow('', 'rank.jsp?tab=3')"))
  assert.ok(h.includes("openLWindow('', 'rank.jsp?tab=4')"))
  assert.ok(h.includes("openLWindow('', 'rank.jsp?tab=5')"))
  assert.ok(!h.includes('rank.jsp?tab=2'), 'tab=2 是功德榜，基准版不出')
})

test('页头是 titlerank.gif，其下一道墨迹条写「道行高深」（原文）', () => {
  const h = renderRank(vm())
  assert.ok(h.includes('img/title/titlerank.gif'))
  assert.ok(h.includes('class="titlebg2 bigbold"'))
  assert.ok(h.includes('>道行高深</TD>'))
})

test('道行榜三列 15%/50%/35%，排名写作「1.」，道行是中文数字年', () => {
  const h = renderRank(vm())
  assert.ok(h.includes('<TD width="15%">排名</TD>'))
  assert.ok(h.includes('<TD width="50%">玩家</TD>'))
  assert.ok(h.includes('<TD width="35%">道行</TD>'))
  assert.ok(h.includes('<TD>1.</TD>') && h.includes('<TD>4.</TD>'), '排名是数字加英文句点')
  assert.ok(h.includes('<TD>九年零二个月</TD>'), '截图 #158 第一名：流氓天尊 九年零二个月')
  assert.ok(h.includes('<TD>七年零一个月</TD>'))
})

test('玩家名是绿色粗体链接，点开 L 窗个人资料', () => {
  const h = renderRank(vm())
  assert.ok(h.includes('<TD class=skillup>'))
  assert.ok(h.includes("openLWindow('', 'playerinfo.jsp?playerid=1')"))
  assert.ok(h.includes('>流氓天尊</A>'))
})

test('产业榜：墨迹条「俗世产业」，收益写作「11786两/小时」（原文）', () => {
  const h = renderRank(
    vm({ tab: 'estate', rows: [{ id: 7, name: '皮蓬', value: '11786两/小时' }] }),
  )
  assert.ok(h.includes('>俗世产业</TD>'))
  assert.ok(h.includes('<TD width="35%">产业收益</TD>'))
  assert.ok(h.includes('<TD>11786两/小时</TD>'))
})

test('阅历榜四列 15/40/20/25，多一个「境界」列', () => {
  const h = renderRank(
    vm({ tab: 'exp', rows: [{ id: 9, name: '皮蓬', realm: '元婴期', value: '452800' }] }),
  )
  assert.ok(h.includes('<TD width="40%">玩家</TD>'))
  assert.ok(h.includes('<TD width="20%">境界</TD>'))
  assert.ok(h.includes('<TD width="25%">阅历</TD>'))
  assert.ok(h.includes('<TD>元婴期</TD>'))
})

test('门派榜：门派名链到 allyinfo，掌门链到 playerinfo', () => {
  const h = renderRank(
    vm({
      tab: 'ally',
      rows: [{ id: 27, name: '迷茫妖盟', leader: { id: 40, name: '清秋' }, value: '六千一百年' }],
    }),
  )
  assert.ok(h.includes("openLWindow('', 'allyinfo.jsp?ally=27')"))
  assert.ok(h.includes("openLWindow('', 'playerinfo.jsp?playerid=40')"))
  assert.ok(h.includes('<TD width="30%">掌门</TD>'))
})

test('玩家名被转义（榜单直接显示玩家自定义的名字）', () => {
  const h = renderRank(vm({ rows: [{ id: 1, name: '<b>x</b>', value: '一年' }] }))
  assert.ok(!h.includes('<b>x</b>'))
  assert.ok(h.includes('&lt;b&gt;x&lt;/b&gt;'))
})
