/**
 * GM 面板的引擎侧：把一份「想改成什么样」的补丁安全地落到存档上。
 *
 * **这不是原版的东西**，原版没有也不可能有这种页面。放在这里只因为单机版改数值
 * 是正当需求（想直接看后期内容、想复现一个 bug、想跳过几十小时的修炼）。
 *
 * 唯一的设计原则：**GM 改出来的存档必须和正常玩出来的存档一样合法。**
 * 这个项目刚刚花了一整轮把「上限被绕过」的三条路堵上（袖里乾坤、经脉/本体等级、
 * 法宝状态），GM 面板要是直接往 state 上糊，等于把那些 bug 从第四条路放回来：
 * 真气超过丹田会在下一次 gainQi 时被悄悄抹平、经脉 21 级纯亏、法宝超格之后
 * 炼器和购买全被拒。所以这里**不提供「无视上限」的开关**，超了就收拢，
 * 并把收拢了哪几项如实报给使用者。
 *
 * 落盘前再过一遍 `validateGameState`：宁可整份补丁被拒，也不写出一个读不回来的存档。
 */

import {
  REALMS,
  clampQi,
  floorQi,
  type Artifact,
  type FiveQi,
  type GameState,
  type Player,
  type Realm,
  type School,
} from './state.ts'
import {
  BODY_DANTIAN,
  BODY_MAX_LEVEL,
  BODY_PARTS,
  DANTIAN_MAX_LEVEL,
  capacityOf,
} from './cultivate.ts'
import { artifactCapacity, artifactSpaceUsed } from './craft.ts'
import { validateGameState } from './game.ts'
import { ELEMENTS, MERIDIANS, MAX_LEVEL as MERIDIAN_MAX_LEVEL, MAX_LEVEL_BEFORE_XINDONG, type Element } from '../data/meridian.ts'
import { SKILL_TREES } from '../data/skills.ts'
import { WORLD_SIZE } from '../data/world.ts'
import { ITEM_STATUSES } from '../pages/item.ts'

export const SCHOOLS: readonly School[] = ['蜀山', '昆仑', '通天']

/** 一份补丁，全部可选；没写的字段保持原样。 */
export type GmPatch = {
  readonly name?: string
  readonly gender?: 'm' | 'f'
  readonly element?: Element
  readonly school?: School
  readonly realm?: Realm
  readonly x?: number
  readonly y?: number
  /** 五行真气，长度 5 */
  readonly qi?: readonly number[]
  readonly silver?: number
  readonly coin?: number
  readonly bonusCoin?: number
  readonly daoxing?: number
  readonly experience?: number
  /** 12 条经脉等级 */
  readonly meridians?: readonly number[]
  /** 8 项本体等级 */
  readonly body?: readonly number[]
  /** 法术等级，按法术**名称** */
  readonly skills?: Readonly<Record<string, number>>
  readonly vip?: boolean
  /** 全量替换背包 */
  readonly artifacts?: readonly Artifact[]
  /** 清空修炼/炼器/战斗/移动等全部待办事件 */
  readonly clearEvents?: boolean
}

export type GmResult =
  | { readonly ok: true; readonly state: GameState; readonly notes: readonly string[] }
  | { readonly ok: false; readonly reason: string }

/** 经脉上限随境界变：心动期之前 13，之后 20（`meridian.ts` 两条都是原文）。 */
export const meridianCapFor = (realm: Realm): number =>
  REALMS.indexOf(realm) < REALMS.indexOf('心动期') ? MAX_LEVEL_BEFORE_XINDONG : MERIDIAN_MAX_LEVEL

/** 第 i 项本体的上限：丹田气海 36，其余 20。 */
export const bodyCapFor = (index: number): number =>
  index === BODY_DANTIAN ? DANTIAN_MAX_LEVEL : BODY_MAX_LEVEL

/** 所有法术的上限表（按名称）。 */
export const skillCaps = (): ReadonlyMap<string, number> =>
  new Map(Object.values(SKILL_TREES).flat().map((n) => [n.name, n.cap]))

const int = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback

