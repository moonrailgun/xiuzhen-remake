/**
 * 城镇玩法：押镖、读书、钱庄、投资、驿站。
 *
 * 原版里这几件事全在「场景中的 NPC」栏点开：村/镇/城各有镖局老板、私塾先生、
 * 钱庄掌柜、村长(镇长/太守)，城池另有驿站与李员外。数值与对话见 `src/data/town.ts`。
 *
 * 证据强弱差很多：**商业等级表、书籍阅历表、镖局对话**是原文；
 * **运镖佣金公式、运镖耗时、驿站价目**是重建（`town.ts` 里逐条标了）。
 *
 * 城镇保存在 `GameState.towns`；投资操作返回新城镇，由调用方更新对应条目。
 */

import { schedule, cancel, type GameEvent } from './timeline.ts'
import type { Artifact, GameState } from './state.ts'
import { spendCoin, type StartResult } from './cultivate.ts'
import { activeQuests, paySilver } from './quest.ts'
import { inWorld } from '../data/world.ts'
import {
  BANK_NOTES,
  ESCORT_CANCEL_COIN,
  ESCORT_SECONDS_PER_CELL,
  READ_BOOK_SILVER,
  RENAME_LENGTH,
  STATION_COST_COIN,
  commerceLevelOf,
  commerceRow,
  distanceOf,
  escortFee,
  findBook,
  findNote,
  type TownKind,
} from '../data/town.ts'

// —— 城镇与投资 ——

export type Investment = { readonly owner: string; readonly silver: number }

export type Town = {
  readonly id: string
  readonly kind: TownKind
  /** 玩家可见的专名，如「地球镇」「无名村」 */
  readonly name: string
  readonly x: number
  readonly y: number
  readonly investments: readonly Investment[]
}

export const totalInvested = (town: Town): number =>
  town.investments.reduce((a, b) => a + b.silver, 0)

/** 当前商业等级（0 = 还没人投）。 */
export const commerceLevel = (town: Town): number =>
  commerceLevelOf(town.kind, totalInvested(town))

/** 全镇总产出（两/小时）。 */
export const townIncome = (town: Town): number =>
  commerceRow(town.kind, commerceLevel(town)).income

/** 某人占的份额。官方活动文原文：「投资一笔银两……就可从村庄的收益中抽取一定比例」。 */
export function shareOf(town: Town, owner: string): number {
  const total = totalInvested(town)
  if (total <= 0) return 0
  const mine = town.investments.find((i) => i.owner === owner)?.silver ?? 0
  return mine / total
}

/** 某人每小时的产业收益（两/小时）。产业排行榜显示的就是这个，写作 `11786两/小时`。 */
export const hourlyIncomeOf = (town: Town, owner: string): number =>
  Math.floor(townIncome(town) * shareOf(town, owner))

/** 最大股东。并列时取先投的（投资列表按时间序）。 */
export function topInvestor(town: Town): Investment | null {
  let best: Investment | null = null
  for (const i of town.investments) if (!best || i.silver > best.silver) best = i
  return best
}

/** 最多同时投 5 处。[原文-玩家经验] `reference/text/guides/45336-p5.txt`「分散成 5 个最好」 */
export const MAX_INVESTMENTS = 5

export type InvestResult =
  | { readonly ok: true; readonly state: GameState; readonly town: Town }
  | { readonly ok: false; readonly reason: string }

/** 投资：花银两换份额。`others` 是玩家已经投过的别的城镇，用来卡 5 处上限。 */
export function invest(
  state: GameState,
  town: Town,
  silver: number,
  others: readonly Town[] = [],
): InvestResult {
  if (!Number.isSafeInteger(silver) || silver <= 0) return { ok: false, reason: '投资金额不正确' }
  if (state.player.silver < silver) return { ok: false, reason: '银两不足' }

  const me = state.player.name
  const already = town.investments.some((i) => i.owner === me)
  const elsewhere = others.filter((t) => t.id !== town.id && t.investments.some((i) => i.owner === me))
  if (!already && elsewhere.length >= MAX_INVESTMENTS) {
    return { ok: false, reason: `最多只能同时投资 ${MAX_INVESTMENTS} 处产业` }
  }

  const investments = already
    ? town.investments.map((i) => (i.owner === me ? { ...i, silver: i.silver + silver } : i))
    : [...town.investments, { owner: me, silver }]

  return {
    ok: true,
    state: { ...state, player: { ...state.player, silver: state.player.silver - silver } },
    town: { ...town, investments },
  }
}

/** 撤回本人全部本金，其他股东的投资保持不变。 */
export function withdrawInvestment(state: GameState, town: Town): InvestResult {
  const mine = town.investments.find(i => i.owner === state.player.name)
  if (!mine) return { ok: false, reason: '你没有投资这处产业' }
  return {
    ok: true,
    state: { ...state, player: { ...state.player, silver: state.player.silver + mine.silver } },
    town: { ...town, investments: town.investments.filter(i => i.owner !== state.player.name) },
  }
}

