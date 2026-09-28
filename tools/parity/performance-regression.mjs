#!/usr/bin/env node
// 正式入口长离线结算：独立存档，暂停调度以稳定覆盖关闭页面与跨标签中断。
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { newGame, tick } from '../../src/engine/game.ts'
import { DAY } from '../../src/engine/clock.ts'
import { serialize, SAVE_KEYS } from '../../src/engine/save.ts'

const browser = await chromium.launch()
await mkdir('tools/parity/shots', { recursive: true })
const errors = []
const wall = Date.parse('2026-09-28T00:00:00Z')
const makeState = () => {
  const s = newGame({ name: '离线回归', gender: 'f', element: '木', school: '通天', x: 100, y: 100, seed: 42 }, wall)
  return { ...s, clock: { gameT: 60 * DAY, wallT: wall - DAY * 1000, rate: 600 } }
}
async function open(failScheduler = false) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
  const original = makeState()
  const page = await context.newPage()
  await page.addInitScript(({ raw, wall, failScheduler }) => {
    Date.now = () => wall
    localStorage.setItem('xiuzhen.save', raw)
    window.holdCatchUp = true
    const timeout = window.setTimeout
    window.setTimeout = function (fn, ms, ...args) {
      if (ms === 0 && window.holdCatchUp && document.getElementById('offline-progress')) {
        if (failScheduler) {
          failScheduler = false
          window.holdCatchUp = false
          throw new Error('回归注入的调度失败')
        }
        window.continueCatchUp = () => fn(...args)
        return 0
      }
      return timeout(fn, ms, ...args)
    }
  }, { raw: serialize(original, original.clock.gameT), wall, failScheduler })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await page.locator('#offline-progress').waitFor({ timeout: 5000 })
  return { context, page, original }
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('xiuzhen.save')).state)
const finish = async page => {
  await page.evaluate(() => { window.holdCatchUp = false; window.continueCatchUp() })
  await page.locator('#offline-progress').waitFor({ state: 'detached' })
}
try {
  {
    const { context, page, original } = await open()
    assert.deepEqual(await saved(page), original, '分批过程中不能保存半结算状态')
    await page.evaluate(() => { setRate(1); gmZeroQi(); refleshAll() })
    assert.deepEqual(await saved(page), original, '结算中禁止动作与重复 pulse 覆盖状态')
    await page.screenshot({ path: 'tools/parity/shots/offline-progress.png' })
    await finish(page)
    assert.deepEqual(await saved(page), tick(original, wall).state, '正式入口结果与同步引擎逐字段一致')
    await page.locator('#bigmenu a[href="map.jsp"]').click()
    await page.screenshot({ path: 'tools/parity/shots/optimized-map.png' })
    await context.close()
    console.log('✔ 长离线让出主线程、动作互斥、结果一致，完成后可操作地图')
  }
  {
    const { context, page, original } = await open()
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    assert.deepEqual(await saved(page), original, '关闭时保存原时钟，不吞掉未结算离线时间')
    await page.evaluate(() => window.continueCatchUp())
    assert.deepEqual(await saved(page), original, '已取消批次不能回写')
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await page.locator('#offline-progress').waitFor()
    await finish(page)
    assert.deepEqual(await saved(page), tick(original, wall).state, '返回页面继续完整结算')
    await context.close()
    console.log('✔ 关闭与返回页面保留全部收益')
  }
  {
    const { context, page, original } = await open()
    const replacement = { ...original, player: { ...original.player, name: '另一标签' }, clock: { ...original.clock, wallT: wall } }
    const other = await context.newPage()
    // 同 origin 的独立标签触发真实 storage 事件；不运行游戏和初始化脚本。
    await other.goto(`${process.env.BASE ?? 'http://localhost:5273'}/?demo=1`)
    await other.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: SAVE_KEYS.main, raw: serialize(replacement, replacement.clock.gameT) })
    await page.locator('#offline-progress').waitFor({ state: 'detached' })
    await page.evaluate(() => window.continueCatchUp())
    assert.deepEqual(await saved(page), replacement, '其他标签的新档不被旧结算覆盖')
    await context.close()
    console.log('✔ 跨标签替换取消旧结算')
  }
  {
    const { context, page, original } = await open(true)
    assert.match(await page.locator('#offline-progress').innerText(), /离线结算失败/)
    assert.deepEqual(await saved(page), original, '失败时保留原档')
    const download = page.waitForEvent('download')
    await page.locator('#offline-progress button').click()
    const file = await download
    assert.deepEqual(JSON.parse(await readFile(await file.path(), 'utf8')).state, original, '失败后仍能导出原档')
    await context.close()
    console.log('✔ 结算异常保留原档并可导出')
  }
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
