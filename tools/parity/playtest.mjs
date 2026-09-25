#!/usr/bin/env node
/**
 * 端到端试玩：建号 → 进游戏 → 点经脉升级 → 刷新后存档还在。
 *
 * 这是阶段 2 的验收：证明引擎与界面真的接通了，而不只是各自的单元测试通过。
 * 用法：先 `npm run dev`，再 `node tools/parity/playtest.mjs`
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'tools', 'parity', 'shots')
const BASE = process.env.BASE ?? 'http://localhost:5273'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const steps = []
const check = (name, ok, detail = '') => {
  steps.push({ name, ok, detail })
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. 首次打开应是建号页
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
check('首次打开进建号页', await page.locator('#createplayerform').count() > 0)
await page.screenshot({ path: join(OUT, 'play-1-create.png') })

// 2. 填名字、选木属性通天、确定
await page.fill('#playername', '173小鱼')
await page.selectOption('select[name=attr]', '1') // 木
await page.selectOption('select[name=school]', '3') // 通天
await page.check('input[name=posi][value="4"]') // 西南益州
await page.click('a[onclick="sendCreatePlayer()"]')
await page.waitForTimeout(400)

check('建号后进入主界面', await page.locator('#gpage').count() > 0)
const name = await page.locator('td.titlebg').first().textContent()
check('角色名显示正确', name?.includes('173小鱼') ?? false, name ?? '')
await page.screenshot({ path: join(OUT, 'play-2-main.png') })

// 3. 五行一缺：木属性角色的金产量应为 0
const goldInc = await page.locator('#goldinc').textContent()
const woodInc = await page.locator('#woodinc').textContent()
check('木属性角色金产量为 0（五行一缺）', goldInc === '0', `金 ${goldInc} / 木 ${woodInc}`)

// 4. 新号真气为 0，无法升级 → 应提示真气不足
await page.locator('.mnode').first().click()
await page.waitForTimeout(200)
check('点经脉节点打开升级说明窗', await page.locator('#rwindow').isVisible())
const panelText = await page.locator('#rwindowcontent').textContent()
check('说明窗显示升级消耗与时间', (panelText ?? '').includes('升级到Lv.1消耗'), (panelText ?? '').slice(0, 40))

await page.click('a[onclick^="doUpgrade"]')
await page.waitForTimeout(200)
const msg = await page.locator('#upgradeMsg').textContent()
check('真气不足时给出原版提示语', (msg ?? '').includes('升级所需真气不足'), msg ?? '')
await page.screenshot({ path: join(OUT, 'play-3-upgrade.png') })

// 5. 给一点真气再升级（模拟攒够了）
await page.evaluate(() => {
  const raw = localStorage.getItem('xiuzhen.save')
  if (!raw) return
  const env = JSON.parse(raw)
  env.state.player.qi = [9999, 9999, 9999, 9999, 9999]
  localStorage.setItem('xiuzhen.save', JSON.stringify(env))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.locator('.mnode').first().click()
await page.waitForTimeout(200)
await page.click('a[onclick^="doUpgrade"]')
await page.waitForTimeout(300)

const eventText = await page.locator('#gmid').textContent()
check('升级后出现修炼事件', (eventText ?? '').includes('Lv1'), (eventText ?? '').replace(/\s+/g, ' ').slice(0, 80))
check('事件栏有「半 完」加速', (eventText ?? '').includes('半') && (eventText ?? '').includes('完'))
await page.screenshot({ path: join(OUT, 'play-4-cultivating.png') })

// 6. 刷新后存档还在
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
const after = await page.locator('td.titlebg').first().textContent()
check('刷新后存档保留', after?.includes('173小鱼') ?? false)
const stillCultivating = await page.locator('#gmid').textContent()
check('修炼事件在刷新后继续', (stillCultivating ?? '').includes('Lv1'))

// 7. 没有 JS 报错
check('全程无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()

const failed = steps.filter((s) => !s.ok)
console.log(`\n${steps.length - failed.length}/${steps.length} 步通过`)
process.exit(failed.length ? 1 : 0)
