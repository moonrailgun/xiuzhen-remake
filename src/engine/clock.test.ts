import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createClock,
  advance,
  setRate,
  dayOfServer,
  weekOfServer,
  weekdayOf,
  formatServerTime,
  formatDuration,
  HOUR,
  DAY,
} from './clock.ts'

test('原速下游戏时间 = 墙钟流逝', () => {
  const c = createClock(1_000_000)
  const after = advance(c, 1_000_000 + 3600_000)
  assert.equal(after.gameT, HOUR)
})

test('倍速按比例放大', () => {
  const c = setRate(createClock(0), 0, 10)
  assert.equal(advance(c, 3600_000).gameT, 10 * HOUR)
})

test('advance 幂等：同一墙钟时刻重复调用不重复累加', () => {
  const c = advance(createClock(0), 1000)
  assert.deepEqual(advance(c, 1000), c)
})

test('墙钟回拨不让游戏时间倒流', () => {
  const c = advance(createClock(10_000), 20_000)
  const back = advance(c, 5_000) // 系统时间被调回去了
  assert.equal(back.gameT, c.gameT, '游戏时间不应减少')
  assert.equal(back.wallT, 5_000, '墙钟基准要更新，否则之后会一次性补算一大段')
})

test('改倍速前先结算：历史时间不按新倍率重算', () => {
  // 原速跑 1 小时，然后切到 10 倍再跑 1 小时 → 应为 1h + 10h，而不是 20h
  const c0 = createClock(0)
  const c1 = advance(c0, 3600_000)
  const c2 = setRate(c1, 3600_000, 10)
  const c3 = advance(c2, 7200_000)
  assert.equal(c3.gameT, HOUR + 10 * HOUR)
})

test('倍速必须是正有限数', () => {
  const c = createClock(0)
  assert.throws(() => setRate(c, 0, 0), /倍速必须是正数/)
  assert.throws(() => setRate(c, 0, -1), /倍速必须是正数/)
  assert.throws(() => setRate(c, 0, Infinity), /倍速必须是正数/)
})

test('开服日历：村庄 1 周、福地与小镇 2 周、城池 3 周、洞天 4 周', () => {
  // 出处 reference/text/guides/50102-p1.txt（2009-02-03 官方 FAQ）
  const at = (days: number) => advance(createClock(0), days * DAY * 1000)
  assert.equal(weekOfServer(at(6)), 0, '第 6 天还没到 1 周')
  assert.equal(weekOfServer(at(7)), 1, '第 7 天满 1 周 → 村庄')
  assert.equal(weekOfServer(at(14)), 2, '福地与小镇')
  assert.equal(weekOfServer(at(21)), 3, '城池')
  assert.equal(weekOfServer(at(28)), 4, '洞天')
})

test('星期几：首服 2008-10-28 开服是星期二', () => {
  assert.equal(new Date('2008-10-28T00:00:00Z').getUTCDay(), 2, '前提核对')
  const at = (days: number) => advance(createClock(0), days * DAY * 1000)
  assert.equal(weekdayOf(at(0)), 2, '开服当天 = 周二')
  assert.equal(weekdayOf(at(4)), 6, '第 4 天 = 周六（斩三尸刷新日）')
  assert.equal(weekdayOf(at(11)), 6, '下一个周六')
})

test('顶栏服务器时间格式 HH:MM:SS', () => {
  const c = advance(createClock(0), (16 * HOUR + 47 * 60 + 58) * 1000)
  // 对照原版 DOM：<SPAN id=servertime title=1234514836>16:47:58</SPAN>
  assert.equal(formatServerTime(c), '16:47:58')
  assert.equal(formatServerTime(advance(createClock(0), 0)), '00:00:00')
})

test('倒计时格式：小时不补零且可超过 24（照原版截图）', () => {
  assert.equal(formatDuration(24 * 60 + 1), '0:24:01') // 截图 #3「需要时间 0:24:01」
  assert.equal(formatDuration(1527 * HOUR + 46 * 60 + 40), '1527:46:40') // 截图 #33
  assert.equal(formatDuration(1222 * HOUR + 13 * 60 + 20), '1222:13:20') // 截图 #32
  assert.equal(formatDuration(-5), '0:00:00', '负数按 0')
})

test('dayOfServer 与 gameT 一致', () => {
  assert.equal(dayOfServer(advance(createClock(0), 0)), 0)
  assert.equal(dayOfServer(advance(createClock(0), DAY * 1000 - 1)), 0)
  assert.equal(dayOfServer(advance(createClock(0), DAY * 1000)), 1)
})
