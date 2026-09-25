import type { GameState } from './state.ts'
import { speedUp, spendCoin, type StartResult } from './cultivate.ts'
import type { MoveLeg } from './move.ts'

/**
 * 仙石消费。**编号与价目全部照原版逐字**
 * （`reference/raw/guides/54385-p1.html` 的 title 属性，另有 4 份副本）：
 *   pay=8  减半移动剩余时间 —— **1 仙石**  title="点此减半移动剩余时间，需要花费1个仙石"
 *   pay=9  直接完成移动行为 —— **5 仙石**  title="点此直接完成移动行为，需要花费5个仙石"
 *   pay=10 减半修炼 —— 2 仙石 ／ pay=11 完成修炼 —— 10 仙石
 * 注意移动与修炼**不同价**，别把修炼的 2/10 套到移动上。
 */
export function purchase(state: GameState, pay: number): StartResult {
  if (![8, 9, 10, 11].includes(pay)) return { ok: false, reason: '本地版暂未开放此套餐，不会扣除仙石。VIP 可在怀旧版设置中切换。' }
  const kind = pay < 10 ? 'move' : 'cultivate'
  const eligible = state.timeline.events.filter(e => e.kind === kind && (kind !== 'move' || Array.isArray(e.payload['legs'])))
  if (!eligible.length) return { ok: false, reason: kind === 'move' ? '没有可以加速的步行移动事件' : '没有正在进行的修炼事件' }
  const finish = pay === 9 || pay === 11
  if (kind === 'cultivate') return speedUp(state, finish ? 'finish' : 'half')
  // 移动是 1/5，不是修炼的 2/10（原版 title 逐字）
  const paid = spendCoin(state, finish ? 5 : 1)
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
