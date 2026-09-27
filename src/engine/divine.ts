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

/** 八种术数。名称与效果出自官方一句话表与技能弹窗原文。 */
export const DIVINATIONS = {
  先天神数: { effect: '推算法宝情况，修炼纯熟后可见法宝状态', school: null },
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
  return myYijing > theirYijing
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
export function taiyi(target: NpcState, at: number, byName: string, kind: '太乙神数' | '先天神数' = '太乙神数', showStatus = true): MailItem {
  const rows = Array.from({ length: target.swords }, (_, i) => ({
    name: `凡品青龙伏魔剑${i > 0 ? `+${i}` : ''}`,
    type: '【飞剑】',
    count: 1,
    ...(showStatus ? { status: '空闲' } : {}),
  }))
  return {
    id: `divine:${at}:${target.base.id}:${kind}`,
    subject: `${byName}推算${target.base.name}`,
    from: '系统',
    at,
    read: false,
    kind: 'divine',
    // 标题原文：`{玩家}拥有的法宝`
    body: { kind, title: `${target.base.name}拥有的法宝`, rows },
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

// —— 另外四种 ——
//
// **结果文案没有存档**（`PAGE-INDEX` 明列为缺口），但**推算什么是官方一句话表写明的**，
// 所以这里按已有三种的体例补写，和全项目对待「逐级消耗表」「世界地形」「NPC 生态」
// 同一个标准：机制照官方说明，文案标 [重建]。
//
// 体例沿用九宫飞星的原文首句 `你掐指一算，发现…`（`03 §1.6` 原文），
// 后面接一张与该术数用途对应的表。

/** 一条推算出来的人。四种新术数共用这个行结构。 */
export type SpyRow = {
  readonly name: string
  readonly realm: string
  readonly daoxing: string
  readonly note: string
}

const mail = (
  at: number,
  byName: string,
  targetName: string,
  id: string,
  body: Readonly<Record<string, unknown>>,
): MailItem => ({
  id: `divine:${at}:${id}`,
  subject: `${byName}推算${targetName}`,
  from: '系统',
  at,
  read: false,
  kind: 'divine',
  body,
})

/**
 * 水镜玄光：按坐标推算在该地修炼的玩家。[文案重建]
 * 官方原话「根据坐标推算在该地修炼的玩家信息」。
 */
export function waterMirror(
  at: number,
  byName: string,
  x: number,
  y: number,
  here: readonly NpcState[],
): MailItem {
  const rows: SpyRow[] = here.map((n) => ({
    name: n.base.name,
    realm: n.realm,
    daoxing: n.daoxingText,
    note: n.suffix === 'm' ? '移动中' : '修炼中',
  }))
  return mail(at, byName, `(${x},${y})`, `${x}:${y}:shuijing`, {
    kind: '水镜玄光',
    lead: `你掐指一算，看清了(${x},${y})的景象。`,
    title: `在(${x},${y})修炼的玩家`,
    rows,
    empty: '此地空无一人。',
  })
}

/**
 * 梅花易数：推算目标的移动情况。[文案重建]
 * 官方原话「推算玩家移动情况」。
 * 去向由 NPC 生成器算**明日位置**得到，所以和地图上看到的完全一致。
 */
export function plumBlossom(
  target: NpcState,
  at: number,
  byName: string,
  tomorrow: { readonly x: number; readonly y: number },
): MailItem {
  const moving = target.x !== tomorrow.x || target.y !== tomorrow.y
  return mail(at, byName, target.base.name, `${target.base.id}:meihua`, {
    kind: '梅花易数',
    lead: `你掐指一算，算出了${target.base.name}的行止。`,
    title: `${target.base.name}的移动情况`,
    rows: [
      { name: '当前位置', realm: '', daoxing: '', note: `(${target.x},${target.y})` },
      moving
        ? { name: '去向', realm: '', daoxing: '', note: `(${tomorrow.x},${tomorrow.y})` }
        : { name: '去向', realm: '', daoxing: '', note: '原地未动' },
    ] satisfies SpyRow[],
  })
}

/**
 * 六壬神定：推算目标的护法列表。[文案重建]
 * 官方原话「可以推算目标的护法列表」（游戏指南·秘笈词条原文）。
 */
export function sixRen(
  target: NpcState,
  at: number,
  byName: string,
  pals: readonly NpcState[],
): MailItem {
  const rows: SpyRow[] = pals.map((n) => ({
    name: n.base.name,
    realm: n.realm,
    daoxing: n.daoxingText,
    note: `${n.swords} 把飞剑`,
  }))
  return mail(at, byName, target.base.name, `${target.base.id}:liuren`, {
    kind: '六壬神定',
    lead: `你掐指一算，算出了${target.base.name}身边的护法。`,
    title: `${target.base.name}的护法`,
    rows,
    empty: '此人身边并无护法。',
  })
}

/**
 * 诰命真经：推算向目标地点移动的玩家列表。[文案重建]
 * 官方原话「可以推算向目标地点移动的玩家列表」（同上）。
 * 判据：明日位置比今日更靠近该地点，即视为正往这里来。
 */
export function edictSutra(
  at: number,
  byName: string,
  x: number,
  y: number,
  inbound: readonly { readonly npc: NpcState; readonly distance: number }[],
): MailItem {
  const rows: SpyRow[] = inbound.map(({ npc, distance }) => ({
    name: npc.base.name,
    realm: npc.realm,
    daoxing: npc.daoxingText,
    note: `尚有 ${distance} 格`,
  }))
  return mail(at, byName, `(${x},${y})`, `${x}:${y}:gaoming`, {
    kind: '诰命真经',
    lead: `你掐指一算，算出了正往(${x},${y})去的人。`,
    title: `正向(${x},${y})移动的玩家`,
    rows,
    empty: '无人往此地去。',
  })
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
    readonly skills: Readonly<Record<string, number>>
    readonly myYijing: number
    readonly theirYijing: number
    readonly targetMeridians?: readonly number[]
    readonly inSight: boolean
    readonly located: boolean
    /** 水镜玄光 / 诰命真经要推算的坐标 */
    readonly spot?: { readonly x: number; readonly y: number }
    /** 水镜玄光：该坐标上的人 */
    readonly here?: readonly NpcState[]
    /** 梅花易数：目标的明日位置 */
    readonly tomorrow?: { readonly x: number; readonly y: number }
    /** 六壬神定：目标的护法 */
    readonly pals?: readonly NpcState[]
    /** 诰命真经：正往该地点去的人 */
    readonly inbound?: readonly { readonly npc: NpcState; readonly distance: number }[]
  },
): DivineResult {
  const skill = kind === '九宫飞星' ? '九宫飞星法' : kind
  if (!((opts.skills[skill] ?? 0) > 0)) return { ok: false, reason: `尚未学会${skill}` }
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
    case '先天神数':
      // 纯熟阈值原文未留存，以满级20重建；NPC法宝列表沿用现有太乙模型。
      return { ok: true, mail: taiyi(target, opts.at, opts.byName, kind, (opts.skills[kind] ?? 0) >= 20) }
    case '太乙神数':
      return { ok: true, mail: taiyi(target, opts.at, opts.byName) }
    case '紫微斗数':
      return {
        ok: true,
        mail: ziwei(target, opts.at, opts.byName, opts.targetMeridians ?? Array(12).fill(0)),
      }
    case '水镜玄光': {
      const spot = opts.spot
      if (!spot) return { ok: false, reason: '请先在地图上选定要推算的地点' }
      return { ok: true, mail: waterMirror(opts.at, opts.byName, spot.x, spot.y, opts.here ?? []) }
    }
    case '梅花易数':
      return {
        ok: true,
        mail: plumBlossom(target, opts.at, opts.byName, opts.tomorrow ?? { x: target.x, y: target.y }),
      }
    case '六壬神定':
      return { ok: true, mail: sixRen(target, opts.at, opts.byName, opts.pals ?? []) }
    case '诰命真经': {
      const spot = opts.spot
      if (!spot) return { ok: false, reason: '请先在地图上选定要推算的地点' }
      return { ok: true, mail: edictSutra(opts.at, opts.byName, spot.x, spot.y, opts.inbound ?? []) }
    }
  }
}
