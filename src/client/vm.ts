/**
 * 选择器：把 `GameState` 投影成各页的视图模型。
 *
 * 和 `demo.ts` 的分工：`demo.ts` 喂夹具（给截图叠图用），这里喂真实存档。
 * 全是纯函数，不碰 DOM，所以能直接写单测（`vm.test.ts`）。
 *
 * 一条边界：页面模块的 DOM 结构是照原版逐字复刻的，**不为了接数据去改它们**。
 * 凡是对不上的（比如法术等级原版按数字 id、我们按名字存），在这里转换。
 */

import { SKILL_TREES, type SkillTab, type SkillVm, type SkillNode } from '../pages/skill.ts'
import {
  pillRows,
  type ItemTab,
  type ItemVm,
  type ItemGroup,
  type ItemGroupId,
  type ItemRow,
  type ItemStatus,
  type CraftRow,
  type BrewRow,
} from '../pages/item.ts'
import type { TradeVm, TradeView, QiOffer, ItemOffer } from '../pages/trade.ts'
import type { AllyVm, AllyTab, AllyMember, AllyNews } from '../pages/ally.ts'
import type { MsgVm, MsgRow } from '../pages/msg.ts'
import { SWORDS, craftCostFor, canForge, isComplete } from '../data/swords.ts'
import { DEFENSIVE_ARTIFACTS, DEFENSIVE_ARTIFACT_NAMES_KNOWN } from '../data/artifacts.ts'
import { ELEMENTS, type Element } from '../data/meridian.ts'
import { artifactSlots, BODY_SLEEVE, craftSeconds, BODY_HAND } from '../engine/craft.ts'
import { npcArtifactPrice, injectSecondsFor, visibleOrders, type QiOrder } from '../engine/market.ts'
import { allNpcsAt, type NpcState } from '../engine/npc.ts'
import { npcsIn } from '../data/town.ts'
import { terrainAt, sceneName } from '../data/world.ts'
import { weekOfServer } from '../engine/clock.ts'
import type { Town } from '../engine/town.ts'
import { formatGameDate, formatGameDateShort } from '../engine/clock.ts'
import type { FiveQi, GameState, Artifact } from '../engine/state.ts'

// —— 法术页 ——

/** 存档里法术按名字存（`divine.ts` 也这么读），页面按节点 id 取，在这里对一次。 */
export function skillLevels(s: GameState): Record<number, number> {
  const out: Record<number, number> = {}
  for (const nodes of Object.values(SKILL_TREES)) {
    for (const n of nodes) out[n.id] = s.player.skills[n.name] ?? 0
  }
  return out
}

/** 按 id 反查节点（升级弹窗要拿名字与上限）。 */
export function skillNodeById(id: number): SkillNode | undefined {
  for (const nodes of Object.values(SKILL_TREES)) {
    const hit = nodes.find((n) => n.id === id)
    if (hit) return hit
  }
  return undefined
}

export function skillVm(s: GameState, tab: SkillTab): SkillVm {
  return {
    tab,
    school: s.player.school,
    levels: skillLevels(s),
    books: s.player.artifacts
      .filter((a) => a.kind === 'book')
      .map((a, i) => ({ name: a.name, itemId: 900 + i, count: a.count })),
  }
}

// —— 法宝页 ——

const GROUP_OF: Record<Artifact['kind'], ItemGroupId> = {
  sword: 1, guard: 1, pill: 2, book: 3, misc: 5,
}

/** 一件法宝的显示名：品质前缀 + 名称 + `+N`。 */
export const artifactLabel = (a: Artifact): string =>
  `${a.quality}${a.name}${a.refine > 0 ? `+${a.refine}` : ''}`

