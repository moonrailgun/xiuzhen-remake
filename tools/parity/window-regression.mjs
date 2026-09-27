#!/usr/bin/env node
// 浮窗壳子的闸门：标题条必须在**窗口顶部**，不能掉到底下去。
//
// 背景：壳子是照原版 DOM 逐字抄的，`#Xwindowtitle` 排在 `#Xwindowcontent`
// **之后**（`04 §2` 的 DOM 树 + `guides/54385-p1.html` 整页实捕都是这个顺序）。
// 它只能靠 CSS 提到顶部；一旦那条规则丢了，标题就按文档流落在内容下面，
// 内容越高掉得越低，最后吊在窗口外面 —— 而法宝详情窗的正文**故意不写法宝名**
// （原版就是靠标题条显示的），那一掉等于整个窗口不告诉你在看哪把剑。
//
// 落点依据 `04 §8.2`：#3 实测标题 at (270,11)、窗框 x=260/y=1 ⇒ 距窗内左上角各 ~10px，
// 与关闭钮（bbox=487,11，距右内缘 8px）同一行。
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
page.setDefaultTimeout(6000)
const failures = []
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(label)
}

/** 标题条相对窗口左上角的位置，以及内容首个元素的顶边。 */
const geometry = key => page.evaluate(k => {
  const win = document.getElementById(k)
  const title = document.getElementById(`${k}title`)
  const content = document.getElementById(`${k}content`)
  const w = win.getBoundingClientRect()
  const t = title.getBoundingClientRect()
  const first = content.firstElementChild ?? content
  const f = first.getBoundingClientRect()
  return {
    dx: Math.round(t.x - w.x),
    dy: Math.round(t.y - w.y),
    winHeight: Math.round(w.height),
    text: document.getElementById(`${k}text`).textContent,
    hasTitle: win.classList.contains('hastitle'),
    // 正文首个元素的顶边相对窗顶
    contentTop: Math.round(f.y - w.y),
    titleBottom: Math.round(t.bottom - w.y),
  }
}, key)

try {
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await page.fill('#playername', '窗口道友')
  await page.selectOption('select[name=attr]', '1')
  await page.click('a[onclick="sendCreatePlayer()"]')
  await page.waitForTimeout(300)

  console.log('带标题的窗：标题在左上角，内容让开那一行')
  const cases = [
    ['R 窗 · 法宝详情', 'rwindow', () => openRWindow('上品三阳一煞剑+5', 'itemmid.jsp?item=50400')],
    ['L 窗 · 写消息', 'lwindow', () => openLWindow('写消息', 'writemsg.jsp')],
    ['B 窗 · 战斗事件', 'bwindow', () => openBWindow('战斗事件', 'battleevent.jsp?tab=2')],
    ['M 窗 · 提示', 'mwindow', () => MDialog('掐指一算', '<div>测试</div>')],
  ]
  for (const [label, key, fn] of cases) {
    await page.evaluate(f => (0, eval)(`(${f})`)(), fn.toString())
    await page.waitForTimeout(250)
    const g = await geometry(key)
    check(`${label}：标题贴着窗口左上角`, g.dx >= 4 && g.dx <= 16 && g.dy >= 2 && g.dy <= 16, JSON.stringify(g))
    check(`${label}：标题没有掉到窗口下半部`, g.dy < g.winHeight / 2, `dy=${g.dy} 窗高=${g.winHeight}`)
    check(`${label}：标题文字写进去了`, (g.text ?? '') !== '')
    check(`${label}：正文让开了标题那一行`, g.contentTop >= g.titleBottom - 4,
      `正文顶=${g.contentTop} 标题底=${g.titleBottom}`)
  }

  console.log('\n空标题的窗：不白占那一行')
  await page.evaluate(() => openLWindow('', 'playerinfo.jsp?playerid=0'))
  await page.waitForTimeout(250)
  const empty = await geometry('lwindow')
  check('空标题窗不挂 hastitle', empty.hasTitle === false, JSON.stringify(empty))
  check('空标题窗正文仍从顶部开始', empty.contentTop <= 8, `正文顶=${empty.contentTop}`)

  console.log('\n内容很长时标题也不跟着往下跑')
  await page.evaluate(() => openGm())
  await page.waitForTimeout(350)
  const tall = await geometry('lwindow')
  check('GM 面板（很高）标题仍在顶部', tall.dy >= 2 && tall.dy <= 16, JSON.stringify(tall))
  check('前提：这个窗确实很高', tall.winHeight > 800, `窗高=${tall.winHeight}`)

  console.log('\n总检')
  check('全程无浏览器异常', errors.length === 0)
  if (errors.length) console.log(errors.slice(0, 3).join('\n'))
} catch (error) {
  console.error(error)
  failures.push(String(error))
} finally {
  await browser.close()
}

console.log(`\n${failures.length ? `✖ ${failures.length} 项失败` : '✔ 浮窗标题条闸门全部通过'}`)
process.exit(failures.length ? 1 : 0)
