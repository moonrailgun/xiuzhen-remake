/**
 * 样式表里几条容易被「好心改回去」的规则。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const css = readFileSync(join(ROOT, 'public', 'css', 'oui.css'), 'utf8')

test('★不要再关抗锯齿（曾经为了「点阵观感」关过，结果只是把中文字糊掉）', () => {
  // 理由写在 oui.css 的 body 规则里：
  //  - Windows：Blink 不实现这个属性，而且 SimSun 12–14px 走内嵌点阵，本来就不抗锯齿；
  //  - macOS：落到 Songti SC 这种轮廓字体，关掉之后 12px 的细横画直接断。
  // 实测同一段字：关 → 截图 922 字节（只剩纯黑白），开 → 4483 字节（有灰阶）。
  const active = css
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n')
  assert.ok(
    !/-webkit-font-smoothing:\s*none/.test(active),
    '别再写 -webkit-font-smoothing: none —— 要点阵观感请内嵌点阵字库',
  )
})

test('中文字体栈保留 SimSun 打头（Windows 上才是当年那个观感）', () => {
  assert.match(css, /font-family:\s*SimSun,\s*'Songti SC'/, 'SimSun 要排第一，macOS 退到 Songti SC')
})

test('三档字号仍是原版实测值 12 / 13 / 14px', () => {
  assert.match(css, /--fs-small:\s*12px/)
  assert.match(css, /--fs-middle:\s*13px/)
  assert.match(css, /--fs-big:\s*14px/)
})

test('★六种浮窗都有落点，不能再全堆在左上角', () => {
  // 曾经只写了 position:absolute 没给 left/top，于是六个窗全落在静态流位置
  // （顶栏正下方最左边）叠在一起。落在哪一栏是有依据的：09 §2.5
  //「L 窗盖在 #gleft 上，R 窗盖在 #gmid(240) 上」，B ≈ 920 ≈ 整个 #gpage 宽。
  for (const id of ['lwindow', 'rwindow', 'bwindow', 'hwindow']) {
    const rule = new RegExp(`#${id}\\s*\\{[^}]*\\}`, 's').exec(css)?.[0] ?? ''
    assert.match(rule, /left:\s*\d/, `#${id} 没有 left，会堆到左上角`)
    assert.match(rule, /top:\s*\d/, `#${id} 没有 top`)
  }
  // 确认框没有位置证据，用居中。
  // 注意 `#mwindow, #mwindow2` 在样式表里出现不止一次（前面还有一条只设 z-index 的），
  // 所以要看**所有**同名规则里有没有一条给了居中。
  const dialogRules = [...css.matchAll(/#mwindow,\s*#mwindow2\s*\{[^}]*\}/gs)].map((x) => x[0])
  assert.ok(dialogRules.length > 0, '找不到 #mwindow, #mwindow2 的规则')
  assert.ok(dialogRules.some((r) => /left:\s*50%/.test(r)), '确认框没有居中')
})

test('R 窗尺寸照 1:1 实测：252×452，正好盖住中栏', () => {
  // 出处 `docs/research/04-ui-core-pages.md` §438：#3 实测外框 x=260–511 / y=1–452，
  // 内容表 230px，且高度固定（#91 内容很少也留白到 447）。
  const rule = /#rwindow\s*\{[^}]*\}/s.exec(css)?.[0] ?? ''
  assert.match(rule, /width:\s*252px/)
  assert.match(rule, /min-height:\s*452px/)
  // 中栏本身也得是 252 宽，否则「正好盖住」就不成立了
  assert.match(css, /#gmid\s*\{[^}]*width:\s*252px/s)
  const left = /#rwindow\s*\{[^}]*left:\s*(\d+)px/s.exec(css)?.[1]
  const gmid = /#gmid\s*\{[^}]*left:\s*(\d+)px/s.exec(css)?.[1]
  assert.equal(left, gmid, 'R 窗的 left 要和 #gmid 对齐')
})
