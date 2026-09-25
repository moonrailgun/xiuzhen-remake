/**
 * 移动。
 *
 * 【照原版】：
 *  - 新号一次移动 2 格，「行万里路」增加单次移动距离 [原文]；
 *  - 移动是**多段路径**，逐段计时，事件栏显示当前段与「下个目标」，可点红 × 取消 [截图 #114]；
 *  - 每段耗时按**目标格**地形算（平原 10 分 / 森林 20 / 青山 30 / 江河 40…）[原文]；
 *  - 移动中可被攻击；移动中随机获得藏宝图 [原文]；
 *  - 被攻击时不能用驿站传送 [原文]。
 *
 * 【重建】：寻路算法。原版「高级 VIP 自动寻路」被玩家吐槽「遇山过山、遇水过水」，
 * 说明它不绕开高耗时地形 —— 所以这里也走直线曼哈顿路径，不做最短耗时寻路。
 */

import { schedule, cancel, countByKind, type GameEvent, type Timeline } from './timeline.ts'
import type { GameState } from './state.ts'
import { MOVE_SECONDS, terrainAt, inWorld, distance, type Terrain } from '../data/world.ts'

/** 本体「行万里路」的序号。 */
export const BODY_WALK = 7
/** 本体「穷千里目」的序号（视野）。 */
export const BODY_EYE = 0

/** 新号一次移动 2 格、观察 4 格。[原文：官方新手指南] */
export const BASE_MOVE_RANGE = 2
export const BASE_SIGHT_RANGE = 4

/** 单次移动的最大格数。[原文 + 重建：每级 +1] */
export const moveRange = (walkLevel: number): number => BASE_MOVE_RANGE + walkLevel
/** 视野半径。 */
export const sightRange = (eyeLevel: number): number => BASE_SIGHT_RANGE + eyeLevel

/**
 * 直线路径：先走 x 再走 y（曼哈顿）。
 * 不绕开高耗时地形 —— 原版的自动寻路也不绕（玩家原话「遇山过山、遇水过水」）。
 */
export function pathTo(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number }[] {
  const steps: { x: number; y: number }[] = []
  let x = fromX
  let y = fromY
  while (x !== toX) {
    x += toX > x ? 1 : -1
    steps.push({ x, y })
  }
  while (y !== toY) {
    y += toY > y ? 1 : -1
    steps.push({ x, y })
  }
  return steps
}

export type MoveLeg = {
  readonly x: number
  readonly y: number
  readonly terrain: Terrain
  readonly seconds: number
}

/** 把一条路径拆成逐段，算出每段耗时（按目标格地形）。 */
export function planMove(
  seed: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  weeksOpen = 99,
): MoveLeg[] {
  return pathTo(fromX, fromY, toX, toY).map((p) => {
    const terrain = terrainAt(seed, p.x, p.y, weeksOpen)
    return { x: p.x, y: p.y, terrain, seconds: MOVE_SECONDS[terrain] }
  })
}

export const MOVE_EVENT_ID = 'move:current'

export type MoveResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string }

/**
 * 开始移动。一次只能有一个移动事件（原版事件栏只显示一条移动事件）。
 */
export function startMove(
  state: GameState,
  toX: number,
  toY: number,
  opts: { readonly weeksOpen?: number } = {},
): MoveResult {
  if (!Number.isInteger(toX) || !Number.isInteger(toY)) return { ok: false, reason: '目标坐标必须是整数' }
  if (!inWorld(toX, toY)) return { ok: false, reason: '目标超出了修真世界的范围' }
  if (toX === state.player.x && toY === state.player.y) {
    return { ok: false, reason: '你已经在这里了' }
  }
  if (countByKind(state.timeline, 'move') > 0) {
    return { ok: false, reason: '你正在移动中' }
  }

  const range = moveRange(state.player.body[BODY_WALK] ?? 0)
  const dist = distance(state.player.x, state.player.y, toX, toY)
  if (dist > range) {
    return { ok: false, reason: `超出移动范围（最多 ${range} 格）` }
  }

  const legs = planMove(
    state.worldSeed,
    state.player.x,
    state.player.y,
    toX,
    toY,
    opts.weeksOpen ?? 99,
  )
  if (legs.length === 0) return { ok: false, reason: '没有可走的路径' }

  const first = legs[0]!
  const event: GameEvent = {
    id: MOVE_EVENT_ID,
    kind: 'move',
    finishAt: state.clock.gameT + first.seconds,
    payload: { legs, index: 0 },
  }
  return { ok: true, state: { ...state, timeline: schedule(state.timeline, event) } }
}

/** 取消移动（事件栏那个红 ×）。人停在当前格，不回退。 */
export const cancelMove = (state: GameState): GameState => ({
  ...state,
  timeline: cancel(state.timeline, MOVE_EVENT_ID),
})

/**
 * 移动事件到点：人走到这一段的目标格；还有后续段就排下一段。
 */
export function resolveMove(
  state: GameState,
  event: GameEvent,
): { state: GameState; follow?: GameEvent[] } {
  const legs = event.payload['legs'] as MoveLeg[]
  const index = event.payload['index'] as number
  const leg = legs[index]
  if (!leg) return { state }

  const moved: GameState = { ...state, player: { ...state.player, x: leg.x, y: leg.y } }

  const nextIndex = index + 1
  const next = legs[nextIndex]
  if (!next) return { state: moved }

  return {
    state: moved,
    follow: [
      {
        id: MOVE_EVENT_ID,
        kind: 'move',
        finishAt: event.finishAt + next.seconds,
        payload: { legs, index: nextIndex },
      },
    ],
  }
}

/** 事件栏要显示的：当前段目标 + 下一段目标。 */
export function moveDisplay(
  state: GameState,
): { current: { x: number; y: number; seconds: number }; next?: { x: number; y: number; seconds: number } } | null {
  const ev = state.timeline.events.find((e) => e.id === MOVE_EVENT_ID || (e.kind === 'move' && e.payload['op'] === 'escort'))
  if (!ev) return null
  if (ev.payload['op'] === 'escort') {
    return { current: { x: Number(ev.payload['x']), y: Number(ev.payload['y']), seconds: Math.max(0, Math.round(ev.finishAt - state.clock.gameT)) } }
  }
  const legs = ev.payload['legs'] as MoveLeg[]
  const index = ev.payload['index'] as number
  const cur = legs[index]
  if (!cur) return null
  const nxt = legs[index + 1]
  return {
    current: { x: cur.x, y: cur.y, seconds: Math.max(0, Math.round(ev.finishAt - state.clock.gameT)) },
    next: nxt
      ? { x: nxt.x, y: nxt.y, seconds: Math.max(0, Math.round(ev.finishAt - state.clock.gameT + nxt.seconds)) }
      : undefined,
  }
}
