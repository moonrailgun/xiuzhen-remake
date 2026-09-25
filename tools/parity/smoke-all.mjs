#!/usr/bin/env node
/** 把所有页面都渲染一遍，确认没有运行时报错。用法：先 npm run dev。 */
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://localhost:5273'
const PAGES = ['', 'page=map', 'page=skill', 'page=skill&tab=sword', 'page=skill&tab=math',
  'page=item', 'page=item&tab=sword', 'page=trade', 'page=ally', 'page=createplayer', 'page=body']

const browser = await chromium.launch()
let bad = 0
for (const q of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await page.goto(`${BASE}/?demo=1${q ? '&' + q : ''}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)
  const has = await page.locator('#gpage').count()
  const ok = has > 0 && errs.length === 0
  if (!ok) bad++
  console.log(`${ok ? '✔' : '✖'} ${q || '(默认)'}${errs.length ? ' — ' + errs[0].slice(0, 70) : ''}`)
  await page.close()
}
await browser.close()
console.log(`\n${PAGES.length - bad}/${PAGES.length} 个页面正常`)
process.exit(bad ? 1 : 0)
