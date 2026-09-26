/**
 * 六种浮窗 + 倒计时 —— 对应原版的 window.js 与 timer.js。
 *
 * 原版把约 30 个函数挂在全局，页面 HTML 里到处是内联 `onclick="openLWindow('','rank.jsp')"`。
 * 我们沿用同样的函数名并挂到 window，这样从帖子里抢救回来的 DOM 片段可以直接复用，
 * 不必逐个改写成事件委托（`docs/spec/DECISIONS.md` §3.9）。
 */

import { morph } from './dom.ts'

export type WindowKey = 'lwindow' | 'rwindow' | 'bwindow' | 'hwindow' | 'mwindow' | 'mwindow2'

/** 取内容区。页面壳保证这些节点存在。 */
const contentOf = (key: WindowKey): HTMLElement | null =>
  document.getElementById(`${key}content`)

const boxOf = (key: WindowKey): HTMLElement | null => document.getElementById(key)

function setTitle(key: WindowKey, title: string): void {
  const el = document.getElementById(`${key}text`)
  if (el) el.textContent = title
}

export function openWindow(key: WindowKey, title: string, html: string): void {
  const box = boxOf(key)
  const content = contentOf(key)
  if (!box || !content) return
  // 同一个窗重开（翻页、答题后刷新）时就地更新，图片不重取；滚动位置照原版换页那样回顶
  morph(content, html)
  content.scrollTop = 0
  setTitle(key, title)
  box.style.display = ''
  startCountdowns(content)
}

export function closeWindow(key: WindowKey): void {
  const box = boxOf(key)
  if (!box) return
  box.style.display = 'none'
  const content = contentOf(key)
  if (content) content.innerHTML = ''
}

/**
 * 页面里的 `openLWindow(title, url)` 等：原版是向服务端要一段 HTML 再塞进窗口。
 * 本地版没有服务端，改成由路由表在进程内渲染（`main.ts` 注入 resolver）。
 */
export type PageResolver = (url: string) => string | Promise<string>

let resolvePage: PageResolver = () => '<div>未接入</div>'
export const setPageResolver = (r: PageResolver): void => void (resolvePage = r)

/** 弹窗「确定」要执行的东西：原版是一段 JS 字符串，本项目新写的地方用函数。 */
export type DialogAction = string | (() => void)

/**
 * 字符串形式按原版语义在**全局作用域**里执行（原版是内联 onclick，本来就跑在全局）。
 * 用 `new Function` 而不是 `eval`，避免意外捕获本模块的局部作用域。
 *
 * 安全边界：这些字符串由我们自己的页面模块拼装，动态值一律先过 `escJs`。
 * **不要把未经转义的玩家输入拼进来。**
 */
function toAction(a: DialogAction | undefined): (() => void) | null {
  if (a === undefined) return null
  if (typeof a === 'function') return a
  return () => { new Function(a)() }
}

async function openFromUrl(key: WindowKey, title: string, url: string): Promise<void> {
  const html = await resolvePage(url)
  openWindow(key, title, html)
}

// —— 倒计时（原版 timer.js）——
// 协议：<SPAN start="剩余秒数">，由定时器每秒重绘；未知时间显示 ???。
// 原版的回调名拼写就是 refleshAll / refleshRight（不是 refresh），沿用以便片段直接复用。

