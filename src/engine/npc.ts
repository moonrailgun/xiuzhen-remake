/**
 * NPC 玩家生态。
 *
 * **这一块是重新设计，不是还原**：原版一半的乐趣来自真人互抢（羊/小狼/大狼），
 * 单机下只能模拟。规则参考玩家攻略里的画像描述，但数值与行为都是自拟的。
 *
 * 一致性是这里最容易出问题的地方（评审专门点过）：同一个 NPC 在排行榜、个人资料、
 * 太乙神数推算、出击时的实际战力必须对得上，否则玩家一眼就看穿。做法是：
 *
 *   **任意时刻的状态 = 纯函数 f(基础记录, 按游戏日取整的时间) + 存档里的稀疏修正**
 *
 * 所有入口（排行榜/资料/推算/战斗）都只调这一个函数，不各自现算。
 * 位置与每格玩家数按「游戏日」分段不变，所以离线结算可以按日重放。
 */

import { rand, randInt, pick } from './rng.ts'
import { WORLD_SIZE, inWorld } from '../data/world.ts'
import { DAY } from './clock.ts'
import { daoxingText, DAOXING_PER_YEAR, type FiveQi, type Artifact, type GameState } from './state.ts'
import { artifactCombatSword, combatDamage, type SwordOutcome, type CombatSword } from './combat.ts'
import type { GameEvent } from './timeline.ts'

/** NPC 画像。取自玩家攻略里的说法：羊（只修炼不打人）、小狼、大狼。 */
export type NpcProfile = '羊' | '小狼' | '大狼'

/** 存档里存的基础记录，每个 NPC 约 80 字节。 */
export type NpcBase = {
  readonly id: number
  readonly name: string
  readonly profile: NpcProfile
  readonly school: '蜀山' | '昆仑' | '通天'
  readonly element: '金' | '木' | '水' | '火' | '土'
  /** 建号时刻（游戏秒），决定成长起点 */
  readonly bornAt: number
  /** 驻点：羊会长期待着，狼会到处跑 */
  readonly homeX: number
  readonly homeY: number
}

/** 存档里的稀疏修正：只记「与玩家发生过关系」而偏离基线的部分。 */
export type NpcPatch = {
  /** 被玩家毁掉的飞剑数 */
  readonly swordsLost?: number
  /** 被玩家抢走的真气 */
  readonly qiLost?: number
  readonly qiGained?: number
  /** 首次交战后装备落入稀疏修正，破损、降级和在外状态不再凭成长重生。 */
  readonly artifacts?: readonly Artifact[]
  /** 被击退后的位置 */
  readonly x?: number
  readonly y?: number
}

export type NpcWorld = {
  readonly bases: readonly NpcBase[]
  readonly patches: Readonly<Record<number, NpcPatch>>
}

const SURNAMES = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡']
const GIVEN = ['青云', '无涯', '长风', '不归', '若水', '登仙', '问道', '寻真', '踏雪', '凌霄', 'moonlight', '小鱼', '浮生', '望舒', '子规']
const SCHOOLS = ['蜀山', '昆仑', '通天'] as const
const ELEMENTS = ['金', '木', '水', '火', '土'] as const
const PROFILES: readonly NpcProfile[] = ['羊', '羊', '羊', '小狼', '小狼', '大狼']

/** 生成 NPC 名单。数量上限 3000（存档体积预算）。 */
export function generateNpcs(seed: number, count = 300): NpcBase[] {
  const n = Math.min(3000, count)
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `${pick(SURNAMES, seed, 'sur', i)}${pick(GIVEN, seed, 'given', i)}`,
    profile: pick(PROFILES, seed, 'profile', i),
    school: pick(SCHOOLS, seed, 'school', i),
    element: pick(ELEMENTS, seed, 'element', i),
    // 开服前后陆续建号，错开成长起点
    bornAt: randInt(30, seed, 'born', i) * DAY,
    homeX: randInt(WORLD_SIZE, seed, 'hx', i),
    homeY: randInt(WORLD_SIZE, seed, 'hy', i),
  }))
}

