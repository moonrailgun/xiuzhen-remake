/**
 * 掠夺与击退。
 *
 * 【照原版】：
 *  - 赢了抢对方真气，但**超出「固本培元」暗仓的部分**才抢得走 [原文]；
 *  - 固本培元旧名「韬光养晦」，2008-09-25 改名并提高消耗 [原文]；
 *  - 被打时**挂在市场的单自动取消并可被掠夺**；主动购买在途的真气不在身上，抢不到 [原文]；
 *  - 命中会把对方**击退到附近 1–4 格**——这就是飞剑「击退」属性的效果 [原文+推断]；
 *  - 吸到的真气**等飞剑飞回来才入丹田** [原文]。
 *
 * 【只能重建】：击退距离与「击退」属性的具体关系；掠夺比例。
 */

import { rand, randInt } from './rng.ts'
import { makeCurve, type Anchor } from '../data/curve.ts'
import { WORLD_SIZE } from '../data/world.ts'
import type { FiveQi } from './state.ts'

/**
 * 固本培元的暗仓容量（每种真气）。[按推断 —— 5 个锚点插值]
 *
 * 锚点出处：`docs/research/02-guides-and-rules.md` §1.5：
 * Lv9=1000、Lv12=1800、Lv13=2100、Lv16=3700、Lv20=8000（满级）。
 * 玩家原话「固本所能保存的真气上限（即 4W）」= 8000 × 5 种。
 */
const ROOT_ANCHORS: readonly Anchor[] = [
  { level: 1, value: 100, source: 'reconstructed（低级段无锚点）' },
  { level: 9, value: 1000, source: 'docs/research/02-guides-and-rules.md §1.5' },
  { level: 12, value: 1800, source: '同上（DECISIONS-rules §4 裁定为 12 级）' },
  { level: 13, value: 2100, source: '同上' },
  { level: 16, value: 3700, source: '同上' },
  { level: 20, value: 8000, source: '同上（满级；五种合计 4 万）' },
]

const rootCurve = makeCurve(ROOT_ANCHORS)

/** 固本培元第 N 级能护住多少（每种真气）。 */
export const vaultCapacity = (rootLevel: number): number =>
  rootLevel <= 0 ? 0 : rootCurve(Math.min(rootLevel, 20))

/**
 * 算一次掠夺能抢走多少。
 *
 * 规则：只有超出暗仓的部分可被抢；抢走的比例按胜方战力占比 [重建]。
 *
 * @param theirQi 对方丹田里的五行真气
 * @param theirRootLevel 对方的固本培元等级
 * @param ratio 抢走可掠夺部分的比例（0–1），默认全抢
 */
export function lootFrom(
  theirQi: FiveQi,
  theirRootLevel: number,
  ratio = 1,
): { readonly taken: FiveQi; readonly left: FiveQi } {
  const vault = vaultCapacity(theirRootLevel)
  const taken: number[] = []
  const left: number[] = []
  for (const v of theirQi) {
    const exposed = Math.max(0, v - vault)
    const got = Math.floor(exposed * Math.max(0, Math.min(1, ratio)))
    taken.push(got)
    left.push(v - got)
  }
  return { taken: taken as unknown as FiveQi, left: left as unknown as FiveQi }
}

/**
 * 击退：被命中的一方被强制位移到附近 1–4 格。[原文]
 * 受伤信里的落点与攻击坐标相差 1–4 格，例「(84,81)的冰城镇」「(85,77)的平原」。
 * 与飞剑「击退」属性的具体关系 [未知]，这里按属性值放大距离。
 */
export function knockback(
  x: number,
  y: number,
  seed: number,
  key: string | number,
  knockbackStat = 2,
): { x: number; y: number } {
  // 原文观察到的范围是 1–4 格
  const dist = 1 + randInt(Math.max(1, Math.min(4, knockbackStat)), seed, 'kbdist', key)
  const dir = randInt(4, seed, 'kbdir', key)
  const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][dir]!
  return {
    x: Math.max(0, Math.min(WORLD_SIZE - 1, x + dx * dist)),
    y: Math.max(0, Math.min(WORLD_SIZE - 1, y + dy * dist)),
  }
}

/**
 * 受伤信（防御方收到）。文案照原版逐字
 * （`docs/research/03-forum-verbatim-mining.md` §1.3）。
 */
export const woundedText = (params: {
  readonly attacker: string
  readonly quality: string
  readonly sword: string
  readonly refine: number
  readonly x: number
  readonly y: number
  readonly place: string
}): string =>
  `　　${params.attacker}的${params.quality}${params.sword}` +
  `${params.refine > 0 ? `+${params.refine}` : ''}向你飞来，仓促之间，你无从抵挡，` +
  `受了伤向附近(${params.x},${params.y})的${params.place}中逃去。\n` +
  `　　你感觉到伤口火辣辣的痛，体内的真气不由自主的向外逸去……`

export const WOUNDED_TABLE_TITLE = '被飞剑刺伤失去的真气'

/**
 * 吸气信（攻击方收到）。文案照原版逐字。
 */
export const absorbText = (params: {
  readonly target: string
  readonly quality: string
  readonly sword: string
  readonly refine: number
  readonly x: number
  readonly y: number
  readonly place: string
}): string => {
  const full = `${params.quality}${params.sword}${params.refine > 0 ? `+${params.refine}` : ''}`
  return (
    `你的${full}向${params.target}飞去，仓促之间，他无从抵挡，` +
    `受了剑伤向附近(${params.x},${params.y})的${params.place}中逃去。\n` +
    `　　 ${full}在空中盘旋一圈，将他因受伤而逸出体外的真气尽数吸入刻于其上的聚灵阵中。` +
    `当它折返回你的身边后，聚灵阵中的真气将自动汇入你的丹田。`
  )
}

export const ABSORB_TABLE_TITLE = '飞剑聚灵阵中吸收的真气'

/** 吸到的真气要等剑飞回来才入丹田 [原文]，所以先挂在「在途」里。 */
export type PendingLoot = {
  readonly qi: FiveQi
  /** 飞剑归位的时刻（游戏秒） */
  readonly arriveAt: number
}
