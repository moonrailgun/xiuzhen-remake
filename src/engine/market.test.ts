import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INJECT_RATES,
  LISTING_DELAY_SECONDS,
  buyArtifact,
  buyQi,
  cancelAllMyOrders,
  emptyMarket,
  injectRateOf,
  injectSeconds,
  injectSecondsFor,
  isFairRatio,
  listArtifact,
  listQi,
  myOrders,
  ratioOf,
  resolveMarketEvent,
  settleArtifactSale,
  visibleOrders,
  refillNpcOrders,
  NPC_ORDER_TARGET,
  NPC_ORDER_TTL,
  type MarketCtx,
} from './market.ts'
import { createClock } from './clock.ts'
import { advanceTo, emptyTimeline } from './timeline.ts'
import { seedRng } from './rng.ts'
import { BODY_DANTIAN } from './cultivate.ts'
import type { Artifact, FiveQi, GameState } from './state.ts'

const qi = (...v: number[]): FiveQi => v as unknown as FiveQi

const body = (dantian: number): number[] => {
  const b = Array(8).fill(0) as number[]
  b[BODY_DANTIAN] = dantian
  return b
}

const state = (over: Partial<GameState['player']> = {}): GameState => ({
  v: 1,
  clock: createClock(0),
  timeline: emptyTimeline(),
  rng: seedRng(1),
  worldSeed: 1,
  npc: { bases: [], patches: {} },
  quests: { entries: [], line: 'qi' as const, dantianBonus: 0 },
  market: { qi: [], artifacts: [] },
  mail: [],
  player: {
    name: '逆神猪',
    gender: 'm',
    element: '金',
    school: '蜀山',
    realm: '筑基期',
    x: 28,
    y: 106,
    // 五行各 10 万，够挂单
    qi: qi(100000, 100000, 100000, 100000, 100000),
    meridians: Array(12).fill(0),
    // 丹田 36 级 = 140 万容量，免得测试被截断
    body: body(36),
    skills: {},
    daoxing: 0,
    experience: 0,
    silver: 0,
    coin: 0,
    bonusCoin: 0,
    artifacts: [],
    createdAt: 0,
    ...over,
  },
})

const ctxOf = (over?: Partial<GameState['player']>): MarketCtx => ({
  state: state(over),
  market: emptyMarket(),
})

const ok = (r: { ok: boolean }): r is { ok: true; ctx: MarketCtx } => r.ok

/** 把 ctx 推进到 until 并结算市场事件。 */
function advance(ctx: MarketCtx, until: number): MarketCtx {
  const out = advanceTo<MarketCtx>(
    { ...ctx, state: { ...ctx.state, clock: { ...ctx.state.clock, gameT: until } } },
    ctx.state.timeline,
    until,
    (c, ev) => ({ state: resolveMarketEvent(c, ev) }),
  )
  return { ...out.state, state: { ...out.state.state, timeline: out.timeline } }
}

// —— 注入丹田的耗时（三张截图逐条核对）——

test('注入耗时照截图 #7：0.5 秒/点，4877 点 = 0:40:38', () => {
  assert.equal(injectSeconds(4877, INJECT_RATES.fast), 40 * 60 + 38)
  assert.equal(injectSeconds(50001, INJECT_RATES.fast), 6 * 3600 + 56 * 60 + 40)
})

test('注入耗时照截图 #123：1.2 秒/点，33339 点 = 11:06:46', () => {
  assert.equal(injectSeconds(33339, INJECT_RATES.mid), 11 * 3600 + 6 * 60 + 46)
})

test('注入耗时照截图 #93：1.25 秒/点，51111 点 = 17:44:48', () => {
  assert.equal(injectSeconds(51111, INJECT_RATES.slow), 17 * 3600 + 44 * 60 + 48)
})

test('注入耗时向下取整，不四舍五入', () => {
  // 4877×0.5 = 2438.5 → 2438；51111×1.25 = 63888.75 → 63888
  assert.equal(injectSeconds(4877, 0.5), 2438)
  assert.equal(injectSeconds(51111, 1.25), 63888)
})

test('注入速率随经脉等级变快：0 级 1.25、1 级 1.2、2 级 0.5 秒/点', () => {
  assert.equal(injectRateOf(Array(12).fill(0)), INJECT_RATES.slow)
  assert.equal(injectRateOf(Array(12).fill(1)), INJECT_RATES.mid)
  assert.equal(injectRateOf(Array(12).fill(2)), INJECT_RATES.fast)
  // 2 级以上不再变快（没有更快的实测点，不外推）
  assert.equal(injectRateOf(Array(12).fill(20)), INJECT_RATES.fast)
})

// —— 出售真气：延迟上架，在途不在身上 ——

