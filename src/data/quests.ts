/**
 * 任务数据表：新手任务链（22 步 × 两条线）、《百妖记》100 回、境界任务 16 条。
 *
 * 完整度（`docs/research/02-guides-and-rules.md` §4）：
 *  - **新手任务** [原文，完整]：`reference/_session1-scratch/corpus/8096.txt`（练气线）、
 *    `8097.txt`（练剑线）逐条转录 —— 标题 / 说明文 / 操作路径 / 奖励全有。两条线内容完全相同，
 *    只是「初涉炼气」7 步与「初涉炼剑」8 步的先后顺序互换（第 3 步做选择）。
 *  - **《百妖记》** [原文‑玩家整理，两帖互证]：`docs/research/03-forum-verbatim-mining.md` §1.10，
 *    主表 `reference/text/forum162/article-92648-p1.txt`，逐回游戏内粘贴 `article-95120-p1.txt`。
 *    **只缺第 73、74、76 三回**，按邻回插值重建并标 `reconstructed`。
 *  - **境界任务** [原文，数值齐、描述文缺]：`corpus/15374.txt`（筑基/辟谷/心动）、
 *    `reference/text/forum162/article-49677-p9.txt`（金丹大道 3 步）、
 *    `reference/text/guides/66877-p1.txt`（五岳五把锁的地名与坐标）。
 *
 * ## 奖励的五行是相对本命属性的
 *
 * 两份新手任务帖的作者都是**金属性**（`8096.txt` #1 楼「可以肯定。你五行缺火」），
 * 所以帖子里「火」恒为其余四项的一半 —— 减半的是**克我**那一种，不是固定的火。
 * 百妖记同理：主表的列名就是「奖励真气[克我属性|其他属性]」。
 * 因此奖励一律存成 `{ base, overcomeBy }`，展示/发放时再按角色本命展开成金木水火土。
 */

import { ELEMENTS, overcomeBy, type Element } from './meridian.ts'
import type { FiveQi, Realm } from '../engine/state.ts'

// —— 奖励 ——

/** 真气奖励：非「克我」的四种各 `base`，「克我」那一种 `overcomeBy`。 */
export type QiReward = {
  readonly base: number
  readonly overcomeBy: number
}

/** 按本命属性把奖励展开成金木水火土。 */
export function qiRewardFor(r: QiReward, self: Element): FiveQi {
  const weak = overcomeBy(self)
  return ELEMENTS.map((e) => (e === weak ? r.overcomeBy : r.base)) as unknown as FiveQi
}

/** 「克我减半」—— 新手任务全程的规律（第 18 步除外，见下）。 */
const half = (base: number): QiReward => ({ base, overcomeBy: base / 2 })

export type QuestReward = {
  readonly qi?: QiReward
  /** 物品名，如「新手玄武玉匣」 */
  readonly items?: readonly string[]
  /** 完成后境界提升到 */
  readonly realm?: Realm
  /** 丹田容量额外上限（境界奖励），单位：单种真气 */
  readonly dantianBonus?: number
  /** 「充满丹田」这类没法用数字表达的奖励，原文照抄 */
  readonly note?: string
}

// —— 怪物 ——

export type Monster = {
  readonly name: string
  readonly attack: number
  readonly agility: number
  readonly life: number
  /** 五行属性；`null` = 原文的「属性:无」 */
  readonly element: Element | null
}

/** 任务概要里怪物的写法 [原文]（`03 §1.10` 逐回游戏内粘贴格式）。 */
export const monsterLine = (m: Monster): string =>
  `${m.name} 攻击:${m.attack} 敏捷:${m.agility} 生命:${m.life} 属性:${m.element ?? '无'}`

// —— 完成条件 ——

export type QuestGoal =
  /** 经脉：至少 `count` 条到 `level` 级；`elements` 给出时还要求覆盖这么多种属性 */
  | { readonly kind: 'meridian'; readonly level: number; readonly count: number; readonly elements?: number }
  /** 本体第 `index` 项（序号同 `cultivate.ts` 的 BODY_PARTS）到 `level` 级 */
  | { readonly kind: 'body'; readonly index: number; readonly level: number }
  /** 法术 `id` 到 `level` 级 */
  | { readonly kind: 'skill'; readonly id: string; readonly level: number }
  /** 炼制：`item` 为「飞剑」「丹药」或具体剑名 */
  | { readonly kind: 'craft'; readonly item: string; readonly count: number }
  /** 淬炼 `count` 把飞剑 */
  | { readonly kind: 'refine'; readonly count: number }
  /** 击败某怪（试剑石 / 百妖 / 五岳 / 三尸 / 天雷都走这条） */
  | { readonly kind: 'slay'; readonly monster: Monster }
  /** 道行达到 `points` 点 */
  | { readonly kind: 'daoxing'; readonly points: number }
  /** 阅历达到 `points` 点 */
  | { readonly kind: 'experience'; readonly points: number }
  /** 交给 NPC `amount` 两银子 */
  | { readonly kind: 'silver'; readonly amount: number; readonly npc: string }
  /** 答题（第 2 步）：题目原文缺 */
  | { readonly kind: 'quiz' }
  /** 选分支（第 3 步）：先炼气还是先炼剑 */
  | { readonly kind: 'choice' }
  /** 结丹：十分真元凝聚成金丹 */
  | { readonly kind: 'goldenCore' }

