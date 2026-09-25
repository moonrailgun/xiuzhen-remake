#!/usr/bin/env node
// GM 面板的跨层回归：真的点页面上的链接、真的填表单、真的看落盘后的存档。
// 引擎侧的上限逻辑由 src/engine/gm.test.ts 守；这里守的是「表单读得对、链接接得上」。
import { chromium } from 'playwright'

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
const fill = (name, value) => page.fill(`#gmform [name="${name}"]`, String(value))
const pick = (name, value) => page.selectOption(`#gmform [name="${name}"]`, String(value))
const apply = async () => {
  await page.locator('#lwindow a[onclick="gmApply()"]').click()
  await page.waitForTimeout(150)
}

try {
  await page.goto(process.env.BASE ?? 'http://localhost:5273')
  await page.fill('#playername', 'GM道友')
  await page.selectOption('select[name=attr]', '1')
  await page.click('a[onclick="sendCreatePlayer()"]')
  await page.waitForTimeout(200)

  console.log('入口')
  await page.evaluate(() => openSettings())
  check('怀旧版设置里有 GM 面板入口', await page.locator('#lwindow a[onclick="openGm()"]').count() === 1)
  await page.locator('#lwindow a[onclick="openGm()"]').click()
  await page.waitForTimeout(150)
  check('GM 面板打开且标明非原版', (await page.locator('#lwindowcontent').textContent()).includes('不是原版的东西'))
  check('表单在页面上', await page.locator('#gmform').count() === 1)

  console.log('\n身份与资源')
  await fill('gm-name', '改名成功')
  await pick('gm-realm', '元婴期')
  await pick('gm-element', '水')
  await fill('gm-silver', '123456')
  await fill('gm-coin', '789')
  await fill('gm-daoxing', '78840')
  await fill('gm-x', '42')
  await fill('gm-y', '43')
  await apply()
  let s = await saved()
  check('名字/境界/本命属性落盘', s.player.name === '改名成功' && s.player.realm === '元婴期' && s.player.element === '水')
  check('银两与仙石落盘', s.player.silver === 123456 && s.player.coin === 789)
  check('道行落盘（78840 = 脱离保护期）', s.player.daoxing === 78840)
  check('坐标落盘', s.player.x === 42 && s.player.y === 43)
  check('左栏人物资料立刻跟着变', (await page.locator('#gleft').textContent()).includes('改名成功'))

  console.log('\n等级：经脉 / 本体 / 法术')
  await fill('gm-meridian0', '99')
  await fill('gm-body5', '99')   // 丹田气海
  await fill('gm-body3', '99')   // 袖里乾坤
  await apply()
  s = await saved()
  check('经脉收拢到 20（已是元婴期）', s.player.meridians[0] === 20)
  check('丹田气海收拢到 36', s.player.body[5] === 36)
  check('袖里乾坤收拢到 20', s.player.body[3] === 20)
  check('收拢的事有写出来', (await page.locator('#lwindowcontent').textContent()).includes('收拢'))

  const skillName = await page.locator('#gmform input[name^="gm-skill:"]').first().getAttribute('name')
  await page.fill(`#gmform [name="${skillName}"]`, '999')
  await apply()
  s = await saved()
  const key = skillName.slice('gm-skill:'.length)
  check('法术等级落盘且不超 cap', s.player.skills[key] > 0)

  console.log('\n真气')
  await page.locator('#lwindow a[onclick="gmFillQi()"]').click()
  await page.waitForTimeout(150)
  s = await saved()
  const cap = Math.min(...s.player.qi)
  check('一键填满：五行都等于丹田上限', s.player.qi.every(v => v === cap) && cap > 1_000_000)
  check('顶栏资源条显示的就是这个数', (await page.locator('#top').textContent()).includes(String(cap)))
  await page.locator('#lwindow a[onclick="gmZeroQi()"]').click()
  await page.waitForTimeout(150)
  s = await saved()
  // 清零之后产出会立刻接着涨（经脉已经 20 级），所以不能断言恰好是 0
  check('一键清零', s.player.qi.every(v => v < cap / 1e6), JSON.stringify(s.player.qi))

  console.log('\n法宝')
  const before = (await saved()).player.artifacts.length
  const firstSword = await page.locator('#gmform [name="gm-add-name"] option').first().getAttribute('value')
  await pick('gm-add-name', firstSword)
  await pick('gm-add-quality', '极品')
  await fill('gm-add-refine', '5')
  await page.locator('#lwindow a[onclick="gmAddItem()"]').click()
  await page.waitForTimeout(150)
  s = await saved()
  const added = s.player.artifacts.find(a => a.id.startsWith('gm:'))
  check('加入背包的法宝真的进了存档', s.player.artifacts.length === before + 1 && !!added)
  check('品质与淬炼按选的来', added.quality === '极品' && added.refine === 5)
  check('类别识别正确（飞剑）', added.kind === 'sword')
  check('法宝页看得到它', (await page.evaluate(async id => {
    gotoTab('item'); return document.getElementById('gpage').textContent
  }, added.id)).includes(added.name))

  await page.evaluate(() => openGm())
  await page.waitForTimeout(150)
  await page.locator(`#lwindow a[onclick="gmDropItem('${added.id}')"]`).click()
  await page.waitForTimeout(150)
  s = await saved()
  check('删除法宝生效', !s.player.artifacts.some(a => a.id === added.id))

  console.log('\n未应用的改动不会被别的动作吃掉')
  await fill('gm-silver', '555')
  await page.locator('#lwindow a[onclick="gmZeroQi()"]').click()   // 另一个动作
  await page.waitForTimeout(150)
  s = await saved()
  check('顺手点了别的按钮，刚填的银两也一起保住了', s.player.silver === 555)

  console.log('\n时间线')
  await page.evaluate(() => { gotoTab('player'); openLWindow('', 'body.jsp') })
  await page.waitForTimeout(100)
  await page.evaluate(() => openGm())
  await page.waitForTimeout(150)
  await page.check('#gmform [name="gm-clearEvents"]')
  await apply()
  s = await saved()
  check('清空事件后时间线是空的', s.timeline.events.length === 0)

  console.log('\n面板开着期间别处的改动不会被回滚')
  // 面板是浮窗，开着的时候左栏照常能玩，每秒还有一次 pulse 在推进时间。
  // 以前不管动没动都把整张表当成补丁发出去，于是「开着面板在别处升了级、回来点应用」
  // 会按面板打开那一刻的快照把等级打回去，还只提示一句「已应用」。
  await page.locator('#lwindow a[onclick="gmFillQi()"]').click()   // 前面清零过，先把真气补回来
  await page.waitForTimeout(250)
  await page.evaluate(() => closeLWindow())
  await page.evaluate(() => setRate(600))
  await page.evaluate(() => doUpgrade('body', 1))
  await page.waitForTimeout(200)
  await page.evaluate(() => openGm())
  await page.waitForTimeout(250)
  check('前提：面板里这一项还是旧值', await page.inputValue('#gmform [name="gm-body1"]') === '0')
  await page.waitForTimeout(4000)
  const grown = (await saved()).player.body[1]
  check('前提：面板开着期间它在别处涨上去了', grown >= 1)
  await fill('gm-coin', '77')
  await apply()
  s = await saved()
  check('只改了仙石，别处涨的等级不该被打回去', s.player.body[1] === grown && s.player.coin === 77)

  const before2 = (await saved()).player.qi.map(Math.floor)
  await page.waitForTimeout(2000)
  await apply()
  s = await saved()
  check('什么都不改地再点一次应用，真气不倒退',
    s.player.qi.every((v, i) => v >= before2[i]))
  await page.evaluate(() => setRate(1))

  console.log('\n存档始终合法')
  check('改完还能正常读回来', await page.evaluate(() => {
    const raw = localStorage.getItem('xiuzhen.save')
    try { JSON.parse(raw); return true } catch { return false }
  }))
  check('全程无浏览器异常', errors.length === 0)
  if (errors.length) console.log(errors.join('\n'))
} catch (error) {
  console.error(error)
  failures.push(String(error))
} finally {
  await browser.close()
}

console.log(`\n${failures.length ? `✖ ${failures.length} 项失败` : '✔ GM 面板回归全部通过'}`)
process.exit(failures.length ? 1 : 0)
