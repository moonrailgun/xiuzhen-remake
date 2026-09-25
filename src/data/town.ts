/**
 * 城镇数据：NPC、商业等级表、镖局报价、书籍、银票。
 *
 * 证据分布很不均匀，每块都标了出处：
 *  - **商业等级 1–30 投入/产出表**：[原文-玩家整理] 全表逐级，最硬的一块；
 *  - **镖局老板对话**：[原文] 逐字，但只有「村/镇」两版；
 *  - **运镖佣金**：只有 1 个算例（Lv.1 村 → 105 格 = 3465 两）+ 1 个收益指数（Lv.29 镇 = 262），
 *    公式 [重建]（两点定一条幂律，见 `payoutIndex`）；
 *  - **书籍阅历表**：[原文] 游戏内指南截图，18 本全；
 *  - **银票面额**：[原文] 从 `trade.jsp?search=` 的 9 个搜索词还原；
 *  - **私塾/钱庄/村长/驿站/李员外的对话**：[未知]，整个项目零命中
 *    （`docs/spec/PAGE-INDEX.md`：「镖局以外全部 NPC 对话零证据」）。
 */

/** 有 NPC 的三种场景。福地/洞天没有 NPC，不在此列。 */
export type TownKind = '村庄' | '小镇' | '城池'

export const TOWN_KINDS: readonly TownKind[] = ['村庄', '小镇', '城池']

/**
 * 镇 = 村 ×1.5，城 = 村 ×2。[原文-玩家整理]
 * `reference/text/forum162/article-103871-p1.txt`：逐级核对成立（城市 30 级 5,800,000→3000）。
 */
export const TOWN_SCALE: Record<TownKind, number> = { 村庄: 1, 小镇: 1.5, 城池: 2 }

/** NPC 自称用的词。村/镇两版 [原文]，城 [推断]。 */
export const TOWN_SELF: Record<TownKind, string> = { 村庄: '本村', 小镇: '本镇', 城池: '本城' }

/**
 * 场景移动耗时与出现时间。[原文] 官方 FAQ
 * `reference/text/guides/50102-p1.txt` 第 6、7 条（`docs/research/03` §1.13 同表）。
 * 只收三种有 NPC 的场景；平原/森林/青山/江河/福地/洞天属地图数据，不在本文件。
 */
export const TOWN_SCENE: Record<TownKind, { readonly moveSeconds: number; readonly openWeek: number }> = {
  村庄: { moveSeconds: 20 * 60, openWeek: 1 },
  小镇: { moveSeconds: 30 * 60, openWeek: 2 },
  城池: { moveSeconds: 40 * 60, openWeek: 3 },
}

// —— 商业等级 ——

export const MAX_COMMERCE_LEVEL = 30

export type CommerceRow = {
  readonly level: number
  /** 升到该等级需要的**总投入**（两） */
  readonly invest: number
  /** 该等级的**总产出**（两/小时） */
  readonly income: number
}

/**
 * 村庄商业等级 1–30：总投入 → 总产出（两/小时）。[原文-玩家整理]
 * `reference/text/forum162/article-103871-p1.txt`（`docs/research/03` §1.13 逐条转录）。
 * 上限 30（`article-95309-p1.txt` L23–24「没有下一个商业等级的提示」）。
 */