/** NPC 在某一刻的完整状态。**所有入口都只用这一个函数。** */
export type NpcState = {
  readonly base: NpcBase
  /** 道行点数 */
  readonly daoxing: number
  readonly daoxingText: string
  readonly realm: '筑基期' | '辟谷期' | '心动期' | '金丹期' | '元婴期'
  /** 带在身上的飞剑数 */
  readonly swords: number
  /** 单把飞剑的战力（攻击面板值） */
  readonly swordPower: number
  readonly artifacts: readonly Artifact[]
  /** 单机重建：最高499级，保留玩家易经500级时的推算空间。 */
  readonly yijing: number
  /** 丹田里的真气（可被掠夺的部分） */
  readonly qi: number
  readonly experience: number
  readonly estate: number
  readonly x: number
  readonly y: number
  /** 状态后缀：n 未出保 / m 移动中 / i 三天未上线 */
  readonly suffix: 'n' | 'm' | 'i' | null
}

/** 成长速度：狼打人抢资源，长得快；羊闷头修炼，长得稳。 */
const GROWTH: Record<NpcProfile, number> = { 羊: 1, 小狼: 1.35, 大狼: 1.9 }

/**
 * 算出某个 NPC 在某一刻的状态。
 *
 * 时间按**游戏日取整**，所以同一天内多次查询结果一致，离线结算也能按日重放。
 */
export function npcAt(world: NpcWorld, base: NpcBase, gameT: number, seed: number): NpcState {
  const day = Math.floor(gameT / DAY)
  const ageDays = Math.max(0, day - Math.floor(base.bornAt / DAY))
  const patch = world.patches[base.id] ?? {}

  // 实力标量：所有派生量都从它出来，保证各入口一致
  const power = ageDays * GROWTH[base.profile] * (0.7 + rand(seed, 'gift', base.id) * 0.6)

  const daoxing = Math.max(0, Math.floor(power * 900))
  const realm =
    daoxing > 60 * DAOXING_PER_YEAR ? '元婴期'
      : daoxing > 40 * DAOXING_PER_YEAR ? '金丹期'
      : daoxing > 25 * DAOXING_PER_YEAR ? '心动期'
      : daoxing > 12 * DAOXING_PER_YEAR ? '辟谷期'
      : '筑基期'

  // NPC 装备成长为单机重建；实体名字/面板复用真实剑表，避免情报和战斗各算一套。
  const count = Math.max(0, Math.min(5, Math.floor(power / 8)) - (patch.swordsLost ?? 0))
  const artifacts: readonly Artifact[] = patch.artifacts ?? Array.from({ length: count }, (_, i) => ({
    id: `npc:${base.id}:sword:${i}`, kind: 'sword', name: base.school === '昆仑' ? '玉虚桃木剑' : base.school === '蜀山' ? '七星磐龙剑' : '青龙伏魔剑',
    quality: '凡品', refine: Math.max(0, Math.floor(Math.log2(1 + power / 10))), status: '空闲', count: 1,
  }))
  const usable = artifacts.filter(a => a.kind === 'sword' && a.status === '空闲')
  const swords = usable.length
  const swordPower = Math.max(0, ...usable.map(a => artifactCombatSword(a)?.attack ?? 0))
  // NPC本来就是单机重建；复用同一实力标量，不把真实玩家失落的成长表当成已知。
  const yijing = Math.min(499, Math.floor(power))
  const qi = Math.max(0, Math.floor(power * 260) - (patch.qiLost ?? 0) + (patch.qiGained ?? 0))

  // 位置：羊待在驻点；狼按日游走。被击退过就用修正位置。
  let x = patch.x ?? base.homeX
  let y = patch.y ?? base.homeY
  if (patch.x === undefined && base.profile !== '羊') {
    const range = base.profile === '大狼' ? 12 : 6
    x = base.homeX + randInt(range * 2 + 1, seed, 'wx', base.id, day) - range
    y = base.homeY + randInt(range * 2 + 1, seed, 'wy', base.id, day) - range
  }
  x = Math.max(0, Math.min(WORLD_SIZE - 1, x))
  y = Math.max(0, Math.min(WORLD_SIZE - 1, y))

  // 出保：道行 18 年或建号 10 天
  const outOfProtection = daoxing >= 18 * DAOXING_PER_YEAR || ageDays >= 10
  const idle = rand(seed, 'idle', base.id, Math.floor(day / 7)) > 0.92
  const suffix = !outOfProtection ? 'n' : idle ? 'i' : null

  return {
    base,
    daoxing,
    daoxingText: daoxingText(daoxing),
    realm,
    swords,
    swordPower,
    artifacts,
    yijing,
    qi,
    experience: Math.floor(power * 4000),
    estate: Math.floor(power * 120),
    x,
    y,
    suffix,
  }
}

