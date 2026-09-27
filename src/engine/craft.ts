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
import { refineSuccessRate, refinePieces, DEFENSIVE_ARTIFACTS, type Quality } from '../data/artifacts.ts'
import { roll, next, type RngState } from './rng.ts'
import { capacityOf, spendCoin } from './cultivate.ts'
import { pillRecipe } from '../data/pills.ts'
import { canForge, swordByName, craftCostFor } from '../data/swords.ts'

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

/** 满级上品率普通50%、昆仑炼器总纲4级70%为原文；中间概率、废品率与极品1%为重建。 */
export function craftQuality(state: GameState, kind: 'sword' | 'guard' = 'sword'): { quality: Quality; rng: RngState } {
  const r = next(state.rng)
  const mastery = Math.max(0, Math.min(20, state.player.skills[kind === 'sword' ? '铸剑之术' : '灵宝真经'] ?? 0)) / 20
  const kunlun = state.player.school === '昆仑' ? Math.max(0, Math.min(4, state.player.skills['炼器总纲'] ?? 0)) * .05 : 0
  const upper = .05 + .45 * mastery + kunlun
  const waste = .65 * (1 - mastery)
  const quality = (state.player.skills['物理通明'] ?? 0) > 0 && r.value < .01 ? '极品'
    : r.value < upper ? '上品' : r.value < 1 - waste ? '凡品' : '废品'
  return { quality, rng: r.state }
}

/** 配方唯一来源；调用方可预览，引擎开始炼制时仍重新读取。 */
export function craftRecipe(state: GameState, kind: CraftKind, name: string): { cost: FiveQi; baseSeconds: number } | null {
  if (kind === 'pill') {
    const pill = pillRecipe(name)
    return pill ? { cost: [0, 0, 0, 0, 0], baseSeconds: pill.baseSeconds } : null
  }
  const recipe = kind === 'sword' ? swordByName(name) : DEFENSIVE_ARTIFACTS.find(g => g.name === name)
  if (!recipe?.craftCost || !recipe.craftSeconds) return null
  return { cost: craftCostFor(recipe.craftCost, state.player.element)!, baseSeconds: recipe.craftSeconds }
}

/** reconstructed：每个未淬炼原件升一档需1仙石；保留淬炼倍率，最高上品。 */
export const qualityUpgradeCost = (item: Artifact): number =>
  (item.kind === 'sword' || item.kind === 'guard') && (item.quality === '废品' || item.quality === '凡品')
    ? refinePieces(item.refine) * item.count : 0

function upgradeQualities(state: GameState, items: readonly Artifact[]): CraftResult {
  if (!items.length || items.some(a => a.status !== '空闲' || !qualityUpgradeCost(a))) return { ok: false, reason: '只能提升空闲的废品或凡品法宝，最高上品' }
  const paid = spendCoin(state, items.reduce((sum, a) => sum + qualityUpgradeCost(a), 0))
  if (!paid.ok) return paid
  const ids = new Set(items.map(a => a.id))
  return { ok: true, state: { ...paid.state, player: { ...paid.state.player,
    artifacts: paid.state.player.artifacts.map(a => ids.has(a.id) ? { ...a, quality: a.quality === '废品' ? '凡品' : '上品' } : a),
  } } }
}

export function upgradeArtifactQuality(state: GameState, id: string): CraftResult {
  const item = state.player.artifacts.find(a => a.id === id)
  return upgradeQualities(state, item ? [item] : [])
}

/** 全升将背包中同名、同类且可提升的空闲法宝各提升一档，统一校验并扣费。 */
export function upgradeAllArtifactQuality(state: GameState, id: string): CraftResult {
  const selected = state.player.artifacts.find(a => a.id === id)
  return upgradeQualities(state, selected ? state.player.artifacts.filter(a => a.kind === selected.kind && a.name === selected.name && a.status === '空闲' && qualityUpgradeCost(a) > 0) : [])
}

export function usePill(state: GameState, id: string): CraftResult {
  const item = state.player.artifacts.find(a => a.id === id)
  if (!item || item.kind !== 'pill' || item.status !== '空闲' || item.count < 1) return { ok: false, reason: '请先选中一颗空闲丹药' }
  const recipe = pillRecipe(item.name)
  if (!recipe) return { ok: false, reason: '没有这颗丹药的服食记载' }
  const { kind, tier } = recipe
  const cap = capacityOf(state)
  return { ok: true, state: { ...state, player: { ...state.player,
    qi: state.player.qi.map((v, i) => Math.min(cap, v + (kind === 5 ? 160 * tier : i === kind ? 1000 * tier : 0))) as unknown as FiveQi,
    artifacts: state.player.artifacts.flatMap(a => a.id !== id ? [a] : a.count > 1 ? [{ ...a, count: a.count - 1 }] : []),
  } } }
}

/**
 * 开始炼制。同类只能有一炉，不同类可以并行。
 */