/** 法宝一览：按分组折叠。忙碌的物品不给 itemsn（照原版，radio 会变成 value=0）。 */
export function itemListGroups(s: GameState): readonly ItemGroup[] {
  const buckets = new Map<ItemGroupId, ItemRow[]>()
  s.player.artifacts.forEach((a, i) => {
    const gid = GROUP_OF[a.kind]
    const idle = a.status === '空闲' || a.status === '损坏'
    const repair = s.timeline.events.find(e => e.kind === 'craft' && e.payload['op'] === 'repair' && e.payload['artifactId'] === a.id)
    const row: ItemRow = {
      name: artifactLabel(a),
      itemId: artifactItemId(a),
      ...(idle ? { itemsn: i + 1 } : {}),
      ...(a.count > 1 ? { count: a.count } : {}),
      status: a.status as ItemStatus,
      ...(repair ? { seconds: Math.max(0, Math.round(repair.finishAt - s.clock.gameT)) } : {}),
    }
    const list = buckets.get(gid) ?? []
    list.push(row)
    buckets.set(gid, list)
  })
  // 原版分组顺序：法宝 → 丹药 → 书籍 → 任务物品
  return ([1, 2, 3, 5] as const)
    .filter((g) => buckets.has(g))
    .map((g) => ({ id: g, items: buckets.get(g)! }))
}

/** 物品 id：飞剑按表里的序号排，其余给个稳定的占位号（只用来开物品窗）。 */
export function artifactItemId(a: Pick<Artifact, 'name'>): number {
  const idx = SWORDS.findIndex((s) => s.name === a.name)
  if (idx >= 0) return 50100 + idx * 100
  const gi = DEFENSIVE_ARTIFACTS.findIndex((d) => d.name === a.name)
  if (gi >= 0) return 60100 + gi * 100
  return 90000
}

/** 当前真气最多能炼几件；条件不够返回 null（页面渲染成红字「(未满足)」）。 */
function craftableCount(qi: FiveQi, cost: FiveQi, allowed: boolean): number | null {
  if (!allowed) return null
  let n = Infinity
  for (let i = 0; i < 5; i++) {
    const c = cost[i] ?? 0
    if (c <= 0) continue
    n = Math.min(n, Math.floor((qi[i] ?? 0) / c))
  }
  return Number.isFinite(n) ? n : 0
}

const ownedCount = (s: GameState, name: string): number =>
  s.player.artifacts.filter((a) => a.name === name).reduce((sum, a) => sum + a.count, 0)

/** 炼制飞剑页：14 把剑全列，等级不够的显示「(未满足)」（照原版，不隐藏）。 */
export function swordCraftRows(s: GameState): readonly CraftRow[] {
  const forge = s.player.skills['铸剑之术'] ?? 0
  const hand = s.player.body[BODY_HAND] ?? 0
  return SWORDS.map((sw, i) => {
    const cost = craftCostFor(sw.craftCost, s.player.element)
    return {
      name: sw.name,
      itemId: 50100 + i * 100,
      owned: ownedCount(s, sw.name),
      ...(cost ? { cost } : {}),
      craftSeconds: craftSeconds(sw.craftSeconds ?? 0, 'sword', hand),
      // 转录不全的剑（缺消耗或耗时）列出来但不可炼，不编数值
      craftable: cost && isComplete(sw)
        ? craftableCount(s.player.qi, cost, canForge(sw, forge))
        : null,
    }
  })
}

/**
 * 炼制护身页。只有指玄道藏碑有完整数值（官方《护身揭密》逐字），
 * 其余四件只知道名字与「24 小时以上」，所以列出来但不可炼 —— 不编数值。
 */
export function guardCraftRows(s: GameState): readonly CraftRow[] {
  const lingbao = s.player.skills['灵宝真经'] ?? 0
  const hand = s.player.body[BODY_HAND] ?? 0
  const known = DEFENSIVE_ARTIFACTS.map((g, i) => {
    const cost = g.craftCost ? craftCostFor(g.craftCost, s.player.element) : undefined
    return {
      name: g.name,
      itemId: 60100 + i * 100,
      owned: ownedCount(s, g.name),
      ...(cost ? { cost } : {}),
      craftSeconds: craftSeconds(g.craftSeconds, 'guard', hand),
      craftable: cost
        ? craftableCount(s.player.qi, cost, lingbao >= g.lingbaoLevel)
        : null,
    }
  })
  const rest = DEFENSIVE_ARTIFACT_NAMES_KNOWN
    .filter((n) => !DEFENSIVE_ARTIFACTS.some((g) => g.name === n))
    .map((name, i) => ({
      name,
      itemId: 60900 + i,
      owned: ownedCount(s, name),
      // 《护身揭密》只说「24 小时以上」，没有逐项数值，所以不可炼
      craftSeconds: 24 * 3600,
      craftable: null,
    }))
  return [...known, ...rest]
}

