/**
 * 存档里的世界状态。
 *
 * 设计要点（`docs/spec/DECISIONS.md` §3.6–3.8）：
 *  - 一切时间用 `clock.gameT`（秒），不读墙钟；
 *  - 生成器的产物（地形、NPC 基础记录）入档，代码改了也不会让旧档错位；
 *  - 整个结构必须可 JSON 序列化：不放 Map/Set/函数/Date。
 */

import type { Clock } from './clock.ts'
import type { Timeline } from './timeline.ts'
import type { RngState } from './rng.ts'
import type { Element } from '../data/meridian.ts'
import type { NpcWorld } from './npc.ts'
import type { QuestLog } from './quest.ts'
import type { Market } from './market.ts'
import type { Town } from './town.ts'

export type School = '蜀山' | '昆仑' | '通天'

/** 五行数值，顺序恒为 金木水火土（与界面显示一致）。 */
export type FiveQi = readonly [number, number, number, number, number]

export const ZERO_QI: FiveQi = [0, 0, 0, 0, 0]

export type Realm = '筑基期' | '辟谷期' | '心动期' | '金丹期' | '元婴期'

export const REALMS: readonly Realm[] = ['筑基期', '辟谷期', '心动期', '金丹期', '元婴期']

/** 一件法宝。 */
export type Artifact = {
  readonly id: string
  readonly kind: 'sword' | 'guard' | 'pill' | 'book' | 'misc'
  /** 飞剑/护身的名称，如「青龙伏魔剑」 */
  readonly name: string
  readonly quality: '废品' | '凡品' | '上品' | '极品'
  readonly refine: number
  /** 空闲 / 损坏 / 斩杀中 / 绞杀中 / 返回中 / 淬炼中 / 炼制中 / 注入中 / 修理中 */
  readonly status: string
  /** 同种物品堆叠数量 */
  readonly count: number
}

export type Player = {
  readonly name: string
  readonly gender: 'm' | 'f'
  readonly element: Element
  readonly school: School
  readonly realm: Realm
  /** 当前位置 */
  readonly x: number
  readonly y: number
  /** 丹田里的五行真气 */
  readonly qi: FiveQi
  /** 12 条经脉等级，顺序同 `MERIDIANS` */
  readonly meridians: readonly number[]
  /** 8 项本体等级：穷千里目/炼体成钢/心静通灵/袖里乾坤/固本培元/丹田气海/手熟无他/行万里路 */
  readonly body: readonly number[]
  /** 法术等级，按法术 id */
  readonly skills: Readonly<Record<string, number>>
  /** 累计消耗的真气 = 道行（点）。1 年 = 4380 点 */
  readonly daoxing: number
  readonly experience: number
  readonly silver: number
  /** 普通仙石（充值/卖法宝）与附加仙石（每周工资/新手卡）。扣除时先扣附加。 */
  readonly coin: number
  readonly bonusCoin: number
  readonly artifacts: readonly Artifact[]
  /**
   * VIP。原版是充值功能（多一条修炼队列、多 5 个法宝格）；
   * 单机版做成「怀旧版设置」里的开关，规则本身照原版。
   */
  readonly vip: boolean
  /** 建号时刻（游戏秒），用于保护期「建号 10 天」 */
  readonly createdAt: number
}

export type GameState = {
  /** 存档格式版本，与 `save.ts` 的 SAVE_VERSION 对应 */
  readonly v: number
  readonly clock: Clock
  readonly timeline: Timeline
  readonly rng: RngState
  readonly player: Player
  /** 世界生成种子；地形按需由种子算，但特殊地点表入档 */
  readonly worldSeed: number
  /** NPC 生态：基础记录入档，状态由纯函数按游戏日算出（见 `npc.ts`） */
  readonly npc: NpcWorld
  /** 任务进度 */
  readonly quests: QuestLog
  /** 市场挂单：自己的 + NPC 的（`market.ts` 负责补货与结算） */
  readonly market: Market
  /** 去过的城镇（按 `x,y` 索引）。没去过的城镇不入档，踩上去才生成 */
  readonly towns: Readonly<Record<string, Town>>
  /** 收件箱，上限 200 封（`docs/spec/DECISIONS.md` §2 的体积预算） */
  readonly mail: readonly MailItem[]
}

export type MailItem = {
  readonly id: string
  readonly subject: string
  readonly from: string
  /** 游戏时间秒 */
  readonly at: number
  readonly read: boolean
  /** 结构化正文，不存 HTML（存档体积与安全考虑） */
  readonly body: Readonly<Record<string, unknown>>
  readonly kind: 'battle' | 'system' | 'divine' | 'player'
}

// —— 真气的加减 ——

export const addQi = (a: FiveQi, b: FiveQi): FiveQi =>
  [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3], a[4] + b[4]] as const

export const subQi = (a: FiveQi, b: FiveQi): FiveQi =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3], a[4] - b[4]] as const

/** 五行都够不够付。 */
export const canAfford = (have: FiveQi, cost: FiveQi): boolean =>
  have.every((v, i) => v >= cost[i]!)

/** 按丹田上限截断（五行共用一个上限）。 */
export const clampQi = (q: FiveQi, cap: number): FiveQi =>
  q.map((v) => Math.max(0, Math.min(cap, v))) as unknown as FiveQi

/** 总真气，用来估道行消耗。 */
export const totalQi = (q: FiveQi): number => q.reduce((a, b) => a + b, 0)

// —— 道行 ——
// [原文]「每消耗 1 真气加 1 时辰」，12 时辰 = 1 天，365 天 = 1 年 → 1 年 = 4380 点。
// 出保条件：道行 18 年（= 78840 点）或建号满 10 天，先到者出保。

export const DAOXING_PER_YEAR = 4380
export const PROTECTION_YEARS = 18
export const PROTECTION_POINTS = PROTECTION_YEARS * DAOXING_PER_YEAR // 78840
export const PROTECTION_DAYS = 10

export const daoxingYears = (points: number): number => points / DAOXING_PER_YEAR

/** 道行的中文写法，排行榜用，如「九年零二个月」。 */
export function daoxingText(points: number): string {
  const totalMonths = Math.floor((points / DAOXING_PER_YEAR) * 12)
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const cn = (n: number): string => {
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
    if (n < 10) return digits[n]!
    if (n < 20) return n === 10 ? '十' : `十${digits[n % 10]}`
    return `${digits[Math.floor(n / 10)]}十${n % 10 ? digits[n % 10] : ''}`
  }
  if (years === 0) return `${cn(months)}个月`
  if (months === 0) return `${cn(years)}年`
  return `${cn(years)}年零${cn(months)}个月`
}

/** 是否已出保护期。 */
export function isOutOfProtection(player: Player, nowGameT: number, daySeconds: number): boolean {
  if (player.daoxing >= PROTECTION_POINTS) return true
  return nowGameT - player.createdAt >= PROTECTION_DAYS * daySeconds
}
