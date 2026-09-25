/**
 * 逐级数值曲线的重建工具。
 *
 * 背景：原版的经脉/本体/法术逐级消耗表是图片帖，图片没有存档（`04-SOURCES.md` B2）。
 * 我们只有散落的锚点（截图里的某几级、玩家帖里的某几个数）。所以这些表**不是照原版**，
 * 而是"过已知锚点的重建曲线"。
 *
 * 做法：在 log 空间做**单调保形**的分段三次插值（PCHIP）。选它的理由：
 *  - 严格过每个锚点（锚点是硬证据，不能被拟合"平滑"掉）；
 *  - 保持单调（升级消耗不可能中途变便宜）；
 *  - 不像多项式拟合那样在锚点之间产生振荡。
 * log 空间：这类成长表跨好几个数量级（丹田 2,900 → 1,200,000），线性插值会把低级段压成 0。
 */

/** 一个锚点：等级 → 值，且必须带出处。 */
export type Anchor = {
  readonly level: number
  readonly value: number
  /** 出处：`reference/` 或 `docs/research/` 下真实存在的路径 + 定位信息。 */
  readonly source: string
}

/**
 * PCHIP 斜率（Fritsch–Carlson）：保证插值结果单调，不越过锚点。
 */
function pchipSlopes(xs: readonly number[], ys: readonly number[]): number[] {
  const n = xs.length
  if (n === 2) {
    const s = (ys[1]! - ys[0]!) / (xs[1]! - xs[0]!)
    return [s, s]
  }

  const h: number[] = []
  const delta: number[] = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1]! - xs[i]!)
    delta.push((ys[i + 1]! - ys[i]!) / h[i]!)
  }

  const m = new Array<number>(n)
  // 内部点：相邻斜率异号（或有一个为 0）时置 0，避免过冲；否则取加权调和平均。
  for (let i = 1; i < n - 1; i++) {
    const d0 = delta[i - 1]!
    const d1 = delta[i]!
    if (d0 * d1 <= 0) {
      m[i] = 0
    } else {
      const w1 = 2 * h[i]! + h[i - 1]!
      const w2 = h[i]! + 2 * h[i - 1]!
      m[i] = (w1 + w2) / (w1 / d0 + w2 / d1)
    }
  }
  // 端点：单边三点公式，再做单调性钳制。
  m[0] = endpointSlope(h[0]!, h[1]!, delta[0]!, delta[1]!)
  m[n - 1] = endpointSlope(h[n - 2]!, h[n - 3]!, delta[n - 2]!, delta[n - 3]!)
  return m
}

function endpointSlope(h0: number, h1: number, d0: number, d1: number): number {
  const s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
  if (s * d0 <= 0) return 0
  if (Math.abs(s) > 3 * Math.abs(d0)) return 3 * d0
  return s
}

/**
 * 由锚点构造一条曲线：给等级返回值。
 *
 * @param anchors 至少 2 个锚点，等级不重复（内部会排序）
 * @param opts.round 取整方式。真气/耗时都是整数；原版多数表看着像"整百/整千"，
 *                   但没有证据说明具体取整规则，所以默认只做四舍五入，不强行凑整。
 */
export function makeCurve(
  anchors: readonly Anchor[],
  opts: { readonly round?: 'nearest' | 'none' } = {},
): (level: number) => number {
  if (anchors.length < 2) throw new Error('曲线至少需要 2 个锚点')

  const sorted = [...anchors].sort((a, b) => a.level - b.level)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.level === sorted[i - 1]!.level) {
      throw new Error(`锚点等级重复：Lv.${sorted[i]!.level}`)
    }
  }
  if (sorted.some((a) => a.value <= 0)) throw new Error('log 空间插值要求所有值 > 0')

  const xs = sorted.map((a) => a.level)
  const ys = sorted.map((a) => Math.log(a.value))
  const ms = pchipSlopes(xs, ys)
  const round = opts.round ?? 'nearest'

  return (level: number): number => {
    let y: number
    if (level <= xs[0]!) {
      // 低于最小锚点：按首段斜率外推（不做钳制，调用方自己保证等级范围）
      y = ys[0]! + ms[0]! * (level - xs[0]!)
    } else if (level >= xs[xs.length - 1]!) {
      const last = xs.length - 1
      y = ys[last]! + ms[last]! * (level - xs[last]!)
    } else {
      let i = 0
      while (i < xs.length - 1 && xs[i + 1]! <= level) i++
      const h = xs[i + 1]! - xs[i]!
      const t = (level - xs[i]!) / h
      const t2 = t * t
      const t3 = t2 * t
      // Hermite 基函数
      const h00 = 2 * t3 - 3 * t2 + 1
      const h10 = t3 - 2 * t2 + t
      const h01 = -2 * t3 + 3 * t2
      const h11 = t3 - t2
      y = h00 * ys[i]! + h10 * h * ms[i]! + h01 * ys[i + 1]! + h11 * h * ms[i + 1]!
    }
    const v = Math.exp(y)
    return round === 'nearest' ? Math.round(v) : v
  }
}

/** 累加 [from, to] 闭区间的曲线值。用来对"总消耗/总耗时"这类累计锚点做校验。 */
export function cumulative(
  curve: (level: number) => number,
  from: number,
  to: number,
): number {
  let sum = 0
  for (let lv = from; lv <= to; lv++) sum += curve(lv)
  return sum
}