/** 领取门槛。 */
export type QuestRequire = {
  /** 境界至少到 */
  readonly realm?: Realm
  /** 必须已出保护期 */
  readonly outOfProtection?: boolean
  /** 前置任务 id（同一条链里默认按顺序，这里只写跨链的） */
  readonly after?: string
}

export type QuestCategory = 'newbie' | 'beast' | 'realm'

export type Quest = {
  readonly id: string
  readonly category: QuestCategory
  /** 系列名：初入修真 / 初涉炼气 / 初涉炼剑 / 十八年后 / 《百妖记》/ 先天境界 / 斩却三尸 / 千金散尽 / 金丹大道 */
  readonly series: string
  /** 步骤名，如「打通经脉」 */
  readonly name: string
  readonly step: number
  readonly total: number
  /** 任务概要（原文说明文） */
  readonly summary: string
  /** 操作路径原文（新手任务专有，可直接当 UI 导航证据） */
  readonly path?: string
  readonly goal: QuestGoal
  readonly reward: QuestReward
  readonly require?: QuestRequire
  /** 固定目标坐标（只有五岳有；百妖记按角色随机生成，见 `engine/quest.ts`） */
  readonly at?: readonly [number, number]
  /** 出处；无出处写 `reconstructed（…）` */
  readonly source: string
  readonly repeatable?: boolean
}

/** 任务栏 / 标题条上的整串写法。 */
export function questTitle(q: Quest): string {
  if (q.category === 'beast') return `《百妖记》第${cnNumber(q.step)}回(${q.step}/${q.total})`
  // 任务栏原文：`斩却三尸-上尸彭踞(1/4)`（`03 §1.9`(e)）
  if (q.category === 'realm') return `${q.series}-${q.name}(${q.step}/${q.total})`
  // 新手任务帖原文是「初入修真 - 打通经脉」，带不带 (n/22) 没有存档证据
  return `${q.series} - ${q.name}`
}

