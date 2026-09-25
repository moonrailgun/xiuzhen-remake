import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderTrade, type TradeVm } from './trade.ts'

/** 截图 #7（2008-12，0.5 秒/点）的前两行 + 截图 #123（2008-10，1.2 秒/点）的第一行。 */
const vm = (over: Partial<TradeVm> = {}): TradeVm => ({
  view: 'buyqi',
  qiOffers: [
    { sheet: 1, give: '火', want: '金', amount: 25000, seconds: 12500 },
    { sheet: 2, give: '水', want: '土', amount: 1000, seconds: 500 },
    { sheet: 3, give: '土', want: '金', amount: 5000, seconds: 6000 },
  ],
  itemOffers: [
    { sheet: 44210, name: '极品古纹青石剑+4', item: 50504, quality: 4, price: 120 },
    { sheet: 15578, name: '极品南明离火剑+3', item: 51004, quality: 3, price: 720 },
  ],
  pager: { page: 1, pages: 2 },
  filterGive: '',
  filterWant: '',
  search: '',
  level: 0,
  order: 2,
  myQiOffers: [{ sheet: 9, give: '金', want: '木', amount: 500, seconds: 250 }],
  myItemOffers: [{ sheet: 40005, name: '藏宝图', item: 300101, quality: 0, price: 2 }],
  sellable: [{ id: 1, name: '上品玉虚桃木剑+2' }],
  ...over,
})

test('横幅用 2008 版的「市 场」，四个子标签一直都在', () => {
  const h = renderTrade(vm())
  assert.ok(h.includes('img/title/titletrade.gif'), '横幅图应是 titletrade.gif（市 场）')
  for (const [label, href] of [
    ['购买真气', 'trade.jsp'],
    ['出售真气', 'trade.jsp?tab=2'],
    ['购买法宝', 'trade.jsp?tab=3'],
    ['出售法宝', 'trade.jsp?tab=4'],
  ] as const) {
    assert.ok(h.includes(`>${label}</A>`), `缺少子标签 ${label}`)
    assert.ok(h.includes(`href="${href}"`), `${label} 的路由应是 ${href}`)
  }
})

test('购买真气页：红字提示与「我用…换…搜索」筛选条（截图 #7 #123 原文）', () => {
  const h = renderTrade(vm())
  assert.ok(h.includes('注意：购买真气注入丹田的时间与经脉有关'))
  assert.ok(h.includes('class=smallred'), '提示是红字')
  assert.ok(h.includes('我用 <SELECT'))
  assert.ok(h.includes('> 换 <SELECT'))
  assert.ok(h.includes('value=搜索'))
  assert.ok(h.includes('>全部</OPTION>'), '两个下拉默认都是「全部」')
})

test('购买真气页：四列 提供/需求/需要时间/操作，列宽 137/137/138/47（原图竖线实测）', () => {
  const h = renderTrade(vm())
  assert.ok(h.includes('width=137><A'), '「提供」列宽 137 且是排序链接')
  assert.ok(h.includes('<TD width=138>需要时间</TD>'))
  // 第四列宽 47：原图 9-交易.jpg 的竖线在 x=25/162/299/437/484。
  // 不给宽度的话「购买」会换行，把行高从 27px 撑到 46px。
  assert.ok(h.includes('<TD width=47 noWrap>操作</TD>'))
  assert.ok(h.includes('>提供</A>') && h.includes('>需求</A>'), '前两列表头可点排序')
  assert.ok(h.includes('width=460'), '表宽 460，与原版 DOM 的 width 属性一致')
})

test('购买真气行：图标 + 「火: 25000」，需要时间 3:28:20（截图 #7 第一行）', () => {
  const h = renderTrade(vm())
  assert.ok(h.includes('<IMG src="img/res/fire.gif">火: 25000'))
  assert.ok(h.includes('<IMG src="img/res/gold.gif">金: 25000'))
  // 25000 点 × 0.5 秒 = 12500 秒 = 3:28:20（小时位不补零）
  assert.ok(h.includes('<TD>3:28:20</TD>'))
  // 截图 #7 第二行：水1000→土1000，0:08:20
  assert.ok(h.includes('<TD>0:08:20</TD>'))
  // 截图 #123 第一行：土5000→金5000，1:40:00（1.2 秒/点）
  assert.ok(h.includes('<TD>1:40:00</TD>'))
})

test('购买真气行的「购买」是绿色链接，且走确定/取消确认框', () => {
  const h = renderTrade(vm())
  assert.ok(h.includes('class=skillup onclick="MDialogOkCancel'))
  assert.ok(h.includes('确定购买?'))
  assert.ok(h.includes('>购买</A>'))
})

test('分页行：首页 上一页 下一页 尾页 + 第1/2页（首页不带 page、尾页是 page=0）', () => {
  const h = renderTrade(vm())
  for (const label of ['首页', '上一页', '下一页', '尾页']) {
    assert.ok(h.includes(`>${label}</A>`), `缺少 ${label}`)
  }
  assert.ok(h.includes('　'), '四个链接之间是全角空格（照原版 DOM）')
  assert.ok(h.includes('第1/2页'))
  assert.ok(h.includes('page=0">尾页'), '尾页用 page=0，照原版 DOM')
  assert.ok(h.includes('page=2">下一页'))
})

