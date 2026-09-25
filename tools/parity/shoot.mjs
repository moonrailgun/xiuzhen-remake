#!/usr/bin/env node
/**
 * 截图对齐工具：把复刻页面按原图尺寸渲染出来，便于和当年的截图叠图比对。
 *
 * 纪律（来自 docs/PLAN.md §4 阶段 1 第 6 步，以及评审意见）：
 *  - 必须 deviceScaleFactor=1，否则 Retina 下出 2× 图，像素对不上；
 *  - 只有 tools/parity/manifest.json 里 use=="overlay_2px" 的截图才做 ±2px 断言，
 *    缩放过的图只能比区块比例。
 *
 * 用法：
 *   node tools/parity/shoot.mjs                 # 截全页
 *   node tools/parity/shoot.mjs --probe         # 打印关键区块的实测坐标，便于对表
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'tools', 'parity', 'shots')
const URL_BASE = process.env.BASE ?? 'http://localhost:5273'

const probe = process.argv.includes('--probe')

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1100, height: 700 },
  deviceScaleFactor: 1, // 关键：不能出 2× 图
})

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL_BASE, { waitUntil: 'networkidle' })

if (probe) {
  // 实测关键区块的位置与尺寸，拿来和 04/05/06 报告里的像素框对表
  const boxes = await page.evaluate(() => {
    const ids = [
      'gpage', 'top', 'logo', 'littlemenu', 'resource', 'bigmenu',
      'avgres', 'servertime', 'gmain', 'gleft', 'gmid', 'gright',
    ]
    const out = {}
    for (const id of ids) {
      const el = document.getElementById(id)
      if (!el) { out[id] = null; continue }
      const r = el.getBoundingClientRect()
      out[id] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
    }
    return out
  })
  console.log('区块实测 [x, y, w, h]（对照 docs/research/04 §1）:')
  for (const [k, v] of Object.entries(boxes)) {
    console.log(`  ${k.padEnd(12)} ${v ? v.join(', ') : '缺失'}`)
  }

  const counts = await page.evaluate(() => ({
    主标签: document.querySelectorAll('#bigmenu img').length,
    右上按钮: document.querySelectorAll('#littlemenu img').length,
    资源图标: document.querySelectorAll('#resource img').length,
    浮窗: ['lwindow', 'rwindow', 'bwindow', 'hwindow', 'mwindow', 'mwindow2']
      .filter((k) => document.getElementById(k)).length,
  }))
  console.log('\n元素计数:', counts)
}

await page.screenshot({ path: join(OUT, 'shell.png') })
console.log(`\n已截图 → tools/parity/shots/shell.png`)

if (errors.length) {
  console.error('\n页面报错:')
  for (const e of errors) console.error('  ' + e)
}

await browser.close()
process.exit(errors.length ? 1 : 0)
