/**
 * 市场：真气交易 + 法宝交易。
 *
 * 原版界面（`docs/research/05` §7 逐字转录）：四个子标签
 * `购买真气 | 出售真气 | 购买法宝 | 出售法宝`，真气表四列 `提供 | 需求 | 需要时间 | 操作`，
 * 红字提示 **「注意：购买真气注入丹田的时间与经脉有关」**。
 *
 * 三条照原版的规则：
 *  1. **出售的真气不立刻上架**，要延迟一会儿；
 *  2. **购买真气有「注入丹田」的耗时**，按点数 × 速率，**向下取整**；
 *  3. **交易在途的真气不在身上** —— 卖出挂单的真气立刻离开丹田，买来的真气注入完成才到账。
 *     玩家专门用这一条躲掠夺（`docs/research/02` §1.6）。反过来，**被攻击时挂单自动取消**。
 *
 * 市场不在 `GameState` 里（存档结构由 `state.ts` 定死）。这里自带 `Market`，
 * 与 `GameState` 一起构成 `MarketCtx`，交给 `timeline.advanceTo` 当状态用。
 */

import { schedule, cancel, type GameEvent } from './timeline.ts'
import { addQi, clampQi, type FiveQi, type GameState } from './state.ts'
import { capacityOf, spendCoin } from './cultivate.ts'
import { ELEMENTS, type Element } from '../data/meridian.ts'

export type QiAmount = { readonly element: Element; readonly amount: number }

export type QiOrder = {
  readonly id: string
  readonly seller: string
  /** 我用（卖家给出的） */
  readonly offer: QiAmount
  /** 换（卖家要的） */
  readonly want: QiAmount
  /** 上架延迟过去了没有。没上架的单别人看不见。 */
  readonly listed: boolean
}

export type ArtifactOrder = {
  readonly id: string
  readonly seller: string
  /** 只有极品可交易，所以这里不存 quality */
  readonly name: string
  readonly refine: number
  /** 标价：**普通仙石**（卖法宝是普通仙石的来源之一） */
  readonly priceCoin: number
}

export type Market = {
  readonly qi: readonly QiOrder[]
  readonly artifacts: readonly ArtifactOrder[]
}

export const emptyMarket = (): Market => ({ qi: [], artifacts: [] })

export type MarketCtx = { readonly state: GameState; readonly market: Market }

export type MarketResult =
  | { readonly ok: true; readonly ctx: MarketCtx }
  | { readonly ok: false; readonly reason: string }

const idxOf = (e: Element): number => ELEMENTS.indexOf(e)

const takeQi = (qi: FiveQi, a: QiAmount): FiveQi =>
  qi.map((v, i) => (i === idxOf(a.element) ? v - a.amount : v)) as unknown as FiveQi

const hasQi = (qi: FiveQi, a: QiAmount): boolean => (qi[idxOf(a.element)] ?? 0) >= a.amount

const addOne = (qi: FiveQi, a: QiAmount): FiveQi =>
  addQi(qi, ELEMENTS.map((e) => (e === a.element ? a.amount : 0)) as unknown as FiveQi)

// —— 挂单比例 ——

/**
 * 挂单比例。
 *
 * `docs/spec/DECISIONS-rules.md` §6 裁决：**界面在程序上不限制比例**
 * （否则不会出现官方规则帖点名的 1000:1 违规案例）；「最高 1:2」是**运营反资助条款**，
 * 靠人工封号执行，不是代码校验。所以这里只提供一个**提示用**的判断，`listQi` 不拦。
 */
export const RATIO_MIN = 1
export const RATIO_MAX = 2

export const ratioOf = (order: Pick<QiOrder, 'offer' | 'want'>): number =>
  order.offer.amount === 0 ? Infinity : order.want.amount / order.offer.amount

export const isFairRatio = (order: Pick<QiOrder, 'offer' | 'want'>): boolean => {
  const r = ratioOf(order)
  return r >= RATIO_MIN && r <= RATIO_MAX
}

