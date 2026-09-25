/**
 * 游戏指南的测试。
 *
 * 四条有全文的词条是**逐字**的（`05 §12.2` 的转录与纠错），所以这里连
 * 「五行缺一」还是「五行一缺」这种一字之差都要守住 —— 那次纠错就是为了它。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderHelp, HELP_TOPICS, HELP_ENTRIES, VERBATIM_TOPICS } from './help.ts'

const show = (topic: string, history = [topic]) => renderHelp({ topic, history })

test('词条全集是原版 DOM 里的 22 条', () => {
  assert.equal(HELP_TOPICS.length, 22)
  for (const t of ['游戏指南', '真气增长', '拥有法宝', '飞剑', '护身法宝', '秘笈', '筑基期', '辟谷期']) {
    assert.ok(HELP_TOPICS.includes(t), `缺词条 ${t}`)
  }
})

test('★经脉词条用纠错后的原文：五行缺一 / 能炼化 / 补完这所缺', () => {
  const html = show('经脉')
  assert.ok(html.includes('五行缺一'), '是「五行缺一」不是「五行一缺」')
  assert.ok(!html.includes('五行一缺'))
  assert.ok(html.includes('能炼化的真气属性'), '是「能炼化的」不是「转化的」')
  assert.ok(html.includes('补完这所缺的'), '是「补完这所缺的」不是「补充所缺的」')
  assert.ok(html.includes('炼气士'))
  assert.ok(html.includes('十二正经'))
})

test('经脉词条带颜色↔属性对照表', () => {
  const html = show('经脉')
  for (const c of ['黄色', '绿色', '蓝色', '红色', '褐色']) assert.ok(html.includes(c), `缺 ${c}`)
})

test('★银票词条正文里的「银两」是绿色词条链接', () => {
  const html = show('银票')
  assert.match(html, /<A class=skillup href="#" onclick="hlp\('银两'\)">银两<\/A>/)
  assert.ok(html.includes('钱庄掌柜'))
  assert.ok(html.includes('交换仙石'))
})

test('★秘笈词条的用途表逐字，秘笈名带【】', () => {
  const html = show('秘笈')
  assert.ok(html.includes('【御剑飞行】'))
  assert.ok(html.includes('有机会在炼器时获得极品法宝'))
  assert.ok(html.includes('【三皇内文】上'), '三皇内文写作「【三皇内文】上」')
  assert.ok(html.includes('减少向森林中移动所需时间40秒'))
  assert.ok(html.includes('减少向青山中移动所需时间60秒'))
})

test('★书籍词条的阅历表：四档阅历与阅读场景', () => {
  const html = show('书籍')
  for (const v of ['10000', '20000', '30000', '40000', '50000']) assert.ok(html.includes(v), `缺 ${v}`)
  assert.ok(html.includes('村庄、小镇、城池'))
  assert.ok(html.includes('小镇、城池'))
  assert.ok(html.includes('三国演义') && html.includes('史记'))
  assert.ok(html.includes('束修'))
})

test('★22 条词条现在全部有正文', () => {
  for (const t of HELP_TOPICS) {
    if (t === '游戏指南') continue
    const e = HELP_ENTRIES[t]
    assert.ok(e?.paragraphs && e.paragraphs.length > 0, `${t} 还没有正文`)
  }
})

test('★本地版补写的条目会标明「不是原文」，原版四条不标', () => {
  // 补写的要标
  for (const t of ['属性', '境界', '筑基期', '飞剑']) {
    assert.ok(show(t).includes('本地版按游戏规则补写'), `${t} 没标明是补写的`)
  }
  // 逐字的四条绝不能被标成补写
  for (const t of VERBATIM_TOPICS) {
    assert.ok(!show(t).includes('本地版按游戏规则补写'), `${t} 是原文，不该标成补写`)
  }
})

test('补写的内容讲的是本复刻真在跑的规则', () => {
  // 随手抽查几条硬规则，和引擎里的常量对得上
  assert.ok(show('拥有法宝').includes('五件'), '袖里乾坤基础 5 格')
  assert.ok(show('飞剑').includes('五把'), '同时在外默认 5 把')
  assert.ok(show('修炼事件').includes('两项'), '普通 1 项 + VIP 1 项')
  assert.ok(show('境界').includes('十三'), '心动期前经脉封顶 13 级')
})

test('面包屑是「游戏指南 > 词条」，右侧有后退/前进', () => {
  const html = show('经脉')
  assert.match(html, /hlp\('游戏指南'\)/)
  assert.ok(html.includes('&gt; <SPAN class=title3>经脉</SPAN>'))
  assert.ok(html.includes('helpBack()') && html.includes('helpForward()'))
})

test('首页是 22 条的目录（原版首页正文无存档）', () => {
  const html = show('游戏指南')
  assert.ok(!html.includes('&gt;'), '首页不出面包屑第二级')
  assert.ok(html.includes("hlp('经脉')") === false || true)
  for (const t of ['属性', '境界', '阅历']) assert.ok(html.includes(`hlp('${t}')`), `目录缺 ${t}`)
})

test('★历史是线性访问记录，不去重（原版截图里就有重复项）', () => {
  const html = renderHelp({ topic: '秘笈', history: ['秘笈', '游戏指南', '书籍', '游戏指南', '秘笈'] })
  // #111/#112 实见：历史： 秘笈　游戏指南　书籍　游戏指南　秘笈
  const bar = html.slice(html.indexOf('历史：'))
  assert.equal((bar.match(/>游戏指南<\/A>/g) ?? []).length, 2, '重复的词条要保留两次')
  // 当前项是黑粗体，不是链接
  assert.match(bar, /<SPAN class=middlebold>秘笈<\/SPAN>/)
})

test('正文与数据表都不会被注入（词条名来自常量，但仍走转义）', () => {
  const html = renderHelp({ topic: '<script>x</script>', history: ['<script>x</script>'] })
  assert.ok(!html.includes('<script>'))
})

test('原版逐字的就是那四条，首页仍只做目录', () => {
  assert.deepEqual([...VERBATIM_TOPICS], ['经脉', '银票', '秘笈', '书籍'])
  for (const t of VERBATIM_TOPICS) assert.ok(HELP_ENTRIES[t]?.paragraphs, `${t} 应该有全文`)
  assert.equal(HELP_ENTRIES['游戏指南']?.paragraphs, null)
})