export function startCraft(state: GameState, order: CraftOrder): CraftResult {
  if (!Number.isSafeInteger(order.count) || order.count <= 0) return { ok: false, reason: '请填写炼制数量' }

  const recipe = craftRecipe(state, order.kind, order.name)
  if (!recipe) return { ok: false, reason: '没有这件物品的炼制配方' }
  const pill = order.kind === 'pill' ? pillRecipe(order.name) : null
  if (pill && (state.player.skills['炼丹之术'] ?? 0) < pill.tier) return { ok: false, reason: `炼制${order.name}需要炼丹之术${pill.tier}级` }
  const guard = order.kind === 'guard' ? DEFENSIVE_ARTIFACTS.find(g => g.name === order.name) : undefined
  if (guard && (state.player.skills['灵宝真经'] ?? 0) < guard.lingbaoLevel) return { ok: false, reason: `炼制${order.name}需要灵宝真经${guard.lingbaoLevel}级` }
  const sword = order.kind === 'sword' ? swordByName(order.name) : undefined
  if (sword && !canForge(sword, state.player.skills['铸剑之术'] ?? 0)) {
    return { ok: false, reason: `炼制${sword.name}需要铸剑之术${sword.forgeLevel}级` }
  }

  const queueId = CRAFT_QUEUE_ID[order.kind]
  if (state.timeline.events.some((e) => e.id === queueId)) {
    return {
      ok: false,
      reason: order.kind === 'pill' ? '丹炉正在炼制中' : '该类法宝正在炼制中',
    }
  }

  if (!canAcquireArtifacts(state, order.count)) return { ok: false, reason: '法宝携带数量已达上限，请先提升袖里乾坤或腾出空位' }

  const total: FiveQi = recipe.cost.map((v) => v * order.count) as unknown as FiveQi
  if (!canAfford(state.player.qi, total)) {
    return { ok: false, reason: '炼制所需真气不足' }
  }

  const per = craftSeconds(recipe.baseSeconds, order.kind, state.player.body[BODY_HAND] ?? 0)
  let rng = state.rng
  const qualities: Quality[] = Array.from({ length: order.count }, () => {
    if (order.kind === 'pill') return '凡品'
    const result = craftQuality({ ...state, rng }, order.kind)
    rng = result.rng
    return result.quality
  })
  const event: GameEvent = {
    id: queueId,
    kind: 'craft',
    finishAt: state.clock.gameT + per * order.count,
    payload: { ...order, ...recipe, quality: qualities[0]!, qualities, perSeconds: per },
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
      rng,
      timeline: schedule(state.timeline, event),
    },
  }
}

/** 修理消耗为重炼的 2/3、耗时同炼制（47102-p1.txt）；淬炼按 2^N 折算为重建。 */
export function repairPlan(state: GameState, artifactId: string): { cost: FiveQi; seconds: number } | null {
  const item = state.player.artifacts.find(a => a.id === artifactId)
  if (!item || (item.kind !== 'sword' && item.kind !== 'guard')) return null
  const recipe = item.kind === 'sword' ? swordByName(item.name) : DEFENSIVE_ARTIFACTS.find(g => g.name === item.name)
  if (!recipe?.craftCost || !recipe.craftSeconds) return null
  const cost = craftCostFor(recipe.craftCost, state.player.element)!
  const pieces = refinePieces(item.refine)
  return {
    cost: cost.map(v => Math.ceil(v * pieces * 2 / 3)) as unknown as FiveQi,
    seconds: craftSeconds(recipe.craftSeconds * pieces, item.kind, state.player.body[BODY_HAND] ?? 0),
  }
}

export function startRepair(state: GameState, artifactId: string): CraftResult {
  const item = state.player.artifacts.find(a => a.id === artifactId)
  const plan = repairPlan(state, artifactId)
  if (!item || !plan || (item.kind !== 'sword' && item.kind !== 'guard')) return { ok: false, reason: '这件法宝无法修理' }
  if (item.status !== '损坏') return { ok: false, reason: '只能修理损坏的法宝' }
  const id = CRAFT_QUEUE_ID[item.kind]
  if (state.timeline.events.some(e => e.id === id)) return { ok: false, reason: '该类法宝正在炼制或修理中' }
  if (!canAfford(state.player.qi, plan.cost)) return { ok: false, reason: '修理所需真气不足' }
  return { ok: true, state: {
    ...state,
    player: { ...state.player, qi: subQi(state.player.qi, plan.cost),
      daoxing: state.player.daoxing + totalQi(plan.cost),
      artifacts: state.player.artifacts.map(a => a.id === artifactId ? { ...a, status: '修理中' } : a),
    },
    timeline: schedule(state.timeline, { id, kind: 'craft', finishAt: state.clock.gameT + plan.seconds,
      payload: { op: 'repair', artifactId, kind: item.kind, name: item.name, quality: item.quality, count: 0 },
    }),
  } }
}

/** 炼制完成：成品进背包。 */
export function resolveCraft(state: GameState, event: GameEvent): GameState {
  if (event.payload['op'] === 'repair') return { ...state, player: { ...state.player,
    artifacts: state.player.artifacts.map(a => a.id === event.payload['artifactId'] && a.status === '修理中' ? { ...a, status: '空闲' } : a),
  } }
  const kind = event.payload['kind'] as CraftKind
  const name = event.payload['name'] as string
  const count = event.payload['count'] as number
  const quality = event.payload['quality'] as Quality
  const qualities = event.payload['qualities'] as readonly Quality[] | undefined

  const made: Artifact[] = Array.from({ length: count }, (_, i) => ({
    id: `${kind}:${event.finishAt}:${i}`,
    kind: kind === 'pill' ? 'pill' : kind === 'guard' ? 'guard' : 'sword',
    name,
    quality: qualities?.[i] ?? quality,
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
  // 状态也要查。在外面打架的剑被淬掉，时间线上的 swordIds 就指向一个不存在的法宝，
  // 返航时状态永远卡在「斩杀中」；反过来「空闲」+「损坏」淬出来继承第一件的状态，
  // 等于一次免费修理。UI 只列空闲的，所以这道守只对引擎/存档这条路生效。
  if (a.status !== '空闲' || b.status !== '空闲') {
    return { ok: false, reason: '只能淬炼空闲的法宝' }
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