// —— 注入丹田的耗时 ——

/**
 * 注入速率（秒/点）。三个实测点全部来自市场页截图，**同一页所有行速率相同**
 * → 速率只取决于看页面的人，与真气种类无关（`docs/research/05` §7.2）：
 *  - 0.50 秒/点 —— #7（2008-12）：4877×0.5 = 2438.5 → 0:40:38
 *  - 1.20 秒/点 —— #123（2008-10）：33339×1.2 = 40006.8 → 11:06:46
 *  - 1.25 秒/点 —— #93（2010-06）：51111×1.25 = 63888.75 → 17:44:48
 *
 * 三例都**向下取整**，这一条是硬的。红字说速率「与经脉有关」，但三张截图都不知道
 * 拍摄者的经脉等级（`docs/research/05` §缺口 10），所以下面的等级→速率映射是 [重建]：
 * 按经脉**平均等级**分段线性，0 级取最慢的 1.25，2 级取最快的 0.5，2 级以上不再变快。
 */
export const INJECT_RATES = {
  fast: 0.5,
  mid: 1.2,
  slow: 1.25,
} as const

/** 实测速率对应的经脉平均等级。[重建] —— 截图里没有这个数。 */
export const INJECT_RATE_ANCHORS: readonly { readonly avgLevel: number; readonly rate: number }[] = [
  { avgLevel: 0, rate: INJECT_RATES.slow },
  { avgLevel: 1, rate: INJECT_RATES.mid },
  { avgLevel: 2, rate: INJECT_RATES.fast },
]

export function injectRateOf(meridians: readonly number[]): number {
  const avg = meridians.length ? meridians.reduce((a, b) => a + b, 0) / meridians.length : 0
  const first = INJECT_RATE_ANCHORS[0]!
  const last = INJECT_RATE_ANCHORS[INJECT_RATE_ANCHORS.length - 1]!
  if (avg <= first.avgLevel) return first.rate
  if (avg >= last.avgLevel) return last.rate
  for (let i = 1; i < INJECT_RATE_ANCHORS.length; i++) {
    const a = INJECT_RATE_ANCHORS[i - 1]!
    const b = INJECT_RATE_ANCHORS[i]!
    if (avg <= b.avgLevel) {
      const t = (avg - a.avgLevel) / (b.avgLevel - a.avgLevel)
      return a.rate + (b.rate - a.rate) * t
    }
  }
  return last.rate
}

/** 注入耗时（秒）。**向下取整** —— 三张截图一致。 */
export const injectSeconds = (points: number, rate: number): number =>
  Math.floor(points * rate)

export const injectSecondsFor = (state: GameState, points: number): number =>
  injectSeconds(points, injectRateOf(state.player.meridians))

/**
 * 出售挂单的上架延迟。
 * `docs/spec/DECISIONS-rules.md` §38 裁决：公式未知，基准版取**固定 30 分钟**
 * （运营公告口径）；玩家那条「与经脉等级有关、约等于注入时间」记为 [未知-待拟合]。
 */
export const LISTING_DELAY_SECONDS = 30 * 60

// —— 事件 ——

const listEventId = (orderId: string): string => `market:list:${orderId}`
const injectEventId = (orderId: string): string => `market:inject:${orderId}`

// —— 真气：出售 ——

/**
 * 挂单「我用 offer 换 want」。
 *
 * 真气**立刻离开丹田**（在途期间不在身上），但单子要等 `LISTING_DELAY_SECONDS` 才上架。
 * 比例不拦（见 `isFairRatio` 的注释）。
 */