const fmt = (total: number): string => {
  const t = Math.max(0, Math.floor(total))
  const h = Math.floor(t / 3600)
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  const s = String(t % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

let timerId: number | null = null
let countdownClock = () => Date.now() / 1000
/** 每个倒计时元素的截止时刻，连同算它时用的 start 值。 */
const deadlines = new WeakMap<HTMLElement, { start: number; at: number }>()
export const setCountdownClock = (clock: () => number): void => { countdownClock = clock }

/** 扫描容器里的倒计时并启动全局定时器。 */
export function startCountdowns(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>('[start]')
  for (const n of nodes) {
    const start = Number(n.getAttribute('start'))
    if (Number.isFinite(start)) {
      // 元素会被 morph 复用：只有重渲染改了 start（新数据）才重设截止；
      // 没动的（比如开着的浮窗里的）不能按旧 start 重算，否则倒计时回跳。
      const d = deadlines.get(n)
      const at = d && d.start === start ? d.at : countdownClock() + start
      if (at !== d?.at) deadlines.set(n, { start, at })
      n.textContent = fmt(Math.max(0, at - countdownClock()))
    }
  }
  if (timerId === null && typeof window !== 'undefined') {
    timerId = window.setInterval(tickCountdowns, 1000)
  }
}

function tickCountdowns(): void {
  const nodes = document.querySelectorAll<HTMLElement>('[start]')
  if (nodes.length === 0) return
  for (const n of nodes) {
    const left = (deadlines.get(n)?.at ?? countdownClock()) - countdownClock()
    n.textContent = fmt(left)
    if (left <= 0) {
      n.removeAttribute('start')
      // 事件到点：让宿主决定是否重新结算并刷新
      n.dispatchEvent(new CustomEvent('countdown-done', { bubbles: true }))
    }
  }
}

export function stopCountdowns(): void {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
}

/** 把原版的全局函数名挂上去。 */
export function installGlobals(): void {
  const g = globalThis as unknown as Record<string, unknown>

  g['openLWindow'] = (title: string, url: string) => void openFromUrl('lwindow', title, url)
  g['openRWindow'] = (title: string, url: string) => void openFromUrl('rwindow', title, url)
  g['openBWindow'] = (title: string, url: string) => void openFromUrl('bwindow', title, url)
  g['closeLWindow'] = () => closeWindow('lwindow')
  g['closeRWindow'] = () => closeWindow('rwindow')
  g['closeBWindow'] = () => closeWindow('bwindow')
  g['closeHWindow'] = () => closeWindow('hwindow')
  g['closeMWindow'] = () => closeWindow('mwindow')
  g['closeMWindow2'] = () => closeWindow('mwindow2')

  /**
   * 原版的 `$('id')` 简写（= `document.getElementById`）。页面模块照原版 DOM 保留了
   * 对它的调用（`item.ts:245` 的「把可炼数量填进输入框」、`ally.ts:148` 的成员页码框），
   * 以前没实现，点下去直接 `ReferenceError: $ is not defined`。
   */
  g['$'] = (id: string) => document.getElementById(id)

  /** 地图上那个「点此移动」小菜单的关闭钮（原版 `mapMenuMove();closeMapMenu();`）。 */
  g['closeMapMenu'] = () => {
    const el = document.getElementById('mapmenu')
    if (el) el.style.display = 'none'
  }

  /** 游戏指南：原版是 hlp('词条') 打开无标题条的 H 窗。 */
  g['hlp'] = (topic: string) => void openFromUrl('hwindow', '', `help.jsp?topic=${encodeURIComponent(topic)}`)

  /**
   * 原版 MDialog 是**三参数** `MDialog(title, html, jsOnOk)`，而且是唯一带输入框的弹窗
   * （「请求援手」里有 <input id=gethelpname>）。这一点纠正了早期分析里"两参数纯提示框"的记法。
   *
   * **第三参既收函数也收 JS 字符串**。原版传的一律是字符串（`07 §197`：
   * `MDialogOkCancel('', '确定购买?', 'ajaxPost(\\'buyqi\\', …);')`，`09b §2.1` 有 41 次
   * 调用的逐字表），所以页面模块照原版写字符串；本项目自己新加的调用传函数更省事。
   * 两种都支持，页面那边就不必为了迁就签名去改原版 DOM。
   */
  g['MDialog'] = (title: string, html: string, onOk?: DialogAction) => {
    openWindow('mwindow', title, html)
    pendingOk = toAction(onOk)
  }
  g['MDialogOkCancel'] = (title: string, html: string, onOk?: DialogAction) => {
    openWindow('mwindow2', title, html)
    pendingOk2 = toAction(onOk)
  }
  g['OnMDialogOK'] = () => {
    const f = pendingOk
    pendingOk = null
    const box = boxOf('mwindow')
    if (box) box.style.display = 'none'
    f?.()
    if (box?.style.display === 'none') closeWindow('mwindow')
  }
  g['OnMDialog2OK'] = () => {
    const f = pendingOk2
    pendingOk2 = null
    const box = boxOf('mwindow2')
    if (box) box.style.display = 'none'
    f?.()
    if (box?.style.display === 'none') closeWindow('mwindow2')
  }
}

let pendingOk: (() => void) | null = null
let pendingOk2: (() => void) | null = null

export { fmt as formatCountdown }
