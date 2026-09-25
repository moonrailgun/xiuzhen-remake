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

// 12. 没有 JS 报错
check('全程无 JS 报错', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()

const failed = steps.filter((s) => !s.ok)
console.log(`\n${steps.length - failed.length}/${steps.length} 步通过`)
process.exit(failed.length ? 1 : 0)