export function listQi(
  ctx: MarketCtx,
  order: { readonly id: string; readonly offer: QiAmount; readonly want: QiAmount },
): MarketResult {
  if (order.offer.amount <= 0 || order.want.amount <= 0) {
    return { ok: false, reason: '数量不正确' }
  }
  if (!hasQi(ctx.state.player.qi, order.offer)) {
    return { ok: false, reason: '真气不足' }
  }
  if (ctx.market.qi.some((o) => o.id === order.id)) {
    return { ok: false, reason: '挂单已存在' }
  }

  const entry: QiOrder = { ...order, seller: ctx.state.player.name, listed: false }
  const event: GameEvent = {
    id: listEventId(order.id),
    kind: 'market',
    finishAt: ctx.state.clock.gameT + LISTING_DELAY_SECONDS,
    payload: { op: 'list', orderId: order.id },
  }

  return {
    ok: true,
    ctx: {
      state: {
        ...ctx.state,
        player: { ...ctx.state.player, qi: takeQi(ctx.state.player.qi, order.offer) },
        timeline: schedule(ctx.state.timeline, event),
      },
      market: { ...ctx.market, qi: [...ctx.market.qi, entry] },
    },
  }
}

/** 已上架、别人看得见的单。 */
export const visibleOrders = (market: Market): readonly QiOrder[] =>
  market.qi.filter((o) => o.listed)

/** 自己的单（含还在延迟中的）。 */
export const myOrders = (ctx: MarketCtx): readonly QiOrder[] =>
  ctx.market.qi.filter((o) => o.seller === ctx.state.player.name)

/**
 * 撤单 / 被攻击时自动取消。真气按丹田上限退回
 * （「被打时挂在市场的单自动取消并可被掠夺」`docs/research/02` §1.6）。
 */
export function cancelQiOrders(ctx: MarketCtx, ids: readonly string[]): MarketCtx {
  const cancelled = ctx.market.qi.filter((o) => ids.includes(o.id))
  if (!cancelled.length) return ctx

  const cap = capacityOf(ctx.state)
  let qi = ctx.state.player.qi
  let timeline = ctx.state.timeline
  for (const o of cancelled) {
    qi = clampQi(addOne(qi, o.offer), cap)
    timeline = cancel(timeline, listEventId(o.id))
  }

  return {
    state: { ...ctx.state, player: { ...ctx.state.player, qi }, timeline },
    market: { ...ctx.market, qi: ctx.market.qi.filter((o) => !ids.includes(o.id)) },
  }
}

/** 被攻击：自己所有挂单一次性取消。 */
export const cancelAllMyOrders = (ctx: MarketCtx): MarketCtx =>
  cancelQiOrders(ctx, myOrders(ctx).map((o) => o.id))

// —— 真气：购买 ——

/**
 * 买一单。立刻付出 `want` 的真气，买到的 `offer` 走**注入丹田**事件，到点才进丹田。
 * 注入期间这批真气既不在市场也不在身上 —— 原版玩家就用这个躲掠夺。
 */
export function buyQi(ctx: MarketCtx, orderId: string): MarketResult {
  const order = ctx.market.qi.find((o) => o.id === orderId)
  if (!order) return { ok: false, reason: '挂单不存在' }
  if (!order.listed) return { ok: false, reason: '挂单尚未上架' }
  if (order.seller === ctx.state.player.name) return { ok: false, reason: '不能买自己的挂单' }
  if (!hasQi(ctx.state.player.qi, order.want)) return { ok: false, reason: '真气不足' }

  const event: GameEvent = {
    id: injectEventId(order.id),
    kind: 'market',
    finishAt: ctx.state.clock.gameT + injectSecondsFor(ctx.state, order.offer.amount),
    payload: { op: 'inject', element: order.offer.element, amount: order.offer.amount },
  }

  return {
    ok: true,
    ctx: {
      state: {
        ...ctx.state,
        player: { ...ctx.state.player, qi: takeQi(ctx.state.player.qi, order.want) },
        timeline: schedule(ctx.state.timeline, event),
      },
      market: { ...ctx.market, qi: ctx.market.qi.filter((o) => o.id !== orderId) },
    },
  }
}

// —— 法宝 ——

/**
 * 寄卖法宝。**只有极品法宝可交易**（`docs/research/02` §1.11 #7、
 * `reference/text/guides/45336-p3`「只有极品飞剑才可以交易」），标价用**普通仙石**。
 * 在售的法宝离开背包 —— 和真气一样，在途期间不在身上。
 */
