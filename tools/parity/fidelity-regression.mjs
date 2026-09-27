#!/usr/bin/env node
// 社交、术数与献书使用独立初始夹具；操作全部经过正式页面，保留用户存档。
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { newGame } from '../../src/engine/game.ts'
import { serialize } from '../../src/engine/save.ts'
import { treasureItem } from '../../src/engine/treasure.ts'
import { BOOKS } from '../../src/data/town.ts'

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
const open = async url => { await close(); await page.evaluate(url => openLWindow('', url), url) }
const map = async (x, y) => {
  await close()
  await page.locator('#bigmenu a[href="map.jsp"]').click()
  await page.fill('#viewposx', String(x)); await page.fill('#viewposy', String(y))
  await page.locator('a[onclick="goToPos()"]').click()
  await page.locator(`a[onclick="onMapCellClick(${x},${y});return false"]`).click()
}
try {
  const wall = new Date('2026-09-27T00:00:00Z')
  const base = newGame({ name: '资料回归', gender: 'm', element: '木', school: '昆仑', x: 100, y: 100, seed: 42 }, +wall)
  const ready = { ...base, rng: [0, 0, 0, 0], player: { ...base.player, coin: 100,
    body: [0, 0, 0, 20, 0, 10, 0, 20], skills: { 易经: 20, 九宫飞星法: 2, 水镜玄光: 1 },
    artifacts: [treasureItem('请神香·文曲星君', 'incense'), treasureItem(BOOKS[0].name, 'book', 'book')] } }
  await page.clock.install({ time: wall }); await page.clock.pauseAt(wall)
  await page.addInitScript(raw => { if (!localStorage.getItem('xiuzhen.save')) localStorage.setItem('xiuzhen.save', raw) }, serialize(ready, 0))
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await page.locator('#bigmenu a[href="ally.jsp"]').click()
  await page.fill('#guildname', '清风阁')
  await page.getByRole('button', { name: '自行立派' }).click()
  await page.locator('#gleft a[href="ally.jsp?tab=4"]').click()
  await page.selectOption('#guildtarget', '1')
  await page.getByRole('button', { name: '结盟', exact: true }).click()
  let s = await saved()
  const guild = s.social.guilds.find(g => g.members.includes(0))
  assert.equal(guild.name, '清风阁'); assert.ok(guild.allies.includes(1))
  assert.ok(s.social.guilds.find(g => g.id === 1).allies.includes(guild.id))
  assert.equal(s.player.school, '昆仑')
  await page.screenshot({ path: 'tools/parity/shots/fidelity-guild.png' })
  const npc = s.npc.bases[0]
  await open(`playerinfo.jsp?playerid=${npc.id}`)
  await page.locator('#lwindow img[title="加为护法"]').click()
  assert.ok((await saved()).social.guardians.includes(npc.id))
  await open(`playerinfo.jsp?playerid=${npc.id}`)
  await page.getByText('屏蔽此人来信', { exact: true }).click()
  assert.ok((await saved()).social.blacklist.includes(npc.name))
  await page.reload()
  assert.ok((await saved()).social.guardians.includes(npc.id))
  console.log('✔ 独立门派、双向外交、护法和黑名单从正式入口生效并持久保存')

  await close(); await page.evaluate(() => openSettings())
  await page.locator('a[onclick="buyPeace()"]').click()
  s = await saved()
  assert.equal(s.player.coin, 80); assert.equal(s.player.bonusCoin, 100)
  assert.equal(s.peaceUntil, s.clock.gameT + 7 * 86400)
  console.log('✔ 免战从设置购买，只扣普通仙石并保存游戏时间期限')

  await close(); await page.locator('#bigmenu a[href="skill.jsp"]').click()
  await page.locator('#gleft a[href="skill.jsp?tab=3"]').click()
  await page.fill('#divinename', npc.name)
  await page.locator('a[onclick="divineByName()"],button[onclick="divineByName()"]', { }).click()
  s = await saved()
  assert.ok(s.divination.located[String(npc.id)])
  assert.equal(s.mail[0].body.kind, '九宫飞星'); assert.ok(s.mail[0].body.qi)
  await page.reload()
  assert.ok((await saved()).divination.located[String(npc.id)])
  console.log('✔ 按名字跨视野定位与二级真气情报保存后可恢复')

  await close(); await page.locator('#bigmenu a[href="item.jsp"]').click()
  await page.locator('input[name=selectitem5][value="1"]').check()
  await page.locator('a[onclick="sendUseItem5()"]', {}).click()
  s = await saved()
  const task = s.quests.wenchang
  assert.equal(task.book, BOOKS[0].name)
  assert.ok(task.reward)
  assert.ok(!s.player.artifacts.some(a => a.id === 'incense'))
  await page.reload(); assert.deepEqual((await saved()).quests.wenchang, task)
  await map(...task.at)
  await page.locator('a[onclick="mapMenuMove()"]').click()
  s = await saved()
  const event = s.timeline.events.find(e => e.kind === 'move')
  const seconds = event.payload.legs.reduce((n, l) => n + l.seconds, 0)
  await page.clock.fastForward((seconds + 2) * 1000)
  await page.locator('a[onclick*="questid=wenchang"]').click()
  await page.locator('a[onclick="claimWenchang()"]:visible').click()
  s = await saved()
  assert.ok(!s.player.artifacts.some(a => a.id === 'book'))
  assert.equal(s.quests.wenchang.expiresAt, task.expiresAt)
  assert.ok(s.player.artifacts.some(a => a.name === task.reward))
  await page.screenshot({ path: 'tools/parity/shots/fidelity-wenchang.png' })
  console.log('✔ 焚香、献书坐标、走路交书、奖励和一小时内继续换书完整运行')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
