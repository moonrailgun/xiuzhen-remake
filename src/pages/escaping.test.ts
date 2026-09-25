/**
 * 转义闸门：内联 onclick 里的 JS 字符串字面量必须**双层**转义。
 *
 * 浏览器对 `onclick="foo('…')"` 是**先 HTML 解码、再当 JS 解析**，所以只做一层都能被绕过：
 *
 *  - 只 `escJs()`：`"` 变 `\"`，但反斜杠救不了 HTML —— 属性在那个 `"` 就结束了，
 *    后面能接上一个新属性（实测可塞 `onmouseover=` 直接执行）。
 *  - 只 `esc()`：`'` 变 `&#39;`，HTML 解码又把它还原成 `'`，JS 字符串被提前闭合
 *    （实测 `李'+(window.x=1)+'四` 会被求值）。
 *
 * 正确写法是 `html.ts` 的 `js()` = `esc(escJs(v))`。
 *
 * **可达性不是理论问题**：`validateGameState` 只校验类型不校验字符集，
 * `validateName` 只在建号时拦；别人发来的存档导入进来就是存储型 XSS。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { renderMid, renderRight } from './sidebar.ts'
import { renderBattleEvent } from './battleevent.ts'
import { renderTrade } from './trade.ts'
import { renderItem } from './item.ts'
import { renderFight } from './fight.ts'
import { renderQuest } from './quest.ts'
import { renderSkill } from './skill.ts'
import { renderMsg } from './msg.ts'
import { renderItemMid } from './itemmid.ts'

/** 两种攻击串：一种闭合 JS 字符串，一种闭合 HTML 属性。 */
const BREAK_JS = "李'+(window.__PWNED=1)+'四"
const BREAK_ATTR = 'X" onmouseover=window.__PWNED=1 z="'

/** 按浏览器的顺序处理属性值：**先 HTML 解码**。 */
const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (all, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(Number(e[1] === 'x' || e[1] === 'X' ? `0${e.slice(1)}` : e.slice(1)))
      : (ENTITY[e] ?? all))

/**
 * **再当 JS 扫一遍**：记录每个字符是不是落在字符串字面量内部。
 * 只认单双引号与反斜杠转义 —— 内联 onclick 里不会出现模板串或正则。
 */
function inStringMask(src: string): boolean[] {
  const mask: boolean[] = []
  let quote = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (quote) {
      mask.push(true)
      if (c === '\\') { mask.push(true); i++; continue }
      if (c === quote) { mask[mask.length - 1] = false; quote = '' }
    } else {
      mask.push(false)
      if (c === '"' || c === "'") quote = c
    }
  }
  return mask
}

/**
 * 判据只有一条：攻击标记必须**留在 JS 字符串字面量里面**。
 *
 * 这么判而不是去数 `&#39;`，是因为两种写法都合法：
 * 逐个值 `js()`，或者把整条 handler 过一遍 `esc()`（`quest.ts` 就是后者，
 * 定界用的那对引号被转成 `&#39;`，解码回来正是它们该有的样子）。
 */
/**
 * 只看**标签内部**。正文里出现 `&quot; onmouseover=…` 只是被 `esc()` 过的普通文字，
 * 不是注入；把整段 HTML 当字符串扫会把它误判成属性。
 */
const tags = (html: string): string[] => [...html.matchAll(/<[a-zA-Z][^>]*>/g)].map((m) => m[0])

function escapedOut(html: string, marker: string): string[] {
  const out: string[] = []
  for (const m of tags(html).join('\n').matchAll(/\son(?:click|keydown|mouseover|mouseout)="([^"]*)"/g)) {
    const src = decodeEntities(m[1]!)
    const mask = inStringMask(src)
    for (let i = src.indexOf(marker); i >= 0; i = src.indexOf(marker, i + 1)) {
      if (!mask[i]) out.push(src.slice(Math.max(0, i - 60), i + 40))
    }
  }
  return out
}

/**
 * 属性被提前闭合：冒出一个**带攻击标记的**事件属性。
 * 只看带标记的 —— 原版 DOM 本来就有一堆不带引号的 `onclick=foo(1)`，那是逐字保真，不是注入。
 */
