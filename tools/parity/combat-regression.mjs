#!/usr/bin/env node
// 独立浏览器存档；只导入玩家/护法装备、技能、容量和位置，任务进度与战斗事件全部由页面操作产生。
import { chromium } from 'playwright'
import { panelStat } from '../../src/data/artifacts.ts'
import { swordByName } from '../../src/data/swords.ts'
import { allNpcsAt, npcAt } from '../../src/engine/npc.ts'
import { rand } from '../../src/engine/rng.ts'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 950 }, deviceScaleFactor: 1 })
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
const detailAttack = () => page.locator('#rwindowcontent .itemmid > table').nth(1).locator('tr').nth(2).locator('td').first().textContent()
const battle = state => state.timeline.events.find(event => event.kind === 'battle')
const raid = state => state.timeline.events.find(event => event.id === 'raid')
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
const reachNextPhase = async (select = battle) => {
  const state = await saved()
  const remaining = select(state).finishAt - state.clock.gameT
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
  prepared.player.artifacts = [
    { id: swordId, kind: 'sword', name: '青龙伏魔剑', quality: '极品', refine: 3, status: '空闲', count: 1 },
    { id: 'support-sword', kind: 'sword', name: '玉虚桃木剑', quality: '上品', refine: 1, status: '空闲', count: 1 },
  ]
  prepared.player.body[5] = 30
  prepared.player.x = accepted.at[0]
  prepared.player.y = accepted.at[1]
  await importState(prepared)
  check('合法导入只准备装备与位置，保留未完成任务', JSON.stringify((await saved()).quests) === JSON.stringify(prepared.quests) && (await saved()).timeline.events.length === 0)
  await openQuest()
  await page.locator('#lwindowcontent a[href*="fight.jsp"], #lwindowcontent a[onclick*="fight.jsp"]').click()
  check('御剑术不足的青龙剑不可选，玉虚剑仍可选',
    await page.locator(`#fightform input[value="${swordId}"]`).count() === 0 &&
    await page.locator('#fightform input[value="support-sword"]').count() === 1)
  prepared.player.skills['御剑术'] = 1
  prepared.player.skills['小周天剑法'] = 1
  await importState(prepared)
  await openQuest()
  await page.locator('#lwindowcontent a[href*="fight.jsp"], #lwindowcontent a[onclick*="fight.jsp"]').click()
  check('任务详情可打开飞剑选择', await page.locator(`#fightform input[value="${swordId}"]`).count() === 1)
  check('无属性目标显示无而非 null', (await page.locator('#lwindowcontent').textContent()).includes('属性:无'))
  await page.locator('#fightform a').first().click()
  check('出击飞剑详情显示所选装备的品质和淬炼',
    await page.locator('#rwindowcontent .itemmid').count() === 1 &&
    Number(await detailAttack()) === panelStat(swordByName('青龙伏魔剑').attack, '极品', 3))
  await page.evaluate(() => closeRWindow())
  await page.selectOption('#fightswordart', '小周天剑法')
  const outbound = await launchSelected()
  const circle = battle(outbound).payload.swords[0].launchedStats
  check('页面选择小周天，出击攻击降至四分之一、敏捷加倍', circle.attack === panelStat(swordByName('青龙伏魔剑').attack, '极品', 3) / 4 && circle.agility === 48)
  const goldBefore = outbound.player.qi[0]
  check('选择飞剑出击后进入斩杀队列', battle(outbound)?.payload.phase === 'outbound' && sword(outbound)?.status === '斩杀中')
  check('出击阶段不提前完成任务', !outbound.quests.entries.find(entry => entry.id === 'beast:1').cleared)
  check('出击事件在页面显示目标', (await openEvents(2)).includes('你放去攻击'))
  await page.locator('#gmid a[onclick*="battleevent.jsp?tab=2"]').first().click()
  await page.locator('#bwindowcontent a[onclick*="itemmid.jsp"]').first().click()
  check('战斗事件中的飞剑详情可打开', await page.locator('#rwindowcontent .itemmid').count() === 1)
  await page.evaluate(() => closeRWindow())
  await page.locator('#bwindowcontent a').filter({ hasText: '支援' }).first().click()
  await page.evaluate(() => closeBWindow())
  check('支援目标同样显示无属性', (await page.locator('#lwindowcontent').textContent()).includes('属性:无'))
  await page.locator('#fightform a').first().click()
  check('支援飞剑详情对应仍空闲的第二把剑',
    await page.locator('#rwindowcontent .itemmid').count() === 1 &&
    Number(await detailAttack()) === panelStat(swordByName('玉虚桃木剑').attack, '上品', 1))
  await page.evaluate(() => { closeRWindow(); closeLWindow(); closeBWindow() })

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
  const grown = await saved()
  grown.player.artifacts = grown.player.artifacts.map(a => a.id === swordId ? { ...a, refine: 8 } : a)
  await importState(grown)
  const world = await saved()
  const npc = world.npc.bases.filter(base => base.profile === '羊' && world.npc.bases.filter(other => other.name === base.name).length === 1)
    .sort((a, b) => a.bornAt - b.bornAt)[0]
  if (!npc) throw new Error('当前世界没有可用于回归的唯一姓名驻点 NPC')
  await page.clock.fastForward(Math.max(1000, (npc.bornAt + 20 * 86400 - world.clock.gameT) * 1000))
  while (raid(await saved())) await reachNextPhase(raid)
  const visiting = await saved()
  visiting.player.x = npc.homeX
  visiting.player.y = npc.homeY
  await importState(visiting)
  await page.locator(`#gmid a[onclick*="fight.jsp?target=${encodeURIComponent(npc.name)}"]`).click()
  check('返航后的同一把飞剑再次出现在 NPC 出击选择中', await page.locator(`#fightform input[value="${swordId}"]`).count() === 1)
  const second = await launchSelected()
  const npcGold = second.player.qi[0]
  const previousLost = second.npc.patches[npc.id]?.qiLost ?? 0
  const npcBefore = npcAt(second.npc, npc, second.clock.gameT, second.worldSeed)
  check('同一把飞剑可再次出击且绑定正确 NPC', battle(second)?.payload.swordIds.includes(swordId) && battle(second)?.payload.target.npcId === npc.id)
  await reachNextPhase()
  const npcReturning = await reachNextPhase()
  const npcLoot = battle(npcReturning)?.payload.loot
  check('NPC 战胜后产生非零掠夺且扣除目标库存', npcLoot?.[0] > 0 && npcReturning.npc.patches[npc.id]?.qiLost === previousLost + npcLoot.reduce((sum, amount) => sum + amount, 0))
  check('NPC 被抢后保留真实断剑与击退位置，不降低累计道行', npcReturning.npc.patches[npc.id]?.artifacts.some(a => a.status === '损坏') && npcAt(npcReturning.npc, npc, npcReturning.clock.gameT, npcReturning.worldSeed).daoxing === npcBefore.daoxing && (npcReturning.npc.patches[npc.id].x !== npcBefore.x || npcReturning.npc.patches[npc.id].y !== npcBefore.y))
  check('NPC 掠夺五气总量不超过胜剑吸收', npcLoot.reduce((n, q) => n + q, 0) <= battle(second).payload.swords[0].launchedStats.absorb)
  check('NPC 战利品返航前不提前入账', npcReturning.player.qi[0] === npcGold)
  const npcReturned = await reachNextPhase()
  check('第二次返航再次恢复空闲并实际发放 NPC 战利品', sword(npcReturned)?.status === '空闲' && !battle(npcReturned) && npcReturned.player.qi[0] === npcGold + npcLoot[0])
  await page.clock.fastForward(2000)
  check('后续 tick 不会重复发放战利品', (await saved()).player.qi[0] === npcReturned.player.qi[0])
  // 来袭事件仍由真实整点调度产生。仅准备装备和驻点，护法关系由页面建立。
  const defenseSetup = await saved()
  let hour = Math.floor(defenseSetup.clock.gameT / 3600) + 1
  while (rand(defenseSetup.worldSeed, 'raid', hour) >= 0.06) hour++
  const residents = allNpcsAt(defenseSetup.npc, hour * 3600, defenseSetup.worldSeed)
  const guardian = residents.find(n => n.base.profile === '羊' && n.swords > 0 &&
    defenseSetup.npc.bases.filter(b => b.name === n.base.name).length === 1 &&
    residents.some(w => w.base.profile !== '羊' && w.swords > 0 && Math.abs(w.x - n.x) + Math.abs(w.y - n.y) <= 12))
  if (!guardian) throw new Error('当前世界没有附近有来袭者的可用护法')
  defenseSetup.player.x = guardian.x
  defenseSetup.player.y = guardian.y
  defenseSetup.player.artifacts = [
    { ...sword(defenseSetup), refine: 8, status: '空闲' },
    { id: 'combat-guard', kind: 'guard', name: '指玄道藏碑', quality: '上品', refine: 5, status: '空闲', count: 1 },
  ]
  // 此用例必须走幸存剑返航；随机新号的普通羊可能全军覆没，所以明确准备耐久足够的真实装备。
  defenseSetup.npc.patches[guardian.base.id] = {
    ...defenseSetup.npc.patches[guardian.base.id],
    artifacts: [{ id: 'combat-guardian-sword', kind: 'sword', name: '玉虚桃木剑', quality: '极品', refine: 8, status: '空闲', count: 1 }],
  }
  await importState(defenseSetup)
  await page.evaluate(id => openLWindow('道友资料', `playerinfo.jsp?playerid=${id}`), guardian.base.id)
  await page.locator('#lwindowcontent a[onclick*=addpal]').click()
  check('从道友资料结为护法并持久落盘', (await saved()).social.guardians.includes(guardian.base.id))
  await page.evaluate(() => { closeLWindow(); closeMWindow() })
  await page.clock.fastForward(Math.ceil((hour * 3600 - (await saved()).clock.gameT) * 1000))
  const incoming = await saved()
  check('真实整点派出 NPC 空闲飞剑，来袭途中实际占用', raid(incoming)?.payload.phase === 'outbound' &&
    incoming.npc.patches[raid(incoming).payload.attackerId].artifacts.some(a => a.status === '斩杀中'))
  const guardState = await reachNextPhase(raid)
  check('护身法宝撑出真实 5760 秒的应对窗口', raid(guardState)?.payload.phase === 'guard' && raid(guardState).finishAt - guardState.clock.gameT === 5760)
  await page.locator('#gmid a[onclick*="battleevent.jsp?tab=1"]').first().click()
  check('护身期间战斗浮窗提供祭剑支援与护法求援', await page.locator('#bwindowcontent a').filter({ hasText: '支援' }).count() > 0 && await page.locator('#bwindowcontent a').filter({ hasText: '求援' }).count() > 0)
  await page.locator('#bwindowcontent a').filter({ hasText: '支援' }).first().click()
  const guardSummary = await page.locator('#lwindowcontent').textContent()
  check('祭剑页概要显示真实护身阶段，不展示零值敌方面板', guardSummary.includes('护身抵挡中') && !guardSummary.includes('攻击:0'))
  await page.selectOption('#fightswordart', '小周天剑法')
  await page.screenshot({ path: 'tools/parity/shots/fidelity-combat-guard.png', fullPage: true })
  await launchSelected()
  const raised = await saved()
  check('护身期间从页面祭剑，实际占用并采用所选剑术', sword(raised).status === '绞杀中' && raid(raised).payload.defending[0].launchedStats.agility === 1536)
  const ask = async () => {
    if (!await page.locator('#bwindow').isVisible()) await page.locator('#gmid a[onclick*="battleevent.jsp?tab=1"]').first().click()
    await page.locator('#bwindowcontent a').filter({ hasText: '求援' }).first().click()
    await page.fill('#gethelpname', guardian.base.name)
    await page.locator('a[onclick="OnMDialogOK()"]').click()
  }
  await ask()
  const aided = await saved(), assistance = raid(aided).payload.aid?.[0]
  check('护法求援派出真实装备并按路程等待', assistance?.npcId === guardian.base.id && assistance.arriveAt > aided.clock.gameT &&
    assistance.swords.some(s => s.id === 'combat-guardian-sword' && s.durability === panelStat(swordByName('玉虚桃木剑').durability, '极品', 8)) &&
    aided.npc.patches[guardian.base.id].artifacts.some(a => a.id === 'combat-guardian-sword' && a.status === '斩杀中'))
  await page.evaluate(() => closeMWindow())
  await ask()
  check('重复求援不会复制已派飞剑', raid(await saved()).payload.aid?.length === 1 && (await page.locator('#mwindowcontent').textContent()).includes('空闲'))
  await page.evaluate(() => { closeMWindow(); closeBWindow() })
  const guardedFight = await reachNextPhase(raid)
  check('护身计时结束后才进入飞剑交战', raid(guardedFight)?.payload.phase === 'fighting')
  const defended = await reachNextPhase(raid)
  check('真实迎敌结算后清除来袭，护法幸存剑开始返航', !raid(defended) && defended.timeline.events.some(e => e.kind === 'raid' && e.payload.phase === 'returning' && e.payload.npcId === guardian.base.id))
  const helperReturn = s => s.timeline.events.find(e => e.kind === 'raid' && e.payload.phase === 'returning' && e.payload.npcId === guardian.base.id)
  const aidHome = await reachNextPhase(helperReturn)
  check('援军返航到家才恢复可用，保留本场战损', aidHome.npc.patches[guardian.base.id].artifacts.every(a => ['空闲', '损坏'].includes(a.status)))
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