/** 淬炼页：手上凑得出一对（同名同品质同淬炼数）的法宝才能淬。 */
export function refineRows(s: GameState): readonly CraftRow[] {
  return refinePairs(s)
    .map((list, i) => {
      const a = list[0]!
      return {
        name: `${artifactLabel(a)} → +${a.refine + 1}`,
        // 淬炼页的 itemId 是**行号**，不是物品号 —— 点「淬炼」时靠它反查这一对
        // （这一页零证据，原版参数名未知，见 item.ts 的注释）
        itemId: REFINE_ROW_BASE + i,
        owned: list.length,
        craftSeconds: 0,
        craftable: Math.floor(list.length / 2),
      }
    })
}

/** 淬炼页行号的基址。挑一个不会和飞剑(501xx)/护身(601xx)/丹药(3 位)撞的区间。 */
export const REFINE_ROW_BASE = 70000

/** 按淬炼页的行号取那一对法宝的 id。 */
export function refinePairAt(s: GameState, itemId: number): readonly [string, string] | null {
  const idx = itemId - REFINE_ROW_BASE
  const rows = refinePairs(s)
  const list = rows[idx]
  if (!list || list.length < 2) return null
  return [list[0]!.id, list[1]!.id]
}

/** 淬炼页的分组：同名同品质同淬炼数、且都空闲的法宝。 */
function refinePairs(s: GameState): readonly (readonly Artifact[])[] {
  const pairs = new Map<string, Artifact[]>()
  for (const a of s.player.artifacts) {
    if (a.kind !== 'sword' && a.kind !== 'guard') continue
    if (a.status !== '空闲') continue
    const key = `${a.name}|${a.quality}|${a.refine}`
    pairs.set(key, [...(pairs.get(key) ?? []), a])
  }
  return [...pairs.values()].filter((l) => l.length >= 2)
}

/** 「正在炼制中 / 正在淬炼中」：直接读时间线上的炼器事件。 */
export function brewRows(s: GameState, kind: 'sword' | 'guard' | 'pill'): readonly BrewRow[] {
  return s.timeline.events
    .filter((e) => e.kind === 'craft' && e.payload['kind'] === kind)
    .map((e) => ({
      name: String(e.payload['name'] ?? ''),
      itemId: 0,
      seconds: Math.max(0, Math.round(e.finishAt - s.clock.gameT)),
      finishAt: formatGameDate(e.finishAt),
    }))
}

export function itemVm(s: GameState, tab: ItemTab): ItemVm {
  if (tab === 'list') {
    return {
      tab: 'list',
      used: s.player.artifacts.reduce((n, a) => n + a.count, 0),
      capacity: artifactSlots(s.player.body[BODY_SLEEVE] ?? 0, s.player.vip),
      groups: itemListGroups(s),
    }
  }
  if (tab === 'sword') return { tab, rows: swordCraftRows(s), brewing: brewRows(s, 'sword') }
  if (tab === 'guard') return { tab, rows: guardCraftRows(s), brewing: brewRows(s, 'guard') }
  if (tab === 'refine') return { tab, rows: refineRows(s), brewing: [] }

  const alchemy = s.player.skills['炼丹之术'] ?? 0
  return {
    tab: 'pill',
    alchemyLevel: alchemy,
    // 丹药消耗表零存档（05 §5.2 只记了不显示五行消耗），所以炼丹门槛只看炼丹之术
    rows: pillRows(alchemy, () => (alchemy >= 1 ? 1 : null)),
    brewing: brewRows(s, 'pill'),
  }
}

// —— 交易页 ——

export const TRADE_PAGE_SIZE = 10

/** 挂单 id 是字符串，原版界面用数字 `sheet`。这里给一份当前页的 id 表供交互反查。 */
export type TradeSheets = { readonly ids: readonly string[] }

const qiOfferOf = (s: GameState, o: QiOrder, sheet: number): QiOffer => ({
  sheet,
  give: o.offer.element,
  want: o.want.element,
  amount: o.offer.amount,
  wantAmount: o.want.amount,
  seconds: injectSecondsFor(s, o.offer.amount),
})