/** 回数的中文写法（《百妖记》第八回）。 */
export function cnNumber(n: number): string {
  const d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n < 10) return d[n]!
  if (n === 100) return '一百'
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${tens === 1 ? '' : d[tens]!}十${ones ? d[ones]! : ''}`
}

// ===========================================================================
// 1. 新手任务链 —— 22 步 × 两条线
// ===========================================================================

const NEWBIE_SRC_QI = 'reference/_session1-scratch/corpus/8096.txt（练气线全文）'
const NEWBIE_SRC_SWORD = 'reference/_session1-scratch/corpus/8097.txt（练剑线全文）'
const NEWBIE_SRC_BOTH = `${NEWBIE_SRC_QI} + ${NEWBIE_SRC_SWORD}（两帖一致）`

/** 新手任务的一步，编号在组装两条线时才定。 */
type NewbieStep = Omit<Quest, 'id' | 'category' | 'step' | 'total'>

/** 试剑石(大) [原文] `reference/text/guides/51853-p1.txt` L84。 */
export const BIG_TEST_STONE: Monster = {
  name: '试剑石(大)',
  attack: 1,
  agility: 60,
  life: 40,
  element: null,
}

/** 试剑石(小)：出击面板原文只留下名字与坐标，属性 [未知]，按「大」等比缩小重建。 */
export const SMALL_TEST_STONE: Monster = {
  name: '试剑石(小)',
  attack: 1,
  agility: 10,
  life: 10,
  element: null,
}

/** 第 1–3 步「初入修真」，两条线共用。 */
const NEWBIE_HEAD: readonly NewbieStep[] = [
  {
    series: '初入修真',
    name: '打通经脉',
    summary: '修真第一步，就是打通经脉，加快丹田真气的产生。',
    path: '人物页面->点击任意一条经脉->在弹出的窗口中点击“升级”',
    goal: { kind: 'meridian', level: 1, count: 1 },
    reward: { qi: half(150) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初入修真',
    name: '本命属性',
    summary:
      '打开人物页面，在人物的名字下面的表格中找到自己的属性。了解相关情况，正确回答问题即可完成任务。',
    // 题目与选项原文缺（`02 §4.1` 缺口、`DECISIONS-rules.md` E-列）
    goal: { kind: 'quiz' },
    reward: { qi: half(50) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初入修真',
    name: '炼气炼剑',
    summary: '通过这个任务你可以选择先学习修炼方面的技巧，还是先学习炼剑方面的技巧。',
    goal: { kind: 'choice' },
    reward: { qi: half(50) },
    source: NEWBIE_SRC_BOTH,
  },
]

/** 「初涉炼气」7 步。练气线在第 4–10 步，练剑线在第 12–18 步。 */
const NEWBIE_QI_LINE: readonly NewbieStep[] = [
  {
    series: '初涉炼气',
    name: '运转周天',
    summary: '挑选其余三种属性的一条经脉，将其升到1级。（即四种颜色圆圈内的数字，分别有一个是1）',
    // 「其余三种属性各一条」+ 第 1 步那条 = 4 条、覆盖 4 种属性（克我无对应经脉）
    goal: { kind: 'meridian', level: 1, count: 4, elements: 4 },
    reward: { qi: half(300) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼气',
    name: '丹田气海',
    summary: '炼气要注意提升丹田的容量，这样才能容纳更多的真气。',
    path: '人物页面->点击“本体”->点击“丹田气海”所指向的小圆圈->在弹出的窗口中点击“升级”',
    goal: { kind: 'body', index: 5, level: 1 },
    reward: { qi: half(250) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼气',
    name: '运转周天',
    summary: '将全部经脉提升到1级（即12个圆圈内的数字全部变为1）',
    goal: { kind: 'meridian', level: 1, count: 12 },
    reward: { qi: half(500) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼气',
    name: '炼丹之术',
    summary: '炼丹之术是另一个真气增长的方式',
    path: '法术页面->点击“炼丹之术”->在弹出的窗口中点击“升级”',
    goal: { kind: 'skill', id: '炼丹之术', level: 1 },
    reward: { qi: half(100) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼气',
    name: '开炉炼丹',
    summary: '炼制1颗丹药',
    path: '法术页面->点击“炼丹之术”->在弹出的窗口中点击“炼制法宝”->在你想要炼制的输入框中输入炼制个数“1”->点击“炼制”',
    goal: { kind: 'craft', item: '丹药', count: 1 },
    reward: { qi: half(50) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼气',
    name: '再拓丹田',
    summary: '将丹田气海提升至2级',
    goal: { kind: 'body', index: 5, level: 2 },
    reward: { qi: half(1200) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼气',
    name: '二转周天',
    summary: '将所有经脉提升至2级',
    goal: { kind: 'meridian', level: 2, count: 12 },
    reward: { qi: half(1000) },
    source: NEWBIE_SRC_BOTH,
  },
]

/** 「初涉炼剑」8 步。练气线在第 11–18 步，练剑线在第 4–11 步。 */
const NEWBIE_SWORD_LINE: readonly NewbieStep[] = [
  {
    series: '初涉炼剑',
    name: '炼制飞剑',
    summary:
      '现在开始试着炼制一把飞剑吧！点击法宝页面，如果您丹田中拥有足够的真气，在对应的位置输入你想要炼制的飞剑数目，然后点击旁边的“炼制”按钮。',
    path: '法宝页面->点击“飞剑”->输入要炼制的飞剑数目->点击“炼制”按钮',
    goal: { kind: 'craft', item: '飞剑', count: 1 },
    reward: { qi: half(100) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼剑',
    name: '以石试剑',
    summary: '附近的山顶有块试剑石，通过地图找到它，然后尝试用飞剑攻击它，将它摧毁。',
    path: '找到试剑石->点击攻击图标->选择法术->选择飞剑',
    goal: { kind: 'slay', monster: SMALL_TEST_STONE },
    reward: { qi: half(50) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼剑',
    name: '无锤百炼',
    summary: '百炼之法可以使飞剑更加凝炼，是淬炼飞剑的前提，将百炼之法提升至Lv.1',
    path: '法术页面->点击“百炼之法”->在弹出的窗口中点击“升级”',
    goal: { kind: 'skill', id: '百炼之法', level: 1 },
    reward: { qi: half(300) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼剑',
    name: '淬炼飞剑',
    summary: '淬炼一把飞剑',
    path: '法术页面->点击“百炼之法”->在弹出的窗口中点击“淬炼法宝”->在你想要淬炼的输入框中输入淬炼个数“1”->点击“淬炼”',
    goal: { kind: 'refine', count: 1 },
    reward: { qi: half(50) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼剑',
    name: '铸剑之术',
    summary: '铸剑之术可以使你掌握铸造其他飞剑的能力，将铸剑之术提升至Lv.1',
    path: '法术页面->点击“铸剑之术”->在弹出的窗口中点击“升级”',
    goal: { kind: 'skill', id: '铸剑之术', level: 1 },
    reward: { qi: half(300) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼剑',
    name: '青龙伏魔',
    summary:
      '炼制一把青龙伏魔剑。点击法宝页面，如果您丹田中拥有足够的真气，在青龙伏魔剑对应的输入框中输入你想要炼制的飞剑数目“1”，然后点击旁边的“炼制”按钮。',
    path: '法宝页面->点击“飞剑”->输入青龙伏魔剑数目->点击“炼制”按钮',
    goal: { kind: 'craft', item: '青龙伏魔剑', count: 1 },
    reward: { qi: half(100) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼剑',
    name: '御剑奇术',
    summary: '御剑术可以使你掌握驱使其他飞剑的能力，将御剑术提升至Lv.1即可驱使青龙伏魔剑',
    path: '法术页面->点击“剑术”->点击“御剑术”->在弹出的窗口中点击“升级”',
    goal: { kind: 'skill', id: '御剑术', level: 1 },
    reward: { qi: half(300) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '初涉炼剑',
    name: '合击之法',
    summary: monsterLine(BIG_TEST_STONE),
    goal: { kind: 'slay', monster: BIG_TEST_STONE },
    // ★ 异常：按「克我为一半」的规律应是 800，两帖都写 1550。
    //   `02 §5` #19 的裁决：**保留 1550 并加注**（疑为原版数据或当年录入笔误，[未知]）。
    reward: { qi: { base: 1600, overcomeBy: 1550 } },
    source: `${NEWBIE_SRC_BOTH}；1550 的异常见 docs/research/02-guides-and-rules.md §5 #19`,
  },
]