/** clock 为区间终点；使用累计整数差，让在线小步与离线整段所得一致。 */
export function settleTownIncome(state: GameState, elapsedSeconds: number): GameState {
  if (!(elapsedSeconds > 0)) return state
  const rate = Object.values(state.towns).reduce((sum, t) => sum + hourlyIncomeOf(t, state.player.name), 0)
  const end = state.clock.gameT
  const income = Math.floor(end * rate / 3600) - Math.floor(Math.max(0, end - elapsedSeconds) * rate / 3600)
  return income ? { ...state, player: { ...state.player, silver: state.player.silver + income } } : state
}

/**
 * 改地名：只有最大股东能改，且**限 2 个字**（不含「村/镇/城」）。
 * [推断] —— 地图上确有玩家起的专名（「地球镇」「无名村」「冰城镇」），
 * 帖子里也点名过最大股东，但改名规则本身没有原文。
 */
export function renameTown(town: Town, owner: string, name: string): { ok: true; town: Town } | { ok: false; reason: string } {
  if (topInvestor(town)?.owner !== owner) return { ok: false, reason: '只有本地投资第一名可以改名' }
  if ([...name].length !== RENAME_LENGTH) return { ok: false, reason: `名字必须是 ${RENAME_LENGTH} 个字` }
  return { ok: true, town: { ...town, name } }
}

/** 本地投资第一名可以免费读书。[重建] —— 无原文。 */
export const canReadFree = (town: Town, owner: string): boolean =>
  topInvestor(town)?.owner === owner

// —— 私塾先生：读书加阅历 ——

/** 从背包里拿掉一件（堆叠的减 1）。书与银票共用。 */
function consumeOne(artifacts: readonly Artifact[], id: string): readonly Artifact[] {
  return artifacts.flatMap((a) => {
    if (a.id !== id) return [a]
    return a.count > 1 ? [{ ...a, count: a.count - 1 }] : []
  })
}

/**
 * 读书：花银两给私塾先生，加阅历。
 *
 * 照原版的两条：**书要在身上**，且**该场景读得了这本书**
 * （私塾先生只列出当前场景可读的书，`reference/text/forum162/article-97984-p1.txt`）。
 */
export function readBook(
  state: GameState,
  bookName: string,
  kind: TownKind,
  opts: { readonly free?: boolean } = {},
): StartResult {
  const book = findBook(bookName)
  if (!book) return { ok: false, reason: '没有这本书' }
  if (!book.scenes.includes(kind)) return { ok: false, reason: `${kind}读不了${book.name}` }

  const held = state.player.artifacts.find((a) => a.kind === 'book' && a.name === bookName)
  if (!held) return { ok: false, reason: '你身上没有这本书' }

  const cost = opts.free ? 0 : READ_BOOK_SILVER
  if (state.player.silver < cost) return { ok: false, reason: '银两不足' }

  return {
    ok: true,
    state: {
      ...state,
      player: {
        ...state.player,
        silver: state.player.silver - cost,
        experience: state.player.experience + book.experience,
        artifacts: consumeOne(state.player.artifacts, held.id),
      },
    },
  }
}

// —— 钱庄掌柜：银两 ⇄ 银票 ——

/**
 * 换银票。银票进背包（`kind: 'misc'`），拿去市场换仙石
 * ——「银票的主要作用是用来交换仙石」[原文] 游戏指南词条。
 */
export function exchangeNote(state: GameState, noteName: string): StartResult {
  const note = findNote(noteName)
  if (!note) return { ok: false, reason: '没有这种面额的银票' }
  if (state.player.silver < note.value) return { ok: false, reason: '银两不足' }

  const id = `note:${note.value}`
  const held = state.player.artifacts.find((a) => a.id === id)
  const artifacts = held
    ? state.player.artifacts.map((a) => (a.id === id ? { ...a, count: a.count + 1 } : a))
    : [
        ...state.player.artifacts,
        { id, kind: 'misc' as const, name: note.name, quality: '凡品' as const, refine: 0, status: '空闲', count: 1 },
      ]

  return {
    ok: true,
    state: {
      ...state,
      player: { ...state.player, silver: state.player.silver - note.value, artifacts },
    },
  }
}

/** 用掉银票换回银两。[原文]「得到银票后，直接使用便可以获得相应的银两」 */
export function redeemNote(state: GameState, noteName: string): StartResult {
  const note = findNote(noteName)
  if (!note) return { ok: false, reason: '没有这种面额的银票' }
  const held = state.player.artifacts.find((a) => a.name === note.name)
  if (!held) return { ok: false, reason: '你身上没有这张银票' }

  return {
    ok: true,
    state: {
      ...state,
      player: {
        ...state.player,
        silver: state.player.silver + note.value,
        artifacts: consumeOne(state.player.artifacts, held.id),
      },
    },
  }
}

