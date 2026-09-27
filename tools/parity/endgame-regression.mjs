#!/usr/bin/env node
// 后期跨层边界回归使用独立夹具；不冒充自然游玩进度。
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { newGame } from '../../src/engine/game.ts'
import { serialize } from '../../src/engine/save.ts'
import { treasureItem } from '../../src/engine/treasure.ts'
import { SECRET_SKILLS } from '../../src/data/secrets.ts'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 1 })
page.setDefaultTimeout(5000)
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('xiuzhen.save')).state)
const close = async () => {
  for (const id of ['lwindow', 'rwindow', 'mwindow', 'mwindow2', 'bwindow']) {
    const a = page.locator(`#${id} .dlgclosebtn a`)
    if (await a.isVisible()) await a.click()
  }
}
const use = async name => {
  await close()
  await page.locator('#bigmenu a[href="item.jsp"]').click()
  const s = await saved(), i = s.player.artifacts.findIndex(a => a.name === name)
  assert.ok(i >= 0, name)
  const group = s.player.artifacts[i].kind === 'book' ? 3 : s.player.artifacts[i].kind === 'pill' ? 2 : 5
  await page.locator(`input[name=selectitem${group}][value="${i + 1}"]`).check()
  await page.locator(`a[onclick="sendUseItem${group}()"]`).click()
}
const selectMap = async (x, y) => {
  await close()
  await page.locator('#bigmenu a[href="map.jsp"]').click()
  await page.fill('#viewposx', String(x))
  await page.fill('#viewposy', String(y))
  await page.locator('a[onclick="goToPos()"]').click()
  await page.locator(`a[onclick="onMapCellClick(${x},${y});return false"]`).click()
}
try {
  const wall = new Date('2026-09-27T00:00:00Z')
  const s = newGame({ name: '后期回归', gender: 'm', element: '木', school: '昆仑', x: 100, y: 100, seed: 42 }, +wall)
  const ready = { ...s, rng: [0, 0, 0, 0], player: { ...s.player, realm: '元婴期', body: [0, 0, 0, 20, 0, 10, 0, 20],
    qi: [0, 0, 0, 0, 0], skills: { 御剑术: 20 }, artifacts: [
      treasureItem('藏宝图', 'map'), treasureItem('御剑飞行', 'fly', 'book'),
      treasureItem('玉虚桃木剑', 'sword', 'sword'),
      { ...treasureItem('十炼紫金丹', 'pill', 'pill'), count: 2 },
      treasureItem('新手玄武玉匣', 'box'),
      treasureItem('二十炼五行丹', 'five-qi', 'pill'),
      ...SECRET_SKILLS.map(n => treasureItem(n.name, `book:${n.id}`, 'book')),
      ...['青玉简页', '夜明珠', '了缘拂尘', '雷音钟'].map(n => treasureItem(n, n)),
    ] } }
  await page.clock.install({ time: wall })
  await page.clock.pauseAt(wall)
  await page.addInitScript(raw => { if (!localStorage.getItem('xiuzhen.save')) localStorage.setItem('xiuzhen.save', raw) }, serialize(ready, 0))
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await use('十炼紫金丹')
  const pill = await saved()
  assert.equal(pill.player.qi[0], 8600)
  assert.deepEqual(pill.player.qi.slice(1), [0, 0, 0, 0])
  assert.equal(pill.player.artifacts.find(a => a.id === 'pill').count, 1)
  console.log('✔ 十炼单行丹只恢复对应真气，叠放只消费一颗')

  await use('藏宝图')
  const t = (await saved()).treasure
  assert.equal(t.reward.name, '物理通明')
  await page.locator('a[onclick="claimTreasure()"]:visible').click()
  assert.deepEqual((await saved()).treasure, t)
  await page.reload()
  assert.deepEqual((await saved()).treasure, t)
  await selectMap(t.x, t.y)
  await page.locator('a[onclick="mapMenuMove()"]').click()
  const moving = await saved()
  const seconds = moving.timeline.events.find(e => e.kind === 'move').payload.legs.reduce((n, l) => n + l.seconds, 0)
  await page.clock.fastForward((seconds + 2) * 1000)
  await page.locator('a[onclick*="questid=treasure"]').click()
  await page.locator('a[onclick="claimTreasure()"]:visible').click()
  assert.equal((await saved()).treasure, undefined)
  await use('物理通明')
  assert.equal((await saved()).player.skills['物理通明'], 1)
  console.log('✔ 用图、未到达拒领、读档保持奖励、到达领取与学习秘笈')
  await use('青玉简页')
  assert.ok((await saved()).player.artifacts.some(a => a.name === '天宫秘箓'))
  assert.ok(!(await saved()).player.artifacts.some(a => a.name === '雷音钟'))
  console.log('✔ 四材料从背包入口合成天宫秘箓')

  await use('御剑飞行')
  await selectMap(110, 110)
  await page.locator('a[onclick="mapMenuFly()"]').click()
  await page.locator('a[onclick="flyTo(110,110,\'sword\')"]').click()
  assert.equal((await saved()).player.artifacts.find(a => a.id === 'sword').status, '御剑飞行中')
  await page.reload()
  assert.equal((await saved()).timeline.events.find(e => e.kind === 'move').payload.op, 'flight')
  await page.locator('a[onclick^="cancelmove("]').click()
  assert.equal((await saved()).player.artifacts.find(a => a.id === 'sword').status, '空闲')
  await selectMap(110, 110)
  await page.locator('a[onclick="mapMenuFly()"]').click()
  await page.locator('a[onclick="flyTo(110,110,\'sword\')"]').click()
  const f = await saved()
  await page.clock.fastForward((f.timeline.events.find(e => e.kind === 'move').finishAt - f.clock.gameT + 2) * 1000)
  const end = await saved()
  assert.deepEqual([end.player.x, end.player.y], [110, 110])
  assert.equal(end.player.artifacts.find(a => a.id === 'sword').status, '空闲')
  await page.screenshot({ path: 'tools/parity/shots/endgame-flight.png' })
  console.log('✔ 地图选择飞剑、飞行中刷新、取消与到达均归还飞剑')
  await use('新手玄武玉匣')
  const box = await saved()
  assert.ok(!box.player.artifacts.some(a => a.id === 'box'))
  const guard = box.player.artifacts.find(a => a.kind === 'guard')
  assert.equal(guard.name, '指玄道藏碑')
  assert.equal(guard.quality, '凡品')
  assert.ok(guard.refine >= 0 && guard.refine <= 3)
  await page.reload()
  assert.deepEqual((await saved()).player.artifacts.find(a => a.id === guard.id), guard)
  console.log('✔ 新手玉匣实际开箱并保留护身存档')
  await use('二十炼五行丹')
  for (const book of SECRET_SKILLS) {
    await use(book.name)
    assert.equal((await saved()).player.skills[book.name], 1)
    await close()
    await page.locator('#bigmenu a[href="skill.jsp"]').click()
    await page.locator('#gleft a[href="skill.jsp?tab=6"]').click()
    await page.locator(`a[onclick*="skillmid.jsp?skill=${book.id}"]`).click()
    await page.locator('a[onclick^="doUpgrade("]').click()
    const upgrading = await saved()
    const event = upgrading.timeline.events.find(e => e.kind === 'cultivate')
    assert.ok(event, `${book.name}进入修炼队列`)
    await page.clock.fastForward((event.finishAt - upgrading.clock.gameT + 2) * 1000)
    assert.equal((await saved()).player.skills[book.name], 2)
  }
  await close()
  await page.locator('#bigmenu a[href="skill.jsp"]').click()
  await page.locator('#gleft a[href="skill.jsp?tab=6"]').click()
  await page.screenshot({ path: 'tools/parity/shots/endgame-secrets.png' })
  await page.reload()
  for (const book of SECRET_SKILLS) assert.equal((await saved()).player.skills[book.name], 2)
  console.log('✔ 五本后期秘笈逐本学习、从秘笈页修炼、刷新后保留等级')
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