test('挂单立刻扣真气，但要过 30 分钟才上架', () => {
  const r = listQi(ctxOf(), { id: 'a', offer: { element: '火', amount: 25000 }, want: { element: '金', amount: 25000 } })
  assert.ok(ok(r))

  // 真气马上离开丹田（玩家用这个躲掠夺）
  assert.equal(r.ctx.state.player.qi[3], 100000 - 25000)
  assert.equal(visibleOrders(r.ctx.market).length, 0)
  assert.equal(myOrders(r.ctx).length, 1)

  const before = advance(r.ctx, LISTING_DELAY_SECONDS - 1)
  assert.equal(visibleOrders(before.market).length, 0)

  const after = advance(r.ctx, LISTING_DELAY_SECONDS)
  assert.equal(visibleOrders(after.market).length, 1)
  assert.equal(after.state.timeline.events.length, 0)
})

test('真气不够就挂不上单', () => {
  const r = listQi(ctxOf({ qi: qi(0, 0, 0, 0, 0) }), {
    id: 'a',
    offer: { element: '金', amount: 1 },
    want: { element: '木', amount: 1 },
  })
  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.reason, '真气不足')
})

test('被攻击时挂单自动取消，真气退回丹田', () => {
  const r = listQi(ctxOf(), { id: 'a', offer: { element: '水', amount: 1000 }, want: { element: '土', amount: 1000 } })
  assert.ok(ok(r))
  const back = cancelAllMyOrders(r.ctx)
  assert.equal(back.state.player.qi[2], 100000)
  assert.equal(back.market.qi.length, 0)
  assert.equal(back.state.timeline.events.length, 0)
})

// —— 挂单比例（DECISIONS-rules §6）——

test('1:1 与 1:2 都算规则内比例，1:3 与 1000:1 不算', () => {
  assert.equal(ratioOf({ offer: { element: '金', amount: 1000 }, want: { element: '木', amount: 2000 } }), 2)
  assert.ok(isFairRatio({ offer: { element: '金', amount: 1000 }, want: { element: '木', amount: 1000 } }))
  assert.ok(isFairRatio({ offer: { element: '金', amount: 1000 }, want: { element: '木', amount: 2000 } }))
  assert.equal(isFairRatio({ offer: { element: '金', amount: 1000 }, want: { element: '木', amount: 3000 } }), false)
  assert.equal(isFairRatio({ offer: { element: '金', amount: 1000 }, want: { element: '木', amount: 1 } }), false)
})

test('界面不硬卡比例：1:3 照样挂得上去（裁决：1:2 是运营处罚线，不是代码校验）', () => {
  const r = listQi(ctxOf(), { id: 'a', offer: { element: '金', amount: 1000 }, want: { element: '木', amount: 3000 } })
  assert.equal(r.ok, true)
})

// —— 购买真气：注入丹田 ——

test('买真气：付出的真气立刻扣，买到的真气注入完成才进丹田', () => {
  const seller: MarketCtx = {
    state: state(),
    market: {
      qi: [
        {
          id: 'x',
          seller: '别人',
          offer: { element: '火', amount: 25000 },
          want: { element: '金', amount: 25000 },
          listed: true,
        },
      ],
      artifacts: [],
    },
  }

  const r = buyQi(seller, 'x')
  assert.ok(ok(r))
  // 金真气立刻付掉，火真气还没到
  assert.equal(r.ctx.state.player.qi[0], 75000)
  assert.equal(r.ctx.state.player.qi[3], 100000)
  assert.equal(r.ctx.market.qi.length, 0)

  // 0 级经脉 = 1.25 秒/点 → 25000×1.25 = 31250 秒
  const need = injectSecondsFor(seller.state, 25000)
  assert.equal(need, 31250)
  assert.equal(r.ctx.state.timeline.events[0]!.finishAt, 31250)

  const mid = advance(r.ctx, need - 1)
  assert.equal(mid.state.player.qi[3], 100000)

  const done = advance(r.ctx, need)
  assert.equal(done.state.player.qi[3], 125000)
})

test('注入进丹田时按丹田上限截断', () => {
  const small: MarketCtx = {
    state: state({ body: body(1), qi: qi(100000, 0, 0, 0, 0) }),
    market: {
      qi: [
        {
          id: 'x',
          seller: '别人',
          offer: { element: '火', amount: 25000 },
          want: { element: '金', amount: 25000 },
          listed: true,
        },
      ],
      artifacts: [],
    },
  }
  const r = buyQi(small, 'x')
  assert.ok(ok(r))
  const done = advance(r.ctx, 999999)
  // 丹田 1 级容量远小于 25000
  assert.ok(done.state.player.qi[3]! < 25000)
})

test('没上架的单买不了，自己的单也买不了', () => {
  const ctx: MarketCtx = {
    state: state(),
    market: {
      qi: [
        { id: 'a', seller: '别人', offer: { element: '火', amount: 1 }, want: { element: '金', amount: 1 }, listed: false },
        { id: 'b', seller: '逆神猪', offer: { element: '火', amount: 1 }, want: { element: '金', amount: 1 }, listed: true },
      ],
      artifacts: [],
    },
  }
  assert.equal(buyQi(ctx, 'a').ok, false)
  assert.equal(buyQi(ctx, 'b').ok, false)
})

// —— 法宝交易 ——

const sword = (over: Partial<Artifact> = {}): Artifact => ({
  id: 's1',
  kind: 'sword',
  name: '古纹青石剑',
  quality: '极品',
  refine: 4,
  status: '空闲',
  count: 1,
  ...over,
})

