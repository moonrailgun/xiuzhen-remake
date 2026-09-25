/**
 * 炼器：飞剑 / 护身 / 丹药的炼制，以及淬炼。
 *
 * 【照原版】：
 *  - **炼器事件不占修炼队列**（官方新手指南原文：「一个用户最多只能同时进行 2 个
 *    修炼事件（不包括炼器事件）」）；
 *  - **飞剑与护身可以并行炼制**（官方攻略《护身揭密》：「护身可以和飞剑一起炼制。
 *    换句话说，同一时间，只要资源足够，道友们可以同时输出两倍的力量」）；
 *  - **丹药一次一炉**（玩家帖：否则「将浪费一个 CD」）；
 *  - 炼制耗时受「手熟无他」影响，**炼丹除外**（技能弹窗 Tips 原文：
 *    「炼丹不只是需要手熟，所需时间与『手熟无他』效果无关」）；
 *  - 淬炼是两把**完全相同**的法宝合成一把 +1，失败时**两把俱毁**；
 *    满级百炼之法可稳定淬到 +10，+11 起要花仙石保（1 石保不毁、2 石保必成）。
 */

import { schedule, countByKind, type GameEvent } from './timeline.ts'
import { subQi, canAfford, totalQi, type FiveQi, type GameState, type Artifact } from './state.ts'
import { refineSuccessRate, refinePieces, type Quality } from '../data/artifacts.ts'
import { roll } from './rng.ts'

export type CraftKind = 'sword' | 'guard' | 'pill'

/** 三条炼器队列：飞剑、护身各一条（可并行），丹药一条。 */
export const CRAFT_QUEUE_ID: Record<CraftKind, string> = {
  sword: 'craft:sword',
  guard: 'craft:guard',
  pill: 'craft:pill',
}

/** 本体「手熟无他」的序号。 */
export const BODY_HAND = 6

/**
 * 炼制耗时。[按推断]
 * 由截图交叉验证得出：`基准时间 ÷ (1 + 0.2 × 手熟无他等级)`，
 * 20 级时为基准的 1/5（七星磐龙剑 1:11:26 → 0:14:17 正好 1/5）。
 * **炼丹不吃这个加成**（技能弹窗 Tips 原文）。
 */
export function craftSeconds(baseSeconds: number, kind: CraftKind, handLevel: number): number {
  if (kind === 'pill') return baseSeconds
  return Math.max(1, Math.round(baseSeconds / (1 + 0.2 * Math.max(0, handLevel))))
}

export type CraftOrder = {
  readonly kind: CraftKind
  readonly name: string
  /** 一次炼几件（原版炼制页可以填数量） */
  readonly count: number
  /** 单件的五行消耗 */
  readonly cost: FiveQi
  /** 单件的基准耗时（手熟无他 0 级时） */
  readonly baseSeconds: number
  /** 产出的品质。「物理通明」秘笈有机会出极品 */
  readonly quality: Quality
}

export type CraftResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string }

/**
 * 开始炼制。同类只能有一炉，不同类可以并行。
 */
export function startCraft(state: GameState, order: CraftOrder): CraftResult {
  if (!Number.isSafeInteger(order.count) || order.count <= 0) return { ok: false, reason: '请填写炼制数量' }

  const queueId = CRAFT_QUEUE_ID[order.kind]
  if (state.timeline.events.some((e) => e.id === queueId)) {
    return {
      ok: false,
      reason: order.kind === 'pill' ? '丹炉正在炼制中' : '该类法宝正在炼制中',
    }
  }

  if (!canAcquireArtifacts(state, order.count)) return { ok: false, reason: '法宝携带数量已达上限，请先提升袖里乾坤或腾出空位' }

  const total: FiveQi = order.cost.map((v) => v * order.count) as unknown as FiveQi
  if (!canAfford(state.player.qi, total)) {
    return { ok: false, reason: '炼制所需真气不足' }
  }

  const per = craftSeconds(order.baseSeconds, order.kind, state.player.body[BODY_HAND] ?? 0)
  const event: GameEvent = {
    id: queueId,
    kind: 'craft',
    finishAt: state.clock.gameT + per * order.count,
    payload: { ...order, perSeconds: per },
  }

  return {
    ok: true,
    state: {
      ...state,
      player: {
        ...state.player,
        qi: subQi(state.player.qi, total),
        // 炼制消耗的真气同样计入道行
        daoxing: state.player.daoxing + totalQi(total),
      },
      timeline: schedule(state.timeline, event),
    },
  }
}

