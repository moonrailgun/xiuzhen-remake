#!/usr/bin/env node
// 独立浏览器、正式入口与真实文件导入。夹具只准备地点/资源，不预设任何完成事件。
// 先运行 npm run dev，再运行 node tools/parity/economy-regression.mjs。
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { newGame } from '../../src/engine/game.ts'
import { serialize } from '../../src/engine/save.ts'
import { WEEK } from '../../src/engine/clock.ts'
import { hourlyIncomeOf } from '../../src/engine/town.ts'
import { npcArtifactPrice } from '../../src/engine/market.ts'
import { terrainAt, WORLD_SIZE } from '../../src/data/world.ts'
import { BANK_NOTES } from '../../src/data/town.ts'
import { SWORDS } from '../../src/data/swords.ts'

const seed = 20260922
const weeks = 4
let townPosition
for (let y = 10; y < WORLD_SIZE - 10 && !townPosition; y++) {
  for (let x = 10; x < WORLD_SIZE - 10; x++) {
    if (terrainAt(seed, x, y, weeks) === '村庄') {
      townPosition = { x, y }
      break
    }
  }
}
assert.ok(townPosition, '种子世界中存在已开放村庄')
const artifact = {
  id: 'economy-fixture:sword', kind: 'sword',
  name: SWORDS.find(s => s.tradable).name,
  quality: '极品', refine: 2, status: '空闲', count: 1,
}
const name = '经济回归道友'
const browser = await chromium.launch()
const page = await browser.newPage()
page.setDefaultTimeout(5000)
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('xiuzhen.save')).state)
const check = (label, actual, expected = true) => {
  assert.deepEqual(actual, expected, label)
  console.log(`✔ ${label}`)
}
const townKey = `${townPosition.x},${townPosition.y}`
const ownedInvestment = state => state.towns[townKey]?.investments.find(i => i.owner === name)?.silver ?? 0
const incomeBetween = (town, start, end) => {
  const rate = hourlyIncomeOf(town, name)
  return Math.floor(end * rate / 3600) - Math.floor(start * rate / 3600)
}

