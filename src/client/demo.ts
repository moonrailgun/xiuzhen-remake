/**
 * 阶段 1 的页面预览路由。
 *
 * 用夹具数据把每个页面渲染出来，方便和当年的截图叠图比对
 * （`tools/parity/manifest.json` 里标了哪些截图可以做 ±2px 断言）。
 * 阶段 2 接上真实 state 之后，这个文件会被 `vm(state,…)` 选择器取代。
 *
 * 用法：`?page=map`、`?page=skill&tab=sword`…；不带参数就是人物页。
 */

import { renderPlayer, type PlayerVm } from '../pages/player.ts'
import { renderMap, type MapVm } from '../pages/map.ts'
import { renderSkill, type SkillVm } from '../pages/skill.ts'
import { renderItem, type ItemVm } from '../pages/item.ts'
import { renderTrade, type TradeVm } from '../pages/trade.ts'
import { renderAlly, type AllyVm } from '../pages/ally.ts'
import { renderCreatePlayer } from '../pages/createplayer.ts'
import mapFixture from './map-fixture.json' with { type: 'json' }
import { PLAYER_2008, PLAYER_BODY_2010 } from './fixtures.ts'
import type { MainTab } from '../pages/shell.ts'

export type DemoPage = {
  readonly tab: MainTab
  readonly html: string
}

function mapVm(): MapVm {
  const f = mapFixture as unknown as {
    cells: MapVm['cells']
    meta: { playerX: number; playerY: number; curMapX: number; curMapY: number; playerDis: number }
  }
  const center = f.cells.find((c) => c.posx === f.meta.curMapX && c.posy === f.meta.curMapY)
  return {
    centerX: f.meta.curMapX,
    centerY: f.meta.curMapY,
    playerX: f.meta.playerX,
    playerY: f.meta.playerY,
    playerDis: f.meta.playerDis,
    cells: f.cells,
    selected: center ?? f.cells[0]!,
    goByDistance: 3,
  }
}

/** 法宝一览的夹具，照截图 #121「拥有法宝 (1/5)：上品玉虚桃木剑」。 */
const ITEM_VM: ItemVm = {
  tab: 'list',
  used: 1,
  capacity: 5,
  groups: [
    {
      id: 1,
      items: [{ name: '上品玉虚桃木剑', itemId: 50103, itemsn: 1, status: '空闲' }],
    },
  ],
} as ItemVm

/** 炼制飞剑页的夹具：数值来自 tools/fixtures/swords.json（原版物品窗逐字）。 */
const SWORD_CRAFT_ROWS = [
  { name: '玉虚桃木剑', itemId: 50100, owned: 0, cost: [140, 144, 71, 48, 95], seconds: 667, craftable: 3 },
  { name: '青龙伏魔剑', itemId: 50200, owned: 0, cost: [130, 146, 71, 54, 89], seconds: 667, craftable: 2 },
  { name: '乌光玄铁剑', itemId: 51100, owned: 0, cost: [321, 210, 140, 110, 180], seconds: 1000, craftable: 0 },
] as unknown as never

const SKILL_VM: SkillVm = { tab: 'produce', school: '通天', levels: { 101: 1 } } as SkillVm

const TRADE_VM = {
  view: 'buyqi',
  // 截图 #7（2008-12）的前几行挂单
  qiOffers: [
    { sheet: 1, give: '土', want: '金', amount: 5000, seconds: 6000 },
    { sheet: 2, give: '金', want: '木', amount: 5000, seconds: 6000 },
    { sheet: 3, give: '金', want: '木', amount: 45700, seconds: 54840 },
    { sheet: 4, give: '木', want: '土', amount: 40000, seconds: 48000 },
  ],
  itemOffers: [],
  pager: { page: 1, pages: 2 },
  filterGive: '',
  filterWant: '',
  search: '',
  level: 0,
  order: 2,
  myQiOffers: [],
  myItemOffers: [],
  sellable: [],
} as unknown as TradeVm

const ALLY_VM = {
  tab: 'overview',
  name: '修真人民解放军',
  allyId: 7,
  founder: { id: 1, name: 'Sean_CGOL' },
  leader: { id: 1, name: 'Sean_CGOL' },
  createdAt: '08-09-16',
  size: 1217,
  nature: '-',
  imLabel: 'QQ群',
  im: '47477448',
  forum: '#',
  allies: [],
  enemies: [{ id: 11, name: '封缘會' }],
  intro: '',
  members: [],
  news: [],
  pager: { page: 1, pages: 1 },
} as unknown as AllyVm

/** 按 `?page=` 选一个页面。返回 null 表示用默认的人物页。 */
export function renderDemoPage(params: URLSearchParams, player: PlayerVm): DemoPage {
  const page = params.get('page')
  const tab = params.get('tab')

  switch (page) {
    case 'map':
      return { tab: 'map', html: renderMap(mapVm()) }
    case 'skill':
      return { tab: 'skill', html: renderSkill({ ...SKILL_VM, tab: (tab as SkillVm['tab']) ?? 'produce' }) }
    case 'item':
      return {
        tab: 'item',
        html: renderItem(
          tab === 'sword'
            ? ({ tab: 'sword', rows: SWORD_CRAFT_ROWS } as ItemVm)
            : ITEM_VM,
        ),
      }
    case 'trade':
      return { tab: 'trade', html: renderTrade(TRADE_VM) }
    case 'ally':
      return { tab: 'ally', html: renderAlly(ALLY_VM) }
    case 'createplayer':
      return { tab: 'player', html: renderCreatePlayer({ gender: 1, attr: 5, school: 0, posi: 0 }) }
    case 'body':
      return { tab: 'player', html: renderPlayer(PLAYER_BODY_2010) }
    default:
      return { tab: 'player', html: renderPlayer(player ?? PLAYER_2008) }
  }
}