/** 炼制完成：成品进背包。 */
export function resolveCraft(state: GameState, event: GameEvent): GameState {
  const kind = event.payload['kind'] as CraftKind
  const name = event.payload['name'] as string
  const count = event.payload['count'] as number
  const quality = event.payload['quality'] as Quality

  const made: Artifact[] = Array.from({ length: count }, (_, i) => ({
    id: `${kind}:${event.finishAt}:${i}`,
    kind: kind === 'pill' ? 'pill' : kind === 'guard' ? 'guard' : 'sword',
    name,
    quality,
    refine: 0,
    status: '空闲',
    count: 1,
  }))

  return { ...state, player: { ...state.player, artifacts: [...state.player.artifacts, ...made] } }
}

/** 法宝携带上限由「袖里乾坤」决定；截图 #121 是 (1/5)，商城提示也是 5。 */
export const BODY_SLEEVE = 3
export const BASE_ARTIFACT_SLOTS = 5
export const artifactSlots = (sleeveLevel: number, vip = false, superVip = false): number =>
  BASE_ARTIFACT_SLOTS + sleeveLevel + (vip ? 5 : 0) + (superVip ? 15 : 0)

/** 当前单机版VIP是设置开关，未实现高级VIP权益。 */
export const artifactCapacity = (state: GameState): number =>
  artifactSlots(state.player.body[BODY_SLEEVE] ?? 0, state.player.vip)

/** 已携带及各炼器队列预留的数量；购买不能占用在炼成品的位置。 */
export const artifactSpaceUsed = (state: GameState): number =>
  state.player.artifacts.reduce((sum, artifact) => sum + artifact.count, 0) +
  state.timeline.events.filter((event) => event.kind === 'craft')
    .reduce((sum, event) => sum + (Number(event.payload['count']) || 0), 0)

export const canAcquireArtifacts = (state: GameState, count: number): boolean =>
  Number.isSafeInteger(count) && count > 0 && artifactSpaceUsed(state) + count <= artifactCapacity(state)

// —— 淬炼 ——

export type RefineResult =
  | { readonly ok: true; readonly state: GameState; readonly success: boolean; readonly message: string }
  | { readonly ok: false; readonly reason: string }

/** 淬炼失败的原版文案（`docs/research/03` §1.16）。 */
export const REFINE_FAIL_TEXT = '双双剧震，震裂成碎片'

/**
 * 淬炼：两把完全相同（同名、同品质、同淬炼等级）的法宝合成一把 +1。
 *
 * @param protect 花仙石保底：`'none'` 不保、`'keep'` 1 石保不毁、`'sure'` 2 石保必成
 */
export function refineArtifact(
  state: GameState,
  artifactIds: readonly [string, string],
  opts: { readonly baihuanLevel?: number; readonly protect?: 'none' | 'keep' | 'sure' } = {},
): RefineResult {
  const [idA, idB] = artifactIds
  const a = state.player.artifacts.find((x) => x.id === idA)
  const b = state.player.artifacts.find((x) => x.id === idB)
  if (!a || !b) return { ok: false, reason: '找不到要淬炼的法宝' }
  if (a.id === b.id) return { ok: false, reason: '需要两件法宝' }
  if (a.name !== b.name || a.quality !== b.quality || a.refine !== b.refine) {
    return { ok: false, reason: '只能淬炼两件完全相同的法宝' }
  }

  const protect = opts.protect ?? 'none'
  const target = a.refine + 1
  const rate = refineSuccessRate({ targetRefine: target, baihuanLevel: opts.baihuanLevel ?? 0 })

  const r = roll(state.rng, rate)
  const success = protect === 'sure' || r.hit
  const rest = state.player.artifacts.filter((x) => x.id !== idA && x.id !== idB)

  if (success) {
    return {
      ok: true,
      success: true,
      message: `淬炼成功，得到 ${a.quality}${a.name}+${target}`,
      state: {
        ...state,
        rng: r.state,
        player: {
          ...state.player,
          artifacts: [...rest, { ...a, id: `${a.id}:r${target}`, refine: target }],
        },
      },
    }
  }

  // 失败：不保则两把俱毁；1 石保不毁则两把都留着
  return {
    ok: true,
    success: false,
    message: protect === 'keep' ? '淬炼失败，法宝无损' : REFINE_FAIL_TEXT,
    state: {
      ...state,
      rng: r.state,
      player: {
        ...state.player,
        artifacts: protect === 'keep' ? state.player.artifacts : rest,
      },
    },
  }
}

export { refinePieces, countByKind }
