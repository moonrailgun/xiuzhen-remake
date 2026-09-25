import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  newGame,
  tick,
  changeRate,
  currentQiPerHour,
  resourceBarOf,
  saveGame,
  loadGame,
} from './game.ts'
import { startCultivate, capacityOf } from './cultivate.ts'
import { DAY, HOUR } from './clock.ts'
import { isOutOfProtection } from './state.ts'
import type { FiveQi, GameState } from './state.ts'
import type { Storage } from './save.ts'

const qi = (...v: number[]): FiveQi => v as unknown as FiveQi

const fresh = (over: Partial<Parameters<typeof newGame>[0]> = {}) =>
  newGame(
    { name: '173小鱼', gender: 'f', element: '木', school: '通天', x: 100, y: 100, seed: 42, ...over },
    0,
  )

function memStorage(): Storage & { size(): number } {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    size: () => [...m.values()].reduce((a, b) => a + b.length, 0),
  }
}

test('新号：全 0 级、送 100 附加仙石、筑基期', () => {
  const s = fresh()
  assert.equal(s.player.realm, '筑基期')
  assert.equal(s.player.bonusCoin, 100, '进游戏送 100 附加仙石（官方指南）')
  assert.equal(s.player.coin, 0)
  assert.deepEqual([...s.player.meridians], Array(12).fill(0))
  assert.deepEqual([...s.player.qi], [0, 0, 0, 0, 0])
})

test('产量：木属性角色金为 0（五行一缺）', () => {
  const per = currentQiPerHour(fresh({ element: '木' }))
  assert.equal(per[0], 0, '金克木 → 金恒为 0')
  for (const i of [1, 2, 3, 4]) assert.ok(per[i]! > 0, `第 ${i} 种应有产出`)
})

test('产量对齐截图 #2：12 脉全 Lv.2、五个 4 的地块 → 每种 60', () => {
  // 截图显示 59，差的 1 是身上飞剑的耗气（见 meridian.test.ts）
  const s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2) } }
  const per = currentQiPerHour(s)
  assert.equal(per[1], 60, '木')
  assert.equal(per[0], 0, '金（五行一缺）')
})

test('产量随本命属性变化：火属性缺水', () => {
  const per = currentQiPerHour(fresh({ element: '火' }))
  assert.equal(per[2], 0, '水克火 → 水恒为 0')
  assert.ok(per[3]! > 0, '火（本命）应有产出')
})

test('tick：按流逝时间补真气', () => {
  const s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 2, 0, 0] } }
  const out = tick(s, 3600_000) // 1 小时
  assert.equal(Math.round(out.state.player.qi[1]!), 60)
  assert.equal(out.state.player.qi[0], 0)
})

test('tick：真气不超过丹田上限', () => {
  const s: GameState = {
    ...fresh(),
    player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 2, 0, 0] },
  }
  const out = tick(s, 1000 * 3600_000) // 1000 小时
  assert.equal(out.state.player.qi[1], capacityOf(s), '停在丹田容量（Lv.2 = 2900）')
  assert.equal(capacityOf(s), 2900)
})

test('tick 幂等：同一墙钟时刻重复调用不重复补真气', () => {
  const s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 9, 0, 0] } }
  const once = tick(s, 3600_000).state
  const twice = tick(once, 3600_000).state
  assert.deepEqual([...twice.player.qi], [...once.player.qi])
})

test('tick：离线期间的修炼会被结算掉', () => {
  let s: GameState = {
    ...fresh(),
    player: { ...fresh().player, meridians: Array(12).fill(0), qi: qi(9999, 9999, 9999, 9999, 9999), body: [0, 0, 0, 0, 0, 9, 0, 0] },
  }
  const started = startCultivate(s, { system: 'meridian', index: 0 })
  assert.equal(started.ok, true)
  s = (started as { state: GameState }).state

  // 离线 30 天
  const out = tick(s, 30 * DAY * 1000)
  assert.equal(out.resolved.length, 1, '积压的修炼应被结算')
  assert.equal(out.state.player.meridians[0], 1)
})

test('倍速：改档后产量按游戏时间走，历史不重算', () => {
  const base: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 9, 0, 0] } }
  const afterHour = tick(base, HOUR * 1000).state
  const sped = changeRate(afterHour, HOUR * 1000, 10)
  const out = tick(sped, 2 * HOUR * 1000) // 再过 1 墙钟小时 = 10 游戏小时
  // 总共 1 + 10 = 11 游戏小时
  assert.equal(Math.round(out.state.player.qi[1]!), 60 * 11)
})

test('保护期：新号在保，10 天后出保', () => {
  const s = fresh()
  assert.equal(isOutOfProtection(s.player, 0, DAY), false)
  assert.equal(isOutOfProtection(s.player, 10 * DAY, DAY), true)
})

test('资源条数据：真气取整，容量随丹田等级', () => {
  const s: GameState = { ...fresh(), player: { ...fresh().player, qi: qi(1.7, 2.2, 0, 0, 0), body: [0, 0, 0, 0, 0, 2, 0, 0] } }
  const bar = resourceBarOf(s)
  assert.deepEqual([...bar.current], [1, 2, 0, 0, 0])
  assert.equal(bar.capacity, 2900)
  assert.equal(bar.bonusCoin, 100)
})

// —— 存档往返 ——

test('存档往返：读回来的状态能继续推进', () => {
  const store = memStorage()
  let s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 9, 0, 0] } }
  s = tick(s, 3600_000).state
  saveGame(store, s, 3600_000)

  const loaded = loadGame(store)
  assert.ok(loaded, '应读到存档')
  assert.equal(loaded!.player.name, '173小鱼')
  assert.equal(Math.round(loaded!.player.qi[1]!), 60)

  // 读回来后再过一小时，产量应继续累加而不是从头算
  const next = tick({ ...loaded!, clock: { ...loaded!.clock, wallT: 3600_000 } }, 7200_000)
  assert.equal(Math.round(next.state.player.qi[1]!), 120)
})

test('存档时先结算时钟：关页面再打开不会重复补一段', () => {
  const store = memStorage()
  const s: GameState = { ...fresh(), player: { ...fresh().player, meridians: Array(12).fill(2), body: [0, 0, 0, 0, 0, 9, 0, 0] } }
  // 过了 1 小时才存档
  saveGame(store, s, 3600_000)
  const loaded = loadGame(store)!
  assert.equal(loaded.clock.gameT, 3600, '存档里的游戏时间应已推进')
  assert.equal(loaded.clock.wallT, 3600_000, '墙钟基准也要更新')
})

test('存档体积：新号远小于 1.5MB 预算', () => {
  const store = memStorage()
  saveGame(store, fresh(), 0)
  assert.ok(store.size() < 4000, `新号存档 ${store.size()} 字节`)
})

test('没有存档时返回 null', () => {
  assert.equal(loadGame(memStorage()), null)
})