export function tradeVm(
  s: GameState,
  view: TradeView,
  page: number,
  filter: { readonly give?: Element | ''; readonly want?: Element | '' } = {},
  /** 购买法宝页的筛选：名称关键字 + 品质（0 全部 / 1 废品 / 2 凡品 / 3 上品 / 4 极品） */
  itemFilter: { readonly search?: string; readonly level?: number } = {},
): { readonly vm: TradeVm; readonly sheets: TradeSheets } {
  const give = filter.give ?? ''
  const want = filter.want ?? ''
  // 筛选条写的是「我用 X 换 Y」，站在买家角度：X 对应挂单的「需求」列
  const all = visibleOrders(s.market)
    .filter((o) => o.seller !== s.player.name)
    .filter((o) => (give === '' || o.want.element === give) && (want === '' || o.offer.element === want))

  const pages = Math.max(1, Math.ceil(all.length / TRADE_PAGE_SIZE))
  const p = Math.min(Math.max(1, page), pages)
  const slice = all.slice((p - 1) * TRADE_PAGE_SIZE, p * TRADE_PAGE_SIZE)

  const mine = s.market.qi.filter((o) => o.seller === s.player.name)
  // 法宝页的名称/品质筛选。市场上只有极品可交易（listArtifact 拦着），
  // 所以 level 选「极品」等于不筛，选别的品质就是空表 —— 与原版一致。
  const search = (itemFilter.search ?? '').trim()
  const level = itemFilter.level ?? 0
  const artifacts = s.market.artifacts
    .filter((o) => o.seller !== s.player.name)
    .filter((o) => search === '' || o.name.includes(search))
    .filter((o) => level === 0 || level === 4)
  const myArtifacts = s.market.artifacts.filter((o) => o.seller === s.player.name)

  const toItemOffer = (o: typeof artifacts[number], i: number): ItemOffer => ({
    sheet: i,
    name: `极品${o.name}${o.refine > 0 ? `+${o.refine}` : ''}`,
    item: 0,
    quality: 4,
    price: o.priceCoin,
  })

  return {
    vm: {
      view,
      qiOffers: slice.map((o, i) => qiOfferOf(s, o, i)),
      itemOffers: artifacts.map(toItemOffer),
      pager: { page: p, pages },
      filterGive: give,
      filterWant: want,
      search,
      level,
      order: 2,
      myQiOffers: mine.map((o, i) => qiOfferOf(s, o, i)),
      myItemOffers: myArtifacts.map(toItemOffer),
      sellable: s.player.artifacts
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => a.quality === '极品' && a.status === '空闲')
        .map(({ a, i }) => ({ id: i, name: artifactLabel(a), npcPrice: npcArtifactPrice(a) })),
    },
    sheets: {
      ids: view === 'sellqi' ? mine.map((o) => o.id)
        : view === 'buyitem' ? artifacts.map((o) => o.id)
        : view === 'sellitem' ? myArtifacts.map((o) => o.id)
        : slice.map((o) => o.id),
    },
  }
}

// —— 门派页 ——

export const ALLY_PAGE_SIZE = 10

/**
 * 单机版没有真人门派，用**道源**（蜀山/昆仑/通天）当门派：
 * 成员 = 同道源的 NPC，掌门 = 其中道行最高的那个。
 * 这一整页是【重建】—— 原版门派是玩家自建的组织，单机下无从还原。
 */
