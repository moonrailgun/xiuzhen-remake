import { DAY } from './clock.ts'
import { REALMS, ZERO_QI, type FiveQi, type GameState } from './state.ts'
import { terrainAt } from '../data/world.ts'

export function sanctuaryKindAt(state: GameState, x: number, y: number, weeksOpen = Math.floor(state.clock.gameT / (7 * DAY))): '福地' | '洞天' | null {
  const kind = terrainAt(state.worldSeed, x, y, weeksOpen)
  return kind === '福地' || kind === '洞天' ? kind : null
}

/** guides/50102-p1：福地辟谷、洞天心动；开服周数由terrainAt统一判定。 */
export function sanctuaryEntryBlocker(state: GameState, x: number, y: number): string | null {
  const kind = sanctuaryKindAt(state, x, y)
  if (!kind) return null
  const need = kind === '福地' ? '辟谷期' : '心动期'
  return REALMS.indexOf(state.player.realm) < REALMS.indexOf(need) ? `${kind}需要${need}才能进入` : null
}

/** 占领者独享各5/6，不参与路过者分享；未祭炼者没有此地收益。 */
export function sanctuaryQi(state: GameState, x: number, y: number, weeksOpen = Math.floor(state.clock.gameT / (7 * DAY))): FiveQi | null {
  const kind = sanctuaryKindAt(state, x, y, weeksOpen)
  if (!kind) return null
  if (!state.quests.sanctuaries?.some(s => s.x === x && s.y === y && s.kind === kind)) return ZERO_QI
  const n = kind === '福地' ? 5 : 6
  return [n, n, n, n, n]
}