export const VILLAGE_COMMERCE: readonly CommerceRow[] = [
  { level: 1, invest: 100, income: 100 },
  { level: 2, invest: 1000, income: 110 },
  { level: 3, invest: 1300, income: 120 },
  { level: 4, invest: 1800, income: 130 },
  { level: 5, invest: 2400, income: 150 },
  { level: 6, invest: 3100, income: 160 },
  { level: 7, invest: 4200, income: 180 },
  { level: 8, invest: 5500, income: 190 },
  { level: 9, invest: 7400, income: 210 },
  { level: 10, invest: 9800, income: 230 },
  { level: 11, invest: 13000, income: 260 },
  { level: 12, invest: 17000, income: 280 },
  { level: 13, invest: 23000, income: 310 },
  { level: 14, invest: 31000, income: 340 },
  { level: 15, invest: 41000, income: 370 },
  { level: 16, invest: 54000, income: 410 },
  { level: 17, invest: 72000, income: 450 },
  { level: 18, invest: 96000, income: 490 },
  { level: 19, invest: 130000, income: 540 },
  { level: 20, invest: 170000, income: 600 },
  { level: 21, invest: 230000, income: 660 },
  { level: 22, invest: 300000, income: 720 },
  { level: 23, invest: 400000, income: 790 },
  { level: 24, invest: 530000, income: 870 },
  { level: 25, invest: 700000, income: 960 },
  { level: 26, invest: 940000, income: 1100 },
  { level: 27, invest: 1200000, income: 1200 },
  { level: 28, invest: 1700000, income: 1300 },
  { level: 29, invest: 2200000, income: 1400 },
  { level: 30, invest: 2900000, income: 1500 },
]

/** 某种场景某一等级的投入/产出。等级 0 = 还没人投资。 */
export function commerceRow(kind: TownKind, level: number): CommerceRow {
  if (level <= 0) return { level: 0, invest: 0, income: 0 }
  const row = VILLAGE_COMMERCE[Math.min(level, MAX_COMMERCE_LEVEL) - 1]
  if (!row) return { level: 0, invest: 0, income: 0 }
  const k = TOWN_SCALE[kind]
  return { level: row.level, invest: Math.round(row.invest * k), income: Math.round(row.income * k) }
}

/** 总投入对应的商业等级（达到该级的总投入门槛才算升级）。 */
export function commerceLevelOf(kind: TownKind, totalInvested: number): number {
  let level = 0
  for (let l = 1; l <= MAX_COMMERCE_LEVEL; l++) {
    if (totalInvested >= commerceRow(kind, l).invest) level = l
    else break
  }
  return level
}

// —— 镖局 ——

/**
 * 运镖收益指数。
 *
 * 只有两个实测点：
 *  - Lv.1 村：`查看终点` 预估表 `Lv.1 | Lv.0 | 约105格 | 3465两` → 3465 ÷ 105 = **33 两/格**
 *    （`reference/text/forum162/article-102765-p1.txt` L43–55）[原文]
 *  - Lv.29 镇：老板对话「运镖的收益指数为**262**」
 *    （`reference/text/forum162/article-101916-p1.txt` L161–164）[原文]
 *
 * 任务描述原文只说「佣金与**起始地点的商业等级**、两地**直线距离**有关」——终点等级虽然
 * 在预估表里显示，但不参与计算。于是取 `佣金 = 收益指数 × 距离`，收益指数按该地
 * **总产出**的幂律重建：`指数 = 33 × (产出/100)^a`，`a` 由上面两点解出，两点都精确还原。
 * [重建] —— 2 个点定 2 个参数，曲线形状本身没有证据。
 */
export const PAYOUT_BASE_INDEX = 33
export const PAYOUT_BASE_INCOME = 100
/** a = ln(262/33) / ln(2100/100) ≈ 0.6804 */
export const PAYOUT_EXPONENT = Math.log(262 / 33) / Math.log(2100 / 100)

export function payoutIndex(kind: TownKind, level: number): number {
  const { income } = commerceRow(kind, level)
  if (income <= 0) return 0
  return Math.round(PAYOUT_BASE_INDEX * (income / PAYOUT_BASE_INCOME) ** PAYOUT_EXPONENT)
}

/** 运镖佣金（两）= 起点收益指数 × 直线距离（格，四舍五入）。 */
export const escortFee = (kind: TownKind, level: number, distance: number): number =>
  Math.round(payoutIndex(kind, level) * Math.round(distance))

/** 两地直线距离（格）。任务描述原文用的就是「直线距离」。 */
export const distanceOf = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(b.x - a.x, b.y - a.y)

