#!/usr/bin/env node
// 正式入口的跨层回归；独立浏览器存档，不访问用户的现有存档。
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch()
const page = await browser.newPage()
page.setDefaultTimeout(5000)
const failures = []
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const check = (label, ok) => {
  console.log(`${ok ? '✔' : '✖'} ${label}`)
  if (!ok) failures.push(label)
}
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('xiuzhen.save')).state)
const importText = async raw => {
  const chooser = page.waitForEvent('filechooser')
  await page.evaluate(() => importSavePrompt())
  await (await chooser).setFiles({ name: 'regression.json', mimeType: 'application/json', buffer: Buffer.from(raw) })
  await page.waitForTimeout(100)
  // 导入会当场盖掉进度，所以有一道二次确认（#mwindow2）。不点它的话导入根本没发生，
  // 后面所有基于「导入后的存档」的断言都会在旧状态上静默通过。
  const ok = page.locator('a[onclick="OnMDialog2OK()"]')
  if (await ok.isVisible()) {
    await ok.click()
    await page.waitForTimeout(100)
  }
}
const acceptQuest = async id => {
  await page.evaluate(() => showAvailableQuests())
  await page.locator(`a[onclick="acceptQuest('${id}')"]`).click()
}
const quest = async id => page.evaluate(id => openLWindow('任务', `quest.jsp?questid=${id}`), id)
const claim = async () => page.locator('#lwindow img[src="img/getreward.gif"]').click()
try {
  const wall = new Date('2026-09-22T00:00:00Z')
  await page.clock.install({ time: wall })
  await page.clock.pauseAt(wall)
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await page.fill('#playername', '回归道友')
  await page.selectOption('select[name=attr]', '1')
  await page.click('a[onclick="sendCreatePlayer()"]')
  await page.locator('a[href="player.jsp?tab=2"]').click()
  check('正式入口可以进入本体', await page.locator('.bodynode').count() === 8)

  await page.evaluate(() => setRate(600))
  const before = await saved()
  await page.clock.runFor(6500)
  const after = await saved()
  check('无事件时仍自然生产并保存', after.player.qi[1] > before.player.qi[1])
  check('自动推进保留打开的设置窗', await page.locator('#lwindow').isVisible())

  await page.evaluate(() => closeLWindow())
  await acceptQuest('newbie:head:1')
  // 自然积累资源完成新手前三步，不注入任务进度或奖励。
  await page.clock.fastForward(120000)
  await page.locator('a[href="player.jsp"]').first().click()
  await page.locator('.mnode').first().click()
  await page.locator('a[onclick^="doUpgrade"]').click()
  check('自然生产的真气可启动首条经脉', (await saved()).timeline.events.some(e => e.kind === 'cultivate'))
  await page.clock.fastForward(2000)
  await quest('newbie:head:1')
  await claim()
  check('首项任务领奖落盘', (await saved()).quests.entries.some(e => e.id === 'newbie:head:1' && e.done))
  await acceptQuest('newbie:head:2')
  await quest('newbie:head:2')
  await page.getByRole('button', { name: '木', exact: true }).click()
  await claim()
  await acceptQuest('newbie:head:3')
  await quest('newbie:head:3')
  await page.getByRole('button', { name: '先炼剑', exact: true }).click()
  await claim()
  const tutorial = await saved()
  check('新手答题与选线可从页面完成并领奖', tutorial.quests.line === 'sword' && [1, 2, 3].every(n => tutorial.quests.entries.some(e => e.id === `newbie:head:${n}` && e.done)))

  await page.locator('#bigmenu a[href="map.jsp"]').click()
  const destination = { x: tutorial.player.x + 1, y: tutorial.player.y }
  await page.evaluate(({ x, y }) => onMapCellClick(x, y), destination)
  await page.locator('a[onclick="mapMenuMove()"] ').click()
  const walking = await saved()
  const walk = walking.timeline.events.find(e => e.kind === 'move')
  check('地图操作创建步行事件', !!walk)
  await page.clock.runFor(Math.ceil((walk.finishAt - walking.clock.gameT) / walking.clock.rate) * 1000)
  const arrived = await saved()
  check('倍速步行无需再点击便自动到达并清除事件', arrived.player.x === destination.x && arrived.player.y === destination.y && !arrived.timeline.events.some(e => e.id === walk.id))

  await page.evaluate(() => setRate(1))
  await page.evaluate(() => closeLWindow())
  await page.locator('#bigmenu a[href="player.jsp"]').click()
  await page.locator('a[href="player.jsp?tab=2"]').click()
  await page.locator('.bodynode').first().click()
  await page.locator('a[onclick^="doUpgrade"]').click()
  const bodyStart = await saved()
  check('本体升级实际进入修炼队列', bodyStart.timeline.events.some(e => e.kind === 'cultivate' && e.payload.system === 'body'))
  await page.evaluate(() => openLWindow('购买', 'payment.jsp'))
  await page.locator('#lwindow a[onclick*="pay=10"]').click()
  check('修炼减半确认前不扣费', (await saved()).player.bonusCoin === bodyStart.player.bonusCoin)
  await page.locator('a[onclick="OnMDialog2OK()"] ').click()
  const half = await saved()
  const remaining = st => st.timeline.events.find(e => e.kind === 'cultivate').finishAt - st.clock.gameT
  check('修炼减半扣2仙石且缩短剩余时间', half.player.bonusCoin === bodyStart.player.bonusCoin - 2 && remaining(half) <= remaining(bodyStart) / 2)
  await page.locator('#lwindow a[onclick*="pay=11"]').click()
  await page.locator('a[onclick="OnMDialog2OK()"] ').click()
  const complete = await saved()
  check('立即完成确认实际执行并扣10仙石', complete.player.body[0] === 1 && complete.player.bonusCoin === half.player.bonusCoin - 10 && !complete.timeline.events.some(e => e.kind === 'cultivate'))
  // 未实现的历史套餐**不从页面上抹掉**（payment.ts 顶部：DOM 逐字保真），
  // 而是点下去由 purchase() 当场拒绝、且一枚仙石都不扣。
  await page.locator('#lwindow a[onclick*="pay=1\'"]').first().click()
  const refused = await saved()
  check('未实现的历史套餐点下去被拒且不扣费',
    (await page.locator('#mwindow').textContent()).includes('暂未开放') &&
    refused.player.bonusCoin === complete.player.bonusCoin)
  await page.evaluate(() => closeMWindow())
  await page.evaluate(() => closeLWindow())

  await page.locator('#bigmenu a[href="trade.jsp"]').click()
  await page.locator('a[href="trade.jsp?tab=2"]').click()
  await page.selectOption('#sellqiform select[name=give]', '木')
  await page.selectOption('#sellqiform select[name=want]', '金')
  await page.fill('#sellqiform input[name=amount]', '20')
  await page.clock.runFor(2100)
  check('自动推进保留出售表单草稿', await page.inputValue('#sellqiform input[name=amount]') === '20' && await page.inputValue('#sellqiform select[name=give]') === '木')
  await page.locator('#sellqiform input[type=submit]').click()
  const listed = await saved()
  check('出售真气表单产生自己的挂单', listed.market.qi.some(o => o.seller === listed.player.name && o.offer.amount === 20))
  await page.locator('a[onclick*="unsellqi"]').click()
  const cancelled = await saved()
  check('撤销真气挂单返还资源', !cancelled.market.qi.some(o => o.seller === cancelled.player.name) && cancelled.player.qi[1] >= listed.player.qi[1] + 20)

  // 求援等输入弹窗在确认回调读取完输入前不能清空内容。
  await page.evaluate(() => MDialog('输入', '<input id=regression-name>', () => {
    const value = document.getElementById('regression-name').value
    MDialog('结果', value)
  }))
  await page.fill('#regression-name', '道友甲')
  await page.locator('a[onclick="OnMDialogOK()"] ').click()
  check('确认回调能读取输入且后续提示保留', await page.locator('#mwindow').isVisible() && await page.locator('#mwindowcontent').textContent() === '道友甲')
  await page.evaluate(() => closeMWindow())

  await page.evaluate(() => resetGame())
  await page.locator('#mwindow2 .dlgclosebtn a').click()
  check('确认窗的关闭按钮有效', !(await page.locator('#mwindow2').isVisible()))
  // 关闭失败也继续导出检查。
  await page.evaluate(() => closeMWindow2())
  const downloadPromise = page.waitForEvent('download')
  await page.evaluate(() => exportSave())
  const download = await downloadPromise
  const raw = await readFile(await download.path(), 'utf8')
  const payload = JSON.parse(raw)
  check('导出使用可迁移存档信封', Number.isInteger(payload.v) && payload.state?.player.name === '回归道友')
  await importText(raw)
  check('浏览器导出文件可直接导入', !(await page.locator('#mwindow').isVisible()))
  const healthy = await saved()
  await importText('{"v":7,"state":{"player":{"name":"坏存档"}}}')
  const preserved = await saved()
  check('无效导入提示错误并保留现有进度', await page.locator('#mwindow').isVisible() && preserved.player.name === healthy.player.name && preserved.player.body[0] === healthy.player.body[0])
  await page.evaluate(() => closeMWindow())

  // 后期资源准备；结丹流程仍从领取、汇聚、压缩、放弃的真实操作进入。
  const core = await saved()
  core.player.realm = '金丹期'
  core.player.body[5] = 30
  core.player.qi[1] = 286000
  // 境界链一次只开放一个：先天那步还挂着的话，结丹根本不会出现在可领列表里
  // （`quest.ts:chainUnlocked` 要求前序 entry 已 done）。把它按已交付处理。
  core.quests.entries = core.quests.entries.map(e => e.id.startsWith('realm:') ? { ...e, cleared: true, done: true } : e)
  await importText(JSON.stringify({ ...payload, state: core }))
  await acceptQuest('realm:jindan:1')
  await quest('realm:jindan:1')
  await page.getByRole('button', { name: '汇聚真气', exact: true }).click()
  await page.getByRole('button', { name: '压缩真元', exact: true }).click()
  const compressing = await saved()
  const coreId = compressing.quests.entries.find(e => e.id === 'realm:jindan:1').coreEventId
  check('结丹入口创建实际压缩事件', !!coreId && compressing.timeline.events.some(e => e.id === coreId))
  await page.locator('#lwindow img[src="img/giveupquest.gif"]').click()
  await page.locator('a[onclick="OnMDialog2OK()"] ').click()
  const abandoned = await saved()
  check('放弃结丹同时移除压缩事件', !abandoned.quests.entries.some(e => e.id === 'realm:jindan:1') && !abandoned.timeline.events.some(e => e.id === coreId))
  check('全流程无浏览器异常', errors.length === 0)
  if (errors.length) console.log(errors.join('\n'))
} catch (error) {
  console.error('浏览器异常', errors)
  console.error('失败时任务与弹窗', await page.evaluate(() => ({
    quests: JSON.parse(localStorage.getItem('xiuzhen.save'))?.state.quests,
    left: document.getElementById('lwindowcontent')?.textContent,
    message: document.getElementById('mwindowcontent')?.textContent,
  })))
  throw error
} finally {
  await browser.close()
}
if (failures.length) throw new Error(`${failures.length} 项失败：${failures.join('、')}`)