/** 第 19–22 步「十八年后」，两条线共用。 */
const NEWBIE_TAIL: readonly NewbieStep[] = [
  {
    series: '十八年后',
    name: '三转周天',
    summary: '将所有经脉提升至3级',
    goal: { kind: 'meridian', level: 3, count: 12 },
    reward: { qi: half(3000) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '十八年后',
    name: '三拓丹田',
    summary: '将丹田气海提升至3级',
    goal: { kind: 'body', index: 5, level: 3 },
    reward: { qi: half(400) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '十八年后',
    name: '未雨绸缪',
    summary: '将固本培元提升至1级',
    goal: { kind: 'body', index: 4, level: 1 },
    reward: { qi: half(100) },
    source: NEWBIE_SRC_BOTH,
  },
  {
    series: '十八年后',
    name: '脱离保护',
    summary:
      '将你的道行（通过各种途径消耗的真气值总和）提升到十八年（共计78840点）以离开新手保护期，你可以在“个人资料”或是“排行榜”中查看你的道行值。',
    goal: { kind: 'daoxing', points: 78840 },
    // 末环奖励「新手玄武玉匣」是 2009-03-24 加入的，在基准版之内（`DECISIONS.md` §1.2）。
    reward: { qi: half(2000), items: ['新手玄武玉匣'] },
    source: `${NEWBIE_SRC_BOTH}；玄武玉匣见 docs/research/01-versions-and-systems.md §2009-03-24 维护公告`,
  },
]

/** 新手任务两条线：第 3 步选「先炼气」还是「先炼剑」。 */
export type NewbieLine = 'qi' | 'sword'

export const NEWBIE_TOTAL = 22

/**
 * id 按「段」编号而不是按步数编号（`newbie:qi:1` 而不是 `newbie:4`）：
 * 两条线是同样 22 件事换了顺序，同一件事在两条线里步数不同、但**必须是同一个任务**，
 * 否则第 3 步选线之后前 3 步的完成记录就对不上了。
 */
const segment = (prefix: string, steps: readonly NewbieStep[]) =>
  steps.map((s, i) => ({ ...s, id: `newbie:${prefix}:${i + 1}` }))

function buildNewbie(line: NewbieLine): readonly Quest[] {
  const qi = segment('qi', NEWBIE_QI_LINE)
  const sword = segment('sword', NEWBIE_SWORD_LINE)
  const middle = line === 'qi' ? [...qi, ...sword] : [...sword, ...qi]
  return [...segment('head', NEWBIE_HEAD), ...middle, ...segment('tail', NEWBIE_TAIL)].map(
    (s, i) => ({
      ...s,
      category: 'newbie' as const,
      step: i + 1,
      total: NEWBIE_TOTAL,
    }),
  )
}

export const NEWBIE_QI_CHAIN: readonly Quest[] = buildNewbie('qi')
export const NEWBIE_SWORD_CHAIN: readonly Quest[] = buildNewbie('sword')

export const newbieChain = (line: NewbieLine): readonly Quest[] =>
  line === 'qi' ? NEWBIE_QI_CHAIN : NEWBIE_SWORD_CHAIN

// ===========================================================================
// 2. 《百妖记》100 回
// ===========================================================================

/**
 * 怪物全表 [原文‑玩家整理，两帖互证]。
 * 列：回数 / 名字 / 攻击 / 敏捷 / 生命 / 属性（`''` = 原文「无」）。
 *
 * 主表 `reference/text/forum162/article-92648-p1.txt` L24–835（寂寞小彬《百妖记 1 到 100 功略》），
 * 逐回游戏内粘贴 `article-95120-p1.txt`（1–53 回），回帖补 58–60、69、75 回。
 * 已按 `03 §1.10` 的勘误取值：25 石狮精=土（主表误作木）、36 有去有来=无（主表作水）、
 * 39 白鼠精攻击=440（主表作 400）。
 */
const BEAST_TABLE: readonly (readonly [string, number, number, number, string])[] = [
  ['三青鸟', 14, 10, 30, ''],
  ['竹叶青', 29, 10, 30, '水'],
  ['油布伞', 30, 10, 30, '木'],
  ['白纸灯笼', 45, 10, 60, '火'],
  ['僵尸', 50, 10, 75, ''],
  ['猛虎', 75, 10, 110, ''],
  ['花精', 20, 10, 160, '木'],
  ['白骷髅', 45, 10, 45, ''],
  ['田螺精', 45, 10, 270, '水'],
  ['混世魔王', 130, 60, 800, ''],
  ['青瓮酒坛', 65, 10, 410, '水'],
  ['穿山甲精', 75, 10, 110, '土'],
  ['黑羊精', 110, 10, 160, ''],
  ['赤链蛇', 30, 10, 220, '火'],
  ['蛤蟆精', 60, 10, 60, '水'],
  ['独目鬼', 60, 10, 360, ''],
  ['蚌女', 90, 10, 550, '水'],
  ['小钻风', 100, 10, 150, ''],
  ['蜈蚣精', 150, 10, 210, ''],
  ['红杏娘娘', 440, 60, 650, '木'],
  ['无头鬼', 40, 10, 320, ''],
  ['野狼精', 85, 10, 90, ''],
  ['蛇女', 85, 10, 550, ''],
  ['树妖', 130, 10, 800, '木'],
  ['石狮精', 150, 10, 230, '土'],
  ['竹节翁', 220, 10, 320, '木'],
  ['大钻风', 55, 10, 430, ''],
  ['狐狸精', 120, 10, 120, ''],
  ['画皮鬼', 120, 10, 700, ''],
  ['黑风大王', 350, 60, 2200, ''],
  ['虾精', 180, 10, 1100, '水'],
  ['蟹怪', 200, 10, 300, '水'],
  ['赤蝎', 300, 10, 420, '火'],
  ['青蛇精', 85, 10, 650, '水'],
  ['有来有去', 170, 10, 180, ''],
  ['有去有来', 170, 10, 1100, ''],
  ['鳐精', 260, 10, 1600, '水'],
  ['野猪精', 290, 10, 450, ''],
  ['白鼠精', 440, 10, 650, ''],
  ['百眼魔君', 1300, 60, 1900, ''],
  ['蜘蛛精', 110, 10, 850, ''],
  ['地缚棺', 230, 10, 240, '木'],
  ['古刹铜钟', 230, 10, 1400, '金'],
  ['三足龟', 350, 10, 2200, '水'],
  ['饿死鬼', 390, 10, 600, ''],
  ['桃精', 600, 10, 850, '木'],
  ['柳怪', 170, 10, 1300, '木'],
  ['鲛人', 350, 10, 360, '水'],
  ['黑玉蟾', 350, 10, 2200, '土'],
  ['九尾妖狐', 1000, 60, 6500, ''],
  ['井溺鬼', 550, 10, 3200, ''],
  ['奔波儿灞', 600, 10, 900, '水'],
  ['灞波儿奔', 900, 10, 1300, '水'],
  ['火云狐', 220, 10, 1700, '火'],
  ['吊睛白额虎', 460, 10, 480, ''],
  ['牛妖', 460, 10, 2900, ''],
  ['幽灵', 700, 10, 4300, ''],
  ['无名虫', 800, 10, 1200, ''],
  ['玄狐', 1200, 10, 1700, ''],
  ['青木居士', 3600, 60, 5000, '木'],
  ['金蟾', 340, 10, 2600, '金'],
  ['古藤精', 700, 10, 700, '木'],
  ['陵鱼', 700, 10, 4300, '水'],
  ['白虎怪', 1100, 10, 6500, ''],
  ['黑熊精', 1200, 10, 1800, ''],
  ['粉骷髅', 1800, 10, 2500, ''],
  ['黑鼠精', 450, 10, 3500, ''],
  ['黑水玄蛇', 950, 10, 950, '水'],
  ['独角怪', 950, 10, 6000, ''],
  ['玉面娘娘', 2800, 60, 17000, ''],
  ['吊死鬼', 1400, 10, 8500, ''],
  ['丹青魂', 1900, 10, 2400, '木'],
  // 73/74/76 两篇玩家整理帖都缺（`DECISIONS-rules.md` E8）。按第 72 与第 75 回线性插值重建，
  // 怪名是仿原表志怪风格自拟的占位名 —— 三条全部 reconstructed。
  ['赤发鬼', 1700, 10, 2100, ''],
  ['铁背苍狼', 1600, 10, 1700, ''],
  ['白蛇精', 1400, 10, 1400, '水'],
  ['沉沙鬼', 1800, 10, 7200, ''],
  ['黑螺精', 2100, 10, 13000, '水'],
  ['落水鬼', 2400, 10, 3600, ''],
  ['总钻风', 3600, 10, 5000, ''],
  ['青面巨猿', 11000, 60, 15000, ''],
  ['金翅大鹏', 900, 10, 7000, '金'],
  ['通臂灵猿', 1900, 10, 1900, ''],
  ['苍松老人', 1900, 10, 12000, '木'],
  ['朱厌', 2800, 10, 17000, ''],
  ['鬼轿子', 1300, 10, 4800, ''],
  ['黑毛小妖', 4700, 10, 6500, ''],
  ['山魈', 1300, 10, 10000, '木'],
  ['赤眼妖瞳', 2800, 10, 2900, '火'],
  ['血骷髅', 2800, 10, 17000, ''],
  ['黑山老妖', 8500, 60, 50000, '土'],
  ['夜行风', 4200, 10, 26000, ''],
  ['雪猿', 4700, 10, 7000, '水'],
  ['神火鸦', 7000, 10, 10000, '火'],
  ['六耳猕猴', 1800, 10, 14000, ''],
  ['璇龟', 3700, 10, 3800, '水'],
  ['五毒金蟾', 3700, 10, 23000, '金'],
  ['古剑魄', 5500, 10, 35000, '金'],
  ['恶蛟', 6500, 10, 9500, '水'],
  ['邪灵', 9500, 10, 13000, ''],
  ['太岁', 28000, 60, 40000, '土'],
]

/** 原文缺失、由邻回插值重建的回次。 */
export const BEAST_RECONSTRUCTED_ROUNDS: readonly number[] = [73, 74, 76]

export const BEAST_TOTAL = 100

/** 逢十为 BOSS 回（敏捷 60，「克我」那一项奖励翻倍）。 */
export const isBeastBoss = (round: number): boolean => round % 10 === 0

/**
 * 第 N 回的真气奖励 [原文规律，1–20 回 20/20 吻合]：
 * 五行各 N×100；逢十 BOSS 回「克我」那一项 2N×100。
 */
export const beastReward = (round: number): QiReward => ({
  base: round * 100,
  overcomeBy: round * 100 * (isBeastBoss(round) ? 2 : 1),
})

/**
 * 领取门槛 [原文] `reference/02-RULES-EXTRACTED.md` L157，
 * 第二来源 `reference/_session1-scratch/corpus/8384.txt`：
 * 1–5 无 · 6–20 离开保护期 · 21–40 辟谷期 · 41–60 心动期 · 61–80 金丹期 · 81–100 元婴期。
 */
export function beastRequire(round: number): QuestRequire | undefined {
  if (round <= 5) return undefined
  if (round <= 20) return { outOfProtection: true }
  if (round <= 40) return { realm: '辟谷期' }
  if (round <= 60) return { realm: '心动期' }
  if (round <= 80) return { realm: '金丹期' }
  return { realm: '元婴期' }
}

const BEAST_SRC =
  'docs/research/03-forum-verbatim-mining.md §1.10（reference/text/forum162/article-92648-p1.txt 主表 + article-95120-p1.txt 逐回粘贴）'

export const BEAST_QUESTS: readonly Quest[] = BEAST_TABLE.map((row, i) => {
  const round = i + 1
  const monster: Monster = {
    name: row[0],
    attack: row[1],
    agility: row[2],
    life: row[3],
    element: row[4] === '' ? null : (row[4] as Element),
  }
  const reconstructed = BEAST_RECONSTRUCTED_ROUNDS.includes(round)
  return {
    id: `beast:${round}`,
    category: 'beast' as const,
    series: '《百妖记》',
    name: `第${cnNumber(round)}回`,
    step: round,
    total: BEAST_TOTAL,
    summary: monsterLine(monster),
    goal: { kind: 'slay' as const, monster },
    reward: { qi: beastReward(round) },
    ...(beastRequire(round) ? { require: beastRequire(round)! } : {}),
    source: reconstructed
      ? 'reconstructed（原文两帖均缺此回；怪名自拟、属性按第 72/75 回线性插值；奖励按 N×100 规律）'
      : BEAST_SRC,
  }
})

/** 第 8 回「白骷髅」是唯一留下任务描述文的百妖任务（截图 #83）。 */
export const BEAST_DESCRIPTION_KNOWN_ROUNDS: readonly number[] = [8]

// ===========================================================================
// 3. 境界任务
// ===========================================================================

/**
 * 阅历门槛 = 345600 × {1,2,3,4,5} [原文 3 点实证 + 推断]。
 * 345600(4 天秒数)=筑基→辟谷、691200=辟谷→心动、1036800=心动→金丹 [DOM#150]、
 * 1382400=金丹→元婴 [原文 article-49677-p9]、1728000=元婴期上限 [DOM#15 #81]。
 */
export const EXPERIENCE_UNIT = 345600
export const EXPERIENCE_THRESHOLDS: Readonly<Record<Realm, number>> = {
  筑基期: EXPERIENCE_UNIT * 1,
  辟谷期: EXPERIENCE_UNIT * 2,
  心动期: EXPERIENCE_UNIT * 3,
  金丹期: EXPERIENCE_UNIT * 4,
  元婴期: EXPERIENCE_UNIT * 5,
}

const SRC_15374 = 'reference/_session1-scratch/corpus/15374.txt（三季稻《如何快速的成长到金丹期》，公测最权威）'
const SRC_66877 = 'reference/text/guides/66877-p1.txt L125–129（五岳五把锁的州/峰名与坐标）'
const SRC_49677 = 'reference/text/forum162/article-49677-p9.txt（大龙《如何从金丹升级到元婴》）'

/**
 * 五岳五把锁 [原文] —— 攻击 2000 / 敏捷 3600 / 生命 500，五属性各一。
 * 敏捷 3600 = 缠斗至少一小时。被克属性时要承受 3000 伤害（`15374`）。
 * 顺序按 `15374` 的「东南西北中」：泰山·玉皇顶 → 衡山·祝融峰 → 华山·落雁峰 → 恒山·天峰岭 → 嵩山·峻极峰。
 */
export const WUYUE: readonly {
  readonly province: string
  readonly peak: string
  readonly at: readonly [number, number]
  readonly monster: Monster
}[] = [
  { province: '徐州', peak: '玉皇顶', at: [168, 198], monster: { name: '肝木藏魂锁', attack: 2000, agility: 3600, life: 500, element: '木' } },
  { province: '荆州', peak: '祝融峰', at: [194, 17], monster: { name: '心火固气锁', attack: 2000, agility: 3600, life: 500, element: '火' } },
  { province: '雍州', peak: '落雁峰', at: [41, 59], monster: { name: '肺金伏魄锁', attack: 2000, agility: 3600, life: 500, element: '金' } },
  { province: '并州', peak: '天峰岭', at: [53, 181], monster: { name: '肾水固精锁', attack: 2000, agility: 3600, life: 500, element: '水' } },
  { province: '冀州', peak: '峻极峰', at: [100, 89], monster: { name: '脾土定意锁', attack: 2000, agility: 3600, life: 500, element: '土' } },
]

/**
 * 三尸 [原文] `15374`：上尸 攻1000/生4000、中尸 攻4000/生1000、下尸 攻4000/生4000，敏捷均 3600。
 * 正式名「上尸彭踞」出自任务栏原文 `斩却三尸-上尸彭踞(1/4)`（`03 §1.9`(e)）；
 * 中尸「彭踬」、下尸「彭蹻」是道教典籍里的固定搭配，属 [推断]。
 * 只在**每周六**刷新、满地图随机、必须按顺序一只只斩、当天不斩完消失。
 */
export const SANSHI: readonly Monster[] = [
  { name: '上尸彭踞', attack: 1000, agility: 3600, life: 4000, element: null },
  { name: '中尸彭踬', attack: 4000, agility: 3600, life: 1000, element: null },
  { name: '下尸彭蹻', attack: 4000, agility: 3600, life: 4000, element: null },
]

/** 三尸只在周六刷新 [原文]（封测为周日，`DECISIONS.md` §5 #8 取周六）。 */
export const SANSHI_SPAWN_WEEKDAY = 6

/** 小天劫的天雷：攻击与生命都是 9999 [原文] `article-49677-p9`。 */
export const HEAVENLY_TRIBULATION: Monster = {
  name: '天雷',
  attack: 9999,
  agility: 3600,
  life: 9999,
  element: null,
}

type RealmStep = Omit<Quest, 'id' | 'category' | 'step' | 'total'>

/** 筑基→辟谷：「先天境界」7 步（先天大圆满 1 + 剑斩五岳 5 + 境界提升 1）。 */
const XIANTIAN_STEPS: readonly RealmStep[] = [
  {
    series: '先天境界',
    name: '先天大圆满',
    summary: '后天境界圆满，将丹田气海提升至20级，方可承接先天之气。',
    goal: { kind: 'body', index: 5, level: 20 },
    reward: {},
    source: `${SRC_15374}（「筑基任务（1/7）就是后天境界丹田气海20级」）；任务描述文 [未知]，此处为重建文案`,
  },
  ...WUYUE.map((y, i): RealmStep => ({
    series: '先天境界',
    name: '剑斩五岳',
    summary: `${monsterLine(y.monster)}　${y.province}·${y.peak}(${y.at[0]},${y.at[1]})`,
    goal: { kind: 'slay', monster: y.monster },
    reward: {},
    at: y.at,
    source: `${SRC_15374}（攻 2000 / 生命 500，五属性各一）+ ${SRC_66877}（第 ${i + 2} 处：${y.peak}）`,
  })),
  {
    series: '先天境界',
    name: '境界提升',
    summary: '完成任务以提升境界',
    goal: { kind: 'experience', points: EXPERIENCE_THRESHOLDS['筑基期'] },
    // 奖励「充满丹田」[原文 c/4317]；公测实测「入手 40W 真气」= 20 级丹田五行各 8 万 [推断]
    reward: { realm: '辟谷期', note: '充满丹田' },
    source: `${SRC_15374}（「筑基任务（7/7）积攒阅历36w左右」）+ docs/research/02-guides-and-rules.md §2.1`,
  },
]

/** 辟谷→心动：「斩却三尸」4 步。 */
const SANSHI_STEPS: readonly RealmStep[] = [
  ...SANSHI.map((m, i): RealmStep => ({
    series: '斩却三尸',
    name: m.name,
    summary: monsterLine(m),
    goal: { kind: 'slay' as const, monster: m },
    reward: {},
    source:
      i === 0
        ? `${SRC_15374} + docs/research/03-forum-verbatim-mining.md §1.9(e)（任务栏原文「斩却三尸-上尸彭踞(1/4)」）`
        : `${SRC_15374}（数值[原文]）；怪名「${m.name}」为 reconstructed（原文只留下「上尸彭踞」）`,
  })),
  {
    series: '斩却三尸',
    name: '境界提升',
    summary: '完成任务以提升境界',
    goal: { kind: 'experience', points: EXPERIENCE_THRESHOLDS['辟谷期'] },
    reward: { realm: '心动期', dantianBonus: 5000 },
    source: `${SRC_15374}（「辟谷任务（4/4）阅历任务，67w左右」）；丹田上限 +5000 出自 corpus/4317.txt（封测）`,
  },
]

/** 心动→金丹：「千金散尽」2 步。 */
const QIANJIN_STEPS: readonly RealmStep[] = [
  {
    series: '千金散尽',
    name: '千金散尽',
    summary: '把你通过跑镖、投资获得的收入100万两交给李员外。',
    goal: { kind: 'silver', amount: 1_000_000, npc: '李员外' },
    reward: {},
    source: `${SRC_15374}（100 万两；c/4317 的 10 万是封测值，裁决见 docs/spec/DECISIONS-rules.md §8）`,
  },
  {
    series: '千金散尽',
    name: '境界提升',
    summary: '完成任务以提升境界',
    goal: { kind: 'experience', points: EXPERIENCE_THRESHOLDS['心动期'] },
    reward: { realm: '金丹期', dantianBonus: 10000 },
    // 任务描述文是唯一有原文的境界任务 [原文] DOM#150
    source:
      'reference/text/forum162/article-95756-p1.txt（DOM #150：「阅历值达到1036800…完成奖励：境界提升为 金丹期」）',
  },
]

/** 心动→金丹「境界提升(2/2)」的任务描述 [原文] `article-95756-p1.txt`。 */
export const QIANJIN_DESCRIPTION: readonly string[] = [
  '你将最后的钱财交付李员外之后，他皱起眉头，似乎想要再劝你两句。你哈哈一笑，拂袖飘然直向山中行去。',
  '在转身离去的那一瞬间，你只觉得心境空明，尘缘俗务皆尽斩断，心中再无烦恼之事。',
]

/**
 * 金丹→元婴：「金丹大道」3 步 [原文] `article-49677-p9`：
 * 1 结丹（十分真元凝成金丹）/ 2 过天劫（天雷攻防 9999）/ 3 阅历值 1382400。
 * 三步的任务名原文都写作「金丹大道-境界提升(n/3)」。
 */
const JINDAN_STEPS: readonly RealmStep[] = [
  {
    series: '金丹大道',
    name: '境界提升',
    summary: '将一甲子真气压缩为一分真元，拥有十分真元就会自动凝聚成金丹。',
    goal: { kind: 'goldenCore' },
    reward: {},
    source: `${SRC_49677}（「1、结丹 金丹大道-境界提升(1/3)」）+ docs/research/01-versions-and-systems.md §4.4（官方 8 条说明原文）`,
  },
  {
    series: '金丹大道',
    name: '境界提升',
    summary: monsterLine(HEAVENLY_TRIBULATION),
    goal: { kind: 'slay', monster: HEAVENLY_TRIBULATION },
    reward: {},
    source: `${SRC_49677}（「2、过天劫 金丹大道-境界提升(2/3)　天雷的攻击和生命都是9999」）`,
  },
  {
    series: '金丹大道',
    name: '境界提升',
    summary: '完成任务以提升境界',
    goal: { kind: 'experience', points: EXPERIENCE_THRESHOLDS['金丹期'] },
    reward: { realm: '元婴期', dantianBonus: 160000 },
    source: `${SRC_49677}（「3、阅历值…达到：1382400」「元婴期到了，丹田上限160000」）`,
  },
]

function buildRealmChain(id: string, realm: Realm, steps: readonly RealmStep[]): readonly Quest[] {
  return steps.map((s, i) => ({
    ...s,
    id: `realm:${id}:${i + 1}`,
    category: 'realm' as const,
    step: i + 1,
    total: steps.length,
    require: { realm },
  }))
}

/** 筑基期接的「先天境界」7 步。 */
export const XIANTIAN_CHAIN = buildRealmChain('xiantian', '筑基期', XIANTIAN_STEPS)
/** 辟谷期接的「斩却三尸」4 步。 */
export const SANSHI_CHAIN = buildRealmChain('sanshi', '辟谷期', SANSHI_STEPS)
/** 心动期接的「千金散尽」2 步。 */
export const QIANJIN_CHAIN = buildRealmChain('qianjin', '心动期', QIANJIN_STEPS)
/** 金丹期接的「金丹大道」3 步。 */
export const JINDAN_CHAIN = buildRealmChain('jindan', '金丹期', JINDAN_STEPS)

export const REALM_QUESTS: readonly Quest[] = [
  ...XIANTIAN_CHAIN,
  ...SANSHI_CHAIN,
  ...QIANJIN_CHAIN,
  ...JINDAN_CHAIN,
]

/** 门槛、石碑和神兽、独享5/6有原文；神兽面板重建为同境界任务可挑战的量级。 */
export const SANCTUARY_QUESTS: readonly Quest[] = [
  { id: 'sanctuary:blessing', category: 'realm', series: '祭炼石碑', name: '福地守护神兽', step: 1, total: 1,
    summary: '击败福地守护神兽，回到石碑前祭炼，占领此处并独享五行元气各5。',
    goal: { kind: 'slay', monster: { name: '福地守护神兽', attack: 1000, agility: 3600, life: 4000, element: null } },
    reward: {}, require: { realm: '辟谷期' }, repeatable: true,
    source: 'reference/text/guides/50102-p1.txt；reconstructed（神兽面板）' },
  { id: 'sanctuary:cave', category: 'realm', series: '祭炼石碑', name: '洞天守护神兽', step: 1, total: 1,
    summary: '击败洞天守护神兽，回到石碑前祭炼，占领此处并独享五行元气各6。',
    goal: { kind: 'slay', monster: { name: '洞天守护神兽', attack: 4000, agility: 3600, life: 8000, element: null } },
    reward: {}, require: { realm: '心动期' }, repeatable: true,
    source: 'reference/text/guides/50102-p1.txt；reconstructed（神兽面板）' },
]

// ===========================================================================
// 索引
// ===========================================================================

/**
 * 一条线下的全部任务定义：新手22 + 百妖100 + 境界16 + 神兽2 = 140。
 * 新手任务的同一步在两条线里 `step` 不同但 `id` 相同，所以索引必须分线建。
 */
export const questsFor = (line: NewbieLine): readonly Quest[] => [
  ...newbieChain(line),
  ...BEAST_QUESTS,
  ...REALM_QUESTS,
  ...SANCTUARY_QUESTS,
]

const BY_ID: Readonly<Record<NewbieLine, ReadonlyMap<string, Quest>>> = {
  qi: new Map(questsFor('qi').map((q) => [q.id, q])),
  sword: new Map(questsFor('sword').map((q) => [q.id, q])),
}

export const questById = (id: string, line: NewbieLine = 'qi'): Quest | undefined =>
  BY_ID[line].get(id)

/** 按顺序推进的四条链 + 新手链 + 百妖记（前一步做完才出下一步）。 */
export const chainsFor = (line: NewbieLine): readonly (readonly Quest[])[] => [
  newbieChain(line),
  BEAST_QUESTS,
  XIANTIAN_CHAIN,
  SANSHI_CHAIN,
  QIANJIN_CHAIN,
  JINDAN_CHAIN,
  ...SANCTUARY_QUESTS.map(q => [q]),
]