/**
 * 镖局老板对话。[原文] 逐字，村/镇两版只差自称，城版 [推断]。
 * 出处：`reference/text/forum162/article-101916-p1.txt` L161–164（10 楼）。
 */
export function escortDialog(town: {
  readonly kind: TownKind
  readonly name: string
  readonly x: number
  readonly y: number
  readonly level: number
}): string {
  const self = TOWN_SELF[town.kind]
  const at = `${town.name}(${town.x},${town.y})`
  return [
    `${at}镖局老板：`,
    `　　欢迎来到${at}的镖局，俺是${self}的镖局老板，负责管理${self}的镖货往来。`,
    `　　${self}目前商业等级为Lv.${town.level}，运镖的收益指数为${payoutIndex(town.kind, town.level)}。`,
    `　　你同意的话，那就在下面的列表中选择好你愿意去的州县，俺再告诉你具体的方位。`,
    `　　[领取运镖任务]`,
  ].join('\n')
}

/**
 * 运镖耗时。[重建] —— 原版只字未提。
 * 按官方场景表里最快的地形（平原 00:10:00/格）折算，正好让「距离越远同等时间收益越大」
 * 这句玩家经验（`corpus/6358.txt`）成立：佣金随距离线性涨，路上顺带干别的事。
 */
export const ESCORT_SECONDS_PER_CELL = 10 * 60

/** 花 1 仙石取消跑镖。[原文] `reference/text/news/gonggao-xz-2009-12-25-2340.txt`「花费一仙石取消[跑镖]任务」 */
export const ESCORT_CANCEL_COIN = 1

// —— 书籍 ——

export type Book = {
  /** 原版物品 id（`itemmid.jsp?item=`），11 + 两位书序 */
  readonly id: number
  readonly name: string
  readonly experience: number
  /** 能在哪些场景读 */
  readonly scenes: readonly TownKind[]
}

const ALL3: readonly TownKind[] = ['村庄', '小镇', '城池']
const TOWN2: readonly TownKind[] = ['小镇', '城池']
const CITY1: readonly TownKind[] = ['城池']

/**
 * 书籍阅历表。[原文] 游戏内指南「书籍」页截图
 * `reference/images/17173-live/20100804111416399/z0804xz02.jpg`（`reference/images/INDEX.md` #112）；
 * 转录见 `docs/research/05-ui-items-market-pages.md`：30000/40000/50000 三行的「阅读场景」
 * 是一个 rowspan=3 的合并格「城池」。
 * id 来自 `docs/research/03` §1.16（1101–1111、1114、1118 [原文]，其余序号 [推断]）。
 */
export const BOOKS: readonly Book[] = [
  { id: 1101, name: '三国演义', experience: 10000, scenes: ALL3 },
  { id: 1102, name: '西游记', experience: 10000, scenes: ALL3 },
  { id: 1103, name: '水浒传', experience: 10000, scenes: ALL3 },
  { id: 1104, name: '红楼梦', experience: 10000, scenes: ALL3 },
  { id: 1105, name: '聊斋志异', experience: 20000, scenes: TOWN2 },
  { id: 1106, name: '搜神记', experience: 20000, scenes: TOWN2 },
  { id: 1107, name: '镜花缘', experience: 20000, scenes: TOWN2 },
  { id: 1108, name: '封神演义', experience: 20000, scenes: TOWN2 },
  { id: 1109, name: '警世通言', experience: 30000, scenes: CITY1 },
  { id: 1110, name: '醒世恒言', experience: 30000, scenes: CITY1 },
  { id: 1111, name: '喻世明言', experience: 30000, scenes: CITY1 },
  { id: 1112, name: '菜根谭', experience: 40000, scenes: CITY1 },
  { id: 1113, name: '围炉夜话', experience: 40000, scenes: CITY1 },
  { id: 1114, name: '小窗幽记', experience: 40000, scenes: CITY1 },
  { id: 1115, name: '世说新语', experience: 50000, scenes: CITY1 },
  { id: 1116, name: '三国志', experience: 50000, scenes: CITY1 },
  { id: 1117, name: '资治通鉴', experience: 50000, scenes: CITY1 },
  { id: 1118, name: '史记', experience: 50000, scenes: CITY1 },
]