export const npcCombatArtifacts = (npc: NpcState): CombatSword[] => npc.artifacts
  .filter(a => a.status === '空闲')
  .map(artifactCombatSword).filter((s): s is CombatSword => s !== null)

export function npcSwordStatus(state: GameState, id: number, swordIds: readonly string[], status: string): GameState {
  const base = state.npc.bases.find(n => n.id === id)
  if (!base) return state
  const npc = npcAt(state.npc, base, state.clock.gameT, state.worldSeed)
  const artifacts = npc.artifacts.map(a => swordIds.includes(a.id) && a.status !== '损坏' ? { ...a, status } : a)
  return { ...state, npc: patchNpc(state.npc, id, { artifacts }) }
}

export function npcCombatDamage(state: GameState, id: number, outcomes: readonly SwordOutcome[], destroyBroken = false, status = '空闲'): GameState {
  const base = state.npc.bases.find(n => n.id === id)
  if (!base) return state
  const npc = npcAt(state.npc, base, state.clock.gameT, state.worldSeed)
  const artifacts = combatDamage(npc.artifacts, outcomes, destroyBroken).map(a =>
    outcomes.some(o => o.id === a.id && !o.broken) ? { ...a, status } : a)
  return { ...state, npc: patchNpc(state.npc, id, { artifacts }) }
}

/** 援助与来袭都走同一返航事件，幸存剑到家后才能再次使用。 */
export function npcReturnEvent(event: GameEvent, npcId: number, swordIds: readonly string[], seconds: number, loot = 0): GameEvent {
  return { id: `raid:return:${event.id}:${npcId}`, kind: 'raid', finishAt: event.finishAt + seconds,
    payload: { phase: 'returning', npcId, swordIds, ...(loot > 0 ? { loot } : {}) } }
}

/** 全部 NPC 在某一刻的状态（排行榜、地图都用它）。 */
export const allNpcsAt = (world: NpcWorld, gameT: number, seed: number): NpcState[] =>
  world.bases.map((b) => npcAt(world, b, gameT, seed))

/** 某一格上有几个 NPC（地图上的人物标记、产量分薄都要用）。 */
export function npcsAtCell(
  world: NpcWorld,
  gameT: number,
  seed: number,
  x: number,
  y: number,
): NpcState[] {
  return allNpcsAt(world, gameT, seed).filter((n) => n.x === x && n.y === y)
}

/** 视野内的 NPC（按曼哈顿距离）。 */
export function npcsInSight(
  world: NpcWorld,
  gameT: number,
  seed: number,
  x: number,
  y: number,
  range: number,
): NpcState[] {
  return allNpcsAt(world, gameT, seed).filter(
    (n) => Math.abs(n.x - x) + Math.abs(n.y - y) <= range,
  )
}

/** 排行榜。原版基准期是 道行/门派/产业/阅历 四榜。 */
export type RankKind = 'daoxing' | 'estate' | 'experience'

export function ranking(
  world: NpcWorld,
  gameT: number,
  seed: number,
  kind: RankKind,
  limit = 20,
): NpcState[] {
  const key = kind === 'daoxing' ? 'daoxing' : kind === 'estate' ? 'estate' : 'experience'
  return [...allNpcsAt(world, gameT, seed)]
    .sort((a, b) => (b[key] as number) - (a[key] as number))
    .slice(0, limit)
}

/** 记录一次「玩家改变了这个 NPC」的修正。 */
export function patchNpc(world: NpcWorld, id: number, patch: NpcPatch): NpcWorld {
  const prev = world.patches[id] ?? {}
  return { ...world, patches: { ...world.patches, [id]: { ...prev, ...patch } } }
}

export { inWorld }