export function allyVm(s: GameState, tab: AllyTab, page: number): AllyVm {
  const all = allNpcsAt(s.npc, s.clock.gameT, s.worldSeed)
  const fellows = all
    .filter((n) => n.base.school === s.player.school)
    .sort((a, b) => b.daoxing - a.daoxing)

  const head = fellows[0]
  const toMember = (n: NpcState, rank: number): AllyMember => ({
    playerId: n.base.id,
    name: n.base.name,
    job: rank === 0 ? '掌门' : n.base.profile === '大狼' ? '杀手' : '弟子',
    realm: n.realm,
    dao: n.daoxingText,
  })

  // 自己排进名册：按道行插到该在的位置
  const me: AllyMember = {
    playerId: 0,
    name: s.player.name,
    job: '弟子',
    realm: s.player.realm,
    dao: `${Math.floor(s.player.daoxing / 4380)}年`,
  }
  const roster = [...fellows.map(toMember), me]
  const pages = Math.max(1, Math.ceil(roster.length / ALLY_PAGE_SIZE))
  const p = Math.min(Math.max(1, page), pages)

  const news: readonly AllyNews[] = s.mail
    .filter((m) => m.kind === 'battle' || m.kind === 'divine')
    .slice(0, 20)
    .map((m, i) => ({
      msgId: i + 1,
      kind: m.kind === 'divine' ? '算' : m.from === s.player.name ? '攻' : '防',
      text: m.subject,
      fromAlly: m.from === s.player.name ? s.player.school : '',
      toAlly: s.player.school,
      date: formatGameDateShort(m.at),
    }))

  return {
    tab,
    name: `${s.player.school}派`,
    allyId: ELEMENTS.indexOf(s.player.element) + 1,
    founder: { id: head?.base.id ?? 0, name: head?.base.name ?? '—' },
    leader: { id: head?.base.id ?? 0, name: head?.base.name ?? '—' },
    createdAt: formatGameDateShort(0).slice(0, 8),
    size: roster.length,
    nature: '-',
    imLabel: '-',
    im: '-',
    forum: null,
    allies: [],
    enemies: [],
    intro: SCHOOL_INTRO[s.player.school],
    members: roster.slice((p - 1) * ALLY_PAGE_SIZE, p * ALLY_PAGE_SIZE),
    news,
    page: p,
    pages,
  }
}

/**
 * 三家道源的简介。**逐字取自建号页的原版文案**（`createplayer.ts` 第 117 行那句
 * 「蜀山以剑仙著称…而通天则信奉弱肉强食的自由思想，最具掠夺性。」按道源拆开），
 * 没有另外编写 —— 原版门派简介是玩家自填的，没有存档可依。
 */
const SCHOOL_INTRO: Record<GameState['player']['school'], string> = {
  蜀山: '蜀山以剑仙著称，拥有最为刚猛的攻击。',
  昆仑: '昆仑以炼器著称，在炼制法宝上有所专长。',
  通天: '通天则信奉弱肉强食的自由思想，最具掠夺性。',
}

// —— 城镇 ——

/** 城镇按坐标索引进存档。 */
export const townKey = (x: number, y: number): string => `${x},${y}`

/**
 * 站在村/镇/城上时取这一格的城镇。**第一次踩上去才生成并入档**
 * （地形本身由世界种子算，所以同一个存档每次都是同一个镇）。
 * 不在城镇上返回 null。
 */
export function townHere(s: GameState): { readonly town: Town; readonly fresh: boolean } | null {
  const t = terrainAt(s.worldSeed, s.player.x, s.player.y, weekOfServer(s.clock))
  if (t !== '村庄' && t !== '小镇' && t !== '城池') return null

  const key = townKey(s.player.x, s.player.y)
  const known = s.towns[key]
  if (known) return { town: known, fresh: false }

  return {
    fresh: true,
    town: {
      id: key,
      kind: t,
      // 专名用世界生成器给的场景名（「雍州 无名村」→ 取后半）
      name: sceneName(s.worldSeed, s.player.x, s.player.y).split(' ')[1] ?? t,
      x: s.player.x,
      y: s.player.y,
      investments: [],
    },
  }
}

/** 中栏「当前场景中的NPC」：站在城镇里才有人。 */
export function sceneNpcNames(s: GameState): readonly string[] {
  const here = townHere(s)
  return here ? npcsIn(here.town.kind).map((n) => n.nameOf(here.town.kind)) : []
}

// —— 收件箱 ——

export const MSG_PAGE_SIZE = 10

export function msgVm(s: GameState, page: number): MsgVm {
  const pages = Math.max(1, Math.ceil(s.mail.length / MSG_PAGE_SIZE))
  const p = Math.min(Math.max(1, page), pages)
  const rows: readonly MsgRow[] = s.mail
    .slice((p - 1) * MSG_PAGE_SIZE, p * MSG_PAGE_SIZE)
    .map((m, i) => ({
      id: (p - 1) * MSG_PAGE_SIZE + i + 1,
      subject: m.subject,
      sender: m.from,
      sentAt: formatGameDate(m.at),
      unread: !m.read,
    }))
  return { rows, page: p, pages }
}
