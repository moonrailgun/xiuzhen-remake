#!/usr/bin/env node
// `app.ts` 自己拼出来的 HTML 的转义闸门。
//
// 为什么要单独一个：`src/pages/escaping.test.ts` 只能覆盖 `src/pages/*` 的纯函数
// render，而 `client/app.ts` 里内联拼的那些片段（玩家列表窗、推算菜单、城镇 NPC 对话、
// 可领任务列表）一条都进不去 —— 775 个单测全绿也拦不住那里的注入。
// 这里走真浏览器：导入一份 NPC 名字带攻击串的存档，把这些界面都点一遍，
// 只看一件事：**攻击串有没有真的执行**。
import { chromium } from 'playwright'
import { newGame } from '../../src/engine/game.ts'
import { serialize } from '../../src/engine/save.ts'

/** 两种攻击串：一种闭合 JS 字符串字面量，一种闭合 HTML 属性。 */
const BREAK_JS = "李'-(window.__PWNED=1)-'四"
const BREAK_ATTR = 'X" onmouseover=window.__PWNED=1 z="'

const browser = await chromium.launch()
const page = await browser.newPage()
page.setDefaultTimeout(6000)
const failures = []
const errors = []
const dialogs = []
page.on('pageerror', e => errors.push(String(e)))
page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss() })
const check = (label, ok) => {
  console.log(`${ok ? '✔' : '✖'} ${label}`)
  if (!ok) failures.push(label)
}
const pwned = () => page.evaluate(() => globalThis.__PWNED === 1)
/** 划过所有链接：属性闭合型注入是 onmouseover，不点也会触发。 */
const hover = async (scope) => {
  const links = await page.locator(`${scope} a`).all()
  for (const l of links.slice(0, 40)) await l.hover({ timeout: 800 }).catch(() => {})
}

try {
  const wall = new Date('2026-09-22T00:00:00Z')
  await page.clock.install({ time: wall })
  await page.clock.pauseAt(wall)
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await page.fill('#playername', '转义道友')
  await page.selectOption('select[name=attr]', '1')
  await page.click('a[onclick="sendCreatePlayer()"]')
  await page.waitForTimeout(200)

  // 造一份存档：站在 (100,100)，同格摆两个名字带攻击串的 NPC
  const base = newGame({ name: '转义道友', gender: 'm', element: '金', school: '蜀山', x: 100, y: 100, seed: 7 }, wall.getTime())
  const evilNpc = (id, name) => ({
    id, name, profile: '羊', school: '蜀山', element: '金',
    bornAt: 0, homeX: 100, homeY: 100,
  })
  const fixture = {
    ...base,
    npc: { bases: [evilNpc(9001, BREAK_JS), evilNpc(9002, BREAK_ATTR)], patches: {} },
  }
  const chooser = page.waitForEvent('filechooser')
  await page.evaluate(() => importSavePrompt())
  await (await chooser).setFiles({ name: 'xss.json', mimeType: 'application/json',
    buffer: Buffer.from(serialize(fixture, wall.getTime())) })
  await page.waitForTimeout(150)
  const ok = page.locator('a[onclick="OnMDialog2OK()"]')
  await ok.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {})
  if (await ok.isVisible()) { await ok.click(); await page.waitForTimeout(150) }

  const loaded = await page.evaluate(() => JSON.parse(localStorage.getItem('xiuzhen.save')).state)
  check('带攻击串的存档导入成功（前提）', loaded.npc.bases.length === 2)

  console.log('\n中栏：当前场景中的玩家')
  await hover('#gmid')
  check('中栏没有被注入', !(await pwned()))

  console.log('\n玩家列表窗（app.ts 的 playerListWindow）')
  await page.evaluate(() => openPlayerList?.() ?? openLWindow('本地玩家', 'playerlist.jsp'))
    .catch(() => {})
  const more = page.locator('#gmid a', { hasText: '更多' })
  if (await more.count()) { await more.first().click(); await page.waitForTimeout(200) }
  await hover('#lwindow')
  check('玩家列表窗没有被注入', !(await pwned()))
  // 名字里的单引号不能把 onclick 拆坏 —— 坏了的话链接根本点不动
  const links = await page.locator('#lwindow a[onclick*="playerinfo.jsp"]').all()
  for (const l of links.slice(0, 4)) await l.click({ timeout: 800 }).catch(() => {})
  check('带引号的名字点得动，没把 onclick 拆成语法错误',
    !errors.some(e => /SyntaxError|Unexpected/.test(e)))

  console.log('\n推算菜单（spyPlayer → doDivine）')
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    await page.evaluate(name => spyPlayer(name), evil)
    await page.waitForTimeout(150)
    await hover('#lwindow')
  }
  check('推算菜单没有被注入', !(await pwned()))

  console.log('\n可领任务列表与城镇 NPC 对话')
  await page.evaluate(() => showAvailableQuests()).catch(() => {})
  await hover('#lwindow')
  check('可领任务列表没有被注入', !(await pwned()))

  console.log('\n总检')
  check('全程没有弹窗（alert/confirm 都算注入成功）', dialogs.length === 0)
  check('window.__PWNED 始终没有被置上', !(await pwned()))
  check('没有因为转义拆坏而产生语法错误',
    !errors.some(e => /SyntaxError|Unexpected/.test(e)))
  if (errors.length) console.log('页面异常：', errors.slice(0, 3).join('\n'))
} catch (error) {
  console.error(error)
  failures.push(String(error))
} finally {
  await browser.close()
}

console.log(`\n${failures.length ? `✖ ${failures.length} 项失败` : '✔ app.ts 转义闸门全部通过'}`)
process.exit(failures.length ? 1 : 0)