export const findBook = (name: string): Book | undefined => BOOKS.find((b) => b.name === name)

/** 该场景能读的书（私塾先生只列出这些）。[原文] `forum162/article-97984-p1.txt` */
export const booksReadableIn = (kind: TownKind): readonly Book[] =>
  BOOKS.filter((b) => b.scenes.includes(kind))

/** 读一本书给私塾先生的银两。[原文-玩家口述] `reference/text/guides/51454-p1.txt`「约 1000 两/本」 */
export const READ_BOOK_SILVER = 1000

/**
 * 本地投资第一名（最大股东）的两项特权：
 *  - 免费读书 [重建] —— 原版无出处；
 *  - 改地名，**2 个字**（不含「村/镇/城」后缀）[推断] —— 地图上确有玩家起的专名
 *    「地球镇」「无名村」「冰城镇」（`docs/research/03` §1.13），且帖子里点名过最大股东。
 */
export const RENAME_LENGTH = 2

// —— 钱庄 ——

export type BankNote = { readonly name: string; readonly value: number }

/**
 * 银票 9 种面额。[原文] 从 `trade.jsp?tab=3…&search=` 的 9 个搜索词还原
 * （`docs/research/08-session-and-survey-delta.md` §3「恰 9 个」）。
 * 用途 [原文]（游戏指南词条 #110）：「银票的主要作用是用来交换仙石」。
 */
export const BANK_NOTES: readonly BankNote[] = [
  { name: '一万两银票', value: 10_000 },
  { name: '两万两银票', value: 20_000 },
  { name: '五万两银票', value: 50_000 },
  { name: '十万两银票', value: 100_000 },
  { name: '二十万两银票', value: 200_000 },
  { name: '五十万两银票', value: 500_000 },
  { name: '一百万两银票', value: 1_000_000 },
  { name: '二百万两银票', value: 2_000_000 },
  { name: '五百万两银票', value: 5_000_000 },
]

export const findNote = (name: string): BankNote | undefined =>
  BANK_NOTES.find((n) => n.name === name)

// —— 驿站 ——

/**
 * 驿站传送费（仙石）。[重建] —— 原版只说「花仙石」，没有价目
 * （`docs/research/02` §1.7：「九州城池有驿站传送（花仙石）」；对话原文 [未知]）。
 * 取 3，与同为「一次性便利功能」的五行互化（3 仙石，付费页 [原文]）对齐。
 */
export const STATION_COST_COIN = 3

/** 被攻击时不能用驿站。[原文] 2008-09-25 后的规则，`docs/research/02` §1.6 小狼帖。 */
export const STATION_BLOCKED_WHEN_ATTACKED = true

// —— 李员外 ——

/**
 * 心动任务「千金散尽」：交 100 万两给李员外。
 * [原文] `docs/spec/DECISIONS-rules.md` §A「裁决：**100 万两**（10 万为封测值）」。
 * 所在地 [未知]。
 */
export const LI_YUANWAI_SILVER = 1_000_000

// —— NPC 清单 ——

export type TownNpc = {
  readonly id: string
  /** 随场景变化的称呼（村长/镇长/太守） */
  readonly nameOf: (kind: TownKind) => string
  readonly scenes: readonly TownKind[]
  readonly purpose: string
  /** 对话原文的证据等级 */
  readonly evidence: '原文' | '未知'
}

const fixed = (name: string) => () => name

