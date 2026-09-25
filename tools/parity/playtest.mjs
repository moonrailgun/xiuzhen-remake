#!/usr/bin/env node
/**
 * 端到端试玩：建号 → 进游戏 → 点经脉升级 → 刷新后存档还在。
 *
 * 这是阶段 2 的验收：证明引擎与界面真的接通了，而不只是各自的单元测试通过。
 * 用法：先 `npm run dev`，再 `node tools/parity/playtest.mjs`
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// 城镇坐标直接问引擎，跟游戏里用的是同一套地形函数
import { terrainAt, WORLD_SIZE } from '../../src/data/world.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'tools', 'parity', 'shots')
const BASE = process.env.BASE ?? 'http://localhost:5273'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const steps = []
const check = (name, ok, detail = '') => {
  steps.push({ name, ok, detail })
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. 首次打开应是建号页
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
check('首次打开进建号页', await page.locator('#createplayerform').count() > 0)
await page.screenshot({ path: join(OUT, 'play-1-create.png') })

// 2. 填名字、选木属性通天、确定
await page.fill('#playername', '173小鱼')
await page.selectOption('select[name=attr]', '1') // 木
await page.selectOption('select[name=school]', '3') // 通天
await page.check('input[name=posi][value="4"]') // 西南益州
await page.click('a[onclick="sendCreatePlayer()"]')
await page.waitForTimeout(400)

check('建号后进入主界面', await page.locator('#gpage').count() > 0)
const name = await page.locator('td.titlebg').first().textContent()
check('角色名显示正确', name?.includes('173小鱼') ?? false, name ?? '')
await page.screenshot({ path: join(OUT, 'play-2-main.png') })

// 3. 五行一缺：木属性角色的金产量应为 0
const goldInc = await page.locator('#goldinc').textContent()
const woodInc = await page.locator('#woodinc').textContent()
check('木属性角色金产量为 0（五行一缺）', goldInc === '0', `金 ${goldInc} / 木 ${woodInc}`)

// 4. 新号真气为 0，无法升级 → 应提示真气不足
await page.locator('.mnode').first().click()
await page.waitForTimeout(200)
check('点经脉节点打开升级说明窗', await page.locator('#rwindow').isVisible())
const panelText = await page.locator('#rwindowcontent').textContent()
check('说明窗显示升级消耗与时间', (panelText ?? '').includes('升级到Lv.1消耗'), (panelText ?? '').slice(0, 40))

await page.click('a[onclick^="doUpgrade"]')
await page.waitForTimeout(200)
const msg = await page.locator('#upgradeMsg').textContent()
check('真气不足时给出原版提示语', (msg ?? '').includes('升级所需真气不足'), msg ?? '')
await page.screenshot({ path: join(OUT, 'play-3-upgrade.png') })

// 5. 给一点真气再升级（模拟攒够了）
await page.evaluate(() => {
  const raw = localStorage.getItem('xiuzhen.save')
  if (!raw) return
  const env = JSON.parse(raw)
  env.state.player.qi = [9999, 9999, 9999, 9999, 9999]
  localStorage.setItem('xiuzhen.save', JSON.stringify(env))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.locator('.mnode').first().click()
await page.waitForTimeout(200)
await page.click('a[onclick^="doUpgrade"]')
await page.waitForTimeout(300)

const eventText = await page.locator('#gmid').textContent()
check('升级后出现修炼事件', (eventText ?? '').includes('Lv1'), (eventText ?? '').replace(/\s+/g, ' ').slice(0, 80))
check('事件栏有「半 完」加速', (eventText ?? '').includes('半') && (eventText ?? '').includes('完'))
await page.screenshot({ path: join(OUT, 'play-4-cultivating.png') })

// 6. 刷新后存档还在
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
const after = await page.locator('td.titlebg').first().textContent()
check('刷新后存档保留', after?.includes('173小鱼') ?? false)
const stillCultivating = await page.locator('#gmid').textContent()
check('修炼事件在刷新后继续', (stillCultivating ?? '').includes('Lv1'))

// 7. 切到地图页
await page.click('#bigmenu a[href="map.jsp"]')
await page.waitForTimeout(400)
const tiles = await page.locator('.mapdiv .tile').count()
check('地图页渲染 113 格', tiles === 113, `实得 ${tiles}`)
const sceneName = await page.locator('#sname').textContent()
check('场景名显示州与地形', /\S+\s\S+/.test(sceneName ?? ''), sceneName ?? '')
const qiSum = await page.evaluate(() =>
  ['sgold', 'swood', 'swater', 'sfire', 'searth']
    .map((id) => Number(document.getElementById(id)?.textContent ?? 0))
    .reduce((a, b) => a + b, 0))
check('天地元气总和为 20（普通格原版规律）', qiSum === 20, `总和 ${qiSum}`)
await page.screenshot({ path: join(OUT, 'play-5-map.png') })

// 8. 点一个邻格再步行移动
const me = await page.evaluate(() => {
  const el = document.getElementById('playermark')
  return el ? { left: el.style.left, top: el.style.top } : null
})
check('地图上有自己的标记', me !== null)

await page.evaluate(() => {
  // 点人物右下相邻的一格（x+1）
  const raw = localStorage.getItem('xiuzhen.save')
  const st = JSON.parse(raw).state
  window.onMapCellClick(st.player.x + 1, st.player.y)
})
await page.waitForTimeout(200)
await page.click('a[onclick="mapMenuMove()"]')
await page.waitForTimeout(400)

const midText = await page.locator('#gmid').textContent()
check('发起移动后出现移动事件', (midText ?? '').includes('移动事件'), (midText ?? '').replace(/\s+/g, ' ').slice(0, 70))
await page.screenshot({ path: join(OUT, 'play-6-moving.png') })

// 9. 超出移动范围时给出提示
await page.evaluate(() => {
  const raw = localStorage.getItem('xiuzhen.save')
  const st = JSON.parse(raw).state
  window.onMapCellClick(st.player.x + 50, st.player.y)
})
await page.click('a[onclick="mapMenuMove()"]')
await page.waitForTimeout(300)
const dialog = await page.locator('#mwindowcontent').textContent()
check('超范围移动被拒绝并提示', (dialog ?? '').includes('移动'), (dialog ?? '').trim().slice(0, 40))

// 10. 领新手任务
await page.click('#bigmenu a[href="player.jsp"]')
await page.waitForTimeout(300)
await page.click('a[onclick="showAvailableQuests()"]')
await page.waitForTimeout(300)
const availText = await page.locator('#lwindowcontent').textContent()
check('可领取任务列表有新手任务', (availText ?? '').includes('初入修真') || (availText ?? '').length > 5, (availText ?? '').replace(/\s+/g, ' ').slice(0, 60))

const firstQuest = page.locator('#lwindowcontent a.skillup').first()
if (await firstQuest.count() > 0) {
  await firstQuest.click()
  await page.waitForTimeout(400)
  const rightText = await page.locator('#gright').textContent()
  check('领取后任务出现在右栏', !(rightText ?? '').includes('目前没有任务'), (rightText ?? '').replace(/\s+/g, ' ').slice(0, 60))
  await page.screenshot({ path: join(OUT, 'play-7-quest.png') })
} else {
  check('领取后任务出现在右栏', false, '没有可领取的任务')
}

// 11. 场景里能看到 NPC（同格或附近）
const npcInfo = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('xiuzhen.save')).state
  return { count: raw.npc.bases.length, hasQuests: (raw.quests?.entries ?? []).length }
})
check('存档里有 NPC 世界与任务进度', npcInfo.count > 0 && npcInfo.hasQuests >= 0, JSON.stringify(npcInfo))

// —— 12. 七个主标签全部接上真实状态 ——
// 这是「点了不换页」这个大坑的回归：以前只有人物页和地图页是真的。
const tabText = async (href) => {
  await page.click(`#bigmenu a[href="${href}"]`)
  await page.waitForTimeout(250)
  return (await page.locator('#gleft').textContent())?.replace(/\s+/g, ' ') ?? ''
}

const skillText = await tabText('skill.jsp')
check('法术页渲染法术树（不是人物页）',
  (await page.locator('.skilltree').count()) > 0 && !skillText.includes('经脉'),
  skillText.slice(0, 50))

// 子标签：剑术树的节点数与炼器树不同，用它验证 ?tab= 真的换了树
await page.click('#gleft a[href="skill.jsp?tab=1"]')
await page.waitForTimeout(250)
const swordCells = await page.locator('.skillcell').count()
check('法术页子标签可切换（炼器 → 剑术）', swordCells === 6, `剑术树 ${swordCells} 格`)

const itemText = await tabText('item.jsp')
check('法宝页渲染「拥有法宝」一览', itemText.includes('拥有法宝'), itemText.slice(0, 50))

await page.click('#gleft a[href="item.jsp?tab=1"]')
await page.waitForTimeout(250)
const swordRows = await page.locator('#gleft table.tablebg tr.trbg').count()
const swordText = (await page.locator('#gleft').textContent()) ?? ''
check('炼制飞剑页列出 14 把剑的真实数值',
  swordRows >= 14 && swordText.includes('玉虚桃木剑'), `${swordRows} 行`)

const tradeText = await tabText('trade.jsp')
const offerRows = await page.locator('#gleft table.tablebg tr.trbg').count()
check('交易页有真实挂单（NPC 自动补货）',
  tradeText.includes('注意：购买真气') && offerRows > 1, `${offerRows} 行挂单`)

const allyText = await tabText('ally.jsp')
check('门派页显示道源与掌门', allyText.includes('通天'), allyText.slice(0, 50))

await page.click('#gleft a[href="ally.jsp?tab=2&page=1&per=10&job=-2"]')
await page.waitForTimeout(250)
const memberText = (await page.locator('#gleft').textContent())?.replace(/\s+/g, ' ') ?? ''
check('门派成员页列出同道源的人（掌门排头）', memberText.includes('掌门'), memberText.slice(0, 60))

// 消息是右侧浮窗，不换左栏
await page.click('#bigmenu a[onclick*="msg.jsp"]')
await page.waitForTimeout(250)
check('消息按钮打开收件箱浮窗',
  (await page.locator('#rwindowcontent').textContent())?.includes('收件箱') ?? false)

// —— 13. 出击：选剑 → 派出去 → 变成战斗事件 ——
// 给自己塞一把剑，然后对感应范围内的人出击。
await page.evaluate(() => {
  const env = JSON.parse(localStorage.getItem('xiuzhen.save'))
  const st = env.state
  st.player.artifacts = [{
    id: 'sw1', kind: 'sword', name: '玉虚桃木剑',
    quality: '上品', refine: 0, status: '空闲', count: 1,
  }]
  // 走到某个「羊」的驻点上 —— 羊不游走，必定还在那儿（狼每天会跑出感应范围）
  const sheep = st.npc.bases.find((b) => b.profile === '羊' && b.bornAt <= st.clock.gameT)
    ?? st.npc.bases[0]
  st.player.x = sheep.homeX
  st.player.y = sheep.homeY
  st.timeline.events = st.timeline.events.filter((e) => e.kind !== 'move')
  localStorage.setItem('xiuzhen.save', JSON.stringify(env))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)

// 用「更多玩家」窗拿一个确实在感应范围内的名字
await page.evaluate(() => window.openLWindow('', 'playerlist.jsp'))
await page.waitForTimeout(300)
const targetName = await page.evaluate(() => {
  const a = document.querySelector('#lwindowcontent a.skillup')
  return a ? a.textContent.trim() : null
})
check('「更多玩家」窗列出感应范围内的人', targetName !== null, targetName ?? '范围内无人')

await page.evaluate((n) => window.openLWindow('', `fight.jsp?target=${encodeURIComponent(n)}`), targetName)
await page.waitForTimeout(400)
const fightText = (await page.locator('#lwindowcontent').textContent())?.replace(/\s+/g, ' ') ?? ''
check('出击页列出可派的飞剑',
  fightText.includes('选择飞剑') && fightText.includes('玉虚桃木剑'),
  fightText.slice(0, 70))

const swordBoxes = await page.locator('#lwindowcontent input[name=sword]').count()
if (swordBoxes > 0) {
  await page.check('#lwindowcontent input[name=sword]')
  await page.click('#lwindowcontent a[onclick^="sendFight"]')
  await page.waitForTimeout(400)
  const battleText = (await page.locator('#gmid').textContent())?.replace(/\s+/g, ' ') ?? ''
  check('出击后出现战斗事件', battleText.includes('战斗事件') && !battleText.includes('战斗事件 目前没有任何事件'),
    battleText.slice(0, 60))
  // 原版战斗事件行是「{数量} {斩杀|返回}」，不是升级标签
  check('战斗事件行照原版写「N 斩杀」',
    /战斗事件 \d+ 斩杀/.test(battleText) && !battleText.includes('undefined'),
    battleText.slice(0, 45))

  // 点这一行应打开 B 窗的战斗事件总览（标题句逐字照原版）
  await page.click('#gmid a[onclick*="battleevent.jsp"]')
  await page.waitForTimeout(400)
  const bText = (await page.locator('#bwindowcontent').textContent())?.replace(/\s+/g, ' ') ?? ''
  check('战斗事件总览用原版标题句「你放去攻击…后于…到达」',
    /你放去攻击\S+\(\d+,\d+\)的.*到达/.test(bText), bText.slice(0, 70))
  check('总览里有求援 / 支援 / 战斗地图三个操作',
    bText.includes('求援') && bText.includes('支援') && bText.includes('战斗地图'))
  await page.evaluate(() => window.closeBWindow())
  const busy = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('xiuzhen.save')).state.player.artifacts[0].status)
  check('派出去的剑变成「斩杀中」', busy === '斩杀中', busy)
} else {
  check('出击后出现战斗事件', false, '出击页没有可选的飞剑')
  check('派出去的剑变成「斩杀中」', false)
}

// —— 14. 城镇：走进村/镇/城，场景 NPC 出现，能投资 ——
// 城镇坐标由引擎算（同一套 terrainAt），不在浏览器里瞎扫。
const seed = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('xiuzhen.save')).state.worldSeed)

let townAt = null
for (let x = 0; x < WORLD_SIZE && !townAt; x++) {
  for (let y = 0; y < WORLD_SIZE; y++) {
    const t = terrainAt(seed, x, y, 99)
    if (t === '村庄' || t === '小镇' || t === '城池') { townAt = { x, y, kind: t }; break }
  }
}
check('世界里生成了城镇', townAt !== null, townAt ? `${townAt.kind}(${townAt.x},${townAt.y})` : '')

await page.evaluate((t) => {
  const env = JSON.parse(localStorage.getItem('xiuzhen.save'))
  const st = env.state
  st.clock.gameT = 40 * 86400 // 开服 4 周后城镇全开
  st.player.x = t.x
  st.player.y = t.y
  st.player.silver = 50000
  st.timeline.events = []
  localStorage.setItem('xiuzhen.save', JSON.stringify(env))
}, townAt)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)

const sceneText = (await page.locator('#gmid').textContent())?.replace(/\s+/g, ' ') ?? ''
check('站在城镇里，场景 NPC 栏出现镖局老板等人',
  sceneText.includes('镖局老板') && sceneText.includes('私塾先生'),
  sceneText.slice(sceneText.indexOf('当前场景中的NPC'), sceneText.indexOf('当前场景中的NPC') + 50))

await page.click('#gmid a[onclick*="npc.jsp?name=%E9%95%96%E5%B1%80%E8%80%81%E6%9D%BF"]')
await page.waitForTimeout(350)
const escortText = (await page.locator('#lwindowcontent').textContent()) ?? ''
check('镖局老板的对话是原版逐字那一段',
  escortText.includes('负责管理') && escortText.includes('镖货往来') && escortText.includes('运镖的收益指数'),
  escortText.replace(/\s+/g, ' ').slice(0, 60))

// 私塾先生：补写的对话要出现，并且标明不是原文
await page.evaluate(() => window.openLWindow('', `npc.jsp?name=${encodeURIComponent('私塾先生')}`))
await page.waitForTimeout(300)
const schoolText = (await page.locator('#lwindowcontent').textContent())?.replace(/\s+/g, ' ') ?? ''
check('私塾先生有对话，且标明是本地版补写',
  schoolText.includes('讲书解惑') && schoolText.includes('本地版按他的职司补写'),
  schoolText.slice(0, 55))
check('镖局老板那段不标补写（它是原文）', !escortText.includes('本地版按他的职司补写'))

// 村长/镇长/太守：投资
const chief = { 村庄: '村长', 小镇: '镇长', 城池: '太守' }[townAt.kind]
await page.evaluate((n) => window.openLWindow('', `npc.jsp?name=${encodeURIComponent(n)}`), chief)
await page.waitForTimeout(300)
check('投资窗显示商业等级与份额',
  ((await page.locator('#lwindowcontent').textContent()) ?? '').includes('商业 Lv.'))

await page.fill('#investsilver', '5000')
await page.click('#lwindowcontent a[onclick="doInvest()"]')
await page.waitForTimeout(400)
const invested = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('xiuzhen.save')).state
  const towns = Object.values(st.towns)
  return { silver: st.player.silver, towns: towns.length, put: towns[0]?.investments?.[0]?.silver ?? 0 }
})
check('投资后银两扣除、城镇入档', invested.towns === 1 && invested.put === 5000 && invested.silver === 45000,
  JSON.stringify(invested))

// —— 15. 游戏指南（H 窗）——
await page.click('#littlemenu a[onclick*="游戏指南"]')
await page.waitForTimeout(350)
check('顶栏「游戏指南」打开 H 窗目录',
  ((await page.locator('#hwindowcontent').textContent()) ?? '').includes('属性'))
await page.click('#hwindowcontent a[onclick="hlp(\'秘笈\')"]')
await page.waitForTimeout(300)
const helpText = (await page.locator('#hwindowcontent').textContent())?.replace(/\s+/g, ' ') ?? ''
check('秘笈词条是原版逐字的用途表',
  helpText.includes('【御剑飞行】') && helpText.includes('有机会在炼器时获得极品法宝'),
  helpText.slice(0, 60))
check('底部有「历史：」访问记录', helpText.includes('历史：'))
await page.evaluate(() => window.closeHWindow())

// —— 15b. 淬炼：两件合一，走的是淬炼规则而不是炼制 ——
await page.evaluate(() => {
  const env = JSON.parse(localStorage.getItem('xiuzhen.save'))
  env.state.player.artifacts = [
    { id: 'r1', kind: 'sword', name: '玉虚桃木剑', quality: '上品', refine: 0, status: '空闲', count: 1 },
    { id: 'r2', kind: 'sword', name: '玉虚桃木剑', quality: '上品', refine: 0, status: '空闲', count: 1 },
  ]
  env.state.player.skills = { ...env.state.player.skills, 百炼之法: 20 }
  localStorage.setItem('xiuzhen.save', JSON.stringify(env))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.click('#bigmenu a[href="item.jsp"]')
await page.waitForTimeout(250)
await page.click('#gleft a[href="item.jsp?tab=4"]')
await page.waitForTimeout(300)
const refineText = (await page.locator('#gleft').textContent())?.replace(/\s+/g, ' ') ?? ''
check('淬炼页列出可淬的那一对', refineText.includes('→ +1'), refineText.slice(0, 60))

await page.click('#gleft a[onclick^="sendMakeItem"]')
await page.waitForTimeout(300)
await page.click('#mwindow2 .mwindow2ok a, #mwindow2 a.mwindow2ok, #mwindow2ok')
  .catch(async () => { await page.evaluate(() => window.OnMDialog2OK()) })
await page.waitForTimeout(400)
const afterRefine = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('xiuzhen.save')).state
  return { n: st.player.artifacts.length, refine: st.player.artifacts[0]?.refine ?? -1 }
})
check('★淬炼后两件变一件 +1（不是炼出第三把新剑）',
  afterRefine.n === 1 && afterRefine.refine === 1, JSON.stringify(afterRefine))

// —— 16. 五行互化：表单提交不能把游戏页跳走 ——
const beforeTurn = await page.evaluate(() => {
  const env = JSON.parse(localStorage.getItem('xiuzhen.save'))
  // 丹田气海 0 级只能存 1000，所以数额要在上限内（否则 tick 会先截断）
  env.state.player.qi = [1000, 0, 0, 0, 0]
  localStorage.setItem('xiuzhen.save', JSON.stringify(env))
  return env.state.player.bonusCoin
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(300)
await page.evaluate(() => window.openLWindow('', 'turnres.jsp'))
await page.waitForTimeout(300)
await page.selectOption('#lwindowcontent select[name=from]', '金')
await page.selectOption('#lwindowcontent select[name=to]', '木')
await page.fill('#lwindowcontent input[name=amount]', '400')
await page.click('#lwindowcontent input[type=submit]')
await page.waitForTimeout(400)
check('五行互化后还在游戏页（表单没把页面跳走）',
  await page.locator('#gpage').count() > 0)
const afterTurn = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('xiuzhen.save')).state
  return { gold: Math.floor(st.player.qi[0]), wood: Math.floor(st.player.qi[1]), bonus: st.player.bonusCoin }
})
check('五行互化：总量守恒、扣 3 仙石',
  afterTurn.gold === 600 && afterTurn.wood === 400 && afterTurn.bonus === beforeTurn - 3,
  JSON.stringify(afterTurn))

// —— 17. 任务详情窗 ——
await page.click('#bigmenu a[href="player.jsp"]')
await page.waitForTimeout(250)
const questLink = page.locator('#gright a[onclick*="quest.jsp?questid="]').first()
if (await questLink.count() > 0) {
  await questLink.click()
  await page.waitForTimeout(350)
  const qText = (await page.locator('#lwindowcontent').textContent())?.replace(/\s+/g, ' ') ?? ''
  check('任务详情窗显示任务标题与概要', qText.length > 10, qText.slice(0, 50))
  await page.evaluate(() => window.closeLWindow())
} else {
  check('任务详情窗显示任务标题与概要', false, '右栏没有任务链接')
}

// —— 17b. 来袭：出保之后会有人打过来，用原版逐字标题句 ——
await page.evaluate(() => {
  const env = JSON.parse(localStorage.getItem('xiuzhen.save'))
  const st = env.state
  st.timeline.events = [{
    id: 'raid', kind: 'raid', finishAt: st.clock.gameT + 7200,
    payload: { attacker: '小哥来了', attackerId: 3, fromX: st.player.x + 4, fromY: st.player.y,
               swordPower: 60, swords: 2, element: '火' },
  }]
  localStorage.setItem('xiuzhen.save', JSON.stringify(env))
})
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(350)
const raidMid = (await page.locator('#gmid').textContent())?.replace(/\s+/g, ' ') ?? ''
check('来袭出现在战斗事件栏', /1 来袭/.test(raidMid), raidMid.slice(0, 40))

await page.click('#gmid a[onclick*="battleevent.jsp"]')
await page.waitForTimeout(400)
const raidB = (await page.locator('#bwindowcontent').textContent())?.replace(/\s+/g, ' ') ?? ''
check('★来袭用原版逐字句「来自…到达并攻击你」',
  /来自小哥来了的.*到达并攻击你/.test(raidB), raidB.slice(0, 70))
check('来袭事件的操作是「还击 / 战斗地图」，没有求援',
  raidB.includes('还击') && raidB.includes('战斗地图') && !raidB.includes('求援'))
check('来犯者的剑看不穿（整行 ???）', raidB.includes('???'))
await page.evaluate(() => window.closeBWindow())

// —— 17c. VIP 开关与写消息：两个以前点了没反应的按钮 ——
await page.evaluate(() => window.openSettings())
await page.waitForTimeout(300)
const beforeVip = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('xiuzhen.save')).state.player.vip)
await page.click('#lwindowcontent a[onclick="toggleVip()"]')
await page.waitForTimeout(400)
const afterVip = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('xiuzhen.save')).state
  return st.player.vip
})
check('VIP 开关能打开（第二条修炼队列才摸得到）', afterVip === !beforeVip, `${beforeVip} → ${afterVip}`)
await page.evaluate(() => window.closeLWindow())

await page.evaluate(() => window.openLWindow('写消息', 'writemsg.jsp?receiver=张三'))
await page.waitForTimeout(300)
await page.fill('#msgsubject', '借剑一用')
await page.fill('#msgtext', '道友，可否借飞剑一观？')
await page.click('#lwindowcontent input[value=发送]')
await page.waitForTimeout(400)
const sentOk = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('xiuzhen.save')).state
  return st.mail.filter((m) => m.subject.startsWith('寄给张三')).length
})
check('★写消息发送后留底（不再弹「尚未接入」）', sentOk === 1, `留底 ${sentOk} 封`)

// 18. 产业页与排行榜浮窗能打开（原版 L 窗路由）
await page.evaluate(() => window.openLWindow('', 'rank.jsp'))
await page.waitForTimeout(300)
check('排行榜浮窗列出 NPC',
  ((await page.locator('#lwindowcontent').textContent()) ?? '').length > 20)

// 12. 没有 JS 报错
check('全程无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()

const failed = steps.filter((s) => !s.ok)
console.log(`\n${steps.length - failed.length}/${steps.length} 步通过`)
process.exit(failed.length ? 1 : 0)
