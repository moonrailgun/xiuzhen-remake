import type { GameState } from './state.ts'
import { speedUp, spendCoin, type StartResult } from './cultivate.ts'
import type { MoveLeg } from './move.ts'

/** 原版编号：8/9 移动半/完，10/11 修炼半/完。历史套餐未实现时不能扣费。 */
export function purchase(state: GameState, pay: number): StartResult {
  if (![8, 9, 10, 11].includes(pay)) return { ok: false, reason: '本地版暂未开放此套餐，不会扣除仙石。VIP 可在怀旧版设置中切换。' }
  const kind = pay < 10 ? 'move' : 'cultivate'
  const eligible = state.timeline.events.filter(e => e.kind === kind && (kind !== 'move' || Array.isArray(e.payload['legs'])))
  if (!eligible.length) return { ok: false, reason: kind === 'move' ? '没有可以加速的步行移动事件' : '没有正在进行的修炼事件' }
  const finish = pay === 9 || pay === 11
  if (kind === 'cultivate') return speedUp(state, finish ? 'finish' : 'half')
  const paid = spendCoin(state, finish ? 10 : 2)
  if (!paid.ok) return paid
  const now = state.clock.gameT
  const events = paid.state.timeline.events.map(e => !eligible.includes(e) ? e : ({
    ...e,
    finishAt: finish ? now : now + Math.max(0, (e.finishAt - now) / 2),
    payload: { ...e.payload, legs: (e.payload['legs'] as MoveLeg[]).map((leg, i) =>
      i > Number(e.payload['index']) ? { ...leg, seconds: finish ? 0 : leg.seconds / 2 } : leg) },
  }))
  return { ok: true, state: { ...paid.state, timeline: { events } } }
}