/** 城镇里能点到的 NPC。除镖局老板外全部**对话零证据**（`docs/spec/PAGE-INDEX.md`）。 */
export const TOWN_NPCS: readonly TownNpc[] = [
  { id: 'escort', nameOf: fixed('镖局老板'), scenes: ALL3, purpose: '领取运镖任务，赚银两', evidence: '原文' },
  { id: 'school', nameOf: fixed('私塾先生'), scenes: ALL3, purpose: '花银两读书，加阅历', evidence: '未知' },
  { id: 'bank', nameOf: fixed('钱庄掌柜'), scenes: ALL3, purpose: '银两⇄银票，银票拿去换仙石', evidence: '未知' },
  {
    id: 'chief',
    nameOf: (k) => (k === '村庄' ? '村长' : k === '小镇' ? '镇长' : '太守'),
    scenes: ALL3,
    purpose: '投资产业，按份额分利（产业排行榜）',
    evidence: '未知',
  },
  { id: 'station', nameOf: fixed('驿站'), scenes: CITY1, purpose: '九州城池间传送，耗仙石；被攻击时禁用', evidence: '未知' },
  { id: 'li', nameOf: fixed('李员外'), scenes: CITY1, purpose: '心动任务「千金散尽」，收 100 万两', evidence: '未知' },
]

export const npcsIn = (kind: TownKind): readonly TownNpc[] =>
  TOWN_NPCS.filter((n) => n.scenes.includes(kind))

/**
 * 其余五个 NPC 的开场白。【本地版补写】
 *
 * **镖局老板那段是原文**（`escortDialog`，出处见其注释）；这五个零存档。
 * 但他们各自办什么事是官方一句话表写明的（`TOWN_NPCS` 的 `purpose`），
 * 所以这里按镖局那段的体例补写：`{地名}{称呼}：` 起头，两三句自述 + 一句引导。
 *
 * 和逐级消耗表、世界地形一样，是「照已知规则重建 + 标注」，不是凭空编设定：
 * 每句话对应的都是这个复刻真在跑的规则。界面上会标明不是原文。
 */
export function townNpcDialog(
  id: string,
  town: { readonly kind: TownKind; readonly name: string; readonly x: number; readonly y: number },
): readonly string[] | null {
  const self = TOWN_SELF[town.kind]
  const at = `${town.name}(${town.x},${town.y})`
  const who = TOWN_NPCS.find((n) => n.id === id)?.nameOf(town.kind)
  if (!who || id === 'escort') return null

  const head = `${at}${who}：`
  switch (id) {
    case 'school':
      return [
        head,
        `　　老朽在${self}设帐授徒，与人讲书解惑。`,
        '　　书中自有古今兴废、人情冷暖，听得多了，道心自然磨得亮些。',
        '　　只是老朽见识有限，未必本本都讲得了——你且看看要听哪一本。',
      ]
    case 'bank':
      return [
        head,
        `　　小号在${self}开了多年，银钱往来最是稳妥。`,
        '　　你身上的银两带着沉，不如兑成银票，轻便，也好拿去换仙石应急。',
        '　　要兑多少，你说个数。',
      ]
    case 'chief':
      return [
        head,
        `　　${self}地方虽小，却也是一方生计所系。`,
        '　　道友若肯出些银两入股，商号兴旺起来，往来的镖货多了，大家都有好处。',
        '　　入了股，按份子每个时辰给你分利；只是一个人只能在一处入股，你要想清楚。',
      ]
    case 'station':
      return [
        head,
        '　　此处通着九州各处城池，踏上传送阵，转眼便到。',
        '　　只是开阵要耗仙石，且你若正被人追着打，阵法是不会为你开的。',
        '　　要去何处，报个方位。',
      ]
    case 'li':
      return [
        head,
        '　　老夫痴长几岁，别的没有，家财还算殷实。',
        '　　修真一途，最难的不是聚财，是舍得。你若能散尽千金而不动心，才算过了这一关。',
        '　　一百万两，你拿得出来，也放得下么？',
      ]
    default:
      return null
  }
}

/** 镖局老板的对话是原文，其余五个是补写的。界面据此标注。 */
export const DIALOG_VERBATIM_IDS: readonly string[] = ['escort']