test('购买法宝页：名称180/价格180/操作，以仙石计价，两列可排序（原版 DOM）', () => {
  const h = renderTrade(vm({ view: 'buyitem' }))
  // href 里的 & 按 HTML 规矩转成 &amp;，原版 DOM 也是这么写的
  assert.ok(
    h.includes('<TD width=180><A href="trade.jsp?tab=3&amp;type=0&amp;order=1'),
    '名称列排序 order=1',
  )
  assert.ok(h.includes('order=2'), '价格列排序 order=2')
  assert.ok(h.includes('>名称</A>') && h.includes('>价格</A>'))
  assert.ok(h.includes('<TD>120仙石</TD>'), '挂单实例：极品古纹青石剑+4 120仙石')
  assert.ok(h.includes('<TD>720仙石</TD>'))
  assert.ok(!h.includes('两</TD>'), '法宝市场不用银两计价')
})

test('购买法宝：名称点开右窗 itemmid，购买弹「确定购买?」走 buyitem', () => {
  const h = renderTrade(vm({ view: 'buyitem' }))
  assert.ok(h.includes("openRWindow('极品古纹青石剑+4', 'itemmid.jsp?item=50504&quality=4')"))
  assert.ok(h.includes('class=skillup>'), '名称格带 skillup（绿色粗体）')
  assert.ok(h.includes("MDialogOkCancel('', '确定购买?',function(){ajaxPost('buyitem', 'sheet=44210', refleshAll);})"))
})

test('购买法宝页的筛选参数是原版那五个：type/level/order/page/search', () => {
  const h = renderTrade(vm({ view: 'buyitem', level: 4, search: '古纹青石剑' }))
  for (const p of ['tab=3', 'type=0', 'order=', 'level=4', 'search=']) {
    assert.ok(h.includes(p), `分页链接缺少参数 ${p}`)
  }
  assert.ok(h.includes('>极品</OPTION>'), '品质下拉 0 全部…4 极品')
  assert.ok(h.includes('value="4" selected'))
  assert.ok(h.includes('value="古纹青石剑"'), '搜索词回填到输入框')
})

test('出售法宝页：我的挂单表操作是「撤销」，走 unsellitem 且没有确认框', () => {
  const h = renderTrade(vm({ view: 'sellitem' }))
  assert.ok(h.includes(">撤销</A>"))
  assert.ok(h.includes("ajaxPost('unsellitem', 'sheet=40005', refleshAll);"))
  assert.ok(!h.includes('确定撤销'), '原版 DOM 里撤销不弹确认框')
  assert.ok(h.includes('<TD>2仙石 </TD>'), '藏宝图 2仙石（原版价格后有个空格）')
  assert.ok(h.includes('>我的挂单</TD>'))
  assert.ok(h.includes('value=出售'), '上半是出售表单（重建）')
})

test('出售真气页：同样是 1:1 等量换，挂单可撤销', () => {
  const h = renderTrade(vm({ view: 'sellqi' }))
  assert.ok(h.includes('我用 <SELECT'))
  assert.ok(h.includes('等量'))
  assert.ok(h.includes('<IMG src="img/res/gold.gif">金: 500'))
  assert.ok(h.includes('<IMG src="img/res/wood.gif">木: 500'), '提供与需求数量相同（1:1）')
  assert.ok(h.includes('unsellqi'))
})

test('玩家可控的法宝名在正文与内联 onclick 里都被转义', () => {
  const evil = `<img src=x onerror=alert(1)>'"`
  const h = renderTrade(
    vm({ view: 'buyitem', itemOffers: [{ sheet: 1, name: evil, item: 1, quality: 0, price: 1 }] }),
  )
  assert.ok(!h.includes('<img src=x'), '正文里不应出现未转义的标签')
  assert.ok(!h.includes("openRWindow('<img"), 'onclick 里也不应出现未转义的尖括号')
  assert.ok(h.includes('\\x3c'), 'escJs 把尖括号转成 \\x3c')
})


test('真实需求数量和收购价可见，出售表单有独立处理入口', () => {
  const offer = { sheet: 9, give: '金' as const, want: '木' as const, amount: 19000, wantAmount: 19341, seconds: 23750 }
  for (const view of ['buyqi', 'sellqi'] as const) {
    const html = renderTrade(vm({ view, qiOffers: [offer], myQiOffers: [offer] }))
    assert.ok(html.includes('金: 19000'))
    assert.ok(html.includes('木: 19341'))
  }
  assert.ok(renderTrade(vm({ view: 'sellqi' })).includes('id=sellqiform'))
  const html = renderTrade(vm({ view: 'sellitem', sellable: [{ id: 1, name: '极品飞剑', npcPrice: 20 }] }))
  assert.ok(html.includes('id=sellitemform'))
  assert.ok(html.includes('NPC最高收购20仙石'))
})
