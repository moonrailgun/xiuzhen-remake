#!/usr/bin/env node
// 独立浏览器存档；只导入装备、容量和位置，任务进度与战斗事件全部由页面操作产生。
import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
page.setDefaultTimeout(5000)
const failures = []
const errors = []
let assertions = 0
page.on('pageerror', error => errors.push(String(error)))
const check = (label, ok) => {
  assertions++
  console.log(`${ok ? '✔' : '✖'} ${label}`)
  if (!ok) failures.push(label)
}
const envelope = () => page.evaluate(() => JSON.parse(localStorage.getItem('xiuzhen.save')))
const saved = async () => (await envelope()).state
const swordId = 'combat-regression-sword'
const sword = state => state.player.artifacts.find(item => item.id === swordId)
const battle = state => state.timeline.events.find(event => event.kind === 'battle')
const importState = async state => {
  const payload = { ...await envelope(), state }
  const chooser = page.waitForEvent('filechooser')
  await page.evaluate(() => importSavePrompt())
  await (await chooser).setFiles({ name: 'combat-regression.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) })
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
}
const openQuest = () => page.locator('a[onclick*="quest.jsp?questid=beast:1"]').click()
const launchSelected = async () => {
  await page.locator(`#fightform input[name=sword][value="${swordId}"]`).check()
  await page.locator('#lwindowcontent a[onclick^="sendFight"]').click()
  return saved()
}
const reachNextPhase = async () => {
  const state = await saved()
  const remaining = battle(state).finishAt - state.clock.gameT
  await page.clock.fastForward(Math.ceil(remaining * 1000))
  return saved()
}
const openEvents = async tab => {
  await page.locator(`#gmid a[onclick*="battleevent.jsp?tab=${tab}"]`).first().click()
  const content = await page.locator('#bwindowcontent').textContent()
  await page.evaluate(() => closeBWindow())
  return content
}

try {
  const wall = new Date('2026-09-22T00:00:00Z')
  await page.clock.install({ time: wall })
  await page.clock.pauseAt(wall)
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await page.fill('#playername', '战斗回归道友')
  await page.selectOption('select[name=attr]', '1')
  await page.click('a[onclick="sendCreatePlayer()"]')
  await page.locator('a[onclick="showAvailableQuests()"]').click()
  await page.locator('a[onclick="acceptQuest(\'beast:1\')"]').click()

  const prepared = await saved()
  const accepted = prepared.quests.entries.find(entry => entry.id === 'beast:1')
  check('页面领取百妖第一回，尚未击杀或领奖', !!accepted?.at && !accepted.cleared && !accepted.done)
  prepared.player.artifacts = [{ id: swordId, kind: 'sword', name: '青龙伏魔剑', quality: '极品', refine: 3, status: '空闲', count: 1 }]
  prepared.player.body[5] = 30
  prepared.player.x = accepted.at[0]
  prepared.player.y = accepted.at[1]
  await importState(prepared)
  check('合法导入只准备装备与位置，保留未完成任务', JSON.stringify((await saved()).quests) === JSON.stringify(prepared.quests) && (await saved()).timeline.events.length === 0)
  await openQuest()
  await page.locator('#lwindowcontent a[href*="fight.jsp"], #lwindowcontent a[onclick*="fight.jsp"]').click()
  check('任务详情可打开飞剑选择', await page.locator(`#fightform input[value="${swordId}"]`).count() === 1)
  const outbound = await launchSelected()
  const goldBefore = outbound.player.qi[0]
  check('选择飞剑出击后进入斩杀队列', battle(outbound)?.payload.phase === 'outbound' && sword(outbound)?.status === '斩杀中')
  check('出击阶段不提前完成任务', !outbound.quests.entries.find(entry => entry.id === 'beast:1').cleared)
  check('出击事件在页面显示目标', (await openEvents(2)).includes('你放去攻击'))

  const fighting = await reachNextPhase()
  check('飞到目标后进入缠斗而非立即结算', battle(fighting)?.payload.phase === 'fighting' && sword(fighting)?.status === '绞杀中' && !fighting.mail.some(mail => mail.kind === 'battle'))
  check('缠斗事件在页面可见', (await openEvents(2)).includes('缠斗'))
  const returning = await reachNextPhase()
  const loot = battle(returning)?.payload.loot
  check('战胜任务怪产生返航事件与战报', battle(returning)?.payload.phase === 'returning' && returning.mail.some(mail => mail.kind === 'battle' && mail.body.won))
  check('真实战斗推进任务完成情况', returning.quests.entries.find(entry => entry.id === 'beast:1').cleared === true)
  check('战利品随剑返航，途中尚未入账', loot?.[0] > 0 && returning.player.qi[0] === goldBefore && sword(returning)?.status === '返回中')
  const returnText = await openEvents(3)
  check('返航页面显示返航且不再提供支援', returnText.includes('返航') && !returnText.includes('支援'))
  const returned = await reachNextPhase()
  check('返航后原飞剑恢复空闲且清除战斗事件', sword(returned)?.status === '空闲' && !battle(returned))
  check('返航后战利品实际入账', returned.player.qi[0] === goldBefore + loot[0])
  await openQuest()
  await page.locator('#lwindow img[src="img/getreward.gif"]').click()
  check('任务可从页面领奖落盘', (await saved()).quests.entries.find(entry => entry.id === 'beast:1').done === true)

  // 选一个世界已生成、名字唯一的驻点 NPC。只推进真实游戏时间，不改 NPC 或战斗记录。
  const world = await saved()
  const npc = world.npc.bases.filter(base => base.profile === '羊' && world.npc.bases.filter(other => other.name === base.name).length === 1)
    .sort((a, b) => a.bornAt - b.bornAt)[0]
  if (!npc) throw new Error('当前世界没有可用于回归的唯一姓名驻点 NPC')
  await page.clock.fastForward(Math.max(1000, (npc.bornAt + 86400 - world.clock.gameT) * 1000))
  const visiting = await saved()
  visiting.player.x = npc.homeX
  visiting.player.y = npc.homeY
  await importState(visiting)
  await page.locator(`#gmid a[onclick*="fight.jsp?target=${encodeURIComponent(npc.name)}"]`).click()
  check('返航后的同一把飞剑再次出现在 NPC 出击选择中', await page.locator(`#fightform input[value="${swordId}"]`).count() === 1)
  const second = await launchSelected()
  const npcGold = second.player.qi[0]
  const previousLost = second.npc.patches[npc.id]?.qiLost ?? 0
  check('同一把飞剑可再次出击且绑定正确 NPC', battle(second)?.payload.swordIds.includes(swordId) && battle(second)?.payload.target.npcId === npc.id)
  await reachNextPhase()
  const npcReturning = await reachNextPhase()
  const npcLoot = battle(npcReturning)?.payload.loot
  check('NPC 战胜后产生非零掠夺且扣除目标库存', npcLoot?.[0] > 0 && npcReturning.npc.patches[npc.id]?.qiLost === previousLost + npcLoot.reduce((sum, amount) => sum + amount, 0))
  check('NPC 战利品返航前不提前入账', npcReturning.player.qi[0] === npcGold)
  const npcReturned = await reachNextPhase()
  check('第二次返航再次恢复空闲并实际发放 NPC 战利品', sword(npcReturned)?.status === '空闲' && !battle(npcReturned) && npcReturned.player.qi[0] === npcGold + npcLoot[0])
  await page.clock.fastForward(2000)
  check('后续 tick 不会重复发放战利品', (await saved()).player.qi[0] === npcReturned.player.qi[0])
  check('全流程无浏览器异常', errors.length === 0)
  if (errors.length) console.error(errors.join('\n'))
} catch (error) {
  console.error('浏览器异常', errors)
  console.error('失败时状态', await page.evaluate(() => ({
    state: JSON.parse(localStorage.getItem('xiuzhen.save'))?.state,
    left: document.getElementById('lwindowcontent')?.textContent,
    message: document.getElementById('mwindowcontent')?.textContent,
  })))
  throw error
} finally {
  await browser.close()
}
console.log(`${assertions - failures.length}/${assertions} 项战斗回归通过`)
if (failures.length) throw new Error(`${failures.length} 项失败：${failures.join('、')}`)
