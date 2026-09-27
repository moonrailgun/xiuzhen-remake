/**
 * 把引擎接到界面上：真正能玩的那一层。
 *
 * 流程：读档（没有就进建号页）→ 每次交互先 `tick` 到当前 → 重渲染 → 存档。
 * 所有时间都走游戏时钟，离线多久都靠一次 `tick` 补回来。
 */

import { renderShell, type MainTab } from '../pages/shell.ts'
import { renderPlayer, type PlayerVm } from '../pages/player.ts'
import { renderMap, screenCells, type MapVm, type MapCell } from '../pages/map.ts'
import { renderSkill, type SkillTab } from '../pages/skill.ts'
import { renderItem, type ItemTab } from '../pages/item.ts'
import { renderTrade, type TradeView } from '../pages/trade.ts'
import { renderAlly, type AllyTab } from '../pages/ally.ts'
import { renderMsg } from '../pages/msg.ts'
import { renderMsgDetail } from '../pages/msgdetail.ts'
import { renderWriteMsg } from '../pages/writemsg.ts'
import { renderItemMid } from '../pages/itemmid.ts'
import { renderQuest } from '../pages/quest.ts'
import { renderRank, type RankTab } from '../pages/rank.ts'
import { renderPlayerInfo } from '../pages/playerinfo.ts'
import { renderTurnres } from '../pages/turnres.ts'
import { renderPayment } from '../pages/payment.ts'
import { renderFight } from '../pages/fight.ts'
import { renderEstate } from '../pages/estate.ts'
import { renderBattleEvent } from '../pages/battleevent.ts'
import { renderHelp, HELP_TOPICS, HELP_ENTRIES } from '../pages/help.ts'
import {
  skillVm, itemVm, tradeVm, allyVm, msgVm, skillNodeById, artifactLabel, artifactItemId,
  townHere, townKey, sceneNpcNames, refinePairAt,
} from './vm.ts'
import { SWORDS, swordByName, craftCostFor, isComplete, type Sword } from '../data/swords.ts'
import { SKILL_TREES } from '../data/skills.ts'
import { ranking } from '../engine/npc.ts'
import {
  MAX_INVESTMENTS, commerceLevel, totalInvested, shareOf, hourlyIncomeOf,
  invest, readBook, canReadFree, exchangeNote, teleport, payLiYuanwai, acceptEscort, quoteEscort,
  BANK_NOTES, redeemNote, withdrawInvestment, type Town,
} from '../engine/town.ts'
import {
  escortDialog, townNpcDialog, DIALOG_VERBATIM_IDS, booksReadableIn, npcsIn,
  READ_BOOK_SILVER, STATION_COST_COIN, LI_YUANWAI_SILVER, BOOKS, type TownNpc,
} from '../data/town.ts'
import { daoxingText, floorQi, REALMS, type Artifact } from '../engine/state.ts'
import { formatGameDate } from '../engine/clock.ts'
import { generates, ELEMENTS } from '../data/meridian.ts'
import { renderMid, renderRight } from '../pages/sidebar.ts'
import { renderCreatePlayer, validateName, type CreatePlayerVm } from '../pages/createplayer.ts'
import { newGame, tick, saveGame, loadGame, resourceBarOf, importGame } from '../engine/game.ts'
import { startMove, startFlight, cancelMove, moveDisplay, sightRange, BODY_EYE } from '../engine/move.ts'
import { startTreasure, claimTreasure, combineSecret, learnSecret, openNoviceBox } from '../engine/treasure.ts'
import { SECRET_MATERIALS, isSecretBook } from '../data/secrets.ts'
import { terrainAt, qiAt, sceneName, terrainVariant, terrainScene, TERRAIN_KEY } from '../data/world.ts'
import { weekOfServer } from '../engine/clock.ts'
import { npcsAtCell, allNpcsAt } from '../engine/npc.ts'
import { availableQuests, activeQuests, accept, abandon, claim, goalMet, questLocation, questTarget, answerQuiz, chooseLine, applyQuestProgress, gatherCoreQi, startCoreCompression } from '../engine/quest.ts'
import { questTitle, qiRewardFor, EXPERIENCE_THRESHOLDS } from '../data/quests.ts'
import { socialOf, guildOf, changeGuardian, createGuild, joinGuild, leaveGuild, recruitGuildMember, setGuildRelation, setBlocked, receiveLetter } from '../engine/social.ts'
import { renderSettings } from '../pages/settings.ts'
import { renderGm, type GmVm } from '../pages/gm.ts'
import { applyGm, sanshiView, summonSanshi, bodyCapFor, meridianCapFor, skillCaps, SCHOOLS, type GmPatch } from '../engine/gm.ts'
import { performDivination, isDivinationVisible, DIVINATIONS, type DivinationKind } from '../engine/divine.ts'
import {
  launch, reinforce, requestHelp, swordsOut, swordsOutLimit, flightSeconds,
  launchedSwordStats, type LaunchSword, type BattleTarget,
} from '../engine/battle.ts'
import { usePill as consumePill, craftRecipe, upgradeArtifactQuality, upgradeAllArtifactQuality, startCraft, startRepair, repairPlan, refineArtifact, canAcquireArtifacts, artifactCapacity, artifactSpaceUsed, REFINE_FAIL_TEXT, type CraftOrder } from '../engine/craft.ts'
import { PILL_NAMES, PILL_TIERS, ITEM_STATUSES } from '../pages/item.ts'
import { DEFENSIVE_ARTIFACTS, DEFENSIVE_ARTIFACT_NAMES_KNOWN, PASSIVE_SWORD_ARTS, QUALITIES, type Quality } from '../data/artifacts.ts'
import {
  ctxOf, applyCtx, canTradeArtifact, buyQi, buyArtifact, listQi, listArtifact, cancelQiOrders, cancelArtifactOrders,
} from '../engine/market.ts'
import type { FiveQi } from '../engine/state.ts'
import { changeRate } from '../engine/game.ts'
import { exportSave as serializeExport, clear as clearSave, SAVE_KEYS } from '../engine/save.ts'
import { dayOfServer } from '../engine/clock.ts'
import { purchase } from '../engine/payment.ts'
import { startCultivate, planUpgrade, skillUpgradeBlockReason, spendCoin, levelOf, capacityOf, BODY_PARTS } from '../engine/cultivate.ts'
import { formatServerTime, formatDuration, DAY } from '../engine/clock.ts'
import { sorted, type GameEvent } from '../engine/timeline.ts'
import type { GameState } from '../engine/state.ts'
import type { Element } from '../data/meridian.ts'
import { MERIDIANS } from '../data/meridian.ts'
import { openWindow, closeWindow, setPageResolver, startCountdowns, setCountdownClock } from './windows.ts'
import { morph } from './dom.ts'
import { esc, escJs, js } from '../pages/html.ts'

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
/** 当前主标签 */
let tab: MainTab = 'player'
/** 各页的子标签（原版是 `?tab=N`，本地版拦下来记在这里） */
let playerView: PlayerVm['view'] = 'meridian'
let skillTab: SkillTab = 'produce'
let itemTab: ItemTab = 'list'
let tradeView: TradeView = 'buyqi'
let allyTab: AllyTab = 'overview'
/** 分页与筛选 */
let tradePage = 1
let tradeFilter: { give: Element | ''; want: Element | '' } = { give: '', want: '' }
/** 购买法宝页的名称搜索与品质筛选（原版参数 search / level） */
let tradeSearch = ''
let tradeLevel = 0
let allyPage = 1
let msgPage = 1
/** 当前交易页那一屏的挂单 id（原版界面用数字 sheet，这里反查回真 id） */
let tradeSheets: readonly string[] = []
/** 地图视图中心（可以跳到别处看，不等于人物所在） */
let mapCenter: { x: number; y: number } | null = null
/** 地图上选中的格子 */
let mapSelected: { x: number; y: number } | null = null

/**
 * 读档失败时把两份原始存档原样扣在这里，**并在玩家做出选择前禁止一切写盘**。
 *
 * 为什么必须这样：以前读不出来就静默进建号页，然后
 *   第 1 次存档冲掉坏主档 → 1 秒后 pulse 第 2 次存档把**好备份**也冲掉，
 * 两份一起没，不可恢复。丢的可能是几十小时进度，而触发条件只是
 * 「将来改了 state 结构忘了加迁移」这种纯代码失误。
 */
let loadFailure: { readonly reason: string; readonly main: string | null; readonly backup: string | null } | null = null

/** GM 面板上一次「应用修改」的结果（收拢说明或错误），只在面板里显示一次。 */
let gmNotice: GmVm['notice'] = undefined

/**
 * 把上面这些模块级的界面状态复位。
 *
 * 「重新开始」只清存档是不够的：这些 `let` 会原样留着，新号一进来就串在上个号的页面
 * （实测：在交易页点重新开始 → 建新号 → 高亮还是「交易」、左栏直接是交易页），
 * 连 `mapSelected` 都还是上个号选过的格子。
 */
function resetViewState(): void {
  tab = 'player'
  playerView = 'meridian'
  skillTab = 'produce'
  itemTab = 'list'
  tradeView = 'buyqi'
  allyTab = 'overview'
  tradePage = 1
  tradeFilter = { give: '', want: '' }
  tradeSearch = ''
  tradeLevel = 0
  allyPage = 1
  msgPage = 1
  tradeSheets = []
  mapCenter = null
  mapSelected = null
  fightTarget = null
  reinforceEventId = null
  helpHistory = []
  helpForwardStack = []
}

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
    view: playerView,
    name: s.player.name,
    element: s.player.element,
    gender: s.player.gender,
    school: s.player.school,
    realm: s.player.realm,
    // 阅历上限随境界涨（345600 × 1..5），不是定值
    experience: [Math.floor(s.player.experience), EXPERIENCE_THRESHOLDS[s.player.realm]],
    silver: s.player.silver,
    meridianLevels: s.player.meridians,
    bodyLevels: s.player.body,
    qiPerHour: resourceBarOf(s).perHour,
  }
}

/** 按真实世界生成一屏地图。 */
function mapVm(s: GameState): MapVm {
  const weeks = weekOfServer(s.clock)
  const center = mapCenter ?? { x: s.player.x, y: s.player.y }
  const cells: MapCell[] = screenCells(center.x, center.y).map((p) => {
    const t = terrainAt(s.worldSeed, p.x, p.y, weeks)
    const key = TERRAIN_KEY[t]
    return {
      name: sceneName(s.worldSeed, p.x, p.y),
      posx: p.x,
      posy: p.y,
      terrain: `${key}${terrainVariant(s.worldSeed, p.x, p.y, t)}`,
      scene: terrainScene(t, terrainVariant(s.worldSeed, p.x, p.y, t)),
      qi: qiAt(s.worldSeed, p.x, p.y, t),
      revealed: s.divination?.scenes.some(scene => scene.x === p.x && scene.y === p.y && scene.expiresAt > s.clock.gameT) ?? false,
      // 本格的人数 = NPC + 自己
      playernum:
        npcsAtCell(s.npc, s.clock.gameT, s.worldSeed, p.x, p.y).length +
        (p.x === s.player.x && p.y === s.player.y ? 1 : 0),
    }
  })
  const sel = mapSelected ?? { x: s.player.x, y: s.player.y }
  // 选中格不在当前这屏时会回落到屏幕中心格。必须把 `mapSelected` 一并对齐 ——
  // 否则左栏显示的是中心格、而「向选中场景步行移动」用的还是屏外那个旧坐标，
  // 等于「界面说去 A、实际走去 B」，而且没有任何提示。
  const onScreen = cells.find((c) => c.posx === sel.x && c.posy === sel.y)
  const selected = onScreen ?? cells[56]!
  if (!onScreen) mapSelected = { x: selected.posx, y: selected.posy }
  return {
    centerX: center.x,
    centerY: center.y,
    playerX: s.player.x,
    playerY: s.player.y,
    playerDis: sightRange(s.player.body[BODY_EYE] ?? 0) / 2,
    cells,
    selected,
    goByDistance: 3,
    playerGender: s.player.gender,
    canFly: s.player.realm === '元婴期',
  }
}

function midVm(s: GameState) {
  const events = sorted(s.timeline)
  const rows = (kind: string) =>
    events
      .filter((e) => e.kind === kind)
      .map((e) => ({
        icon: iconOf(kind, e.payload),
        text: labelOf(s, kind, e.payload),
        seconds: Math.max(0, Math.round(e.finishAt - s.clock.gameT)),
        speedup: kind === 'cultivate',
      }))

  /**
   * 战斗事件行**按阶段合并**，不是一场一行 —— 照原版 DOM（09 §1.7）：
   * `<A style="COLOR:black" onclick="openBWindow('','battleevent.jsp?tab=N')">
   *    <IMG src="img/event/attack.gif"> {数量} {斩杀|返回}</A>` + 倒计时。
   * tab 实见值：2 = 斩杀（出击中）、3 = 返回。
   */
  const battleRows = () => {
    const all = events.filter((e) => e.kind === 'battle')
    const raids = events.filter((e) => e.kind === 'raid')
    const groups: { label: string; tab: number; icon: string; of: typeof all }[] = [
      { label: '斩杀', tab: 2, icon: 'event/attack.gif',
        of: all.filter((e) => e.payload['phase'] !== 'returning') },
      { label: '返回', tab: 3, icon: 'event/back.gif',
        of: all.filter((e) => e.payload['phase'] === 'returning') },
      // 来袭：原版 tab 号未留存（实见的只有 2=斩杀 3=返回），取 1 是 [推断]
      { label: '来袭', tab: 1, icon: 'event/attack.gif', of: raids },
    ]
    return groups
      .filter((g) => g.of.length > 0)
      .map((g) => ({
        icon: g.icon,
        text: `${g.of.length} ${g.label}`,
        seconds: Math.max(0, Math.round(Math.min(...g.of.map((e) => e.finishAt)) - s.clock.gameT)),
        openUrl: `battleevent.jsp?tab=${g.tab}`,
      }))
  }

  // 移动事件照原版显示「当前段坐标 + 下个目标」，并带取消的红 ×。
  // 不给 icon：原版 `img/event/` 只有 mark / attack / back 三个文件（07 §7.2），
  // 没有 move.gif；截图 #114 里移动块用的就是那两个 mark.gif 墨点。
  const md = moveDisplay(s)
  const move = md
    ? [{
        text: `(${md.current.x}, ${md.current.y})`,
        seconds: md.current.seconds,
        cancelId: 'move',
        nextLeg: md.next ? { text: `下个目标(${md.next.x},${md.next.y})`, seconds: md.next.seconds } : undefined,
      }]
    : []

  // 当前场景中的玩家：同一格上的 NPC（照原版显示名字 + 状态后缀 + 四个操作图标）
  const here = npcsAtCell(s.npc, s.clock.gameT, s.worldSeed, s.player.x, s.player.y)
  const players = here.map((n) => ({
    name: n.base.name,
    suffix: n.suffix ?? undefined,
    avatar: `${{ 蜀山: 'shushan', 昆仑: 'kunlun', 通天: 'tongtian' }[n.base.school]}m`,
  }))

  return {
    battle: battleRows(),
    craft: rows('craft'),
    move,
    cultivate: rows('cultivate'),
    npcs: sceneNpcNames(s),
    players,
  }
}

