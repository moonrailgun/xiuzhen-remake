/**
 * 顶栏横幅的防回归。
 *
 * 这张图是全站每页最显眼的一张，出过两次问题：
 *  1. 宽度只有 750px（顶栏是 1000px），右边 1/4 没有背景，墨迹到一半就断；
 *  2. 烧在原图上的按钮与「人物/法术…」标签没擦干净，留下鬼影，
 *     我们的 HTML 又在上面画一遍真的，看起来就是重影 + 模糊。
 *
 * 所以这里钉三条：尺寸、CSS 引用、以及「别再糊回去」。
 * 重做脚本是 `tools/assets/rebuild_topbar.py`（可复现）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BANNER = join(ROOT, 'public', 'img', 'top', 'back2.jpg')

/** 只读 JPEG 的 SOFn 段拿宽高，不引依赖。 */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2 // 跳过 SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue }
    const marker = buf[i + 1]!
    // SOF0..SOF15，排除 DHT(c4) / JPG(c8) / DAC(cc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  throw new Error('不是有效的 JPEG')
}

test('★顶栏横幅必须铺满 1000×98（曾经只有 750，右边 1/4 是空的）', () => {
  assert.ok(existsSync(BANNER), '横幅文件不在了')
  const { width, height } = jpegSize(readFileSync(BANNER))
  assert.equal(width, 1000, '顶栏宽 1000px，图窄了右边就没有背景')
  assert.equal(height, 98, '顶栏墨迹高 98px（第 99 行是黑线、第 100 行是白线）')
})

test('CSS 确实在用这张图，且顶栏高度与之匹配', () => {
  const css = readFileSync(join(ROOT, 'public', 'css', 'oui.css'), 'utf8')
  assert.match(css, /#top\s*\{[^}]*url\(\.\.\/img\/top\/back2\.jpg\)/s)
  assert.match(css, /--top-height:\s*98px/, '顶栏高度应是 98px')
})

test('重做脚本还在（万一要改，别手工 P 图）', () => {
  const script = join(ROOT, 'tools', 'assets', 'rebuild_topbar.py')
  assert.ok(existsSync(script), '缺 tools/assets/rebuild_topbar.py')
  const text = readFileSync(script, 'utf8')
  // 两个关键事实别被改掉：两张源图同尺度、不整块挖
  assert.match(text, /scale=1\.000/, '应记着两张源截图是同尺度的（不要再当成缩图去放大）')
  assert.match(text, /不整块挖/, '应记着只擦文字像素，别把山一起挖了')
})

// 「糊不糊」要看高频能量，文件体积靠不住 —— 补平的区域反而压得更小
// （重做后 19KB < 原来 66KB，但明显更清晰）。这条检查在
// `tools/assets/check.py` 里做，那边有 PIL/numpy。
