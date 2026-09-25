/**
 * 术数推算（玩家操作菜单里叫「掐指一算」）。
 *
 * 【照原版】三种结果文案有逐字原文（`docs/research/03-forum-verbatim-mining.md` §1.6）：
 *  - **九宫飞星**：`你掐指一算，发现{名字}正位于({x},{y})。` 后面附目标丹田五行真气与固本培元等级；
 *  - **太乙神数**：标题 `{名字}拥有的法宝`，四列表 `名称 | 类型 | 数量 | 状态`，
 *    类型写作 `【丹药】【飞剑】【书籍】【任务】`；
 *  - **紫微斗数**：标题 `{名字}的经脉修炼情况`，12 行 `经脉名 Lv.N [属性] N倍`，
 *    每组三条只在第一条标属性。
 *
 * 【只能重建】另外四种（水镜玄光、梅花易数、六壬神定、诰命真经）的结果文案没有存档，
 * 只知道各自推算什么（官方一句话表）。
 *
 * 使用条件 [原文]：太乙神数要「能在视野范围内看到对方，或者是用九宫飞星推算出对方的位置
 * （如果对方进行移动则需要重新定位）」。
 */

import { MERIDIANS, multiplier, groupElement, type Element } from '../data/meridian.ts'
import type { NpcState } from './npc.ts'
import type { MailItem, FiveQi } from './state.ts'

/** 七种术数。名称与效果出自官方一句话表与技能弹窗原文。 */
export const DIVINATIONS = {
  九宫飞星: { effect: '根据玩家姓名推算他的位置，以及他的真气', school: null },
  太乙神数: { effect: '推算玩家拥有的法宝情况', school: '通天' },
  紫微斗数: { effect: '推算目标的经脉等级', school: null },
  水镜玄光: { effect: '根据坐标推算在该地修炼的玩家信息', school: null },
  梅花易数: { effect: '推算玩家移动情况', school: '蜀山' },
  六壬神定: { effect: '推算目标的护法列表', school: null },
  诰命真经: { effect: '推算向目标地点移动的玩家列表', school: null },
} as const

export type DivinationKind = keyof typeof DIVINATIONS

export type DivineResult =
  | { readonly ok: true; readonly mail: MailItem }
  | { readonly ok: false; readonly reason: string }

/**
 * 推算成功与否取决于术数修为（易经等级）的高低。[原文]
 * 「九宫飞星法（输入玩家名推算其位置，要求己方术数修为高于对方）」；
 * 易经「每高 1 点，对方推算成功率 −10%」。
 */
export function divineSucceeds(myYijing: number, theirYijing: number): boolean {
  return myYijing >= theirYijing
}

/** 九宫飞星：位置 + 丹田真气 + 固本培元等级。 */
export function flyingStar(
  target: NpcState,
  at: number,
  byName: string,
): MailItem {
  // 原文三段连在一起
  const line = `你掐指一算，发现${target.base.name}正位于(${target.x},${target.y})。`
  const qi: FiveQi = [
    Math.floor(target.qi * 0.2), Math.floor(target.qi * 0.2), Math.floor(target.qi * 0.2),
    Math.floor(target.qi * 0.2), Math.floor(target.qi * 0.2),
  ] as unknown as FiveQi
  return {
    id: `divine:${at}:${target.base.id}:fly`,
    // 消息主题原文：`{推算者}推算{目标}`
    subject: `${byName}推算${target.base.name}`,
    from: '系统',
    at,
    read: false,
    kind: 'divine',
    body: {
      kind: '九宫飞星',
      line,
      x: target.x,
      y: target.y,
      qi,
      // 「固本培元」是暗仓，推算能看到等级
      rootLevel: Math.max(0, Math.floor(target.daoxing / 20000)),
    },
  }
}

/** 太乙神数：法宝列表（名称/类型/数量/状态）。 */
export function taiyi(target: NpcState, at: number, byName: string): MailItem {
  const rows = Array.from({ length: target.swords }, (_, i) => ({
    name: `凡品青龙伏魔剑${i > 0 ? `+${i}` : ''}`,
    type: '【飞剑】',
    count: 1,
    status: '空闲',
  }))
  return {
    id: `divine:${at}:${target.base.id}:taiyi`,
    subject: `${byName}推算${target.base.name}`,
    from: '系统',
    at,
    read: false,
    kind: 'divine',
    // 标题原文：`{玩家}拥有的法宝`
    body: { kind: '太乙神数', title: `${target.base.name}拥有的法宝`, rows },
  }
}

/**
 * 紫微斗数：12 条经脉的等级与倍率。
 * 原文格式：`经脉名 Lv.N [属性] N倍`，每组三条只在第一条标属性。
 */
export function ziwei(
  target: NpcState,
  at: number,
  byName: string,
  levels: readonly number[],
): MailItem {
  let lastGroup = ''
  const rows = MERIDIANS.map((m, i) => {
    const lv = levels[i] ?? 0
    const showElement = m.group !== lastGroup
    lastGroup = m.group
    return {
      name: m.name,
      level: lv,
      element: showElement ? groupElement(target.base.element as Element, m.group) : '',
      multiplier: multiplier(lv),
    }
  })
  return {
    id: `divine:${at}:${target.base.id}:ziwei`,
    subject: `${byName}推算${target.base.name}`,
    from: '系统',
    at,
    read: false,
    kind: 'divine',
    // 标题原文：`{目标}的经脉修炼情况`
    body: { kind: '紫微斗数', title: `${target.base.name}的经脉修炼情况`, rows },
  }
}

/**
 * 统一入口。
 *
 * @param myYijing 我方易经等级（术数修为）
 * @param theirYijing 对方易经等级
 */
export function divine(
  kind: DivinationKind,
  target: NpcState,
  opts: {
    readonly at: number
    readonly byName: string
    readonly myYijing: number
    readonly theirYijing: number
    readonly targetMeridians?: readonly number[]
    readonly inSight: boolean
    readonly located: boolean
  },
): DivineResult {
  if (!divineSucceeds(opts.myYijing, opts.theirYijing)) {
    return { ok: false, reason: '你的术数修为不及对方，推算失败' }
  }
  // 太乙神数要先看到人或先定位 [原文]
  if (kind === '太乙神数' && !opts.inSight && !opts.located) {
    return { ok: false, reason: '需要先看到对方，或用九宫飞星推算出对方的位置' }
  }

  switch (kind) {
    case '九宫飞星':
      return { ok: true, mail: flyingStar(target, opts.at, opts.byName) }
    case '太乙神数':
      return { ok: true, mail: taiyi(target, opts.at, opts.byName) }
    case '紫微斗数':
      return {
        ok: true,
        mail: ziwei(target, opts.at, opts.byName, opts.targetMeridians ?? Array(12).fill(0)),
      }
    default:
      // 其余四种没有结果文案的原文
      return { ok: false, reason: `${kind}的推算结果在后续版本开放` }
  }
}