test('只有极品法宝可以交易', () => {
  const bad = listArtifact({ state: state({ artifacts: [sword({ quality: '上品' })] }), market: emptyMarket() }, 's1', 120)
  assert.equal(bad.ok, false)
  assert.equal(bad.ok === false && bad.reason, '只有极品法宝可以交易')

  const good = listArtifact({ state: state({ artifacts: [sword()] }), market: emptyMarket() }, 's1', 120)
  assert.equal(good.ok, true)
})

test('寄卖的法宝离开背包，成交后得普通仙石（行情锚点：极品古纹青石剑+4 = 120 仙石）', () => {
  const listed = listArtifact({ state: state({ artifacts: [sword()] }), market: emptyMarket() }, 's1', 120)
  assert.ok(ok(listed))
  assert.equal(listed.ctx.state.player.artifacts.length, 0)
  assert.equal(listed.ctx.market.artifacts[0]!.priceCoin, 120)

  const sold = settleArtifactSale(listed.ctx, 's1')
  assert.ok(ok(sold))
  assert.equal(sold.ctx.state.player.coin, 120)
  assert.equal(sold.ctx.state.player.bonusCoin, 0)
})

test('买法宝只能用普通仙石，附加仙石不认', () => {
  const shelf: MarketCtx = {
    state: state({ coin: 0, bonusCoin: 500 }),
    market: { qi: [], artifacts: [{ id: 's1', seller: '别人', name: '古纹青石剑', refine: 4, priceCoin: 120 }] },
  }
  const no = buyArtifact(shelf, 's1')
  assert.equal(no.ok, false)
  assert.equal(no.ok === false && no.reason, '普通仙石不足')

  const rich: MarketCtx = { ...shelf, state: state({ coin: 120, bonusCoin: 500 }) }
  const yes = buyArtifact(rich, 's1')
  assert.ok(ok(yes))
  assert.equal(yes.ctx.state.player.coin, 0)
  assert.equal(yes.ctx.state.player.bonusCoin, 500)
  assert.equal(yes.ctx.state.player.artifacts[0]!.name, '古纹青石剑')
  assert.equal(yes.ctx.state.player.artifacts[0]!.quality, '极品')
  assert.equal(yes.ctx.state.player.artifacts[0]!.refine, 4)
})

// —— NPC 补货（单机版的「别人」）——

test('NPC 补货把市场补满，且同种子同时刻可重放', () => {
  const s = state()
  const a = refillNpcOrders(s)
  const b = refillNpcOrders(s)
  assert.equal(a.market.qi.length, NPC_ORDER_TARGET)
  assert.deepEqual(a.market.qi, b.market.qi, '同一存档重放要得到同一批单子')
})

test('★买走的 NPC 单不会在同一小时里原样复活', () => {
  const s = refillNpcOrders(state())
  const bought = s.market.qi[3]!
  const r = buyQi({ state: s, market: s.market }, bought.id)
  assert.ok(r.ok, r.ok ? '' : r.reason)

  const after = refillNpcOrders({ ...r.ctx.state, market: r.ctx.market })
  assert.equal(after.market.qi.length, NPC_ORDER_TARGET, '补回到目标单数')
  assert.ok(
    !after.market.qi.some((o) => o.id === bought.id),
    `刚买走的 ${bought.id} 又出现了`,
  )
})

test('NPC 单挂满 TTL 后撤下', () => {
  const s = refillNpcOrders(state())
  const later = refillNpcOrders({
    ...s,
    clock: { ...s.clock, gameT: s.clock.gameT + NPC_ORDER_TTL + 3600 },
  })
  assert.equal(later.market.qi.length, NPC_ORDER_TARGET)
  assert.equal(
    later.market.qi.filter((o) => s.market.qi.some((old) => old.id === o.id)).length,
    0,
    '旧的一批应该全部换掉',
  )
})

test('NPC 单的提供与需求必是两种不同的真气，比例在 1:1–1:2 之间', () => {
  // 多跑几个世界种子，保证不是某一个种子碰巧对
  for (const seed of [1, 7, 42, 999]) {
    const s = refillNpcOrders({ ...state(), worldSeed: seed })
    for (const o of s.market.qi) {
      assert.notEqual(o.offer.element, o.want.element, `${seed}: ${o.id} 自己换自己`)
      const r = o.want.amount / o.offer.amount
      assert.ok(r >= 1 && r <= 2, `${seed}: ${o.id} 比例 ${r} 越界`)
    }
  }
})

test('自己的挂单不会被补货逻辑撤掉', () => {
  const s = refillNpcOrders(state())
  const listed = listQi({ state: s, market: s.market }, {
    id: 'me:1',
    offer: { element: '金', amount: 100 },
    want: { element: '木', amount: 100 },
  })
  assert.ok(listed.ok)
  const after = refillNpcOrders({ ...listed.ctx.state, market: listed.ctx.market })
  assert.ok(after.market.qi.some((o) => o.id === 'me:1'))
})