try {
  // 停住墙钟，所有耗时只通过 runFor 推进，避免机器速度影响整点断言。
  const wall = new Date('2026-09-22T00:00:00Z')
  await page.clock.install({ time: wall })
  await page.clock.pauseAt(wall)
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await page.fill('#playername', '导入前道友')
  await page.selectOption('select[name=attr]', '1')
  await page.click('a[onclick="sendCreatePlayer()"]')

  const initial = newGame({ name, gender: 'm', element: '金', school: '蜀山',
    ...townPosition, seed, startGameT: weeks * WEEK }, wall.getTime())
  const fixture = {
    ...initial,
    clock: { ...initial.clock, rate: 600 },
    npc: { bases: [], patches: {} },
    player: { ...initial.player, silver: 100000, coin: 1000, artifacts: [artifact] },
  }
  // 不写 localStorage 后 reload：旧页面的 pagehide 会覆盖那种夹具。
  const chooser = page.waitForEvent('filechooser')
  await page.evaluate(() => importSavePrompt())
  await (await chooser).setFiles({ name: 'economy-fixture.json', mimeType: 'application/json',
    buffer: Buffer.from(serialize(fixture, wall.getTime())) })
  await page.waitForTimeout(100)
  // 导入会当场盖掉进度，先过二次确认（#mwindow2）。**必须等它出现再点**：
  // `isVisible()` 是当下一瞬的快照，文件读取是异步的，固定 sleep 100ms 赌不赢慢机器 ——
  // 赌输了就是「导入压根没发生，后面所有断言在旧状态上静默通过」。
  const importOk = page.locator('a[onclick="OnMDialog2OK()"]')
  await importOk.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {})
  if (await importOk.isVisible()) {
    await importOk.click()
    await page.waitForTimeout(100)
  }
  await page.waitForFunction(expected => JSON.parse(localStorage.getItem('xiuzhen.save'))?.state.player.name === expected, name)
  check('真实文件选择器导入经济夹具', (await saved()).player.name, name)

  console.log('投资、分红与异地运镖')
  await page.getByRole('link', { name: '村长', exact: true }).click()
  await page.fill('#investsilver', '1000')
  await page.getByRole('link', { name: '投资', exact: true }).click()
  let current = await saved()
  check('投资实际扣除本金并写入产业', [current.player.silver, ownedInvestment(current)], [99000, 1000])
  const invested = current
  await page.clock.runFor(6000)
  current = await saved()
  check('无操作一小时后自动分红', current.player.silver - invested.player.silver,
    incomeBetween(invested.towns[townKey], invested.clock.gameT, current.clock.gameT))
  check('投资分红为正', current.player.silver > invested.player.silver)

  await page.getByRole('link', { name: '镖局老板', exact: true }).click()
  await page.getByRole('link', { name: '领取运镖任务', exact: true }).click()
  const escortStarted = await saved()
  const escort = escortStarted.timeline.events.find(e => e.payload.op === 'escort')
  check('镖局创建真实运镖事件', !!escort)
  check('目的地是另一处已开放城镇',
    (escort.payload.x !== townPosition.x || escort.payload.y !== townPosition.y) &&
    ['村庄', '小镇', '城池'].includes(terrainAt(seed, escort.payload.x, escort.payload.y, weeks)))
  check('有产业的起点给出正佣金', escort.payload.fee > 0)
  await page.clock.runFor(Math.ceil((escort.finishAt - escortStarted.clock.gameT) / 600) * 1000)
  current = await saved()
  check('运镖计时完成后实际到站', [current.player.x, current.player.y], [escort.payload.x, escort.payload.y])
  check('运镖完成消耗事件', current.timeline.events.some(e => e.id === escort.id), false)
  check('运镖佣金和途中产业收益均到账', current.player.silver - escortStarted.player.silver,
    escort.payload.fee + incomeBetween(escortStarted.towns[townKey], escortStarted.clock.gameT, current.clock.gameT))
  check('到站后重新显示当地镖局', await page.getByRole('link', { name: '镖局老板', exact: true }).isVisible())

  console.log('产业撤资确认与取消')
  await page.locator('a[onclick*="estate.jsp"]').click()
  await page.getByRole('link', { name: '撤资', exact: true }).click()
  check('撤资显示真实确认框', await page.locator('#mwindow2').isVisible())
  const beforeWithdraw = await saved()
  check('点击撤资但尚未确认时不退款', ownedInvestment(beforeWithdraw), 1000)
  await page.locator('#mwindow2 .mwindow2cancel a').click()
  check('取消撤资保持本金和产业', [(await saved()).player.silver, ownedInvestment(await saved())],
    [beforeWithdraw.player.silver, 1000])
  await page.getByRole('link', { name: '撤资', exact: true }).click()
  await page.locator('#mwindow2 .mwindow2ok a').click()
  current = await saved()
  check('确认撤资退回本金并移除本人份额', [current.player.silver, ownedInvestment(current)],
    [beforeWithdraw.player.silver + 1000, 0])
  const afterWithdraw = current.player.silver
  await page.clock.runFor(6000)
  check('撤资后不再产生分红', (await saved()).player.silver, afterWithdraw)

  console.log('钱庄兑银票、背包使用兑回')
  const note = BANK_NOTES[0]
  await page.getByRole('link', { name: '钱庄掌柜', exact: true }).click()
  await page.getByRole('link', { name: `兑${note.name}（${note.value} 两）`, exact: true }).click()
  current = await saved()
  check('兑银票扣银两并取得真实背包物品',
    [current.player.silver, current.player.artifacts.find(a => a.name === note.name)?.count],
    [afterWithdraw - note.value, 1])
  await page.locator('a[href="item.jsp"]').first().click()
  await page.locator('input[name=selectitem5]').check()
  await page.locator('a[onclick="sendUseItem5()"]').click()
  current = await saved()
  check('从背包使用银票恢复银两且消耗银票',
    [current.player.silver, current.player.artifacts.some(a => a.name === note.name)], [afterWithdraw, false])

  console.log('法宝挂单、撤销、NPC 收购与购买')
  await page.locator('a[href="trade.jsp"]').first().click()
  await page.getByRole('link', { name: '出售法宝', exact: true }).click()
  const price = npcArtifactPrice(artifact)
  await page.selectOption('#sellitemform [name=item]', '0')
  await page.fill('#sellitemform [name=price]', String(price))
  await page.locator('#sellitemform [type=submit]').click()
  current = await saved()
  check('出售提交后法宝离开背包并形成挂单',
    [current.player.artifacts.some(a => a.id === artifact.id), current.market.artifacts.some(o => o.id === artifact.id)], [false, true])
  await page.getByRole('link', { name: '撤销', exact: true }).click()
  current = await saved()
  check('撤销挂单原样归还法宝（含淬炼等级）', current.player.artifacts.find(a => a.id === artifact.id), artifact)
  check('撤销移除挂单且不收取仙石', [current.market.artifacts.some(o => o.id === artifact.id), current.player.coin], [false, fixture.player.coin])

  await page.fill('#sellitemform [name=price]', String(price))
  await page.locator('#sellitemform [type=submit]').click()
  const saleStarted = await saved()
  await page.clock.runFor(6000)
  current = await saved()
  check('合理标价挂牌一小时后 NPC 成交，获得普通仙石',
    [current.market.artifacts.some(o => o.id === artifact.id), current.player.coin, current.player.bonusCoin],
    [false, saleStarted.player.coin + price, saleStarted.player.bonusCoin])
  check('NPC 成交后不复制法宝回背包', current.player.artifacts.some(a => a.id === artifact.id), false)

  await page.getByRole('link', { name: '购买法宝', exact: true }).click()
  const buy = page.locator('a[onclick*="ajaxPost(\'buyitem\'"]').first()
  const row = buy.locator('xpath=ancestor::tr[1]')
  const buyName = await row.locator('td').nth(0).innerText()
  const buyPrice = Number((await row.locator('td').nth(1).innerText()).replace(/[^0-9]/g, ''))
  const beforeBuy = await saved()
  await buy.click()
  check('市场购买显示确认且尚未扣款',
    [await page.locator('#mwindow2').isVisible(), (await saved()).player.coin], [true, beforeBuy.player.coin])
  await page.locator('#mwindow2 .mwindow2ok a').click()
  current = await saved()
  const purchased = current.player.artifacts.filter(a => !beforeBuy.player.artifacts.some(old => old.id === a.id))
  check('确认购买以普通仙石结算并实际获得法宝',
    [current.player.coin, current.player.bonusCoin, purchased.length],
    [beforeBuy.player.coin - buyPrice, beforeBuy.player.bonusCoin, 1])
  check('实际获得的法宝对应所点市场行', buyName.includes(purchased[0].name))
  check('买走的挂单被移除', current.market.artifacts.some(o => o.id === purchased[0].id), false)
  const coinAfterBuy = current.player.coin
  await page.clock.runFor(6000)
  check('继续推进不会重复结算法宝出售', (await saved()).player.coin, coinAfterBuy)
  check('所有经济流程无浏览器异常', errors, [])
} catch (error) {
  console.error('页面异常：', errors)
  console.error('当前提示：', await page.locator('#mwindowcontent').innerText().catch(() => ''))
  throw error
} finally {
  await browser.close()
}
