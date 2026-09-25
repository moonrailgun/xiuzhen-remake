/**
 * 把引擎接到界面上：真正能玩的那一层。
 *
 * 流程：读档（没有就进建号页）→ 每次交互先 `tick` 到当前 → 重渲染 → 存档。
 * 所有时间都走游戏时钟，离线多久都靠一次 `tick` 补回来。
 */

import { renderShell, type MainTab } from '../pages/shell.ts'
import { renderPlayer, type PlayerVm } from '../pages/player.ts'
import { renderMid, renderRight } from '../pages/sidebar.ts'
import { renderCreatePlayer, validateName, type CreatePlayerVm } from '../pages/createplayer.ts'
import { newGame, tick, saveGame, loadGame, resourceBarOf } from '../engine/game.ts'
import { startCultivate, planUpgrade, speedUp, levelOf, BODY_PARTS } from '../engine/cultivate.ts'
import { formatServerTime, formatDuration } from '../engine/clock.ts'
import { sorted } from '../engine/timeline.ts'
import type { GameState } from '../engine/state.ts'
import type { Element } from '../data/meridian.ts'
import { MERIDIANS } from '../data/meridian.ts'
import { openWindow, setPageResolver, startCountdowns } from './windows.ts'

const STORAGE_KEY_AVAILABLE = (() => {
  try {
    localStorage.setItem('__probe', '1')
    localStorage.removeItem('__probe')
    return true
  } catch {
    return false
  }
})()

/** 建号页的临时选择。 */
let draft: CreatePlayerVm = { gender: 1, attr: 5, school: 0, posi: 0 }
let state: GameState | null = null

