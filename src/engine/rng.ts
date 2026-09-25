/**
 * 确定性随机。
 *
 * 这个游戏有两种完全不同的随机需求，混用会出大问题：
 *
 * 1. **无状态的"查询式"随机** —— 给定 (种子, 坐标/日期/名字…) 直接算出值，不依赖调用顺序。
 *    世界地形、NPC 某一天的位置与状态、地块元气都用它。
 *    好处：地图可以跳到任意坐标查看而不推进任何状态；NPC 离线期间的轨迹可以按需重放；
 *    存档里不必记录这些（但按 `docs/spec/DECISIONS.md` §3.8 我们仍然把生成结果入档，
 *    以免以后改了算法让旧档错位）。
 *
 * 2. **有状态的序列随机** —— 淬炼成功/失败、炼器出极品、移动捡到藏宝图这类一次性判定。
 *    这些必须在**事件创建时**就掷好、把结果写进事件载荷，绝不能在结算时才掷 ——
 *    否则同一段离线时间重放两次会得到不同结果，违反 `timeline.ts` 的纯函数约定。
 */

/** 32 位混合（murmur3 finalizer），雪崩性好且够快。 */
function mix32(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** 把任意字符串折成 32 位（FNV-1a）。 */
function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * 无状态随机：同样的 (seed, keys) 永远得到同样的 [0,1) 值。
 * keys 可以混用数字和字符串，例如 `rand(seed, 'terrain', x, y)`、`rand(seed, 'npc', id, day)`。
 */
export function rand(seed: number, ...keys: readonly (number | string)[]): number {
  let h = seed >>> 0
  for (const k of keys) {
    const v = typeof k === 'number' ? (Number.isInteger(k) ? k : hashString(String(k))) : hashString(k)
    h = mix32((h ^ (v >>> 0)) + 0x9e3779b9)
  }
  return mix32(h) / 0x1_0000_0000
}

/** 无状态整数：[0, n) */
export const randInt = (n: number, seed: number, ...keys: readonly (number | string)[]): number =>
  Math.floor(rand(seed, ...keys) * n)

/** 无状态地从数组里挑一个。 */
export function pick<T>(items: readonly T[], seed: number, ...keys: readonly (number | string)[]): T {
  if (items.length === 0) throw new Error('不能从空数组里挑')
  return items[randInt(items.length, seed, ...keys)]!
}

/**
 * 无状态的加权挑选。weights 与 items 等长，权重和须 > 0。
 * 地块元气分布（纯 13 / 7+7 / 5+5+5 / 5+4+4+4 / 五个 4，优先级从高到低）用它。
 */
export function weightedPick<T>(
  items: readonly T[],
  weights: readonly number[],
  seed: number,
  ...keys: readonly (number | string)[]
): T {
  if (items.length !== weights.length) throw new Error('items 与 weights 长度不一致')
  const total = weights.reduce((a, b) => a + b, 0)
  if (!(total > 0)) throw new Error('权重和必须 > 0')
  let r = rand(seed, ...keys) * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!
    if (r < 0) return items[i]!
  }
  return items[items.length - 1]!
}

/**
 * 有状态的序列随机（sfc32）。状态可序列化，进存档。
 * 只在"事件创建时掷骰"这一种场合用。
 */
export type RngState = readonly [number, number, number, number]

export function seedRng(seed: number): RngState {
  let a = mix32(seed)
  let b = mix32(a ^ 0x9e3779b9)
  let c = mix32(b ^ 0x85ebca6b)
  let d = mix32(c ^ 0xc2b2ae35)
  return [a >>> 0, b >>> 0, c >>> 0, d >>> 0]
}

/** 取下一个 [0,1) 值，返回新状态（不可变，便于存档与重放）。 */
export function next(state: RngState): { value: number; state: RngState } {
  let [a, b, c, d] = state
  const t = (a + b) >>> 0
  a = b ^ (b >>> 9)
  b = (c + (c << 3)) >>> 0
  c = ((c << 21) | (c >>> 11)) >>> 0
  c = (c + t) >>> 0
  d = (d + 1) >>> 0
  const out = (t + d) >>> 0
  return { value: out / 0x1_0000_0000, state: [a >>> 0, b >>> 0, c >>> 0, d >>> 0] }
}

/** 按概率判定一次（如淬炼成功率）。 */
export function roll(state: RngState, probability: number): { hit: boolean; state: RngState } {
  const r = next(state)
  return { hit: r.value < probability, state: r.state }
}