/**
 * 事件行图标。战斗行按阶段换图，这两个文件名是原版的
 * （`09 §资源表`：`event/attack.gif` = 出击/斩杀中，`event/back.gif` = 返回中）。
 */
function iconOf(kind: string, payload: Readonly<Record<string, unknown>>): string {
  if (kind !== 'battle') return 'event/mark.gif'
  return payload['phase'] === 'returning' ? 'event/back.gif' : 'event/attack.gif'
}

/**
 * 事件行文字。
 *
 * 原版战斗事件的完整句子是 B 窗（`battleevent.jsp`）里的整行，如
 * 「你放去攻击道法自然(259,14)的 3:49:48 后于…到达」（`03 §1.11` 原文）；
 * 中栏只有 252px 宽，放的是压缩版，所以这里只取目标与阶段。
 */
function labelOf(s: GameState, kind: string, payload: Readonly<Record<string, unknown>>): string {
  if (kind === 'battle') {
    const t = payload['target'] as { name?: string; x?: number; y?: number } | undefined
    const name = t?.name ?? '目标'
    const phase = payload['phase']
    if (phase === 'fighting') return `与${name}缠斗`
    if (phase === 'returning') return `${name} 返回中`
    return `攻击${name}(${t?.x ?? 0},${t?.y ?? 0})`
  }
  if (kind === 'craft') {
    const n = payload['count'] as number
    return `${payload['op'] === 'repair' ? '修理' : ''}${String(payload['name'] ?? '法宝')}${n > 1 ? `×${n}` : ''}`
  }

  if (payload['op'] === 'goldenCore') return '压缩真元'
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

/** 右栏：进行中的任务 + 护法。 */
function rightVm(s: GameState) {
  const quests = activeQuests(s.quests).map((q) => {
    const entry = s.quests.entries.find(e => e.id === q.id)
    // 打怪类任务在任务栏显示目标坐标（照截图 #2「目标地点:(154,102)」）
    const loc = q.goal.kind === 'slay' ? (entry?.at ?? questLocation(s, q)) : null
    return {
      id: q.id,
      title: questTitle(q),
      detail: loc ? `目标地点：(${loc[0]},${loc[1]})` : undefined,
      abandonable: q.category !== 'realm',
    }
  })
  if (s.treasure) quests.push({ id: 'treasure', title: '机缘遇宝',
    detail: `目标地点：(${s.treasure.x},${s.treasure.y})`, abandonable: false })
  return { quests, guardingMe: socialOf(s).guardians.length, guardingOthers: socialOf(s).guardians.length, guardCap: 7 }
}

/** 左栏：按主标签选页面。七个标签全部接真实状态。 */
function leftPane(s: GameState): string {
  switch (tab) {
    case 'map':
      return renderMap(mapVm(s))
    case 'skill':
      return renderSkill(skillVm(s, skillTab))
    case 'item':
      return renderItem(itemVm(s, itemTab))
    case 'trade': {
      const { vm, sheets } = tradeVm(s, tradeView, tradePage, tradeFilter, { search: tradeSearch, level: tradeLevel })
      tradeSheets = sheets.ids
      return renderTrade(vm)
    }
    case 'ally':
      return renderAlly(allyVm(s, allyTab, allyPage))
    // 消息是右侧浮窗，不占左栏；点它时左栏停在人物页（原版同样不换页）
    case 'msg':
    case 'player':
      return renderPlayer(playerVm(s))
  }
}

/**
 * 存储不可用时顶在页面最上方的横幅。
 *
 * 以前只在「怀旧版设置」里写一行小字，玩家根本看不到 —— 隐私模式下玩一整晚、
 * 关掉页面全没。用横幅而不是浮窗：建号页不含浮窗骨架（那在 `renderShell` 里），
 * 而这条警告恰恰在建号之前就该出现。
 */
const noStorageBanner = (): string =>
  STORAGE_KEY_AVAILABLE ? '' :
  `<DIV style="background:#ffe8e8;border-bottom:1px solid #cc0000;padding:6px 10px">
<SPAN class=smallred><B>无法存档</B></SPAN>
<SPAN class=small>：浏览器禁用了本地存储（常见于无痕/隐私模式），这局的进度关掉页面就没了。
想留住进度请换普通窗口，或随时用「关于 → 导出存档」手动备份。</SPAN></DIV>`

/** 倒计时 span 的 start 值每秒递减、正文由 timer 改写；比较栏位是否变化时把它们抹平。 */
const stripCountdowns = (html: string): string => html.replace(/ start="[^"]*">[^<]*/g, '>')

function render(live = false): void {
  const app = root()
  if (!app) return

  if (loadFailure) {
    app.innerHTML = noStorageBanner() + recoveryPage(loadFailure)
    return
  }

  if (!state) {
    app.innerHTML = noStorageBanner() + renderCreatePlayer(draft)
    return
  }

  const s = state
  const serverTime = formatServerTime(s.clock)
  const html = renderShell({
    tab,
    resources: resourceBarOf(s),
    serverTime,
    version: '版本号:1.2.1-yyge',
    left: leftPane(s),
    mid: renderMid(midVm(s)),
    right: renderRight(rightVm(s)),
  })
  // 整页首绘：横幅要跟着一起进 DOM（它是 #gpage 的兄弟节点，之后的局部更新不会动它）
  if (!document.getElementById('gpage')) app.innerHTML = noStorageBanner() + html
  else {
    const template = document.createElement('template')
    template.innerHTML = html
    // 服务器时间每秒都变，单独就地改，别为它重建整个顶栏。
    const clockEl = document.getElementById('servertime')
    if (clockEl) clockEl.textContent = serverTime
    // 浮窗独立于三栏更新；定时刷新时保留正在填写的表单。
    for (const id of ['top', 'gleft', 'gmid', 'gright']) {
      const current = document.getElementById(id)
      const next = template.content.querySelector<HTMLElement>(`#${id}`)
      if (!current || !next) continue
      // 每秒的 pulse 也走这里：内容没变就不碰 DOM。
      if (stripCountdowns(current.innerHTML) === stripCountdowns(next.innerHTML)) continue
      // 变了也只改差异节点：没动的 <img>、输入框焦点和滚动位置都原样保留（见 dom.ts）。
      morph(current, next, { keepDrafts: live })
    }
  }
  for (const quest of app.querySelectorAll<HTMLElement>('[data-live-quest]')) {
    if (quest.parentElement) morph(quest.parentElement, questWindow(s, quest.dataset['liveQuest']!), { keepDrafts: true })
  }
  startCountdowns(app)
}

/**
 * 原版页面里的子标签、分页、筛选全是 `xxx.jsp?tab=N` 这样的普通链接。
 * 页面模块是照原版逐字复刻的，不能为了接数据去改它们的 href，
 * 所以在这里统一拦一次：认识的路由换成切页，不认识的照旧交给浮窗解析器。
 *
 * 返回 true 表示已处理（调用方要 `preventDefault`）。
 */
export function routeJsp(href: string): boolean {
  const m = /(?:^|\/)(\w+)\.jsp(?:\?(.*))?$/.exec(href.replace(/&amp;/g, '&'))
  if (!m) return false
  const page = m[1]!
  const q = new URLSearchParams(m[2] ?? '')
  const n = (key: string, dflt = 0) => Number(q.get(key) ?? dflt) || dflt

  switch (page) {
    case 'player': tab = 'player'; playerView = n('tab') === 2 ? 'body' : 'meridian'; break
    // 原版首页是登录/选服门户，本地版没有，点了就回人物页（不能让它真的跳走）
    case 'index': tab = 'player'; break
    case 'map': {
      tab = 'map'
      // 排行榜、任务窗里的 `map.jsp?x=&y=` 是「把地图跳到这个坐标」
      if (q.has('x') && q.has('y')) {
        const x = n('x', -1)
        const y = n('y', -1)
        if (x >= 0 && y >= 0) {
          mapCenter = { x, y }
          mapSelected = { x, y }
        }
      } else {
        // 不带参数的 `map.jsp` 就是地图页下方那个「返回人物所在」（map.ts:187）。
        // 清掉视图中心，下次渲染自然跟回角色身上。
        mapCenter = null
        mapSelected = null
      }
      break
    }
    case 'skill': {
      tab = 'skill'
      // 原版编号：炼器 2 / 剑术 1 / 术数 3 / 秘笈 6
      const byNum: Record<number, SkillTab> = { 1: 'sword', 2: 'produce', 3: 'math', 6: 'book' }
      skillTab = byNum[n('tab', 2)] ?? 'produce'
      break
    }
    case 'item': {
      tab = 'item'
      const byNum: Record<number, ItemTab> = { 1: 'sword', 2: 'guard', 3: 'pill', 4: 'refine' }
      itemTab = q.has('tab') ? (byNum[n('tab')] ?? 'list') : 'list'
      break
    }
    case 'trade': {
      tab = 'trade'
      const byNum: Record<number, TradeView> = { 2: 'sellqi', 3: 'buyitem', 4: 'sellitem' }
      tradeView = q.has('tab') ? (byNum[n('tab')] ?? 'buyqi') : 'buyqi'
      // 尾页在原版写成 page=0
      tradePage = q.has('page') ? (n('page') || Number.MAX_SAFE_INTEGER) : 1
      // 法宝页的名称/品质筛选（原版参数 search / level），以前直接丢掉 → 搜了没反应
      if (q.has('search') || q.has('level')) {
        tradeSearch = q.get('search') ?? ''
        tradeLevel = n('level', 0)
      }
      if (q.has('give') || q.has('want')) {
        tradeFilter = {
          give: (q.get('give') ?? '') as Element | '',
          want: (q.get('want') ?? '') as Element | '',
        }
      }
      break
    }
    case 'ally': {
      tab = 'ally'
      const byNum: Record<number, AllyTab> = { 1: 'attack', 2: 'member', 3: 'news', 4: 'feature' }
      allyTab = q.has('tab') ? (byNum[n('tab')] ?? 'overview') : 'overview'
      // 「尾页」原版传 page=0，服务端解释成最后一页（trade.jsp 同一约定）。
      // n() 会把 0 当缺省值吞掉，所以这里显式还原成「要多少有多少」，交给 allyVm 去夹。
      allyPage = q.has('page') ? (n('page') || Number.MAX_SAFE_INTEGER) : 1
      break
    }
    case 'msg':
      msgPage = n('page', 1)
      openWindow('rwindow', '消息', renderMsg(msgVm(state!, msgPage)))
      return true
    default:
      return false
  }
  render()
  return true
}

/** 推进到现在 → 重渲染 → 存档。所有交互都走这一条路径。 */
function advanceState(): void {
  if (!state) return
  const out = tick(state, Date.now())
  state = out.state
  if (out.resolved.some(e => e.kind === 'move')) mapCenter = null
}

function step(): void {
  advanceState()
  render()
  persist()
}

function pulse(): void {
  if (!state) return
  advanceState()
  render(true)
  persist()
}

function persist(): void {
  // 读档失败且玩家还没选择怎么办：一个字节都不许写，否则会盖掉可恢复的原始存档
  if (loadFailure) return
  if (!state || !STORAGE_KEY_AVAILABLE) return
  try {
    state = saveGame(localStorage, state, Date.now())
  } catch (e) {
    // 配额不足或隐私模式：提示用户导出，不静默吞掉
    openWindow('mwindow', '存档失败', `<DIV class=middle style="padding:10px">
存档写入失败，可能是浏览器空间不足或禁用了存储。<BR>请用「导出存档」把进度保存下来。</DIV>`)
  }
}

// —— 交互（挂到 window，供页面里的内联 onclick 调用）——

export function installGameActions(): void {
  const g = globalThis as unknown as Record<string, unknown>

  // 原版页面将这两个刷新函数作为 ajaxPost 的回调参数传入。
  g['refleshAll'] = step
  g['refleshRight'] = step

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

  // 经脉/本体节点、法术格、物品名都走 `openRWindow(title, url)`，
  // 全部由 `resolvePage` 按 url 分发（见下），这里不再覆盖 `windows.ts` 的实现。

  /** 升级按钮。法术走名字（存档按名字存），经脉/本体走序号。 */
  g['doUpgrade'] = (system: string, index: number) => {
    if (!state) return
    const target = system === 'skill'
      ? { system: 'skill' as const, id: skillNodeById(index)?.name ?? '' }
      : { system: system as 'meridian' | 'body', index }
    const r = startCultivate(state, target, { hasVip: state.player.vip })
    if (!r.ok) {
      const box = document.getElementById('upgradeMsg')
      if (box) box.innerHTML = `<SPAN class=smallred>${r.reason}</SPAN>`
      return
    }
    state = r.state
    closeWindow('rwindow')
    step()
  }

  /** 事件栏的「半 / 完」。 */
  g['paycoin'] = (pay: number) => {
    if (!state) return
    const r = purchase(state, pay)
    if (!r.ok) return openWindow('mwindow', '无法购买', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
    state = r.state
    step()
  }

  /** 主标签切页。原版是链接跳转，本地版拦下来换渲染。 */
  g['gotoTab'] = (next: string) => {
    tab = next as MainTab
    render()
  }

  /** 页面里少数几处原版用 `location.href=` 跳转的地方改走这里（见 ally.ts 的说明）。 */
  g['gotoJsp'] = (url: string) => void routeJsp(url)

  /** 地图：点格子选中。 */
  g['onMapCellClick'] = (x: number, y: number) => {
    mapSelected = { x, y }
    render()
  }

  /** 地图：向选中场景步行移动。 */
  g['mapMenuMove'] = () => {
    if (!state || !mapSelected) return
    const r = startMove(state, mapSelected.x, mapSelected.y, {
      weeksOpen: weekOfServer(state.clock),
    })
    if (!r.ok) {
      openWindow('mwindow', '无法移动', `<DIV class=middle style="padding:10px">${r.reason}</DIV>`)
      return
    }
    state = r.state
    step()
  }

  g['mapMenuFly'] = () => {
    if (!state || !mapSelected) return
    if (!(state.player.skills['御剑飞行']! > 0)) return tell('御剑飞行', '请先学习御剑飞行秘笈。')
    const { x, y } = mapSelected
    const swords = state.player.artifacts.filter(a => a.kind === 'sword' && a.status === '空闲')
    openWindow('mwindow', '御剑飞行', `<DIV class=middle style="padding:10px">选择飞剑前往(${x},${y})：<BR>${swords.map(a =>
      `<A class=skillup href="#" onclick="flyTo(${x},${y},'${js(a.id)}')">${esc(artifactLabel(a))}</A><BR>`).join('') || '没有空闲飞剑。'}</DIV>`)
  }
  g['flyTo'] = (x: number, y: number, id: string) => {
    if (!state) return
    const r = startFlight(state, x, y, id)
    if (!r.ok) return tell('御剑飞行', r.reason)
    state = r.state
    closeWindow('mwindow')
    step()
  }

  /** 地图：滚屏。 */
  g['goBy'] = (dx: number, dy: number) => {
    if (!state) return
    const dis = Number((document.getElementById('gobydis') as HTMLInputElement | null)?.value ?? 3)
    const c = mapCenter ?? { x: state.player.x, y: state.player.y }
    mapCenter = { x: c.x + dx * dis, y: c.y + dy * dis }
    render()
  }

  /** 地图：坐标跳转。 */
  g['goToPos'] = () => {
    const x = Number((document.getElementById('viewposx') as HTMLInputElement | null)?.value)
    const y = Number((document.getElementById('viewposy') as HTMLInputElement | null)?.value)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      mapCenter = { x, y }
      render()
    }
  }

  /** 事件栏的取消（移动事件的红 ×）。 */
  g['cancelmove'] = () => {
    if (!state) return
    state = cancelMove(state)
    step()
  }

  /** 推算结果、坐标视野、出击资格共用引擎状态。 */
  const castDivination = (kind: DivinationKind, name?: string, spot?: { x: number; y: number }) => {
    if (!state) return
    const target = allNpcsAt(state.npc, state.clock.gameT, state.worldSeed).find(n => n.base.name === name)
    const r = performDivination(state, kind, target?.base.id, spot)
    state = r.state
    closeWindow('lwindow')
    openWindow('mwindow', r.ok ? '推算' : '推算失败', `<DIV class=middle style="padding:10px">${esc(r.ok ? '推算结果已送到你的消息里。' : r.reason ?? '无法推算')}</DIV>`)
    step()
  }
  g['spyScene'] = () => { if (mapSelected) castDivination('水镜玄光', undefined, mapSelected) }
  g['spyPlayer'] = (name: string) => {
    if (!state) return
    const kinds = Object.keys(DIVINATIONS) as DivinationKind[]
    const menu = kinds.map(k => `<DIV style="padding:3px 0"><A class=skillup href="#" onclick="doDivine('${k}','${js(name)}')">${k}</A><SPAN class=smallgray>　${DIVINATIONS[k].effect}</SPAN></DIV>`).join('')
    openWindow('lwindow', '掐指一算', `<DIV class=middle style="padding:10px">${menu}</DIV>`)
  }
  g['doDivine'] = (kind: string, name: string) => castDivination(kind as DivinationKind, name)
  g['divineByName'] = () => castDivination('九宫飞星', (document.getElementById('divinename') as HTMLInputElement | null)?.value.trim())

  /** 出击：把勾选的飞剑派出去。 */
  g['sendFight'] = () => {
    if (!state || !fightTarget) return
    const picked = [...document.querySelectorAll<HTMLInputElement>('input[name=sword]:checked')]
      .map((el) => el.value)
    const swords = launchableSwords(state)
      .filter(({ sword }) => picked.includes(sword.id))
      .map(({ sword }) => sword)
    if (swords.length === 0) {
      openWindow('mwindow', '出击', '<DIV class=middle style="padding:10px">请选择出击的飞剑</DIV>')
      return
    }
    // 从战斗事件里点「支援 / 还击」进来的，并进原事件；否则是一次新的出击
    const r = reinforceEventId
      ? reinforce(state, reinforceEventId, swords, {
          wanjianLevel: state.player.skills['万剑诀'] ?? 0,
        })
      : launch(state, fightTarget, swords, {
          wanjianLevel: state.player.skills['万剑诀'] ?? 0,
          sightRange: sightRange(state.player.body[BODY_EYE] ?? 0),
        })
    if (!r.ok) {
      openWindow('mwindow', '无法出击', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
      return
    }
    state = r.state
    closeWindow('lwindow')
    step()
  }

  /**
   * 求援。原版是「把事件通过消息发给指定的道友」，弹窗里那个输入框 id 是 `gethelpname`
   * （`09 §1.7` 原文）。单机下没有真人可求，发出去的信留在自己的收件箱里作记录 ——
   * 原版同一玩法里「自己支援自己」本来就是常规操作（见 `battle.ts`）。
   */
  g['sendEventMsg'] = (eventId: string) => {
    if (!state) return
    const who = (document.getElementById('gethelpname') as HTMLInputElement | null)?.value ?? ''
    const r = requestHelp(state, eventId, who.trim())
    if (!r.ok) {
      openWindow('mwindow', '求援', `<DIV class=middle style="padding:10px">${esc(r.reason ?? '')}</DIV>`)
      return
    }
    state = r.state
    openWindow('mwindow', '求援',
      `<DIV class=middle style="padding:10px">已向 ${esc(who || '道友')} 发出求援。</DIV>`)
    step()
  }

  /**
   * 游戏指南的后退 / 前进（面包屑右侧那两个黑色实心双三角）。
   * 退回去时**不再往历史里追加**，否则「历史：」会自己长出重复项。
   */
  const showHelp = (topic: string) =>
    openWindow('hwindow', '', renderHelp({ topic, history: helpHistory }))

  g['helpBack'] = () => {
    if (helpHistory.length < 2) return
    const last = helpHistory[helpHistory.length - 1]!
    helpForwardStack = [...helpForwardStack, last]
    helpHistory = helpHistory.slice(0, -1)
    showHelp(helpHistory[helpHistory.length - 1]!)
  }

  g['helpForward'] = () => {
    const next = helpForwardStack[helpForwardStack.length - 1]
    if (next === undefined) return
    helpForwardStack = helpForwardStack.slice(0, -1)
    helpHistory = [...helpHistory, next]
    showHelp(next)
  }

  g['selectAllSwords'] = (checked: boolean) => {
    for (const el of document.querySelectorAll<HTMLInputElement>('input[name=sword]')) {
      el.checked = checked
    }
  }

  /** 收件箱的全选与删除。 */
  g['selectAllMsg'] = (checked: boolean) => {
    for (const el of document.querySelectorAll<HTMLInputElement>('#msgform input[name=ids]')) {
      el.checked = checked
    }
  }
  g['removeSelectMsg'] = () => {
    if (!state) return
    // 复选框的 value 是当页的 1 起序号，换算回 mail 数组下标
    const picked = [...document.querySelectorAll<HTMLInputElement>('#msgform input[name=ids]:checked')]
      .map((el) => Number(el.value) - 1)
    if (picked.length === 0) return
    state = { ...state, mail: state.mail.filter((_, i) => !picked.includes(i)) }
    openWindow('rwindow', '消息', renderMsg(msgVm(state, msgPage)))
    step()
  }

  // —— 城镇 ——
  // 城镇是踩上去才入档的，所以每个操作前先把这一格的镇写回 state。

  const withTown = (fn: (town: Town, s: GameState) => GameState | { error: string }): void => {
    if (!state) return
    const here = townHere(state)
    if (!here) return
    const s0: GameState = here.fresh
      ? { ...state, towns: { ...state.towns, [townKey(here.town.x, here.town.y)]: here.town } }
      : state
    const out = fn(here.town, s0)
    if ('error' in out) {
      openWindow('mwindow', '提示', `<DIV class=middle style="padding:10px">${esc(out.error)}</DIV>`)
      return
    }
    state = out
    closeWindow('lwindow')
    step()
  }

  g['takeEscort'] = (x: number, y: number) => withTown((town, s) => {
    const r = acceptEscort(s, town, { x, y })
    return r.ok ? r.state : { error: r.reason }
  })

  g['readBook'] = (name: string) => withTown((town, s) => {
    const r = readBook(s, name, town.kind, { free: canReadFree(town, s.player.name) })
    return r.ok ? r.state : { error: r.reason }
  })

  g['exchangeNote'] = (name: string) => withTown((_town, s) => {
    const r = exchangeNote(s, name)
    return r.ok ? r.state : { error: r.reason }
  })

  g['redeemNote'] = (name: string) => withTown((_town, s) => {
    const r = redeemNote(s, name)
    return r.ok ? r.state : { error: r.reason }
  })

  g['doInvest'] = () => withTown((town, s) => {
    const silver = Number((document.getElementById('investsilver') as HTMLInputElement | null)?.value ?? 0)
    // 「只能投一处产业」这条规则要看别处的镇，所以把已知的镇全传进去
    const others = Object.values(s.towns)
    const r = invest(s, town, silver, others)
    if (!r.ok) return { error: r.reason }
    return {
      ...r.state,
      towns: { ...r.state.towns, [townKey(r.town.x, r.town.y)]: r.town },
    }
  })

  g['doTeleport'] = () => withTown((town, s) => {
    const x = Number((document.getElementById('tpx') as HTMLInputElement | null)?.value)
    const y = Number((document.getElementById('tpy') as HTMLInputElement | null)?.value)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: '请填写目标坐标' }
    const r = teleport(s, { x, y }, { fromKind: town.kind })
    return r.ok ? r.state : { error: r.reason }
  })

  g['payLiYuanwai'] = () => withTown((_town, s) => {
    const r = payLiYuanwai(s)
    return r.ok ? r.state : { error: r.reason }
  })

  const applySocial = (r: ReturnType<typeof changeGuardian>) => {
    if (!r.ok) return openWindow('mwindow', '提示', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
    state = r.state
    closeWindow('lwindow')
    step()
  }
  g['addpal'] = (name: string | number) => {
    if (!state) return
    const npc = state.npc.bases.find(n => typeof name === 'number' ? n.id === name : n.name === name)
    applySocial(changeGuardian(state, npc?.id ?? -1, true))
  }
  g['blockSender'] = (name: string, blocked: boolean) => { if (state) applySocial(setBlocked(state, name, blocked)) }
  g['removeGuardian'] = (id: number) => { if (state) applySocial(changeGuardian(state, id, false)) }
  g['guildAction'] = (action: string) => {
    if (!state) return
    const val = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? ''
    const r = action === 'create' ? createGuild(state, val('guildname'))
      : action === 'join' ? joinGuild(state, Number(val('guildtarget')))
      : action === 'leave' ? leaveGuild(state)
      : action === 'recruit' ? recruitGuildMember(state, Number(val('guildnpc')), val('guildjob'))
      : setGuildRelation(state, Number(val('guildtarget')), action as 'ally' | 'enemy' | 'neutral')
    applySocial(r)
  }

  /** 原版的通用 ajax 提交入口。本地版没有服务端，按 action 分发。 */
  g['ajaxPost'] = (action: string, params: string) => {
    const g2 = globalThis as unknown as Record<string, (...a: unknown[]) => void>
    const p = new URLSearchParams(params ?? '')
    if (action === 'paycoin') {
      const m = /pay=(\d+)/.exec(params ?? '')
      if (m) g2['paycoin']!(Number(m[1]))
      return
    }
    if (action === 'buyqi' || action === 'buyitem') {
      doMarketBuy(action, Number(p.get('sheet') ?? -1))
      return
    }
    if (action === 'unsellqi' || action === 'unsellitem') {
      doMarketCancel(action, Number(p.get('sheet') ?? -1))
      return
    }
    if (action === 'unestate' && state) {
      const town = state.towns[p.get('town') ?? '']
      if (!town) return
      const r = withdrawInvestment(state, town)
      if (!r.ok) return openWindow('mwindow', '撤资', esc(r.reason))
      state = { ...r.state, towns: { ...r.state.towns, [townKey(r.town.x, r.town.y)]: r.town } }
      closeWindow('lwindow')
      step()
      return
    }
    if (action === 'finishquest') {
      doClaimQuest(p.get('questid') ?? '')
      return
    }
    if (action === 'cancelquest') {
      g2['cancelquest']!(p.get('questid') ?? '')
      return
    }
    openWindow('mwindow', '提示',
      `<DIV class=middle style="padding:10px">（${esc(action)} 尚未接入）</DIV>`)
  }
  g['postForm'] = (action: string, params?: string) => {
    if (action === 'sellqi') return doListQi()
    if (action === 'sellitem') return doListArtifact()
    if (action === 'sendmsg') return doSendMsg()
    // 个人资料窗用的是 postForm('addpal','playerid=N')，中栏用的是 addpal(name)，
    // 两个入口要走同一条路（`playerinfo.ts:86` vs `sidebar.ts:218`）
    if (action === 'addpal') {
      const id = Number(new URLSearchParams(params ?? '').get('playerid') ?? 0)
      if (!state) return
      ;(globalThis as unknown as Record<string, (n: number) => void>)['addpal']!(id)
      return
    }
    openWindow('mwindow', '提示', `<DIV class=middle style="padding:10px">（${esc(action)} 尚未接入）</DIV>`)
  }

  /** 炼制法宝（炼制页的「炼制」按钮）。数量从原版那个 `craft{id}` 输入框读。 */
  g['sendMakeItem'] = (itemId: number, count?: number) => {
    if (!state) return
    // 淬炼页共用这个按钮，但走的是完全不同的规则（两件合一、失败俱毁）
    if (itemTab === 'refine') return doRefine(itemId)
    const box = document.getElementById(`craft${itemId}`) as HTMLInputElement | null
    const n = Math.max(1, Math.floor(Number(box?.value) || count || 1))
    const made = craftOrderFor(state, itemId, n)
    if (!made) {
      openWindow('mwindow', '无法炼制',
        '<DIV class=middle style="padding:10px">这件法宝没有留下炼制配方。</DIV>')
      return
    }
    const r = startCraft(state, made)
    if (!r.ok) {
      openWindow('mwindow', '无法炼制', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
      return
    }
    state = r.state
    step()
  }

  /** 法宝一览的各操作。radio 的 value 是 `itemsn`（1 起），0 表示忙碌中不可选。 */
  const selected = (group: number): number => {
    const el = document.querySelector<HTMLInputElement>(`input[name=selectitem${group}]:checked`)
    return Number(el?.value ?? 0)
  }
  const tell = (title: string, text: string) =>
    openWindow('mwindow', title, `<DIV class=middle style="padding:10px">${esc(text)}</DIV>`)

  const destroy = (group: number) => {
    if (!state) return
    const sn = selected(group)
    if (!sn) return tell('销毁', '请先选中一件法宝。')
    const item = state.player.artifacts[sn - 1]
    if (!item) return
    ;(globalThis as unknown as Record<string, (t: string, h: string, ok?: () => void) => void>)
      ['MDialogOkCancel']!('销毁',
        `<DIV class=middle style="padding:10px">确定销毁 ${esc(artifactLabel(item))} 吗?</DIV>`,
        () => {
          if (!state) return
          state = {
            ...state,
            player: {
              ...state.player,
              artifacts: state.player.artifacts.filter((_, i) => i !== sn - 1),
            },
          }
          step()
        })
  }
  for (const gid of [1, 2, 3, 5]) {
    g[`sendDestroyItem${gid}`] = () => destroy(gid)
    g[`sendSellItem${gid}`] = () => {
      if (!state) return
      const sn = selected(gid)
      const item = sn ? state.player.artifacts[sn - 1] : undefined
      if (!item) return tell('出售', '请先选中一件法宝。')
      if (item.status !== '空闲' || !canTradeArtifact(item)) return tell('出售', '这件物品不可交易，或正在使用中。')
      tradeView = 'sellitem'
      tab = 'trade'
      render()
    }
  }
  g['sendDestroyAllItem'] = () => {
    if (!state) return
    state = {
      ...state,
      player: { ...state.player, artifacts: state.player.artifacts.filter((a) => a.kind !== 'misc') },
    }
    step()
  }
  g['sendUseItem2'] = () => usePill()
  g['sendUseItem3'] = (id?: string) => {
    if (!state) return
    const r = learnSecret(state, id ?? state.player.artifacts[selected(3) - 1]?.id ?? '')
    if (!r.ok) return tell('秘笈', r.reason)
    state = r.state
    step()
    tell('秘笈', '已学会秘笈记载的法门。')
  }
  g['sendUseItem5'] = () => {
    if (!state) return
    const item = state.player.artifacts[selected(5) - 1]
    if (!item) return tell('使用', '请先选中一件物品。')
    const treasure = ['藏宝图', '天宫秘箓'].includes(item.name)
    const material = SECRET_MATERIALS.some(n => n === item.name)
    const box = item.name === '新手玄武玉匣'
    if (!treasure && !material && !box && !BANK_NOTES.some(note => note.name === item.name)) return tell('任务物品', '任务物品在对应任务完成时自动消耗。')
    const r = treasure ? startTreasure(state, item.id) : material ? combineSecret(state) : box ? openNoviceBox(state, item.id) : redeemNote(state, item.name)
    if (!r.ok) return tell('使用', r.reason)
    state = r.state
    step()
    if (treasure) openWindow('lwindow', '机缘遇宝', questWindow(state, 'treasure'))
    if (material) tell('天宫秘箓', '四件材料已合成天宫秘箓，可在法宝栏使用。')
    if (box) tell('新手玄武玉匣', `获得${artifactLabel(state.player.artifacts.at(-1)!)}。`)
  }
  g['claimTreasure'] = () => {
    if (!state) return
    const name = state.treasure?.reward.name
    const r = claimTreasure(state)
    if (!r.ok) return tell('机缘遇宝', r.reason)
    state = r.state
    closeWindow('lwindow')
    step()
    tell('机缘遇宝', `获得${name}。`)
  }
  g['sendRepairItem'] = () => {
    if (!state) return
    const item = state.player.artifacts[selected(1) - 1]
    if (!item || item.status !== '损坏') return tell('修理', '请先选中一件损坏的法宝。')
    const plan = repairPlan(state, item.id)
    if (!plan) return tell('修理', '这件法宝缺少修理资料，暂不能修理。')
    ;(globalThis as unknown as Record<string, (t: string, h: string, ok?: () => void) => void>)
      ['MDialogOkCancel']!('修理', `<DIV class=middle style="padding:10px">修理 ${esc(artifactLabel(item))}<BR>
金、木、水、火、土真气：${plan.cost.join(' / ')}<BR>需要时间 ${formatDuration(plan.seconds)}</DIV>`, () => {
        if (!state) return
        const result = startRepair(state, item.id)
        if (!result.ok) return tell('修理', result.reason)
        state = result.state
        step()
      })
  }
  const upgradeQuality = (all: boolean) => {
    if (!state) return
    const item = state.player.artifacts[selected(1) - 1]
    if (!item) return tell('提升品质', '请先选中一件法宝。')
    const r = (all ? upgradeAllArtifactQuality : upgradeArtifactQuality)(state, item.id)
    if (!r.ok) return tell('提升品质', r.reason)
    state = r.state
    step()
  }
  g['sendUpgradeItem'] = () => upgradeQuality(false)
  g['sendUpgradeAllItem'] = () => upgradeQuality(true)

  function usePill(): void {
    if (!state) return
    const item = state.player.artifacts[selected(2) - 1]
    if (!item) return tell('服食', '请先选中一颗丹药。')
    const result = consumePill(state, item.id)
    if (!result.ok) return tell('服食', result.reason)
    state = result.state
    step()
  }

  /** 查看可领取任务。 */
  g['showAvailableQuests'] = () => {
    if (!state) return
    const list = availableQuests(state.quests, state)
    const body = list.length === 0
      ? '<DIV class=smallgray>目前没有可以领取的任务。</DIV>'
      : list.map((q) =>
          `<DIV style="padding:4px 0"><A class=skillup href="#" onclick="acceptQuest('${js(q.id)}')">${questTitle(q)}</A></DIV>`,
        ).join('')
    openWindow('lwindow', '可领取任务', `<DIV class=middle style="padding:10px">${body}</DIV>`)
  }

  g['acceptQuest'] = (id: string) => {
    if (!state) return
    const r = accept(state.quests, state, id)
    if (!r.ok) {
      openWindow('mwindow', '无法领取', `<DIV class=middle style="padding:10px">${r.reason}</DIV>`)
      return
    }
    state = { ...state, quests: r.value }
    closeWindow('lwindow')
    step()
  }

  g['questAnswer'] = (id: string, answer: string) => {
    if (!state) return
    const r = answerQuiz(state.quests, state, id, answer)
    if (!r.ok) return openWindow('mwindow', '答题', esc(r.reason))
    state = { ...state, quests: r.value }
    openWindow('lwindow', '任务', questWindow(state, id))
    step()
  }
  g['questChooseLine'] = (id: string, line: 'qi' | 'sword') => {
    if (!state) return
    state = { ...state, quests: chooseLine(state.quests, id, line) }
    openWindow('lwindow', '任务', questWindow(state, id))
    step()
  }
  g['questGatherCore'] = (id: string) => {
    if (!state) return
    const amount = Number((document.getElementById('core-qi-amount') as HTMLInputElement | null)?.value)
    const r = gatherCoreQi(state, id, amount)
    if (!r.ok) return openWindow('mwindow', '汇聚真气', esc(r.reason))
    state = r.value
    openWindow('lwindow', '任务', questWindow(state, id))
    step()
  }
  g['questCompressCore'] = (id: string) => {
    if (!state) return
    const r = startCoreCompression(state, id)
    if (!r.ok) return openWindow('mwindow', '压缩真元', esc(r.reason))
    state = r.value
    openWindow('lwindow', '任务', questWindow(state, id))
    step()
  }

  g['cancelquest'] = (id: string) => {
    if (!state) return
    const eventId = state.quests.entries.find(e => e.id === id)?.coreEventId
    const r = abandon(state.quests, id)
    if (!r.ok) {
      openWindow('mwindow', '无法放弃', `<DIV class=middle style="padding:10px">${r.reason}</DIV>`)
      return
    }
    state = { ...state, quests: r.value, timeline: { events: state.timeline.events.filter(e => e.id !== eventId) } }
    step()
  }

  /** 把读不出来的原始存档原样存成文件，交给玩家自己留底。 */
  g['downloadRaw'] = (which: 'main' | 'backup') => {
    const raw = which === 'main' ? loadFailure?.main : loadFailure?.backup
    if (!raw) return
    const blob = new Blob([raw], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `xiuzhen-${which}-raw.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 0)
  }

  /** 玩家确认放弃抢救之后，才允许清掉旧档并重新开始。 */
  g['discardBrokenSave'] = () => {
    const g2 = globalThis as unknown as Record<string, (t: string, h: string, ok?: () => void) => void>
    g2['MDialogOkCancel']!(
      '清空存档',
      '<DIV class=middle style="padding:10px">确定清空这份读不出来的存档并重新建号？<BR>' +
      '<SPAN class=smallred>清空之后就找不回来了，建议先下载原始数据。</SPAN></DIV>',
      () => {
        try {
          clearSave(localStorage)
        } catch { /* 忽略 */ }
        loadFailure = null
        state = null
        resetViewState()
        render()
      },
    )
  }

  /** 顶栏「关于」→ 怀旧版设置。 */
  g['openSettings'] = () => {
    if (!state) return
    let bytes = 0
    try {
      bytes = (localStorage.getItem(SAVE_KEYS.main) ?? '').length
    } catch { /* 存储不可用 */ }
    // 标题传空：设置页自己那张表的表头就是「怀旧版设置」，
    // 壳子再写一遍就重复了（原版壳子标题与内容表头从不同名）。
    openWindow('lwindow', '', renderSettings({
      rate: state.clock.rate,
      dayOfServer: dayOfServer(state.clock),
      saveBytes: bytes,
      storageOk: STORAGE_KEY_AVAILABLE,
      vip: state.player.vip,
    }))
  }

  /** 怀旧版设置里的 VIP 开关。规则照原版：多一个待修名额（顺序修炼）、多 5 个法宝格。 */
  g['toggleVip'] = () => {
    if (!state) return
    state = { ...state, player: { ...state.player, vip: !state.player.vip } }
    step()
    ;(globalThis as unknown as Record<string, () => void>)['openSettings']!()
  }

  /**
   * 原版付费页买完之后的回调，用来把那一页刷新一遍
   * （原文 `ajaxPost('paycoin', 'pay=N', openPayment);` 的第三个参数）。
   * 我们的页面模块照原版逐字渲染那一行，所以这个全局必须存在 —— 否则内联
   * onclick 会在调用 ajaxPost 之前就抛 ReferenceError，点了毫无反应。
   */
  g['openPayment'] = () => {
    if (!state) return
    openWindow('lwindow', '', resolvePage('payment.jsp'))
  }

  g['setRate'] = (rate: number) => {
    if (!state) return
    state = changeRate(state, Date.now(), rate)
    step()
    ;(globalThis as unknown as Record<string, () => void>)['openSettings']!()
  }

  g['importSavePrompt'] = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const loaded = importGame(await file.text())
        const apply = () => {
          state = { ...loaded, clock: { ...loaded.clock, wallT: Date.now() } }
          loadFailure = null   // 导入成功，解除「禁止写盘」
          closeWindow('lwindow')
          step()
        }
        // 读档失败时本来就没有能丢的东西，直接覆盖；
        // 正常游戏中导入会**当场盖掉当前进度**（1 秒后 pulse 连备份一起换掉），
        // 所以要先让玩家确认，并把两边的角色摆出来对照 —— 选错文件的代价太大。
        if (!state) return apply()
        const g2 = globalThis as unknown as Record<string, (t: string, h: string, ok?: () => void) => void>
        g2['MDialogOkCancel']!(
          '导入存档',
          `<DIV class=middle style="padding:10px">导入后<B>当前进度会被覆盖且无法撤销</B>。<BR><BR>` +
          `当前：${esc(state.player.name)}　道行 ${esc(daoxingText(state.player.daoxing))}<BR>` +
          `导入：${esc(loaded.player.name)}　道行 ${esc(daoxingText(loaded.player.daoxing))}<BR><BR>` +
          `<SPAN class=smallred>建议先「导出」备份当前存档。</SPAN></DIV>`,
          apply,
        )
      } catch (e) {
        openWindow('mwindow', '导入失败', `<DIV class=middle style="padding:10px">${
          e instanceof Error ? esc(e.message) : '存档格式不对'
        }</DIV>`)
      }
    }
    input.click()
  }

  g['resetGame'] = () => {
    const g2 = globalThis as unknown as Record<string, (t: string, h: string, ok?: () => void) => void>
    g2['MDialogOkCancel']!(
      '重新开始',
      '<DIV class=middle style="padding:10px">这会清空当前进度，重新建号。<BR>建议先导出存档。</DIV>',
      () => {
        try {
          clearSave(localStorage)
        } catch { /* 忽略 */ }
        state = null
        resetViewState()
        closeWindow('lwindow')
        render()
      },
    )
  }


  // ===========================================================================
  // GM 面板（本地版工具，非原版）
  // ===========================================================================

  /** 表单里一个字段的原始值。面板上的 NAME 全部以 `gm-` 开头。 */
  const field = (name: string): string | undefined => {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `#gmform [name="${CSS.escape(name)}"]`)
    return el === null ? undefined : el.value
  }
  const fieldNum = (name: string, fallback: number): number => {
    const raw = field(name)
    const v = raw === undefined || raw.trim() === '' ? NaN : Number(raw)
    return Number.isFinite(v) ? v : fallback
  }
  const checked = (name: string): boolean =>
    document.querySelector<HTMLInputElement>(`#gmform [name="${CSS.escape(name)}"]`)?.checked === true

  /**
   * 这一格被人动过没有。
   *
   * 用浏览器自己的 `defaultValue` / `defaultChecked` —— 它记的正是渲染那一刻写进
   * `value=` 属性里的值，不用自己再存一份快照。
   *
   * 为什么非做不可：面板是浮窗，开着的时候左栏照常能玩，每秒还有一次 pulse 在推进时间。
   * 以前不管动没动都把整张表当成补丁发出去，于是「开着面板买了把剑，回来点应用」
   * 会按面板打开那一刻的快照把剑删掉、真气银两一起回滚，还只提示一句「已应用」。
   */
  const dirty = (name: string): boolean => {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
      `#gmform [name="${CSS.escape(name)}"]`)
    if (el === null) return false
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      return el.checked !== el.defaultChecked
    }
    if (el instanceof HTMLSelectElement) {
      return [...el.options].some((o) => o.selected !== o.defaultSelected)
    }
    return el.value !== (el as HTMLInputElement).defaultValue
  }
  /** 一组里只要有一格动过，整组都要发（等级、真气这些是数组，不能只发一半）。 */
  const anyDirty = (names: readonly string[]): boolean => names.some(dirty)

  /**
   * 把表单里**动过的那些格子**读成一份补丁。
   *
   * 没动过的字段一律不放进补丁 —— `applyGm` 对 `undefined` 的字段原样不动，
   * 这样面板开着期间在别处发生的变化不会被回滚。
   * 每个动作（应用 / 加法宝 / 删法宝 / 填满真气）都先读一遍表单再动手，
   * 这样「改了一堆数字还没应用，顺手删了一件法宝」也不会把那堆数字丢掉。
   */
  function readGmForm(s: GameState): GmPatch {
    const p = s.player
    const patch: Record<string, unknown> = {}
    const put = (key: string, name: string, read: () => unknown) => {
      if (dirty(name)) patch[key] = read()
    }

    put('name', 'gm-name', () => field('gm-name'))
    put('gender', 'gm-gender', () => (field('gm-gender') === '女' ? 'f' : 'm'))
    put('element', 'gm-element', () => field('gm-element'))
    put('school', 'gm-school', () => field('gm-school'))
    put('realm', 'gm-realm', () => field('gm-realm'))
    put('x', 'gm-x', () => fieldNum('gm-x', p.x))
    put('y', 'gm-y', () => fieldNum('gm-y', p.y))
    put('silver', 'gm-silver', () => fieldNum('gm-silver', p.silver))
    put('coin', 'gm-coin', () => fieldNum('gm-coin', p.coin))
    put('bonusCoin', 'gm-bonusCoin', () => fieldNum('gm-bonusCoin', p.bonusCoin))
    put('daoxing', 'gm-daoxing', () => fieldNum('gm-daoxing', p.daoxing))
    put('experience', 'gm-experience', () => fieldNum('gm-experience', p.experience))
    put('vip', 'gm-vip', () => checked('gm-vip'))
    if (checked('gm-clearEvents')) patch['clearEvents'] = true

    const qiNames = ELEMENTS.map((_, i) => `gm-qi${i}`)
    if (anyDirty(qiNames)) patch['qi'] = qiNames.map((n, i) => fieldNum(n, p.qi[i] ?? 0))
    const merNames = MERIDIANS.map((_, i) => `gm-meridian${i}`)
    if (anyDirty(merNames)) patch['meridians'] = merNames.map((n, i) => fieldNum(n, p.meridians[i] ?? 0))
    const bodyNames = BODY_PARTS.map((_, i) => `gm-body${i}`)
    if (anyDirty(bodyNames)) patch['body'] = bodyNames.map((n, i) => fieldNum(n, p.body[i] ?? 0))

    const skillNames = [...skillCaps().keys()]
    if (anyDirty(skillNames.map((n) => `gm-skill:${n}`))) {
      const skills: Record<string, number> = {}
      for (const name of skillNames) {
        const v = fieldNum(`gm-skill:${name}`, p.skills[name] ?? 0)
        if (v > 0) skills[name] = v
      }
      patch['skills'] = skills
    }

    // 法宝行：只要有一格动过就整张表发。`gm-item-id` 是隐藏域、永远不 dirty，
    // 所以专门看品质/淬炼/数量/状态那四列。
    const itemNames: string[] = []
    for (let i = 0; field(`gm-item-id:${i}`) !== undefined; i++) {
      itemNames.push(`gm-item-quality:${i}`, `gm-item-refine:${i}`, `gm-item-count:${i}`, `gm-item-status:${i}`)
    }
    if (anyDirty(itemNames)) {
      const items: Artifact[] = []
      for (let i = 0; ; i++) {
        const id = field(`gm-item-id:${i}`)
        if (id === undefined) break
        const original = p.artifacts.find((a) => a.id === id)
        if (!original) continue
        items.push({
          ...original,
          quality: (field(`gm-item-quality:${i}`) ?? original.quality) as Artifact['quality'],
          refine: fieldNum(`gm-item-refine:${i}`, original.refine),
          status: field(`gm-item-status:${i}`) ?? original.status,
          count: fieldNum(`gm-item-count:${i}`, original.count),
        })
      }
      patch['artifacts'] = items
    }
    return patch as GmPatch
  }

  /** 当前背包（按面板上那些行读出来的，供加/删法宝在它上面改）。 */
  function gmCurrentArtifacts(s: GameState): readonly Artifact[] {
    const fromForm = readGmForm(s).artifacts
    return fromForm ?? s.player.artifacts
  }

  /** 落一份补丁，记下收拢说明，重开面板。 */
  function commitGm(patch: GmPatch): void {
    if (!state) return
    const r = applyGm(state, patch)
    if (!r.ok) {
      gmNotice = { ok: false, lines: [`没有改动：${r.reason}`] }
    } else {
      state = r.state
      gmNotice = {
        ok: true,
        lines: r.notes.length === 0
          ? ['已应用。']
          : ['已应用，其中这些被收拢到了上限：', ...r.notes],
      }
      step()
    }
    ;(globalThis as unknown as Record<string, () => void>)['openGm']!()
  }

  g['openGm'] = () => {
    if (!state) return
    openWindow('lwindow', 'GM 面板', resolvePage('gm.jsp'))
  }

  /** 召唤三尸：即时动作，不跟「应用修改」走，所以不读表单。 */
  g['gmSummonSanshi'] = () => {
    if (!state) return
    const r = summonSanshi(state)
    if (!r.ok) {
      gmNotice = { ok: false, lines: [`召唤失败：${r.reason}`] }
    } else {
      state = r.state
      gmNotice = { ok: true, lines: [r.message] }
      step()
    }
    ;(globalThis as unknown as Record<string, () => void>)['openGm']!()
  }

  g['gmApply'] = () => {
    if (!state) return
    commitGm(readGmForm(state))
  }

  g['gmFillQi'] = () => {
    if (!state) return
    const patch = readGmForm(state)
    // 上限按**表单里的**丹田气海算，不是按当前的 —— 一次就能「丹田拉满 + 真气拉满」
    const draftState: GameState = {
      ...state,
      player: { ...state.player, body: patch.body ?? state.player.body },
    }
    const cap = capacityOf(draftState)
    commitGm({ ...patch, qi: [cap, cap, cap, cap, cap] })
  }

  g['gmZeroQi'] = () => {
    if (!state) return
    commitGm({ ...readGmForm(state), qi: [0, 0, 0, 0, 0] })
  }

  g['gmDropItem'] = (id: string) => {
    if (!state) return
    const patch = readGmForm(state)
    commitGm({ ...patch, artifacts: gmCurrentArtifacts(state).filter((a) => a.id !== id) })
  }

  g['gmAddItem'] = () => {
    if (!state) return
    const name = field('gm-add-name')
    if (!name) return
    const patch = readGmForm(state)
    const quality = (field('gm-add-quality') ?? '极品') as Artifact['quality']
    const refine = Math.max(0, fieldNum('gm-add-refine', 0))
    const item: Artifact = {
      // 时间戳做 id：GM 加的东西不参与任何按 id 推导的逻辑，只要不撞车
      id: `gm:${Date.now().toString(36)}:${Math.floor(performance.now() * 1000).toString(36)}`,
      kind: gmItemKind(name),
      name,
      quality,
      refine,
      status: '空闲',
      count: 1,
    }
    commitGm({ ...patch, artifacts: [...gmCurrentArtifacts(state), item] })
  }

  g['exportSave'] = () => {
    if (!state) return
    const blob = new Blob([serializeExport(state, Date.now())], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `xiuzhen-${state.player.name}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 0)
  }
}


/** 目录里的名字 → 法宝类别。GM 加的东西也要能被物品页正确分类。 */
function gmItemKind(name: string): Artifact['kind'] {
  if (swordByName(name)) return 'sword'
  if (DEFENSIVE_ARTIFACTS.some((d) => d.name === name) || DEFENSIVE_ARTIFACT_NAMES_KNOWN.includes(name)) return 'guard'
  if (PILL_NAMES.some((p) => name.endsWith(p))) return 'pill'
  if (BOOKS.some((b) => b.name === name)) return 'book'
  return 'misc'
}

/** GM 面板可加入的法宝目录。 */
const GM_CATALOG: readonly { readonly group: string; readonly names: readonly string[] }[] = [
  { group: '飞剑', names: SWORDS.map((s) => s.name) },
  { group: '护身', names: DEFENSIVE_ARTIFACT_NAMES_KNOWN },
  { group: '丹药', names: PILL_TIERS.flatMap((t) => PILL_NAMES.map((n) => `${t}${n}`)) },
  { group: '书', names: BOOKS.map((b) => b.name) },
  { group: '银票', names: BANK_NOTES.map((n) => n.name) },
]

function gmVm(s: GameState): GmVm {
  const caps = skillCaps()
  const slots = artifactCapacity(s)
  return {
    name: s.player.name,
    gender: s.player.gender,
    element: s.player.element,
    school: s.player.school,
    realm: s.player.realm,
    x: s.player.x,
    y: s.player.y,
    // 用 floorQi 而不是 Math.floor：真气是浮点累加出来的，17279.99999999 数学上就是
    // 17280，顶栏显示的也是 17280 —— 面板里不能比顶栏少 1。
    qi: s.player.qi.map(floorQi),
    qiCap: capacityOf(s),
    silver: s.player.silver,
    coin: s.player.coin,
    bonusCoin: s.player.bonusCoin,
    daoxing: s.player.daoxing,
    daoxingText: daoxingText(s.player.daoxing),
    experience: s.player.experience,
    vip: s.player.vip,
    meridians: MERIDIANS.map((m, i) => ({
      name: m.name, level: s.player.meridians[i] ?? 0, cap: meridianCapFor(s.player.realm),
    })),
    body: BODY_PARTS.map((name, i) => ({ name, level: s.player.body[i] ?? 0, cap: bodyCapFor(i) })),
    skills: (['produce', 'sword', 'math'] as const).flatMap((tree) =>
      SKILL_TREES[tree].map((n) => ({
        tree: { produce: '炼器', sword: '剑诀', math: '术数' }[tree],
        name: n.name,
        level: s.player.skills[n.name] ?? 0,
        cap: caps.get(n.name) ?? n.cap,
      }))),
    artifacts: s.player.artifacts.map((a) => ({
      id: a.id, kind: a.kind, name: a.name, quality: a.quality,
      refine: a.refine, status: a.status, count: a.count,
    })),
    used: artifactSpaceUsed(s),
    slots,
    catalog: GM_CATALOG,
    qualities: [...QUALITIES],
    statuses: [...ITEM_STATUSES],
    elements: [...ELEMENTS],
    schools: [...SCHOOLS],
    realms: [...REALMS],
    events: s.timeline.events.length,
    sanshi: (() => {
      const v = sanshiView(s)
      return {
        name: v.quest?.name ?? null,
        step: v.quest?.step ?? 0,
        total: v.quest?.total ?? 0,
        status: v.status,
        at: v.at,
        isSpawnDay: v.isSpawnDay,
        blocked: v.blocked,
      }
    })(),
    notice: gmNotice,
  }
}

/**
 * 浮窗内容解析器。原版这些浮窗是去服务端取 `xxx.jsp` 的片段，
 * 本地版按同样的 URL 分发到各页面模块（见 `windows.ts` 的 `setPageResolver`）。
 */
function resolvePage(url: string): string {
  advanceState()
  const s = state
  if (!s) return ''
  const [path, query] = url.replace(/&amp;/g, '&').split('?')
  const q = new URLSearchParams(query ?? '')
  const page = /(\w+)\.jsp$/.exec(path ?? '')?.[1]

  switch (page) {
    // 本地版工具，不是原版的页面（见 pages/gm.ts）
    case 'gm': {
      const html = renderGm(gmVm(s))
      gmNotice = undefined   // 提示只显示一次
      return html
    }

    case 'msg':
      msgPage = Number(q.get('page') ?? 1) || 1
      return renderMsg(msgVm(s, msgPage))

    case 'msgdetail':
      return mailDetail(s, Number(q.get('msg') ?? 0))

    // 门派新闻里的一条 = 收件箱里的一封战报/推算信，用同一个读信页
    case 'allymsg':
      return mailDetail(s, Number(q.get('msg') ?? 0))

    case 'writemsg':
      return renderWriteMsg({
        receiver: q.get('receiver') ?? '',
        subject: q.get('remsg') ? `Re:${s.mail[Number(q.get('remsg')) - 1]?.subject ?? ''}` : '',
        replyTo: q.has('remsg') ? Number(q.get('remsg')) : null,
      })

    case 'itemmid':
      return itemWindow(s, Number(q.get('item') ?? 0), q.get('itemsn'))

    case 'skillmid': {
      // 同一个路由承载三种升级面板：人物页的经脉/本体节点带 `type=&idx=`，
      // 法术树的格子带 `skill=`（都是原版写法，见 player.ts / skill.ts）
      const type = q.get('type')
      if (type === 'meridian' || type === 'body') {
        const index = Number(q.get('idx') ?? 0)
        const target = { system: type, index } as const
        const plan = planUpgrade(s, target)
        const name = (type === 'meridian' ? MERIDIANS[index]?.name : BODY_PARTS[index]) ?? ''
        return upgradePanel(name, plan, target)
      }
      return skillWindow(s, Number(q.get('skill') ?? 0))
    }

    case 'quest':
      // 原版参数名是 questid（09 §1.18 的全量路由表）
      return questWindow(s, q.get('questid') ?? q.get('quest') ?? '')

    case 'fight':
      // type=3 支援 / type=2 还击都带 eventid；type=1（或只带 target）是主动出击
      return q.has('eventid')
        ? reinforceWindow(s, q.get('eventid')!, q.get('type') === '2' ? 'counter' : 'reinforce')
        : fightWindow(s, q.get('target') ?? '')

    case 'battleevent':
      return renderBattleEvent(battleEventVm(s, Number(q.get('tab') ?? 2)))

    case 'battlemap':
      return battleMapWindow(s, q.get('eventid') ?? '')

    case 'help': {
      // 词条名从 hlp('主题') 来；不认识的词条退回目录
      const topic = q.get('topic') ?? '游戏指南'
      const known = HELP_TOPICS.includes(topic) || topic in HELP_ENTRIES ? topic : '游戏指南'
      // 历史是**线性访问记录，不去重**（05 §12.1 第 7 层，#111 实见重复项）
      helpHistory = [...helpHistory, known].slice(-8)
      helpForwardStack = []
      return renderHelp({ topic: known, history: helpHistory })
    }

    case 'estate':
      return renderEstate(estateVm(s))

    case 'playerlist':
      return playerListWindow(s)

    case 'guard':
      return guardWindow(s, Number(q.get('tab') ?? 1))

    case 'npc':
      return npcWindow(s, q.get('name') ?? '')

    case 'allyinfo':
      return renderAlly(allyVm(s, 'overview', 1, Number(q.get('ally') ?? 0) || undefined))

    case 'rank': {
      // 原版子标签传的是数字（rank.ts：门派 3 / 产业 4 / 阅历 5），不是内部枚举名。
      // 以前直接 `as` 成枚举，结果全部落到道行榜，而 renderRank 里 COLUMNS[undefined]
      // 会抛 TypeError —— 异常吞在 openFromUrl 的 promise 里，表现成「点了没反应」。
      const byNum: Record<string, RankTab> = { 3: 'ally', 4: 'estate', 5: 'exp' }
      return renderRank(rankVm(s, byNum[q.get('tab') ?? ''] ?? 'power'))
    }

    case 'playerinfo':
      // 侧栏按名字点进来，门派名册按 id —— 两种都接
      return playerInfoWindow(s, q.has('name')
        ? (allNpcsAt(s.npc, s.clock.gameT, s.worldSeed)
            .find((n) => n.base.name === q.get('name'))?.base.id ?? 0)
        : Number(q.get('playerid') ?? 0))

    case 'turnres':
      return renderTurnres({
        current: resourceBarOf(s).current as unknown as [number, number, number, number, number],
        capacity: resourceBarOf(s).capacity,
        cost: TURN_RES_COIN,
        from: s.player.element,
        to: generates(s.player.element),
      })

    case 'payment':
      return renderPayment({ remaining: {} })

    default:
      return `<DIV class=middle style="padding:12px">（${esc(url)} 尚未接入）</DIV>`
  }
}

/** 「五行互化」的仙石开销。付费页原文「自由分配…比例」是 3 仙石。 */
const TURN_RES_COIN = 3

// —— 出击 ——

/** 当前这一屏出击页对应的目标（点「出击」时反查）。 */
let fightTarget: BattleTarget | null = null
/** 支援/还击时对应的战斗事件 id；主动出击是 null。 */
let reinforceEventId: string | null = null
/** 游戏指南的访问记录。**线性、不去重**（原版截图里就有重复项）。 */
let helpHistory: readonly string[] = []
/** 点过「后退」之后能「前进」回去的那些词条。 */
let helpForwardStack: readonly string[] = []

/** 背包里空闲的飞剑 → 可出击的剑，面板值已算过品质与淬炼。 */
function launchableSwords(s: GameState): { readonly sword: LaunchSword; readonly table: Sword }[] {
  const out: { sword: LaunchSword; table: Sword }[] = []
  s.player.artifacts.forEach((a) => {
    if (a.kind !== 'sword' || a.status !== '空闲') return
    const t = swordByName(a.name)
    if (!t || t.speed === null || t.agility === null || t.wieldLevel > (s.player.skills['御剑术'] ?? 0)) return
    out.push({
      table: t,
      sword: {
        id: a.id,
        name: a.name,
        quality: a.quality,
        refine: a.refine,
        attack: t.attack,
        durability: t.durability,
        speed: t.speed,
        agility: t.agility,
        element: (t.element ?? '无') as LaunchSword['element'],
      },
    })
  })
  return out
}

/** 出击页。目标可以是同格的 NPC，也可以是任务里的怪。 */
function fightWindow(s: GameState, targetName: string): string {
  const npc = allNpcsAt(s.npc, s.clock.gameT, s.worldSeed)
    .find(n => n.base.name === targetName && isDivinationVisible(s, n))
  const quest = activeQuests(s.quests).find(q => q.goal.kind === 'slay' && q.goal.monster.name === targetName)
  const monster = quest ? questTarget(s.quests, quest.id) : null
  reinforceEventId = null
  fightTarget = monster ?? (npc ? {
    kind: 'player', npcId: npc.base.id, name: npc.base.name, x: npc.x, y: npc.y,
    attack: npc.swordPower, agility: Math.max(1, Math.round(npc.swordPower / 10)),
    hp: npc.swordPower * 2, element: npc.base.element,
  } : null)
  if (!fightTarget) return '<DIV class=middle style="padding:12px">对方已不在你的感应范围内。</DIV>'
  const target = fightTarget
  const dist = Math.abs(target.x - s.player.x) + Math.abs(target.y - s.player.y)
  const wanjian = s.player.skills['万剑诀'] ?? 0
  const rows = launchableSwords(s).map(({ sword }) => ({
    id: sword.id,
    name: artifactLabel(s.player.artifacts.find((a) => a.id === sword.id)!),
    itemId: artifactItemId(sword),
    itemsn: s.player.artifacts.findIndex((a) => a.id === sword.id) + 1,
    attack: launchedSwordStats(sword, s.player.skills).attack,
    durability: launchedSwordStats(sword, s.player.skills).durability,
    agility: launchedSwordStats(sword, s.player.skills).agility,
    speed: launchedSwordStats(sword, s.player.skills).speed,
    element: sword.element ?? '无',
    seconds: flightSeconds(dist, launchedSwordStats(sword, s.player.skills).speed),
  }))

  const passives = Object.keys(PASSIVE_SWORD_ARTS)
    .filter((k) => (s.player.skills[k] ?? 0) > 0)
    .map((k) => `${k} Lv.${s.player.skills[k]}`)

  return renderFight({
    kind: 'attack',
    targetName: target.name,
    at: [target.x, target.y],
    summary: `${target.name}　攻击:${target.attack} 敏捷:${target.agility} 生命:${target.hp} 属性:${target.element ?? '无'}`,
    swords: rows,
    limit: swordsOutLimit(wanjian),
    out: swordsOut(s),
    passives,
    ...(rows.length === 0 ? { blocked: '没有空闲的飞剑可以出击' } : {}),
  })
}

/** 来袭事件 → B 窗的一条。标题句用原版的「来自{玩家}的…到达并攻击你」。 */
function raidEventItem(s: GameState, e: GameEvent) {
  const who = String(e.payload['attacker'] ?? '某人')
  const fx = Number(e.payload['fromX'] ?? s.player.x)
  const fy = Number(e.payload['fromY'] ?? s.player.y)
  const seconds = Math.max(0, Math.round(e.finishAt - s.clock.gameT))
  return {
    eventId: e.id,
    kind: 'incoming' as const,
    who,
    at: [s.player.x, s.player.y] as [number, number],
    seconds,
    when: formatGameDate(e.finishAt),
    // 来袭方的剑看不穿（原版整行 ???），另带「从{玩家} ({x},{y})而来」
    left: [{
      owner: who,
      ownerId: Number(e.payload['attackerId'] ?? 0),
      seconds,
      arriveAt: formatGameDate(e.finishAt),
      from: { name: who, x: fx, y: fy },
    }],
    right: [],
  }
}

/** 战斗事件总览（B 窗）。本地版会出现四种态里的三种：出击 / 缠斗 / 来袭。 */
function battleEventVm(s: GameState, tab: number) {
  const all = sorted(s.timeline)
  const raids = all.filter((e) => e.kind === 'raid').map((e) => raidEventItem(s, e))
  const events = all.filter((e) => e.kind === 'battle')
  return {
    tab,
    events: [...raids, ...events.map((e) => {
      const t = e.payload['target'] as BattleTarget
      const phase = e.payload['phase'] as string
      const swords = (e.payload['swords'] ?? []) as readonly LaunchSword[]
      const left = swords.map((sw) => ({
        owner: s.player.name,
        ownerId: 0,
        name: `${sw.quality}${sw.name}${sw.refine > 0 ? `+${sw.refine}` : ''}`,
        itemId: artifactItemId(sw),
        stats: [
          (sw.launchedStats ?? launchedSwordStats(sw, {})).attack,
          (sw.launchedStats ?? launchedSwordStats(sw, {})).durability,
          (sw.launchedStats ?? launchedSwordStats(sw, {})).agility,
          0,
          0,
        ] as [number, number, number, number, number],
        seconds: Math.max(0, Math.round(e.finishAt - s.clock.gameT)),
        arriveAt: formatGameDate(e.finishAt),
      }))
      // 对方的剑看不穿 —— 原版就是整行 ???，这里如实照做
      const right = [{
        owner: t.name,
        ownerId: 0,
        seconds: null,
        arriveAt: formatGameDate(e.finishAt),
      }]
      return {
        eventId: e.id,
        kind: (phase === 'fighting' || phase === 'returning' ? phase : 'outbound') as 'fighting' | 'returning' | 'outbound',
        who: t.name,
        at: [t.x, t.y] as [number, number],
        seconds: Math.max(0, Math.round(e.finishAt - s.clock.gameT)),
        when: formatGameDate(e.finishAt),
        left,
        right: phase === 'fighting' ? right : [],
      }
    })],
  }
}

/** 支援 / 还击页：与出击页同构，只是目标来自已有事件。 */
function reinforceWindow(s: GameState, eventId: string, kind: 'reinforce' | 'counter'): string {
  const ev = s.timeline.events.find((e) => e.id === eventId && e.kind === 'battle')
  if (!ev) return '<DIV class=middle style="padding:12px">这场战斗已经结束了。</DIV>'
  const t = ev.payload['target'] as BattleTarget
  fightTarget = t
  reinforceEventId = eventId

  const dist = Math.abs(t.x - s.player.x) + Math.abs(t.y - s.player.y)
  const rows = launchableSwords(s).map(({ sword }) => ({
    id: sword.id,
    name: artifactLabel(s.player.artifacts.find((a) => a.id === sword.id)!),
    itemId: artifactItemId(sword),
    itemsn: s.player.artifacts.findIndex((a) => a.id === sword.id) + 1,
    attack: launchedSwordStats(sword, s.player.skills).attack,
    durability: launchedSwordStats(sword, s.player.skills).durability,
    agility: launchedSwordStats(sword, s.player.skills).agility,
    speed: launchedSwordStats(sword, s.player.skills).speed,
    element: sword.element ?? '无',
    seconds: flightSeconds(dist, launchedSwordStats(sword, s.player.skills).speed),
  }))

  return renderFight({
    kind,
    targetName: t.name,
    at: [t.x, t.y],
    summary: `${t.name}　攻击:${t.attack} 敏捷:${t.agility} 生命:${t.hp} 属性:${t.element ?? '无'}`,
    swords: rows,
    limit: swordsOutLimit(s.player.skills['万剑诀'] ?? 0),
    out: swordsOut(s),
    passives: [],
    ...(rows.length === 0 ? { blocked: '没有空闲的飞剑可以派出' } : {}),
  })
}

/**
 * 战场地图。**本体 DOM 未留存**（09 §6），只知道入口与窗标题「战场地图」。
 * 这里给一张最小的位置示意，不编造原版没有依据的布局。
 */
function battleMapWindow(s: GameState, eventId: string): string {
  const ev = s.timeline.events.find((e) => e.id === eventId)
  if (!ev) return '<DIV class=middle style="padding:12px">这场战斗已经结束了。</DIV>'
  const t = ev.payload['target'] as BattleTarget
  return `<DIV class=middle style="padding:10px">
${esc(s.player.name)} (${s.player.x},${s.player.y}) → ${esc(t.name)} (${t.x},${t.y})<BR>
<SPAN class=smallgray>距离 ${Math.abs(t.x - s.player.x) + Math.abs(t.y - s.player.y)} 格</SPAN><BR>
<SPAN class=smallgray>（原版战场示意图的页面结构没有留下存档）</SPAN></DIV>`
}

/** 产业页：我在各城镇的投资与每小时分利。 */
function estateVm(s: GameState) {
  const rows = Object.values(s.towns)
    .filter((t) => t.investments.some((i) => i.owner === s.player.name))
    .map((t) => ({
      name: t.name,
      x: t.x,
      y: t.y,
      level: commerceLevel(t),
      invested: t.investments.find((i) => i.owner === s.player.name)?.silver ?? 0,
      share: Math.round(shareOf(t, s.player.name) * 1000) / 10,
      income: hourlyIncomeOf(t, s.player.name),
    }))
  return { rows, slotCap: MAX_INVESTMENTS }
}

/**
 * 护法页（`guard.jsp?tab=1|2`）。**零截图零 DOM**，只知道两个入口与
 * 右栏那两块「为我护法 (0/7)」「为他护法 (0/7)」。
 *
 * NPC 自动接受互为护法属于单机重建，关系与屏蔽名单随存档保存。
 */
function guardWindow(s: GameState, tab: number): string {
  const social = socialOf(s)
  const rows = social.guardians.map(id => {
    const npc = s.npc.bases.find(n => n.id === id)
    return `<DIV>${esc(npc?.name ?? '')}　<A href="#" onclick="removeGuardian(${id})">解除护法</A></DIV>`
  }).join('')
  return `<DIV class=middle style="padding:12px"><B>${tab === 2 ? '为他护法' : '为我护法'}（${social.guardians.length}/7）</B><BR><BR>${rows || '暂无护法。'}<BR>
  <SPAN class=smallgray>通过道友资料结为护法后，交战时可按姓名求援，援军需飞行抵达。</SPAN><BR><BR>
  <B>屏蔽的来信</B><BR>${social.blacklist.map(name => `${esc(name)}　<A href="#" onclick="blockSender('${js(name)}',false)">解除屏蔽</A><BR>`).join('') || '暂无屏蔽。'}</DIV>`
}

/** 「点击此处查看更多玩家」：视野内的人，按道行排。 */
function playerListWindow(s: GameState): string {
  const list = allNpcsAt(s.npc, s.clock.gameT, s.worldSeed).filter(n => isDivinationVisible(s, n))
    .sort((a, b) => b.daoxing - a.daoxing)
    .slice(0, 30)
  if (list.length === 0) {
    return '<DIV class=middle style="padding:12px">感应范围内没有别人。</DIV>'
  }
  return `<TABLE class="tablebg middle" cellSpacing=1 cellPadding=3 width=460 border=0><TBODY>
<TR class="titlebg middlebold" align=middle><TD width="30%">玩家</TD><TD width="20%">境界</TD><TD width="25%">道行</TD><TD width="25%">位置</TD></TR>
${list.map((n) =>
    `<TR class="trbg middle" align=middle>` +
    `<TD><A class=skillup href="#" onclick="openLWindow('','playerinfo.jsp?name=${js(encodeURIComponent(n.base.name))}')">${esc(n.base.name)}</A></TD>` +
    `<TD>${esc(n.realm)}</TD><TD>${esc(n.daoxingText)}</TD>` +
    `<TD class=small>(${n.x},${n.y})</TD></TR>`).join('\n')}
</TBODY></TABLE>`
}

/**
 * NPC 对话窗。先按城镇 NPC 认（镖局老板/私塾先生/钱庄掌柜/村长/驿站/李员外），
 * 认不出来再当成同格的修真者。
 *
 * **只有镖局老板的对话是原文**（`data/town.ts` 的 `escortDialog` 逐字，
 * 出处 `reference/text/forum162/article-101916-p1.txt`）。其余五个对话零存档，
 * 所以只写「他能办什么事」+ 操作，不编对白。
 */
function npcWindow(s: GameState, name: string): string {
  const here = townHere(s)
  if (here) {
    const kind = here.town.kind
    const def = npcsIn(kind).find((n) => n.nameOf(kind) === name)
    if (def) return townNpcWindow(s, here.town, def)
  }

  const n = allNpcsAt(s.npc, s.clock.gameT, s.worldSeed).find((x) => x.base.name === name)
  if (!n) return '<DIV class=middle style="padding:12px">此人已不在此地。</DIV>'
  return `<DIV class=middle style="padding:10px">${esc(n.base.name)}　${esc(n.realm)}<BR>` +
    `<SPAN class=smallgray>道行 ${esc(n.daoxingText)}　道源 ${esc(n.base.school)}　属性 ${esc(n.base.element)}</SPAN></DIV>`
}

/** 城镇 NPC 的对话与操作。 */
function townNpcWindow(s: GameState, town: Town, def: TownNpc): string {
  const level = commerceLevel(town)
  const box = (inner: string) => `<DIV class=middle style="padding:10px">${inner}</DIV>`
  // handler 整条过一遍 `esc`：调用方里的 `escJs(名字)` 是内层，这里是外层，
  // 合起来就是 `html.ts` 的 `js()` 那两层（`quest.ts` 的 `button()` 同构）。
  // 定界用的那对单引号会变成 `&#39;`，HTML 解码回来正好还是引号。
  const act = (label: string, fn: string) =>
    `<DIV style="padding:4px 0"><A class=skillup href="#" onclick="${esc(fn)}">${esc(label)}</A></DIV>`
  const pre = (text: string) =>
    `<DIV class=middle style="padding:10px;white-space:pre-wrap">${esc(text)}</DIV>`

  // 镖局老板那段是原文；其余五个是本地版补写的，要标出来
  const lines = townNpcDialog(def.id, town)
  const dialog = lines ? pre(lines.join('\n')) : ''
  const note = DIALOG_VERBATIM_IDS.includes(def.id)
    ? ''
    : '<DIV class=smallgray style="padding:4px 10px">※ 此人的对话原文没有留下存档，这段是本地版按他的职司补写的。</DIV>'

  switch (def.id) {
    case 'escort': {
      // 唯一一段原文对话
      const dialog = escortDialog({ kind: town.kind, name: town.name, x: town.x, y: town.y, level })
      let destination: { x: number; y: number } | null = null
      for (let radius = 1; radius < 200 && !destination; radius++) {
        for (let dx = -radius; dx <= radius && !destination; dx++) {
          for (const dy of [radius - Math.abs(dx), -(radius - Math.abs(dx))]) {
            const x = town.x + dx, y = town.y + dy
            if (x < 0 || x >= 200 || y < 0 || y >= 200) continue
            if (['村庄', '小镇', '城池'].includes(terrainAt(s.worldSeed, x, y, weekOfServer(s.clock)))) { destination = { x, y }; break }
          }
        }
      }
      if (!destination) return pre(dialog) + box('暂时没有可以送达的其他州县。')
      const quote = quoteEscort(town, destination)
      return `${pre(dialog)}${box(
        `<SPAN class=smallgray>本地商业 Lv.${level}，送往 ${esc(sceneName(s.worldSeed, destination.x, destination.y))} (${destination.x},${destination.y})</SPAN>` +
        act('领取运镖任务', `takeEscort(${destination.x},${destination.y})`) +
        `<SPAN class=smallgray>佣金 ${quote.fee} 两，约 ${formatDuration(quote.seconds)}</SPAN>`,
      )}`
    }
    case 'school': {
      const books = booksReadableIn(town.kind)
      return dialog + note + box(
        `<SPAN class=smallgray>${esc(def.purpose)}　每本 ${READ_BOOK_SILVER} 两</SPAN><BR>` +
        (books.length === 0
          ? '<SPAN class=smallgray>此地无书可读。</SPAN>'
          : books.map((b) => act(`读《${b.name}》（阅历 +${b.experience}）`,
              `readBook('${escJs(b.name)}')`)).join('')),
      )
    }
    case 'bank':
      return dialog + note + box(
        `<SPAN class=smallgray>${esc(def.purpose)}　现有 ${s.player.silver} 两</SPAN>` +
        BANK_NOTES.map((n) => act(`兑${n.name}（${n.value} 两）`, `exchangeNote('${escJs(n.name)}')`) + (s.player.artifacts.some(a => a.name === n.name) ? act(`兑回${n.name}（取回 ${n.value} 两）`, `redeemNote('${escJs(n.name)}')`) : '')).join(''),
      )
    case 'chief':
      return dialog + note + box(
        `<SPAN class=smallgray>${esc(def.purpose)}</SPAN><BR>` +
        `${esc(town.name)}　商业 Lv.${level}　已投入 ${totalInvested(town)} 两<BR>` +
        `你的份额 ${(shareOf(town, s.player.name) * 100).toFixed(1)}%，` +
        `每小时 ${hourlyIncomeOf(town, s.player.name)} 两<BR>` +
        `投资 <INPUT class=small id=investsilver size=8 value="1000"> 两` +
        act('投资', 'doInvest()'),
      )
    case 'station':
      return dialog + note + box(
        `<SPAN class=smallgray>${esc(def.purpose)}　每次 ${STATION_COST_COIN} 仙石</SPAN><BR>` +
        `传送到 x <INPUT class=small id=tpx size=4> y <INPUT class=small id=tpy size=4>` +
        act('传送', 'doTeleport()') +
        '<SPAN class=smallgray>价目是重建的，见 data/town.ts</SPAN>',
      )
    case 'li':
      return dialog + note + box(
        `<SPAN class=smallgray>${esc(def.purpose)}</SPAN><BR>` +
        `你现有 ${s.player.silver} 两，需要 ${LI_YUANWAI_SILVER} 两` +
        act('交付千金', 'payLiYuanwai()'),
      )
    default:
      return box(esc(def.purpose))
  }
}

// —— 炼制配方 ——

/** 按炼制页的 itemId 反查配方。飞剑 501xx、护身 601xx、丹药三位数。 */
function craftOrderFor(s: GameState, itemId: number, count: number): CraftOrder | null {
  let kind: CraftOrder['kind'], name: string | undefined
  if (itemId >= 50100 && itemId < 60000) {
    kind = 'sword'; name = SWORDS[Math.floor((itemId - 50100) / 100)]?.name
  } else if (itemId >= 60100 && itemId < 60900) {
    kind = 'guard'; name = DEFENSIVE_ARTIFACTS[Math.floor((itemId - 60100) / 100)]?.name
  } else {
    kind = 'pill'
    const pill = PILL_NAMES[Math.floor(itemId / 100) - 1], tier = PILL_TIERS[(itemId % 100) - 1]
    if (pill && tier) name = `${tier}${pill}`
  }
  const recipe = name ? craftRecipe(s, kind, name) : null
  return recipe && name ? { kind, name, count, ...recipe, quality: '凡品' } : null
}

// —— 市场 ——

/**
 * 淬炼：两件完全相同的法宝合成一件 +1，**失败俱毁**。
 * 满级百炼之法能稳定淬到 +10，+11 起要花仙石保（1 石保不毁、2 石保必成）。
 */
function doRefine(rowId: number): void {
  if (!state) return
  const pair = refinePairAt(state, rowId)
  if (!pair) {
    openWindow('mwindow', '淬炼', '<DIV class=middle style="padding:10px">凑不出两件完全相同的法宝。</DIV>')
    return
  }
  const s = state
  const [idA] = pair
  const item = s.player.artifacts.find((a) => a.id === idA)!
  const next = item.refine + 1
  const g2 = globalThis as unknown as Record<string, (t: string, h: string, ok?: () => void) => void>
  g2['MDialogOkCancel']!(
    '淬炼',
    `<DIV class=middle style="padding:10px">用两件 ${esc(artifactLabel(item))} 淬炼成 +${next}？<BR>` +
    `<SPAN class=smallred>失败则两件俱毁。</SPAN></DIV>`,
    () => {
      if (!state) return
      const r = refineArtifact(state, pair, {
        baihuanLevel: state.player.skills['百炼之法'] ?? 0,
      })
      if (!r.ok) {
        openWindow('mwindow', '淬炼失败', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
        return
      }
      state = applyQuestProgress(state, r.state)
      openWindow('mwindow', '淬炼', `<DIV class=middle style="padding:10px">${
        r.success ? `淬炼成功，得到 +${next}。` : `${REFINE_FAIL_TEXT}。`
      }</DIV>`)
      step()
    },
  )
}

/**
 * 四种「后补」术数要的上下文。
 *
 * 全部由 NPC 生成器算出来，所以和地图上看到的完全一致：
 *  - 明日位置 = 拿明天的游戏时刻再算一次（`npcAt` 按游戏日取整，天然确定）；
 *  - 护法 = 同道源、离他最近的几个人（原版护法是真人互相邀请，单机下只能这样模拟）。
 */
/**
 * 发消息。
 *
 * 原版是投进对方的收件箱；单机版没有真人收件箱，所以**记进自己的收件箱存底**
 * （标明是寄出的），这样至少「写了、寄了、留了底」这条链是通的，
 * 而不是点一下弹「尚未接入」。收信人须是现有 NPC；自动回执经过黑名单过滤。
 */
function doSendMsg(): void {
  if (!state) return
  const val = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''
  const to = val('msgreceiver').trim()
  const subject = val('msgsubject').trim()
  const content = val('msgtext').trim()

  if (!to) {
    openWindow('mwindow', '写消息', '<DIV class=middle style="padding:10px">请填写收件人。</DIV>')
    return
  }

  const known = allNpcsAt(state.npc, state.clock.gameT, state.worldSeed)
    .some((n) => n.base.name === to)

  if (!known) return openWindow('mwindow', '写消息', '<DIV class=middle style=padding:10px>查无此人，请填写现有道友姓名。</DIV>')

  const sent = {
    id: `sent:${state.clock.gameT}:${to}`,
    subject: `寄给${to}：${subject || '（无主题）'}`,
    from: state.player.name,
    at: state.clock.gameT,
    read: true,
    kind: 'player' as const,
    body: {
      kind: 'text',
      paragraphs: [
        ...(content ? [`　　${content}`] : ['　　（正文为空）']),
        '',
        '　　此信已寄出，以下回执由本地道友自动生成。',
      ],
    },
  }
  state = receiveLetter({ ...state, mail: [sent, ...state.mail].slice(0, 200) }, {
    id: `reply:${state.clock.gameT}:${to}`, subject: `回执：${subject || '（无主题）'}`, from: to,
    at: state.clock.gameT, read: false, kind: 'player', body: { kind: 'text', paragraphs: ['来信已收到。此为本地道友自动回执。'] },
  })
  openWindow('mwindow', '写消息',
    `<DIV class=middle style="padding:10px">已寄给 ${esc(to)}，副本留在你的收件箱里。</DIV>`)
  step()
}

/** 领取任务奖励（任务窗底部那个「领取奖励」按钮）。 */
function doClaimQuest(id: string): void {
  if (!state) return
  const r = claim(state.quests, state, id)
  if (!r.ok) {
    openWindow('mwindow', '无法领取', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
    return
  }
  state = { ...r.value.state, quests: r.value.log }
  closeWindow('lwindow')
  step()
}

/**
 * 五行互化（`turnres.jsp` 的表单）。付费功能，每次 3 仙石，总量守恒。
 * 原版「自由分配…比例」是 3 仙石（付费页原文）。
 */
function doTurnRes(p: URLSearchParams): void {
  if (!state) return
  const from = p.get('from') as Element | null
  const to = p.get('to') as Element | null
  const amount = Math.floor(Number(p.get('amount')) || 0)
  if (!from || !to || from === to || amount <= 0) {
    openWindow('mwindow', '五行互化', '<DIV class=middle style="padding:10px">请选择不同的五行并填写数量。</DIV>')
    return
  }
  const fi = ELEMENTS.indexOf(from)
  const ti = ELEMENTS.indexOf(to)
  if ((state.player.qi[fi] ?? 0) < amount) {
    openWindow('mwindow', '五行互化', '<DIV class=middle style="padding:10px">真气不足。</DIV>')
    return
  }
  const paid = spendCoin(state, TURN_RES_COIN)
  if (!paid.ok) {
    openWindow('mwindow', '五行互化', `<DIV class=middle style="padding:10px">${esc(paid.reason)}</DIV>`)
    return
  }
  const cap = resourceBarOf(paid.state).capacity
  const qi = paid.state.player.qi.map((v, i) =>
    i === fi ? v - amount : i === ti ? Math.min(cap, v + amount) : v) as unknown as FiveQi
  state = { ...paid.state, player: { ...paid.state.player, qi } }
  closeWindow('lwindow')
  step()
}

/** 交易页的 sheet 号 → 真实挂单 id（那一屏渲染时记下来的）。 */
const sheetId = (sheet: number): string | undefined => tradeSheets[sheet]

function doMarketBuy(action: 'buyqi' | 'buyitem', sheet: number): void {
  if (!state) return
  const id = sheetId(sheet)
  if (!id) return
  const r = action === 'buyqi' ? buyQi(ctxOf(state), id) : buyArtifact(ctxOf(state), id)
  if (!r.ok) {
    openWindow('mwindow', '无法购买', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
    return
  }
  state = applyCtx(r.ctx)
  step()
}

function doMarketCancel(action: 'unsellqi' | 'unsellitem', sheet: number): void {
  if (!state) return
  const id = sheetId(sheet)
  if (!id) return
  // 按这一单实际占几格来查，不能写死 1 —— 否则引擎里的检查和这里的提示会分叉
  const slotsBack = action === 'unsellitem'
    ? Math.max(1, state.market.artifacts.find((o) => o.id === id)?.artifact?.count ?? 1)
    : 1
  if (action === 'unsellitem' && !canAcquireArtifacts(state, slotsBack)) {
    return openWindow('mwindow', '无法撤销', '<DIV class=middle style="padding:10px">法宝携带数量已达上限，请先提升袖里乾坤或腾出空位</DIV>')
  }
  state = applyCtx((action === 'unsellitem' ? cancelArtifactOrders : cancelQiOrders)(ctxOf(state), [id]))
  step()
}

/** 出售真气页的表单：我用 X 数量 换 Y。 */
function doListQi(): void {
  if (!state) return
  const v = (name: string) =>
    document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)?.value ?? ''
  const offer = { element: v('give') as Element, amount: Number(v('amount')) || 0 }
  const want = { element: v('want') as Element, amount: Number(v('wantamount')) || Number(v('amount')) || 0 }
  const r = listQi(ctxOf(state), { id: `me:${state.clock.gameT}:${state.market.qi.length}`, offer, want })
  if (!r.ok) {
    openWindow('mwindow', '无法挂单', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
    return
  }
  state = applyCtx(r.ctx)
  step()
}

/** 出售法宝页的表单：选一件极品法宝 + 标价。 */
function doListArtifact(): void {
  if (!state) return
  const idx = Number(document.querySelector<HTMLSelectElement>('[name=item]')?.value ?? -1)
  const price = Number(document.querySelector<HTMLInputElement>('[name=price]')?.value ?? 0)
  const item = state.player.artifacts[idx]
  if (!item) {
    openWindow('mwindow', '无法挂单', '<DIV class=middle style="padding:10px">请先选一件法宝。</DIV>')
    return
  }
  const r = listArtifact(ctxOf(state), item.id, price)
  if (!r.ok) {
    openWindow('mwindow', '无法挂单', `<DIV class=middle style="padding:10px">${esc(r.reason)}</DIV>`)
    return
  }
  state = applyCtx(r.ctx)
  step()
}

function mailDetail(s: GameState, oneBased: number): string {
  const m = s.mail[oneBased - 1]
  if (!m) return '<DIV class=middle style="padding:12px">这封信已经不在了。</DIV>'
  // 读过就标已读（下次打开收件箱不再加粗）
  state = { ...s, mail: s.mail.map((x, i) => (i === oneBased - 1 ? { ...x, read: true } : x)) }
  return renderMsgDetail({
    id: oneBased,
    subject: m.subject,
    sender: m.from,
    avatar: null,
    sentAt: formatGameDate(m.at),
    body: { kind: 'text', paragraphs: mailParagraphs(m.body) },
  })
}

/**
 * 把结构化信体摊成段落。
 *
 * 存档里存的是结构（不存 HTML，见 `state.ts`），读信页只认段落，
 * 所以在这里做一次转换 —— 尤其是七种术数的结果，不能让它掉成一坨 JSON。
 */
function mailParagraphs(raw: Readonly<Record<string, unknown>>): readonly string[] {
  const b = raw as {
    kind?: string
    lead?: string
    title?: string
    text?: string
    paragraphs?: readonly string[]
    empty?: string
    rows?: readonly Record<string, unknown>[]
  }
  if (b.paragraphs) return b.paragraphs
  if (b.text) return [b.text]

  const out: string[] = []
  if (b.lead) out.push(`　　${b.lead}`)
  if (b.title) out.push(b.title)

  const rows = b.rows ?? []
  if (rows.length === 0) {
    out.push(b.empty ?? '　　什么也没算出来。')
    return out
  }

  for (const r of rows) {
    // 各种术数的行字段不同，统一挑出非空的拼一行
    const cells = ['name', 'realm', 'daoxing', 'note', 'level', 'element', 'multiplier',
      'type', 'count', 'status']
      .map((k) => r[k])
      .filter((v) => v !== undefined && v !== null && v !== '')
      .map((v) => String(v))
    if (cells.length > 0) out.push(`　　${cells.join('　')}`)
  }
  return out
}

/** 物品窗。飞剑走 `swords.ts` 的原版数值表，护身走 `artifacts.ts`。 */
function itemWindow(s: GameState, itemId: number, itemsn: string | null): string {
  const owned = itemsn === null ? undefined : s.player.artifacts[Number(itemsn) - 1]
  if (owned && owned.kind !== 'sword') return `<DIV class=middle style="padding:12px"><B>${esc(owned.name)}</B><BR>${
    isSecretBook(owned.name) ? '学习后获得秘笈上记载的法门，秘笈消失。' : owned.name === '藏宝图' || owned.name === '天宫秘箓'
      ? '使用后领取机缘遇宝任务，前往指定地点开启宝藏。' : SECRET_MATERIALS.some(n => n === owned.name)
        ? `集齐${SECRET_MATERIALS.join('、')}各一件，使用任意一件即可合成天宫秘箓。` : esc(owned.status)}</DIV>`
  const idx = Math.floor((itemId - 50100) / 100)
  const sw = owned ? swordByName(owned.name) : SWORDS[idx]
  if (!sw) return '<DIV class=middle style="padding:12px">没有这件法宝的记载。</DIV>'

  const forge = s.player.skills['铸剑之术'] ?? 0
  const wield = s.player.skills['御剑术'] ?? 0
  const quality = owned?.quality ?? null
  const refine = owned?.refine ?? 0
  const cost = craftCostFor(sw.craftCost, s.player.element)
  return renderItemMid({
    name: sw.name,
    flavor: sw.flavor,
    // 三阴绝脉剑与冰魄寒光剑的物品窗转录不全，缺的字段照实说明，不填 0 冒充
    ...(isComplete(sw) && sw.speed !== null && sw.knockback !== null
      ? {}
      : { effect: '（这把剑的部分数值在现存资料里没有留下转录）' }),
    tradable: sw.tradable,
    element: sw.element ?? '无属性',
    category: '飞剑',
    quality,
    refine,
    forge: { text: `铸剑之术${sw.forgeLevel}级`, met: forge >= sw.forgeLevel },
    wield: { text: `御剑术${sw.wieldLevel}级`, met: wield >= sw.wieldLevel },
    stats: {
      attack: sw.attack,
      durability: sw.durability,
      absorb: sw.absorb,
      speed: sw.speed ?? 0,
      agility: [sw.agility ?? 0, sw.agility ?? 0],
      knockback: sw.knockback ?? 0,
    },
    upkeep: sw.upkeepPerHour as unknown as [number, number, number, number, number],
    ...(cost ? { craftCost: cost as unknown as [number, number, number, number, number] } : {}),
    ...(sw.craftSeconds !== null ? { craftSeconds: sw.craftSeconds } : {}),
  })
}

/** 法术窗：当前等级 + 升级消耗 + 升级按钮，结构与经脉窗同构。 */
function skillWindow(s: GameState, id: number): string {
  const node = skillNodeById(id)
  if (!node) return '<DIV class=middle style="padding:12px">没有这门法术的记载。</DIV>'
  const plan = planUpgrade(s, { system: 'skill', id: node.name })
  if (plan.toLevel > node.cap) {
    return `<DIV class=middle style="padding:10px">${esc(node.name)} 已至上限 Lv.${node.cap}。</DIV>`
  }
  const blocked = skillUpgradeBlockReason(s, node.name)
  return upgradePanel(node.name, plan, { system: 'skill', index: id }, blocked)
}

function questWindow(s: GameState, id: string): string {
  if (id === 'treasure' && s.treasure) return `<DIV data-live-quest=treasure class=middle style="padding:12px"><B>机缘遇宝</B><BR>
循着${esc(s.treasure.source)}的指引，前往(${s.treasure.x},${s.treasure.y})寻找宝藏。<BR>
<A class=skillup href="#" onclick="claimTreasure()">开启宝藏</A></DIV>`
  const q = activeQuests(s.quests).find((x) => x.id === id)
  if (!q) return '<DIV class=middle style="padding:12px">没有这个任务。</DIV>'
  const entry = s.quests.entries.find((e) => e.id === id)
  const done = entry ? goalMet(q, entry, s) : false
  const loc = q.goal.kind === 'slay' ? (entry?.at ?? questLocation(s, q)) : null
  return `<DIV data-live-quest="${esc(id)}">${renderQuest({
    id: q.id,
    title: questTitle(q),
    summary: q.summary,
    progress: loc
      ? { kind: 'slay', monster: q.goal.kind === 'slay' ? q.goal.monster.name : '', at: loc, done }
      : { kind: 'text', text: q.goal.kind === 'experience'
        ? `阅历达到 ${q.goal.points}（当前 ${Math.floor(s.player.experience)}，可通过行走或读书积累）`
        : q.summary, done },
    reward: q.reward.qi
      ? { kind: 'qi', qi: qiRewardFor(q.reward.qi, s.player.element) }
      : { kind: 'text', text: q.reward.note ?? (q.reward.realm ? `境界提升为 ${q.reward.realm}` : '—') },
    description: [q.summary, ...(q.path ? [q.path] : [])],
    claimable: done,
    interaction: q.goal.kind === 'quiz' ? { kind: 'quiz' }
      : q.goal.kind === 'choice' ? { kind: 'choice' }
      : q.goal.kind === 'goldenCore' ? { kind: 'goldenCore', gathered: entry?.coreQi ?? 0, cores: entry?.count ?? 0, compressing: !!entry?.coreEventId }
      : undefined,
  })}</DIV>`
}

function rankVm(s: GameState, tab: RankTab) {
  if (tab === 'ally') {
    const all = allNpcsAt(s.npc, s.clock.gameT, s.worldSeed)
    return { tab, rows: socialOf(s).guilds.map(g => ({ g,
      total: g.members.reduce((sum, id) => sum + (id === 0 ? s.player.daoxing : all.find(n => n.base.id === id)?.daoxing ?? 0), 0),
    })).sort((a, b) => b.total - a.total).map(({ g, total }) => ({ id: g.id, name: g.name,
      leader: { id: g.leader, name: g.leader === 0 ? s.player.name : all.find(n => n.base.id === g.leader)?.base.name ?? '' }, value: daoxingText(total) })) }
  }
  const kind = tab === 'estate' ? 'estate' : tab === 'exp' ? 'experience' : 'daoxing'
  const rows = ranking(s.npc, s.clock.gameT, s.worldSeed, kind, 20).map((n) => ({
    id: n.base.id,
    name: n.base.name,
    realm: n.realm,
    value: kind === 'daoxing' ? n.daoxingText
      : kind === 'estate' ? `${n.estate}两/小时`
      : String(n.experience),
  }))
  return { tab, rows }
}

function playerInfoWindow(s: GameState, id: number): string {
  const me = id === 0
  const npc = me ? null : allNpcsAt(s.npc, s.clock.gameT, s.worldSeed).find((n) => n.base.id === id)
  if (!me && !npc) return '<DIV class=middle style="padding:12px">查无此人。</DIV>'
  const school = npc?.base.school ?? s.player.school
  // NPC 记录里没有性别（原版名册也不显示），统一按男身头像
  const gender = npc ? 'm' : s.player.gender
  return renderPlayerInfo({
    playerId: id,
    avatar: `${{ 蜀山: 'shushan', 昆仑: 'kunlun', 通天: 'tongtian' }[school]}${gender === 'f' ? 'f' : 'm'}`,
    name: npc?.base.name ?? s.player.name,
    element: npc?.base.element ?? s.player.element,
    rank: npc
      ? ranking(s.npc, s.clock.gameT, s.worldSeed, 'daoxing', 9999).findIndex((n) => n.base.id === id) + 1
      : 1,
    dao: npc?.daoxingText ?? daoxingText(s.player.daoxing),
    origin: school,
    ally: guildOf(s, id) ? { id: guildOf(s, id)!.id, name: guildOf(s, id)!.name } : null,
    age: '-',
    gender: gender === 'f' ? '女' : '男',
    location: '-',
    intro: '-',
    self: me,
    deletingDays: null,
  }) + (!me ? `<DIV class=middle style=padding:8px><A href="#" onclick="blockSender('${js(npc!.base.name)}',${!socialOf(s).blacklist.includes(npc!.base.name)})">${socialOf(s).blacklist.includes(npc!.base.name) ? '解除屏蔽来信' : '屏蔽此人来信'}</A></DIV>` : '')
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

/**
 * 读档失败的落地页。
 *
 * 三件事，顺序不能反：**先让玩家能把原始存档拿走**，再让他决定重开。
 * 在他点「重新开始」之前，`persist()` 一个字节都不写（见 `loadFailure`）。
 */
function recoveryPage(f: NonNullable<typeof loadFailure>): string {
  const has = (s: string | null) => s !== null && s.length > 0
  return `<DIV id=gpage><DIV class=middle style="padding:40px 30px;max-width:620px">
<TABLE class=tablebg cellSpacing=1 cellPadding=6 width="100%" border=0><TBODY>
<TR class="titlebg bigbold" align=middle><TD>存档读不出来</TD></TR>
<TR class=trbg><TD>
<SPAN class=smallred>${esc(f.reason)}</SPAN><BR><BR>
<SPAN class=middle>为了不把还能抢救的数据冲掉，游戏<B>暂时不会写入任何存档</B>。<BR>
请先把下面的原始存档下载下来备份，再决定要不要重新开始。</SPAN>
</TD></TR>
<TR class=trbg><TD>
${has(f.main)
    ? '<A class=skillup href="#" onclick="downloadRaw(\'main\')">下载主存档原始数据</A>'
    : '<SPAN class=smallgray>主存档是空的</SPAN>'}
<BR>
${has(f.backup)
    ? '<A class=skillup href="#" onclick="downloadRaw(\'backup\')">下载备份存档原始数据</A>'
    : '<SPAN class=smallgray>没有备份存档</SPAN>'}
</TD></TR>
<TR class=trbg><TD align=middle>
<A class=skillup href="#" onclick="importSavePrompt()">导入一份存档</A>　
<A class=skillup href="#" onclick="discardBrokenSave()">清空并重新开始</A>
</TD></TR>
</TBODY></TABLE></DIV></DIV>`
}

/** 升级说明面板，结构照截图 #3 的经脉弹窗。 */
function upgradePanel(
  name: string,
  plan: ReturnType<typeof planUpgrade>,
  target: { system: string; index: number },
  blocked?: string,
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
${blocked ? `<SPAN class=smallred>${esc(blocked)}</SPAN>` : `<A class=skillup href="#" onclick="doUpgrade('${target.system}',${target.index})">升级</A>`}
</DIV>
</DIV>`
}

export function boot(): void {
  installGameActions()
  setPageResolver(resolvePage)
  setCountdownClock(() => state ? state.clock.gameT + Math.max(0, Date.now() - state.clock.wallT) / 1000 * state.clock.rate : Date.now() / 1000)
  document.addEventListener('click', () => advanceState(), true)
  document.addEventListener('submit', () => advanceState(), true)

  // 页面里的原版 .jsp 链接统一在这里拦一次（子标签、分页、筛选都走它）
  document.addEventListener('click', (ev) => {
    const a = (ev.target as HTMLElement | null)?.closest?.('a')
    const href = a?.getAttribute('href')
    if (!state || !href || href === '#' || href.startsWith('javascript:')) return
    if (routeJsp(href)) ev.preventDefault()
  })
  // 页面里的原版表单同样是往 .jsp 提交的。本地版没有服务端，
  // 所以凡是 .jsp 的表单一律拦下（不拦就会真的跳走、把游戏页丢掉）。
  document.addEventListener('submit', (ev) => {
    const form = ev.target as HTMLFormElement | null
    const action = form?.getAttribute('action')
    if (!state || !form || !action || !action.includes('.jsp')) return
    ev.preventDefault()
    const q = new URLSearchParams(new FormData(form) as unknown as Record<string, string>)
    if (form.id === 'sellqiform') return doListQi()
    if (form.id === 'sellitemform') return doListArtifact()
    if (action.includes('turnres.jsp')) {
      doTurnRes(q)
      return
    }
    routeJsp(`${action}?${q}`)
  })

  if (STORAGE_KEY_AVAILABLE) {
    try {
      state = loadGame(localStorage)
    } catch (e) {
      // **先把两份原始存档扣下来**，再决定怎么办 —— 不能直接进建号页，
      // 那样两秒之内主档和备份都会被新号覆盖掉。
      state = null
      loadFailure = {
        reason: e instanceof Error ? e.message : '存档读取失败',
        main: localStorage.getItem(SAVE_KEYS.main),
        backup: localStorage.getItem(SAVE_KEYS.backup),
      }
    }
  }
  step()

  // 事件到点时自动推进（倒计时归零会冒泡这个事件）
  window.setInterval(pulse, 1000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pulse() })
  window.addEventListener('pagehide', () => { advanceState(); persist() })
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
