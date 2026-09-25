import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderShell, pageHeader, countdown, MAIN_TABS, type ShellVm } from './shell.ts'
import { esc, escJs } from './html.ts'

const vm = (over: Partial<ShellVm> = {}): ShellVm => ({
  tab: 'player',
  resources: {
    current: [1132, 1364, 2164, 2071, 1401],
    capacity: 2900,
    perHour: [0, 59, 59, 59, 59],
    coin: 0,
    bonusCoin: 73,
  },
  serverTime: '16:47:58',
  version: '版本号:1.2.1-yyge',
  left: '',
  mid: '',
  right: '',
  ...over,
})

test('整页骨架用原版 id（截图对齐与补素材都依赖它们）', () => {
  const h = renderShell(vm())
  for (const id of [
    'gpage', 'top', 'logo', 'littlemenu', 'resource', 'bigmenu', 'avgres',
    'servertime', 'loading', 'gmain', 'gleft', 'gmid', 'gright',
  ]) {
    assert.ok(h.includes(`id=${id}`), `缺少 #${id}`)
  }
})

test('六种浮窗都在，且各自有 iframe 垫片与关闭钮', () => {
  const h = renderShell(vm())
  for (const w of ['lwindow', 'rwindow', 'bwindow', 'hwindow', 'mwindow', 'mwindow2']) {
    assert.ok(h.includes(`id=${w}`), `缺少 ${w}`)
    assert.ok(h.includes(`id=${w}iframe`), `缺少 ${w} 的 iframe 垫片`)
    assert.ok(h.includes(`id=${w}content`), `缺少 ${w}content`)
  }
  // M 窗单按钮、M2 窗确定+取消
  assert.ok(h.includes('btnok.gif'))
  assert.ok(h.includes('btncancel.gif'))
})

test('资源条：五行 + 仙石，格式为 现有/上限 与 每小时增量', () => {
  const h = renderShell(vm())
  for (const icon of ['gold', 'wood', 'water', 'fire', 'earth', 'coin']) {
    assert.ok(h.includes(`img/res/${icon}.gif`), `缺少 ${icon} 图标`)
  }
  // 对照截图 #2：1132/2900 +0、1364/2900 +59
  assert.ok(h.includes('>1132</SPAN>/'))
  assert.ok(h.includes('>2900</SPAN>'))
  assert.ok(h.includes('id=goldinc>0<'))
  assert.ok(h.includes('id=woodinc>59<'))
  assert.ok(h.includes('0 +73'), '仙石显示为 普通 +附加')
})

test('真气增长为负时显示减号（身上飞剑会持续耗气）', () => {
  // 截图 #95：金179 木179 水-1 火0 土-1
  const h = renderShell(vm({ resources: { ...vm().resources, perHour: [179, 179, -1, 0, -1] } }))
  assert.ok(h.includes('- <SPAN id=waterinc>1</SPAN>'), '水应显示 -1')
  assert.ok(h.includes('+ <SPAN id=fireinc>0</SPAN>'), '0 显示为 +0')
})

test('7 个主标签，选中的用 _2 图、其余 _1 图', () => {
  const h = renderShell(vm({ tab: 'map' }))
  assert.equal(MAIN_TABS.length, 7)
  assert.ok(h.includes('img/btn/map_2.gif'), '地图应为选中态')
  assert.ok(h.includes('img/btn/player_1.gif'), '人物应为未选中态')
  for (const t of MAIN_TABS) assert.ok(h.includes(`img/btn/${t}_`), `缺少标签 ${t}`)
})

test('消息标签不是页面，是打开右侧浮窗', () => {
  const h = renderShell(vm())
  assert.ok(h.includes("openRWindow('消息','msg.jsp')"))
  assert.ok(h.includes('id=msgopenbtn'))
  assert.ok(!h.includes('href="msg.jsp"'), '消息不应是链接跳转')
})

test('右上角 7 个小按钮（含 2009 DOM 才有的 about）', () => {
  const h = renderShell(vm())
  for (const img of ['index', 'help', 'rank', 'playerdir', 'vip', 'bbs', 'about']) {
    assert.ok(h.includes(`img/btn/${img}.gif`), `缺少 ${img}`)
  }
})

test('版本号与服务器时间都显示（两份证据不互斥）', () => {
  const h = renderShell(vm())
  assert.ok(h.includes('版本号:1.2.1-yyge'))
  assert.ok(h.includes('16:47:58'))
})

test('五行互化入口在顶栏', () => {
  assert.ok(renderShell(vm()).includes("openLWindow('','turnres.jsp')"))
})

test('页头通式：150×30 标题图 + 绿色子标签，且子标签无选中态', () => {
  const h = pageHeader('titleplayer.gif', [
    { label: '经脉', href: 'player.jsp', active: true },
    { label: '本体', href: 'player.jsp?tab=2' },
  ])
  assert.ok(h.includes('height=30 width=150'))
  assert.ok(h.includes('img/title/titleplayer.gif'))
  assert.ok(h.includes(' | '), '子标签用竖线分隔')
  const greens = h.match(/class=skillup/g) ?? []
  assert.equal(greens.length, 2, '两个子标签都是绿色，当前页不高亮')
})

test('倒计时用原版协议 <SPAN start="秒">，未知显示 ???', () => {
  assert.ok(countdown(1441).includes('start="1441"'))
  assert.ok(countdown(1441).includes('0:24:01'), '对照截图 #3「需要时间 0:24:01」')
  assert.ok(countdown(null).includes('???'))
})

test('HTML 转义挡住注入（玩家名会进正文和内联 onclick）', () => {
  const evil = `<img src=x onerror=alert(1)>&"'`
  const out = esc(evil)
  assert.ok(!out.includes('<img'))
  assert.ok(!out.includes('"') && !out.includes("'"))
  // escJs 用于把动态值塞进内联 JS 的字符串字面量：引号必须被反斜杠转义
  const js = escJs(`'); alert(1); //`)
  assert.ok(js.startsWith("\\'"), `单引号应被转义，实得 ${js}`)
  assert.ok(!/(^|[^\\])'/.test(js), '不应残留未转义的单引号')
  // </script> 与尖括号会提前结束内联脚本上下文
  assert.ok(!escJs('</script>').includes('<'))
  assert.ok(!escJs('</script>').includes('>'))
})

test('三栏内容原样嵌入', () => {
  const h = renderShell(vm({ left: '<b>L</b>', mid: '<b>M</b>', right: '<b>R</b>' }))
  assert.ok(h.includes('<DIV id=gleft><b>L</b></DIV>'))
  assert.ok(h.includes('<DIV id=gmid><b>M</b></DIV>'))
  assert.ok(h.includes('<DIV id=gright><b>R</b></DIV>'))
})