const ELEMENT_BY_ATTR: Record<number, Element> = { 0: '金', 1: '木', 2: '土', 3: '水', 4: '火' }
const SCHOOL_BY_ID: Record<number, '蜀山' | '昆仑' | '通天'> = { 1: '蜀山', 2: '昆仑', 3: '通天' }
/** 九州出生坐标。世界 200×200，按方位放在九宫格中心（阶段 3 接真实地图后再校准）。 */
const POSITION_XY: Record<number, [number, number]> = {
  1: [50, 100], 2: [50, 150], 3: [100, 150], 4: [50, 50], 5: [100, 100],
  6: [150, 150], 7: [100, 50], 8: [150, 50], 9: [150, 100],
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function root(): HTMLElement | null {
  return document.getElementById('app')
}

// —— 渲染 ——

function playerVm(s: GameState): PlayerVm {
  return {
    view: 'meridian',
    name: s.player.name,
    element: s.player.element,
    gender: s.player.gender,
    school: s.player.school,
    realm: s.player.realm,
    experience: [Math.floor(s.player.experience), 345600],
    silver: s.player.silver,
    meridianLevels: s.player.meridians,
    bodyLevels: s.player.body,
    qiPerHour: resourceBarOf(s).perHour,
  }
}

function midVm(s: GameState) {
  const events = sorted(s.timeline)
  const rows = (kind: string) =>
    events
      .filter((e) => e.kind === kind)
      .map((e) => ({
        icon: 'event/mark.gif',
        text: labelOf(s, e.payload),
        seconds: Math.max(0, Math.round(e.finishAt - s.clock.gameT)),
        speedup: kind === 'cultivate',
      }))
  return {
    battle: rows('battle'),
    craft: rows('craft'),
    move: rows('move'),
    cultivate: rows('cultivate'),
    npcs: [],
    players: [],
  }
}

function labelOf(s: GameState, payload: Readonly<Record<string, unknown>>): string {
  const system = payload['system']
  const to = payload['toLevel'] as number
  if (system === 'meridian') {
    const i = payload['index'] as number
    return `${MERIDIANS[i]?.name ?? '经脉'} Lv${to}`
  }
  if (system === 'body') {
    const i = payload['index'] as number
    return `${BODY_PARTS[i] ?? '本体'} Lv${to}`
  }
  return `${String(payload['id'] ?? '法术')} Lv${to}`
}

function render(): void {
  const app = root()
  if (!app) return

  if (!state) {
    app.innerHTML = renderCreatePlayer(draft)
    return
  }

  const s = state
  app.innerHTML = renderShell({
    tab: 'player' as MainTab,
    resources: resourceBarOf(s),
    serverTime: formatServerTime(s.clock),
    version: '版本号:1.2.1-yyge',
    left: renderPlayer(playerVm(s)),
    mid: renderMid(midVm(s)),
    right: renderRight({ quests: [], guardingMe: 0, guardingOthers: 0, guardCap: 7 }),
  })
  startCountdowns(app)
}

/** 推进到现在 → 重渲染 → 存档。所有交互都走这一条路径。 */
function step(): void {
  if (!state) return render()
  const out = tick(state, Date.now())
  state = out.state
  render()
  persist()
}

function persist(): void {
  if (!state || !STORAGE_KEY_AVAILABLE) return
  try {
    saveGame(localStorage, state, Date.now())
  } catch (e) {
    // 配额不足或隐私模式：提示用户导出，不静默吞掉
    openWindow('mwindow', '存档失败', `<DIV class=middle style="padding:10px">
存档写入失败，可能是浏览器空间不足或禁用了存储。<BR>请用「导出存档」把进度保存下来。</DIV>`)
  }
}

// —— 交互（挂到 window，供页面里的内联 onclick 调用）——

export function installGameActions(): void {
  const g = globalThis as unknown as Record<string, unknown>

  /** 建号页的确定按钮。 */
  g['sendCreatePlayer'] = () => {
    const input = document.getElementById('playername') as HTMLInputElement | null
    const name = input?.value ?? ''
    const check = validateName(name)
    if (!check.ok) {
      draft = { ...readDraft(), error: check.reason }
      render()
      return
    }
    const d = readDraft()
    const attr = d.attr === 5 ? pickRandom([0, 1, 2, 3, 4]) : d.attr
    const school = d.school === 0 ? pickRandom([1, 2, 3]) : d.school
    const posi = d.posi === 0 ? pickRandom([1, 2, 3, 4, 5, 6, 7, 8, 9]) : d.posi
    const [x, y] = POSITION_XY[posi] ?? [100, 100]

    state = newGame(
      {
        name: name.trim(),
        // 建号页用 1/2（原版表单取值），引擎里用 m/f
        gender: d.gender === 2 ? 'f' : 'm',
        element: ELEMENT_BY_ATTR[attr]!,
        school: SCHOOL_BY_ID[school]!,
        x,
        y,
        seed: Math.floor(Math.random() * 2 ** 31),
      },
      Date.now(),
    )
    step()
  }

  /** 建号页换头像（原版同名函数）。 */
  g['updateAvatar'] = () => {
    draft = readDraft()
    const img = document.getElementById('avatar') as HTMLImageElement | null
    if (!img) return
    const s = { 1: 'shushan', 2: 'kunlun', 3: 'tongtian' }[draft.school]
    img.src = s ? `img/avatar/${s}${draft.gender === 2 ? 'f' : 'm'}.gif` : 'img/avatar/random.gif'
  }

  /** 点经脉/本体节点：打开右窗显示升级说明。 */
  g['openRWindow'] = (title: string, url: string) => {
    if (!state) return
    const m = /type=(\w+)&idx=(\d+)/.exec(url)
    if (!m) return
    const system = m[1] === 'body' ? 'body' : 'meridian'
    const index = Number(m[2])
    const target = { system, index } as const
    const plan = planUpgrade(state, target)
    const name = system === 'meridian' ? MERIDIANS[index]?.name : BODY_PARTS[index]
    openWindow('rwindow', `${name} Lv.${plan.fromLevel}`, upgradePanel(name ?? '', plan, target))
  }

  /** 升级按钮。 */
  g['doUpgrade'] = (system: string, index: number) => {
    if (!state) return
    const r = startCultivate(state, { system: system as 'meridian' | 'body', index })
    if (!r.ok) {
      const box = document.getElementById('upgradeMsg')
      if (box) box.innerHTML = `<SPAN class=smallred>${r.reason}</SPAN>`
      return
    }
    state = r.state
    step()
  }

  /** 事件栏的「半 / 完」。 */
  g['paycoin'] = (pay: number) => {
    if (!state) return
    const r = speedUp(state, pay === 10 ? 'finish' : 'half')
    if (!r.ok) return
    state = r.state
    step()
  }

  g['exportSave'] = () => {
    if (!state) return
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `xiuzhen-${state.player.name}.json`
    a.click()
  }
}

function readDraft(): CreatePlayerVm {
  const q = (sel: string) => document.querySelector<HTMLInputElement>(sel)
  const sel = (name: string) => document.querySelector<HTMLSelectElement>(`select[name=${name}]`)
  return {
    gender: (Number(q('input[name=gender]:checked')?.value) || 1) as 1 | 2,
    attr: Number(sel('attr')?.value ?? 5),
    school: Number(sel('school')?.value ?? 0),
    posi: Number(q('input[name=posi]:checked')?.value ?? 0),
  }
}

/** 升级说明面板，结构照截图 #3 的经脉弹窗。 */
function upgradePanel(
  name: string,
  plan: ReturnType<typeof planUpgrade>,
  target: { system: string; index: number },
): string {
  const icons = ['gold', 'wood', 'water', 'fire', 'earth']
  return `<DIV class=middle style="padding:6px">
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width="100%" border=0><TBODY>
<TR class="titlebg bigbold" align=middle><TD colSpan=5>升级到Lv.${plan.toLevel}消耗</TD></TR>
<TR class="trbg middle" align=middle>${icons.map((ic) => `<TD><IMG src="img/res/${ic}.gif"></TD>`).join('')}</TR>
<TR class="trbg middle" align=middle>${plan.cost.map((v) => `<TD>${v}</TD>`).join('')}</TR>
<TR class="trbg middle" align=middle><TD colSpan=5>需要时间 ${formatDuration(plan.seconds)}</TD></TR>
</TBODY></TABLE>
<DIV id=upgradeMsg style="text-align:center;padding:6px"></DIV>
<DIV style="text-align:center">
<A class=skillup href="#" onclick="doUpgrade('${target.system}',${target.index})">升级</A>
</DIV>
</DIV>`
}

export function boot(): void {
  installGameActions()
  setPageResolver((url) => `<DIV class=middle style="padding:12px">（${url} 尚未接入）</DIV>`)

  if (STORAGE_KEY_AVAILABLE) {
    try {
      state = loadGame(localStorage)
    } catch {
      state = null // 存档损坏：从建号开始，旧档仍留在备份 key 里
    }
  }
  step()

  // 事件到点时自动推进（倒计时归零会冒泡这个事件）
  document.addEventListener('countdown-done', () => step())
  // 另一个标签页存了档 → 重新读，避免互相覆盖
  window.addEventListener('storage', () => {
    if (!STORAGE_KEY_AVAILABLE) return
    try {
      const fresh = loadGame(localStorage)
      if (fresh) {
        state = fresh
        render()
      }
    } catch {
      /* 忽略：本页继续用内存里的状态 */
    }
  })
}
