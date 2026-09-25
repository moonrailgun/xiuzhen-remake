#!/usr/bin/env node
/**
 * 截图对齐验收：把复刻页面和当年的截图叠起来比。
 *
 * 纪律（`docs/PLAN.md` §4 阶段 1 第 6 步 + 评审意见）：
 *  - `deviceScaleFactor=1`，否则 Retina 下出 2× 图，像素对不上；
 *  - **只有 `tools/parity/manifest.json` 里 `use=="overlay_2px"` 的截图**才做像素级断言，
 *    缩放过的图只能比区块比例；
 *  - 媒体水印、浏览器原生控件、资料片后才有的元素要打掩膜。
 *
 * 这里做的是**区块几何**对齐：抓复刻页面里关键元素的包围盒，和从原图量出的
 * 参考框比对。逐像素比对颜色意义不大（源图是 JPEG，且 2008-12 那批被做过曲线处理，
 * 见 `docs/spec/DECISIONS-ui.md` §0.3）。
 *
 * 用法：先 `npm run dev`，再 `node tools/parity/compare.mjs`
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'tools', 'parity', 'shots')
const BASE = process.env.BASE ?? 'http://localhost:5273'
mkdirSync(OUT, { recursive: true })

/**
 * 参考框：从原生 1:1 截图 #2（xiuzhen801.jpg，2008-12）量出来的页面坐标。
 * 量法：截图左留白 5px，所以「截图 x − 5 = 页面 x」；顶栏黑线实测在 y=98。
 * 容差 ±2px（评审定的 overlay_2px 标准）。
 */
const REFERENCE = [
  { id: 'gpage', box: [0, 0, 1000, null], why: '页面定宽 1000、左对齐' },
  { id: 'top', box: [0, 0, 1000, 99], why: '顶栏：y0–97 墨迹 + y98 黑线' },
  { id: 'bigmenu', box: [307, 78, null, null], why: '主标签起点 x≈307（步进 64）' },
  { id: 'resource', box: [305, 26, null, null], why: '资源条起点 x≈305（步进 120）' },
  { id: 'avgres', box: [891, 74, null, null], why: '五行互化 x≈891' },
  { id: 'gleft', box: [20, 100, 460, null], why: '左栏 20–480，内容表宽 460' },
  { id: 'gmid', box: [509, 100, 252, null], why: '中栏 509–761' },
  { id: 'gright', box: [768, 100, 220, null], why: '右栏 768–988' },
]

const TOLERANCE = 2

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1100, height: 800 },
  deviceScaleFactor: 1, // 关键
})

// 用预览模式渲染 2008-12 那张截图的场景（夹具逐字抄了截图上的数字）
await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle' })

const measured = await page.evaluate((ids) => {
  const out = {}
  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) {
      out[id] = null
      continue
    }
    const r = el.getBoundingClientRect()
    out[id] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
  }
  return out
}, REFERENCE.map((r) => r.id))

const rows = []
let pass = 0
let fail = 0

for (const ref of REFERENCE) {
  const got = measured[ref.id]
  if (!got) {
    rows.push({ id: ref.id, ok: false, detail: '元素不存在', why: ref.why })
    fail++
    continue
  }
  const diffs = []
  const labels = ['x', 'y', '宽', '高']
  ref.box.forEach((want, i) => {
    if (want === null) return // null = 这一维不做断言
    const delta = got[i] - want
    if (Math.abs(delta) > TOLERANCE) diffs.push(`${labels[i]} 差 ${delta > 0 ? '+' : ''}${delta}`)
  })
  const ok = diffs.length === 0
  ok ? pass++ : fail++
  rows.push({
    id: ref.id,
    ok,
    detail: ok ? `[${got.join(', ')}]` : `${diffs.join('、')}（实得 [${got.join(', ')}]）`,
    why: ref.why,
  })
}

console.log(`截图对齐（容差 ±${TOLERANCE}px，对照原生 1:1 截图 #2）\n`)
for (const r of rows) {
  console.log(`${r.ok ? '✔' : '✖'} ${r.id.padEnd(10)} ${r.detail}`)
  if (!r.ok) console.log(`             依据：${r.why}`)
}
console.log(`\n${pass}/${pass + fail} 个区块在容差内`)

await page.screenshot({ path: join(OUT, 'parity-main.png') })
writeFileSync(join(OUT, 'parity-report.json'), JSON.stringify({ tolerance: TOLERANCE, rows }, null, 2))

await browser.close()
process.exit(fail ? 1 : 0)
