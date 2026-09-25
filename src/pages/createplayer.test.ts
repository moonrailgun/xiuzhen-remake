import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  renderCreatePlayer,
  validateName,
  avatarFor,
  ATTR_OPTIONS,
  SCHOOL_OPTIONS,
  POSITION_ROWS,
  type CreatePlayerVm,
} from './createplayer.ts'

const vm = (o: Partial<CreatePlayerVm> = {}): CreatePlayerVm => ({
  gender: 1,
  attr: 5,
  school: 0,
  posi: 0,
  ...o,
})

/** 原版 HTML 仅保存在本地归档，公开源码不包含这份文件。 */
const originalPath = new URL('../../reference/raw/game-server/s1-createplayer.jsp-BQGMCWI5.html', import.meta.url)

test('本地参考归档：建号页取值与文案逐项核对', {
  skip: !existsSync(originalPath) && '本地参考归档未提供',
}, () => {
  const original = new TextDecoder('gbk').decode(readFileSync(originalPath))
  for (const value of ['<option value="0">金</option>', '<option value="2">土</option>', '<option value="3">水</option>']) {
    assert.ok(original.includes(value))
  }
  for (const p of POSITION_ROWS.flat()) {
    assert.ok(original.includes(`value="${p.value}" />${p.label}`), p.label)
  }
  for (const text of [
    '蜀山以剑仙著称，拥有最为刚猛的攻击；昆仑以炼器著称，在炼制法宝上有所专长；而通天则信奉弱肉强食的自由思想，最具掠夺性。',
    '为你在游戏里的人物起一个名字，可以使用中英文字符和数字，最多7个汉字(14个英文字母)长度。',
  ]) assert.ok(original.includes(text))
  for (const title of ['人物资料', '五行属性', '道源宗法', '出生方位']) {
    assert.ok(original.includes(`<td>${title}</td>`), `原版缺 ${title}`)
  }
})

test('五行取值照原版：0金 1木 2土 3水 4火，5=随机（2 是土不是水）', () => {
  assert.deepEqual(
    ATTR_OPTIONS.map((o) => [o.value, o.label]),
    [[5, '随机'], [0, '金'], [1, '木'], [3, '水'], [4, '火'], [2, '土']],
  )
})

test('门派取值照原版：1蜀山 2昆仑 3通天，0=随机', () => {
  assert.deepEqual(
    SCHOOL_OPTIONS.map((o) => [o.value, o.label]),
    [[0, '随机'], [1, '蜀山'], [2, '昆仑'], [3, '通天']],
  )
})

test('九州取值与排布照原版', () => {
  const flat = POSITION_ROWS.flat()
  assert.equal(flat.length, 9)
  assert.deepEqual(
    flat.map((p) => [p.value, p.label]),
    [
      [2, '西北凉州'], [3, '北方并州'], [6, '东北幽州'],
      [1, '西方雍州'], [5, '中央冀州'], [9, '东方徐州'],
      [4, '西南益州'], [7, '南方荆州'], [8, '东南扬州'],
    ],
  )
})

test('三派描述文案与原版逐字一致', () => {
  const text = '蜀山以剑仙著称，拥有最为刚猛的攻击；昆仑以炼器著称，在炼制法宝上有所专长；而通天则信奉弱肉强食的自由思想，最具掠夺性。'
  assert.ok(renderCreatePlayer(vm()).includes(text))
})

test('姓名说明文案与原版逐字一致', () => {
  const text = '为你在游戏里的人物起一个名字，可以使用中英文字符和数字，最多7个汉字(14个英文字母)长度。'
  assert.ok(renderCreatePlayer(vm()).includes(text))
})

test('四个分节标题与原版一致', () => {
  const h = renderCreatePlayer(vm())
  for (const t of ['人物资料', '五行属性', '道源宗法', '出生方位']) {
    assert.ok(h.includes(t), `我们缺 ${t}`)
  }
})

test('沿用原版的 id、class 与表格宽度', () => {
  const h = renderCreatePlayer(vm())
  assert.ok(h.includes('id="createplayerform"'))
  assert.ok(h.includes('id="playername"'))
  assert.ok(h.includes('id="avatar"'))
  assert.ok(h.includes('width="460"'), '主表宽 460')
  assert.ok(h.includes('class="titlebg2 bigbold"'), '分节标题用墨迹条')
  assert.ok(h.includes('class="tablebg middle"'))
  assert.ok(h.includes('cellspacing="1" cellpadding="3"'), '网格线靠 cellspacing=1 漏出')
  assert.ok(h.includes('img/title/titlecreatechr.gif'))
  assert.ok(h.includes('img/btn/btnok.gif'))
})

test('默认全选「随机」', () => {
  const h = renderCreatePlayer(vm())
  assert.ok(h.includes('<OPTION selected="selected" value="5">随机</OPTION>'), '五行默认随机')
  assert.ok(h.includes('<OPTION selected="selected" value="0">随机</OPTION>'), '门派默认随机')
  assert.ok(h.includes('value="0" checked="checked" />随机'), '方位默认随机')
  assert.ok(h.includes('value="1" checked="checked"'), '性别默认男')
})

test('选中态跟随 vm', () => {
  const h = renderCreatePlayer(vm({ gender: 2, attr: 1, school: 3, posi: 8 }))
  assert.ok(h.includes('<OPTION selected="selected" value="1">木</OPTION>'))
  assert.ok(h.includes('<OPTION selected="selected" value="3">通天</OPTION>'))
  assert.ok(h.includes('value="8" checked="checked" />东南扬州'))
  assert.ok(h.includes('value="2" checked="checked" onclick="updateAvatar()" />女'))
})

// —— 姓名校验 ——

test('姓名：7 个汉字通过，8 个汉字拒绝', () => {
  assert.equal(validateName('一二三四五六七').ok, true)
  assert.equal(validateName('一二三四五六七八').ok, false)
})

test('姓名：14 个字母通过，15 个拒绝', () => {
  assert.equal(validateName('a'.repeat(14)).ok, true)
  assert.equal(validateName('a'.repeat(15)).ok, false)
})

test('姓名：中英数混合按半角/全角计宽', () => {
  assert.equal(validateName('173小鱼').ok, true) // 3 + 2×2 = 7
  assert.equal(validateName('举头望明月').ok, true)
})

test('姓名：空白与非法字符拒绝（从源头挡掉注入）', () => {
  assert.equal(validateName('').ok, false)
  assert.equal(validateName('   ').ok, false)
  for (const bad of ["<img>", "a'b", 'a"b', 'a<b', '名 字', '名字!', '😀']) {
    assert.equal(validateName(bad).ok, false, bad)
  }
})

test('头像：随机时用 random.gif，否则按门派+性别', () => {
  assert.equal(avatarFor(0, 1), 'random.gif')
  assert.equal(avatarFor(1, 1), 'shushanm.gif')
  assert.equal(avatarFor(2, 2), 'kunlunf.gif')
  assert.equal(avatarFor(3, 1), 'tongtianm.gif')
})

test('校验失败时显示红字提示（原版文案未存档，此处为重建）', () => {
  const h = renderCreatePlayer(vm({ error: '请输入人物姓名。' }))
  assert.ok(h.includes('class="smallred"'))
  assert.ok(h.includes('请输入人物姓名。'))
})