export function listArtifact(
  ctx: MarketCtx,
  artifactId: string,
  priceCoin: number,
): MarketResult {
  const item = ctx.state.player.artifacts.find((a) => a.id === artifactId)
  if (!item) return { ok: false, reason: '没有这件法宝' }
  if (item.quality !== '极品') return { ok: false, reason: '只有极品法宝可以交易' }
  if (item.status !== '空闲') return { ok: false, reason: '法宝不在空闲状态' }
  if (priceCoin <= 0) return { ok: false, reason: '价格不正确' }

  const entry: ArtifactOrder = {
    id: artifactId,
    seller: ctx.state.player.name,
    name: item.name,
    refine: item.refine,
    priceCoin,
  }
  return {
    ok: true,
    ctx: {
      state: {
        ...ctx.state,
        player: {
          ...ctx.state.player,
          artifacts: ctx.state.player.artifacts.filter((a) => a.id !== artifactId),
        },
      },
      market: { ...ctx.market, artifacts: [...ctx.market.artifacts, entry] },
    },
  }
}

/** 卖出成交：得**普通仙石**（这是普通仙石的来源之一，见 `state.ts` 的 coin/bonusCoin）。 */
export function settleArtifactSale(ctx: MarketCtx, orderId: string): MarketResult {
  const order = ctx.market.artifacts.find((o) => o.id === orderId)
  if (!order) return { ok: false, reason: '挂单不存在' }
  return {
    ok: true,
    ctx: {
      state: {
        ...ctx.state,
        player: { ...ctx.state.player, coin: ctx.state.player.coin + order.priceCoin },
      },
      market: { ...ctx.market, artifacts: ctx.market.artifacts.filter((o) => o.id !== orderId) },
    },
  }
}

/** 买法宝：**只能用普通仙石**（附加仙石不行，`cultivate.spendCoin` 的 requireNormal）。 */
export function buyArtifact(ctx: MarketCtx, orderId: string): MarketResult {
  const order = ctx.market.artifacts.find((o) => o.id === orderId)
  if (!order) return { ok: false, reason: '挂单不存在' }
  if (order.seller === ctx.state.player.name) return { ok: false, reason: '不能买自己的挂单' }

  const paid = spendCoin(ctx.state, order.priceCoin, { requireNormal: true })
  if (!paid.ok) return { ok: false, reason: paid.reason }

  return {
    ok: true,
    ctx: {
      state: {
        ...paid.state,
        player: {
          ...paid.state.player,
          artifacts: [
            ...paid.state.player.artifacts,
            {
              id: order.id,
              kind: 'sword' as const,
              name: order.name,
              quality: '极品' as const,
              refine: order.refine,
              status: '空闲',
              count: 1,
            },
          ],
        },
      },
      market: { ...ctx.market, artifacts: ctx.market.artifacts.filter((o) => o.id !== orderId) },
    },
  }
}

// —— 事件结算 ——

/** 市场事件到点：`list` = 单子上架；`inject` = 买到的真气进丹田（按上限截断）。 */
export function resolveMarketEvent(ctx: MarketCtx, event: GameEvent): MarketCtx {
  const op = event.payload['op']

  if (op === 'list') {
    const orderId = event.payload['orderId'] as string
    return {
      ...ctx,
      market: {
        ...ctx.market,
        qi: ctx.market.qi.map((o) => (o.id === orderId ? { ...o, listed: true } : o)),
      },
    }
  }

  if (op === 'inject') {
    const gained: QiAmount = {
      element: event.payload['element'] as Element,
      amount: event.payload['amount'] as number,
    }
    const qi = clampQi(addOne(ctx.state.player.qi, gained), capacityOf(ctx.state))
    return { ...ctx, state: { ...ctx.state, player: { ...ctx.state.player, qi } } }
  }

  return ctx
}
