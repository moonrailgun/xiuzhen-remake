#!/usr/bin/env node
/** 为并排对比抓复刻侧的截图。用法：先 npm run dev，再 node tools/parity/shoot-cases.mjs */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'tools', 'parity', 'shots')
const BASE = process.env.BASE ?? 'http://localhost:5273'
mkdirSync(OUT, { recursive: true })

const CASES = [
  { name: 'main-2008', url: `${BASE}/?demo=1`, clip: { x: 0, y: 0, width: 1000, height: 588 } },
  { name: 'market-2008', url: `${BASE}/?demo=1&page=trade`, clip: { x: 0, y: 99, width: 510, height: 431 } },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 })
for (const c of CASES) {
  await page.goto(c.url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, `mine-${c.name}.png`), clip: c.clip })
  console.log(`✔ mine-${c.name}.png`)
}
await browser.close()
