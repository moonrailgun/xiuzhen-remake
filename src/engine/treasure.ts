import type { Artifact, GameState } from './state.ts'
import { next } from './rng.ts'
import { canAcquireArtifacts } from './craft.ts'
import { WORLD_SIZE } from '../data/world.ts'
import { SECRET_BOOKS, SECRET_MATERIALS, isSecretBook } from '../data/secrets.ts'
import { DEFENSIVE_ARTIFACTS } from '../data/artifacts.ts'

export type Treasure = { readonly source: string; readonly x: number; readonly y: number; readonly reward: Artifact }
type Result = { readonly ok: true; readonly state: GameState } | { readonly ok: false; readonly reason: string }
export const treasureItem = (name: string, id: string, kind: Artifact['kind'] = 'misc'): Artifact =>
  ({ id, name, kind, quality: '凡品', refine: 0, status: '空闲', count: 1 })

function consume(state: GameState, id: string): GameState {
  return { ...state, player: { ...state.player, artifacts: state.player.artifacts.flatMap(a => a.id !== id ? [a]
    : a.count > 1 ? [{ ...a, count: a.count - 1 }] : []) } }
}

/** 2009-03-24 公告：凡品护身、淬炼0–3。重建：只使用有完整数值的护身，淬炼等概率。 */
export function openNoviceBox(state: GameState, id: string): Result {
  const box = state.player.artifacts.find(a => a.id === id && a.name === '新手玄武玉匣'
    && a.kind === 'misc' && a.status === '空闲' && a.count > 0)
  if (!box) return { ok: false, reason: '请先选中新手玄武玉匣。' }
  const used = consume(state, id)
  if (!canAcquireArtifacts(used, 1)) return { ok: false, reason: '法宝栏已满，请先腾出位置。' }
  const draw = next(state.rng)
  const guard = { ...treasureItem(DEFENSIVE_ARTIFACTS[0]!.name, `box:${draw.state.join(':')}`, 'guard'), refine: Math.floor(draw.value * 4) }
  return { ok: true, state: { ...used, rng: draw.state,
    player: { ...used.player, artifacts: [...used.player.artifacts, guard] } } }
}

/** 用图生成「机缘遇宝」、到坐标领奖有原文（docs/research/02 §3.10）。
 * 重建：附近两格、一次一个任务；种类权重与等概率子表见规则裁决。结果在使用时入档。
 */
export function startTreasure(state: GameState, id: string): Result {
  if (state.treasure) return { ok: false, reason: '请先完成正在进行的机缘遇宝。' }
  const a = state.player.artifacts.find(a => a.id === id && a.kind === 'misc' && a.status === '空闲' && a.count > 0)
  if (!a || !['藏宝图', '天宫秘箓'].includes(a.name)) return { ok: false, reason: '请选中藏宝图或天宫秘箓。' }
  let rng = state.rng
  const draw = () => { const r = next(rng); rng = r.state; return r.value }
  const choose = <T>(values: readonly T[]): T => values[Math.floor(draw() * values.length)]!
  const advanced = a.name === '天宫秘箓'
  const group = draw()
  let name: string, kind: Artifact['kind']
  // 清单原文：official-site/xzxs-content-fashu.html.txt；五岳山形图、二十炼微尘丹纠正原文笔误。
  if (group < (advanced ? 0.7 : 0.1)) {
    name = advanced ? choose(SECRET_BOOKS.filter(n => n !== '物理通明')) : '物理通明'; kind = 'book'
  } else if (!advanced && group < 0.7) {
    name = choose(SECRET_MATERIALS); kind = 'misc'
  } else if (group < 0.85) {
    const tier = choose(advanced ? ['十炼', '二十炼'] : ['一炼', '二炼', '三炼', '四炼', '五炼'])
    name = tier + choose(['紫金丹', '碧罗丹', '微尘丹', '冰雪丹', '烈炎丹', '五行丹']); kind = 'pill'
  } else {
    name = choose(advanced ? ['菜根谭', '围炉夜话', '小窗幽记', '世说新语', '三国志', '资治通鉴', '史记']
      : ['三国演义', '西游记', '水浒传', '红楼梦', '聊斋志异', '搜神记', '镜花缘', '封神演义', '警世通言', '醒世恒言', '喻世明言'])
    kind = 'book'
  }
  let x = Math.max(0, Math.min(WORLD_SIZE - 1, state.player.x + Math.floor(draw() * 5) - 2))
  const y = Math.max(0, Math.min(WORLD_SIZE - 1, state.player.y + Math.floor(draw() * 5) - 2))
  if (x === state.player.x && y === state.player.y) x = x === WORLD_SIZE - 1 ? x - 1 : x + 1
  return { ok: true, state: { ...consume(state, id), rng, treasure: {
    source: a.name, x, y, reward: treasureItem(name, `treasure:${rng.join(':')}`, kind),
  } } }
}

export function claimTreasure(state: GameState): Result {
  const t = state.treasure
  if (!t) return { ok: false, reason: '没有正在进行的机缘遇宝。' }
  if (state.timeline.events.some(e => e.kind === 'move') || state.player.x !== t.x || state.player.y !== t.y)
    return { ok: false, reason: `请先到达(${t.x},${t.y})。` }
  if (!canAcquireArtifacts(state, 1)) return { ok: false, reason: '法宝栏已满，请腾出一个位置再领取。' }
  return { ok: true, state: { ...state, treasure: undefined,
    player: { ...state.player, artifacts: [...state.player.artifacts, t.reward] } } }
}

export function combineSecret(state: GameState): Result {
  const parts = SECRET_MATERIALS.map(n => state.player.artifacts.find(a => a.name === n && a.kind === 'misc' && a.status === '空闲' && a.count > 0))
  if (parts.some(a => !a)) return { ok: false, reason: `需要${SECRET_MATERIALS.join('、')}各一件。` }
  let combined = state
  for (const a of parts) combined = consume(combined, a!.id)
  if (!canAcquireArtifacts(combined, 1)) return { ok: false, reason: '法宝栏已满，请先腾出位置。' }
  const reward = treasureItem('天宫秘箓', `secret:${parts[0]!.id}`)
  return { ok: true, state: { ...combined, player: { ...combined.player, artifacts: [...combined.player.artifacts, reward] } } }
}

export function learnSecret(state: GameState, id: string): Result {
  const a = state.player.artifacts.find(a => a.id === id && a.kind === 'book' && a.status === '空闲' && a.count > 0)
  if (!a || !isSecretBook(a.name)) return { ok: false, reason: '请先选中一本秘笈；普通书籍可在私塾阅读。' }
  if ((state.player.skills[a.name] ?? 0) > 0) return { ok: false, reason: '你已经学过这本秘笈。' }
  const used = consume(state, id)
  return { ok: true, state: { ...used, player: { ...used.player, skills: { ...used.player.skills, [a.name]: 1 } } } }
}