function injectedAttrs(html: string): string[] {
  // 先把成对引号的属性整段摘掉，剩下的才是「多出来的」东西。
  // 真被闭合时属性会提前结束，注入的那截正好留在剩余物里。
  const rest = tags(html).map((t) => t.replace(/\s[\w-]+=(?:"[^"]*"|'[^']*')/g, '')).join('\n')
  return [...rest.matchAll(/\son\w+=[^"'\s>]*__PWNED[^\s>]*/g)].map((m) => m[0])
}

const check = (label: string, html: string) => {
  assert.deepEqual(escapedOut(html, '__PWNED'), [], `${label}：标记跑出了 JS 字符串字面量，可执行`)
  assert.deepEqual(injectedAttrs(html), [], `${label}：属性被提前闭合，注入了新的事件属性`)
}

test('★中栏：玩家名进 spyPlayer / addpal 的 onclick', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('sidebar players', renderMid({
      battle: [], craft: [], move: [], cultivate: [], npcs: [evil],
      players: [{ name: evil, avatar: 'shushanm' }],
    }))
  }
})

test('★右栏：任务 id 进 quest.jsp / cancelquest', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('sidebar quests', renderRight({
      quests: [{ id: evil, title: evil, abandonable: true }],
      guardingMe: 0, guardingOthers: 0, guardCap: 7,
    }))
  }
})

test('★战斗事件总览：玩家名与飞剑名', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('battleevent', renderBattleEvent({ tab: 2, events: [{
      eventId: evil, kind: 'fighting', who: evil, at: [1, 2], seconds: 10,
      when: '2009-01-01 00:00:00',
      left: [{ owner: evil, ownerId: 1, name: evil, itemId: 1, stats: [1, 2, 3, 4, 5], seconds: 5, arriveAt: 'x' }],
      right: [{ owner: evil, ownerId: 2, seconds: null, arriveAt: 'x' }],
    }] }))
  }
})

test('★交易页：法宝挂单名', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('trade buyitem', renderTrade({
      view: 'buyitem', qiOffers: [], itemOffers: [{ sheet: 1, name: evil, item: 1, quality: 4, price: 2 }],
      pager: { page: 1, pages: 1 }, filterGive: '', filterWant: '', search: '', level: 0, order: 2,
      myQiOffers: [], myItemOffers: [], sellable: [{ id: 0, name: evil }],
    }))
  }
})

test('★法宝页：物品名进 openRWindow', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('item list', renderItem({
      tab: 'list', used: 1, capacity: 5,
      groups: [{ id: 1, items: [{ name: evil, itemId: 1, itemsn: 1, status: '空闲' }] }],
    }))
    check('item craft', renderItem({
      tab: 'sword',
      rows: [{ name: evil, itemId: 1, owned: 0, craftSeconds: 10, craftable: 1 }],
    }))
  }
})

test('★出击页：目标名与飞剑名', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('fight', renderFight({
      kind: 'attack', targetName: evil, at: [1, 2], summary: evil,
      swords: [{ id: evil, name: evil, itemId: 1, attack: 1, durability: 1, agility: 1, speed: 1, element: '金', seconds: 1 }],
      limit: 5, out: 0, passives: [],
    }))
  }
})

test('★任务详情窗：任务 id 进 finishquest / cancelquest', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('quest', renderQuest({
      id: evil, title: evil, summary: evil,
      progress: { kind: 'text', text: evil, done: false },
      reward: { kind: 'text', text: evil },
      description: [evil], claimable: true,
    }))
  }
})

test('★法术页与收件箱', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('skill book', renderSkill({
      tab: 'book', school: '蜀山', levels: {},
      books: [{ name: evil, itemId: 1, count: 1 }],
    }))
    check('msg', renderMsg({ rows: [{ id: 1, subject: evil, sender: evil, sentAt: 'x' }], page: 1, pages: 1 }))
  }
})

test('★物品窗：名称进 hlp / openRWindow', () => {
  for (const evil of [BREAK_JS, BREAK_ATTR]) {
    check('itemmid', renderItemMid({
      name: evil, flavor: [evil], tradable: true, element: '金', category: '飞剑',
      quality: '极品', refine: 0,
      stats: { attack: [1, 1], durability: [1, 1], absorb: [1, 1], speed: 1, agility: [1, 1], knockback: 1 },
    }))
  }
})