/**
 * 补丁没给这个字段就**原样留着**，不要顺手取整。
 *
 * 真气、道行这些在正常游戏里是逐段累加出来的浮点（在线推 30 天会得到
 * `17279.99999999274`）。以前不管补丁有没有给都走一遍 `Math.floor`，于是
 * 「打开面板什么都不改、直接点应用」每种真气凭空少 1 点。
 */
const patched = (given: number | undefined, current: number): number =>
  given === undefined ? current : int(given, current)

/** 夹到 [lo, hi]，夹住了就记一笔。 */
function clamp(value: number, lo: number, hi: number, label: string, notes: string[]): number {
  if (value < lo) { notes.push(`${label} 收到 ${lo}（不能小于 ${lo}）`); return lo }
  if (value > hi) { notes.push(`${label} 收到 ${hi}（上限 ${hi}）`); return hi }
  return value
}

/**
 * 应用补丁。
 *
 * 顺序是有讲究的：**先改等级和开关，再按新的上限夹资源**。
 * 丹田气海决定真气上限、袖里乾坤与 VIP 决定法宝格数 —— 反过来做的话，
 * 「把丹田从 0 升到 36 同时把真气拉满」这种最常见的操作会按旧上限被砍掉。
 */
export function applyGm(state: GameState, patch: GmPatch): GmResult {
  const notes: string[] = []
  const p = state.player

  // —— 1. 身份 ——
  const name = patch.name === undefined ? p.name : patch.name.trim()
  if (!name) return { ok: false, reason: '名字不能为空' }
  if ([...name].length > 12) return { ok: false, reason: '名字最多 12 个字' }
  if (patch.element !== undefined && !ELEMENTS.includes(patch.element)) {
    return { ok: false, reason: `没有「${patch.element}」这种本命属性` }
  }
  if (patch.school !== undefined && !SCHOOLS.includes(patch.school)) {
    return { ok: false, reason: `没有「${patch.school}」这个道源` }
  }
  if (patch.realm !== undefined && !REALMS.includes(patch.realm)) {
    return { ok: false, reason: `没有「${patch.realm}」这个境界` }
  }
  const realm = patch.realm ?? p.realm

  // —— 2. 等级：经脉 / 本体 / 法术 ——
  const meridians = (patch.meridians ?? p.meridians).map((v, i) =>
    clamp(int(v, 0), 0, meridianCapFor(realm), `经脉「${MERIDIANS[i]?.name ?? i}」`, notes))
  if (meridians.length !== MERIDIANS.length) {
    return { ok: false, reason: `经脉必须是 ${MERIDIANS.length} 条` }
  }

  const body = (patch.body ?? p.body).map((v, i) =>
    clamp(int(v, 0), 0, bodyCapFor(i), `本体「${BODY_PARTS[i] ?? i}」`, notes))
  if (body.length !== BODY_PARTS.length) {
    return { ok: false, reason: `本体必须是 ${BODY_PARTS.length} 项` }
  }

  // 补丁没给法术就原样留着 —— 连「丢掉表里没有的法术」这种好意也不做。
  // 空补丁必须是恒等，否则「打开面板什么都不改直接点应用」会悄悄改掉存档。
  let skills = p.skills
  if (patch.skills !== undefined) {
    const caps = skillCaps()
    const next: Record<string, number> = {}
    for (const [key, raw] of Object.entries(patch.skills)) {
      const cap = caps.get(key)
      // 未知法术直接丢掉：`skillUpgradeBlockReason` 会因为找不到节点而永远拒绝升级，
      // 留在存档里只是一条永远动不了的死数据。
      if (cap === undefined) { notes.push(`丢弃了不存在的法术「${key}」`); continue }
      const level = clamp(int(raw, 0), 0, cap, `法术「${key}」`, notes)
      if (level > 0) next[key] = level
    }
    skills = next
  }

  const vip = patch.vip ?? p.vip

  // —— 3. 位置与数值 ——
  const x = clamp(patched(patch.x, p.x), 0, WORLD_SIZE - 1, '横坐标', notes)
  const y = clamp(patched(patch.y, p.y), 0, WORLD_SIZE - 1, '纵坐标', notes)
  const MAX_MONEY = Number.MAX_SAFE_INTEGER
  const silver = clamp(patched(patch.silver, p.silver), 0, MAX_MONEY, '银两', notes)
  const coin = clamp(patched(patch.coin, p.coin), 0, MAX_MONEY, '普通仙石', notes)
  const bonusCoin = clamp(patched(patch.bonusCoin, p.bonusCoin), 0, MAX_MONEY, '附加仙石', notes)
  const daoxing = clamp(patched(patch.daoxing, p.daoxing), 0, MAX_MONEY, '道行', notes)
  const experience = clamp(patched(patch.experience, p.experience), 0, MAX_MONEY, '阅历', notes)

  // —— 4. 法宝 ——
  // 同上：补丁没给就原样留着，不去重、不取整。
  let artifacts: readonly Artifact[] = p.artifacts
  if (patch.artifacts !== undefined) {
    const seen = new Set<string>()
    const next: Artifact[] = []
    for (const a of patch.artifacts) {
      if (seen.has(a.id)) { notes.push(`丢弃了重复的法宝 id「${a.id}」`); continue }
      if (!(ITEM_STATUSES as readonly string[]).includes(a.status)) {
        return { ok: false, reason: `法宝「${a.name}」的状态「${a.status}」不是九种状态之一` }
      }
      seen.add(a.id)
      next.push({ ...a, refine: Math.max(0, int(a.refine, 0)), count: Math.max(1, int(a.count, 1)) })
    }
    artifacts = next
  }

  // —— 5. 按**新的**上限夹资源 ——
  const draft: GameState = {
    ...state,
    player: {
      ...p,
      name,
      gender: patch.gender ?? p.gender,
      element: patch.element ?? p.element,
      school: patch.school ?? p.school,
      realm,
      x, y, silver, coin, bonusCoin, daoxing, experience, vip,
      meridians, body, skills, artifacts,
    } satisfies Player,
    ...(patch.clearEvents ? { timeline: { events: [] } } : {}),
  }

  const qiCap = capacityOf(draft)
  if (patch.qi !== undefined && patch.qi.length !== 5) {
    return { ok: false, reason: '五行真气必须是 5 个数' }
  }
  // 没给就原样带过去（正常游戏里它是浮点，取整会白丢将近 1 点）；
  // 给了就用 `floorQi` —— 顶栏显示的也是它，面板填什么就该得到什么。
  const qiIn: readonly number[] = patch.qi ?? p.qi
  const qi = clampQi(
    (patch.qi === undefined ? [...qiIn] : qiIn.map((v) => floorQi(int(v, 0)))) as unknown as FiveQi,
    qiCap,
  )
  for (let i = 0; i < 5; i++) {
    if ((qiIn[i] ?? 0) > qiCap) { notes.push(`${ELEMENTS[i]}真气 收到丹田上限 ${qiCap}`); break }
  }

  // 法宝格：炼器队列里在炼的那些也占位置（`artifactSpaceUsed`）。
  //
  // **超格就整份拒绝，绝不替使用者丢东西。** 数值收拢是面板明说过的，销毁法宝不是。
  // 以前这里是个 `while (超格 && 还有得丢) pop()` 的裁剪循环，有两个后果：
  //  1. 光是炼器队列就超格时（关掉 VIP、把袖里乾坤降回 0），它会把背包**清空**之后放弃，
  //     法宝永久销毁，而占用依然超标 —— 此后炼制/购买/换银票全被 `canAcquireArtifacts` 拒；
  //  2. 明明没做到，却还返回 `ok`。
  const slots = artifactCapacity(draft)
  const used = artifactSpaceUsed(draft)
  if (used > slots) {
    const queued = used - artifacts.reduce((n, a) => n + a.count, 0)
    return {
      ok: false,
      reason: `法宝会超出袖里乾坤的格数（要占 ${used} 格，只有 ${slots} 格`
        + (queued > 0 ? `，其中炼器队列占了 ${queued} 格` : '')
        + '）。请先减少法宝、清空炼器队列，或者别把格数调这么小。',
    }
  }

  const next: GameState = {
    ...draft,
    player: { ...draft.player, qi, artifacts },
  }

  // —— 6. 最后一道闸：改出来的存档必须读得回来 ——
  try {
    validateGameState(JSON.parse(JSON.stringify(next)))
  } catch (e) {
    return { ok: false, reason: `改完的存档过不了校验：${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true, state: next, notes }
}