/** 银票面额一览（钱庄界面用）。 */
export { BANK_NOTES }

// —— 镖局老板：押镖 ——

export const ESCORT_EVENT_ID = 'town:escort'

export type EscortQuote = {
  readonly distance: number
  readonly fee: number
  readonly seconds: number
}

/**
 * 运镖报价。原版「查看终点」弹出的预估表：`起点等级 | 终点等级 | 两地距离 | 总计`。
 * 佣金只与**起点**商业等级和**直线距离**有关（任务描述原文），终点等级只是显示。
 */
export function quoteEscort(from: Town, to: { readonly x: number; readonly y: number }): EscortQuote {
  const distance = Math.round(distanceOf(from, to))
  return {
    distance,
    fee: escortFee(from.kind, commerceLevel(from), distance),
    seconds: distance * ESCORT_SECONDS_PER_CELL,
  }
}

/** 接镖。运到目的地后与当地镖局老板对话完成（这里到点即结算）。 */
export function acceptEscort(
  state: GameState,
  from: Town,
  to: { readonly x: number; readonly y: number },
): StartResult {
  if (!Number.isInteger(to.x) || !Number.isInteger(to.y) || !inWorld(to.x, to.y)) return { ok: false, reason: '目的地坐标不正确' }
  if (state.timeline.events.some((e) => e.id === ESCORT_EVENT_ID)) {
    return { ok: false, reason: '你已经有一趟镖在身上了' }
  }
  if (state.timeline.events.some(e => e.kind === 'move')) return { ok: false, reason: '移动途中无法接镖' }
  const quote = quoteEscort(from, to)
  if (quote.distance <= 0) return { ok: false, reason: '请选择别的州县' }

  const event: GameEvent = {
    id: ESCORT_EVENT_ID,
    kind: 'move',
    finishAt: state.clock.gameT + quote.seconds,
    payload: { op: 'escort', x: to.x, y: to.y, fee: quote.fee },
  }
  return { ok: true, state: { ...state, timeline: schedule(state.timeline, event) } }
}

/** 花 1 仙石取消跑镖。[原文] 2009-12-25 公告。 */
export function cancelEscort(state: GameState): StartResult {
  if (!state.timeline.events.some((e) => e.id === ESCORT_EVENT_ID)) {
    return { ok: false, reason: '你没有在跑镖' }
  }
  const paid = spendCoin(state, ESCORT_CANCEL_COIN)
  if (!paid.ok) return paid
  return { ok: true, state: { ...paid.state, timeline: cancel(paid.state.timeline, ESCORT_EVENT_ID) } }
}

/** 运镖到点：人到目的地，佣金入账。 */
export function resolveEscort(state: GameState, event: GameEvent): GameState {
  return {
    ...state,
    player: {
      ...state.player,
      x: event.payload['x'] as number,
      y: event.payload['y'] as number,
      silver: state.player.silver + (event.payload['fee'] as number),
    },
  }
}

// —— 驿站 ——

/**
 * 驿站传送（只有九州城池有）。花仙石；**被攻击时不能用**
 * （2008-09-25 后的规则 [原文]）。价目 [重建]，见 `data/town.ts` 的 `STATION_COST_COIN`。
 */
export function teleport(
  state: GameState,
  to: { readonly x: number; readonly y: number },
  opts: { readonly fromKind?: TownKind; readonly underAttack?: boolean } = {},
): StartResult {
  if (!Number.isInteger(to.x) || !Number.isInteger(to.y) || !inWorld(to.x, to.y)) return { ok: false, reason: '目的地坐标不正确' }
  if (opts.underAttack || state.timeline.events.some(e => e.kind === 'raid')) return { ok: false, reason: '你正在被攻击，无法使用驿站' }
  if (state.timeline.events.some(e => e.kind === 'move')) return { ok: false, reason: '移动途中无法使用驿站' }
  if (opts.fromKind && opts.fromKind !== '城池') return { ok: false, reason: '只有城池才有驿站' }

  const paid = spendCoin(state, STATION_COST_COIN)
  if (!paid.ok) return paid
  return { ok: true, state: { ...paid.state, player: { ...paid.state.player, x: to.x, y: to.y } } }
}

// —— 李员外 ——

/** 心动任务「千金散尽」：交 100 万两。 */
export function payLiYuanwai(state: GameState): StartResult {
  const q = activeQuests(state.quests).find(q => q.goal.kind === 'silver' && q.goal.npc === '李员外')
  if (!q) return { ok: false, reason: '请先领取千金散尽任务' }
  const paid = paySilver(state, state.quests, q.id, Math.floor(state.player.silver))
  if (!paid.ok) return paid
  return { ok: true, state: { ...paid.value.state, quests: paid.value.log } }
}
