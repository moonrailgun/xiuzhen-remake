/**
 * 游戏指南（H 窗，`hlp('词条')` 打开）。
 *
 * 证据等级 A（`docs/spec/PAGE-INDEX.md` §39）：
 *  - **结构**来自 1:1 截图 #111 / #112（`05 §12.1`，七层：关闭钮 / 面包屑 + 前进后退 /
 *    墨迹标题条 / 正文框 / 数据表 / 滚动条 / 底部「历史：」）；
 *  - **22 条词条名**是 DOM 原文（`09 §1.18` 末段）；
 *  - **只有 4 条有正文全文**（经脉 #109、银票 #110、秘笈 #111、书籍 #112），
 *    在 `05 §12.2` 里逐字转录并纠过错 —— 下面这 4 条是逐字照抄的。
 *
 * **其余 18 条正文零存档**（PAGE-INDEX 明列为缺口）。这 18 条由本地版按
 * **本复刻实际在跑的规则**补写（见 `LOCAL_ENTRIES`），并在页面上明确标注
 * 「不是原文」—— 与全项目对「有规则、没文案」的一贯做法一致，
 * 但绝不让补写的内容混进那四条逐字原文里。
 *
 * 底部「历史：」是**线性访问记录，不去重**（#111/#112 实见
 * `秘笈　游戏指南　书籍　游戏指南　秘笈`），照做。
 */

import { esc, escJs, each, when, js } from './html.ts'

/** 22 条词条全集，顺序照 DOM 原文（`09 §1.18`）。 */
export const HELP_TOPICS: readonly string[] = [
  '游戏指南', '属性', '境界', '阅历', '银两', '产业', '真气增长',
  '拥有法宝', '飞剑', '护身法宝', '丹药', '书籍', '任务物品', '秘笈',
  '战斗事件', '炼器事件', '移动事件', '修炼事件',
  '场景中的NPC', '场景中的玩家', '筑基期', '辟谷期',
]

export type HelpTable = {
  /** 表头单元格；`span` 用于「书籍」那种跨 4 列的表头 */
  readonly head: readonly { readonly text: string; readonly span?: number }[]
  readonly rows: readonly (readonly string[])[]
}

export type HelpEntry = {
  /** 正文，每段一行；`null` 表示这一条正文没有存档 */
  readonly paragraphs: readonly string[] | null
  /** 正文里要做成绿色粗体链接的词条名（#110 的「银两」） */
  readonly links?: readonly string[]
  readonly table?: HelpTable
}

export type HelpVm = {
  readonly topic: string
  /** 线性访问记录，不去重；最后一项是当前词条 */
  readonly history: readonly string[]
}

// —— 四条有全文的词条（逐字，出处 05 §12.2）——

const MERIDIAN_ENTRY: HelpEntry = {
  paragraphs: [
    '在《修真》的世界中，修真者又叫作炼气士。他们从天地中汲取天地元气，通过自身经脉炼化为真气，然后汇聚于丹田，以用于打通经脉、修炼法术、炼制法宝等等。而炼化真气的速率，则主要取决于修真者自身经脉等级的高低。',
    '',
    '人物的经脉按“手、足”和“阴、阳”，可以分为四类，每一类又各有三条，合称为“十二正经”。',
    '人物的属性不同，他们四类经脉能炼化的真气属性也不同。不过炼化真气的属性分别与经脉图中的“小圆圈”和经脉连线的颜色相对应，非常容易辨别。',
    '五行之中，有一种属性的真气无法通过自身炼化天地元气得到，此谓之“五行缺一”，乃是天数。',
    '',
    '一般修真者们可以通过炼丹、交易真气等方式来补完这所缺的“一”。',
  ],
  table: {
    head: [{ text: '颜色' }, { text: '黄色' }, { text: '绿色' }, { text: '蓝色' }, { text: '红色' }, { text: '褐色' }],
    rows: [['属性', '[金]', '[木]', '[水]', '[火]', '[土]']],
  },
}

const NOTE_ENTRY: HelpEntry = {
  paragraphs: [
    '俗世使用的银票，可以通过在村庄/小镇/城池与钱庄掌柜对话，由身上的银两兑换获得。',
    '',
    '银票的主要作用是用来交换仙石，以解决某些需要银两的修真者们的燃眉之急。',
  ],
  links: ['银两'],
}

const BOOKLET_ENTRY: HelpEntry = {
  paragraphs: [
    '秘笈是记载着修真法门的特殊道具，玩家可以通过阅读秘笈来学会新的法术。',
    '你可以在“法术->秘笈”页面中查阅到从秘笈获得的法术。',
  ],
  table: {
    head: [{ text: '秘笈' }, { text: '用途' }],
    rows: [
      ['【御剑飞行】', '可以使用飞剑进行移动。'],
      ['【物理通明】', '有机会在炼器时获得极品法宝。'],
      ['【六壬神定】', '可以推算目标的护法列表。'],
      ['【紫微斗数】', '可以推算目标的经脉等级。'],
      ['【诰命真经】', '可以推算向目标地点移动的玩家列表。'],
      ['【三皇内文】上', '减少向森林中移动所需时间40秒。'],
      ['【三皇内文】中', '减少向森林中移动所需时间40秒。'],
      ['【三皇内文】下', '减少向森林中移动所需时间40秒。'],
      ['【五岳山形图】', '减少向青山中移动所需时间60秒。'],
      ['【五岳真形图】', '减少向青山中移动所需时间60秒。'],
      ['【五岳神形图】', '减少向青山中移动所需时间60秒。'],
    ],
  },
}

const BOOK_ENTRY: HelpEntry = {
  paragraphs: [
    '书籍记载着古往今来许多事情，阅读书籍，可以博古通今，提升自己的阅历。阅历越高的人，越容易从凡间种种事情从领悟大道，磨练自己的道心，进入不同的修真境界。',
    '',
    '阅读书籍，从中获益，需要有人讲解，一般在私塾中有先生收取束修（银两）为你解读书中的道理。',
    '而不同地方的私塾先生，见识也不尽相同，所以未必能为你解读有的书。',
  ],
  links: ['银两'],
  table: {
    head: [{ text: '书籍', span: 4 }, { text: '增加阅历' }, { text: '阅读场景' }],
    rows: [
      ['三国演义', '西游记', '水浒传', '红楼梦', '10000', '村庄、小镇、城池'],
      ['聊斋志异', '搜神记', '镜花缘', '封神演义', '20000', '小镇、城池'],
      ['警世通言', '醒世恒言', '喻世明言', '', '30000', '城池'],
      ['菜根谭', '围炉夜话', '小窗幽记', '', '40000', '城池'],
      ['世说新语', '三国志', '资治通鉴', '史记', '50000', '城池'],
    ],
  },
}

/** 首页词条：22 条的目录。原版首页正文没有存档，所以只做目录。 */
const INDEX_ENTRY: HelpEntry = { paragraphs: null }

/**
 * 其余 18 条【本地版补写】。
 *
 * 原版正文零存档，但**这些词条讲的规则本身是有据可查的** —— 全都写在
 * `docs/spec/DECISIONS-rules.md` 与各 `src/engine/*.ts` 的注释里，
 * 而且正是这个复刻实际在跑的规则。所以这里按已有四条的体例补写：
 * 讲清楚规则，不假装是原版文案（页面会标明是本地版补写）。
 *
 * 这与全项目对「有规则、没文案」的一贯做法一致（逐级消耗表、世界地形、
 * 出击页都是照规则重建 + 标注），不该对指南另立一套「宁缺毋滥」的标准。
 */
const LOCAL_ENTRIES: Readonly<Record<string, HelpEntry>> = {
  属性: {
    paragraphs: [
      '修真者的本命属性分金、木、水、火、土五种，建号时定下，此后不再更改。',
      '本命属性决定四类经脉各炼化哪一种真气，也决定升级与炼器时五行消耗的多寡：',
      '本命消耗最多，其次是我克、生我、我生，克我的那一种最少甚至为零。',
      '',
      '五行相生：金生水、水生木、木生火、火生土、土生金。',
      '五行相克：金克木、木克土、土克水、水克火、火克金。',
      '飞剑交锋时，相克的一方伤害提高五成，相生则另有加成。',
    ],
    links: ['经脉', '真气增长'],
  },
  境界: {
    paragraphs: [
      '境界共五重：筑基期、辟谷期、心动期、金丹期、元婴期。',
      '境界由阅历与境界任务推进，越高的境界能修炼的上限越高。',
      '心动期之前经脉最高只能升到 13 级，此后才能继续往上。',
    ],
    links: ['阅历', '经脉'],
    table: {
      head: [{ text: '境界' }, { text: '说明' }],
      rows: [
        ['筑基期', '入道之始，人人皆从此起步'],
        ['辟谷期', '不再需要五谷，丹田大开'],
        ['心动期', '经脉可越过十三之限'],
        ['金丹期', '结成金丹，法力大进'],
        ['元婴期', '元婴出窍，丹田可至三十六级'],
      ],
    },
  },
  阅历: {
    paragraphs: [
      '阅历是进入更高境界的凭据。走路和读书可以增长阅历。',
      '书籍需要私塾先生讲解，先生收取束修（银两），不同地方的先生见识不同，未必能讲得了所有书。',
    ],
    links: ['书籍', '银两', '境界'],
  },
  银两: {
    paragraphs: [
      '银两是俗世的通货，主要来自押镖与产业分利。',
      '银两可以用来请私塾先生讲书，也可以在钱庄兑成银票。',
    ],
    links: ['银票', '产业', '书籍'],
  },
  产业: {
    paragraphs: [
      '在村庄、小镇、城池里向村长（镇长、太守）投资银两，即可在当地置办产业。',
      '投资会提升当地的商业等级，商业等级越高，押镖的收益指数也越高。',
      '产业按你占的份额分利，每小时入账；同一时间只能在一处置办产业。',
    ],
    links: ['银两'],
  },
  真气增长: {
    paragraphs: [
      '真气增长 = 所在地块的天地元气 × 该属性三条经脉的倍率之和 − 身上法宝的耗气。',
      '所以想长得快，一要找元气高的地块，二要把经脉升上去。',
      '',
      '五行之中有一种真气无法自行炼化（五行缺一），只能靠炼丹或交易补足。',
      '真气存放在丹田里，丹田的容量由「丹田气海」决定，满了就不再增长。',
    ],
    links: ['经脉', '拥有法宝'],
  },
  拥有法宝: {
    paragraphs: [
      '法宝分飞剑、护身法宝、丹药、书籍、任务物品五类。',
      '能随身携带的法宝数量由「袖里乾坤」决定，基础为五件。',
      '法宝有废品、凡品、上品、极品四种品质，极品的数值是废品的十倍。',
      '两件完全相同的法宝可以淬炼成一件，淬炼一次数值翻倍，但失败时两件俱毁。',
    ],
    links: ['飞剑', '护身法宝', '丹药', '书籍', '任务物品'],
  },
  飞剑: {
    paragraphs: [
      '飞剑是攻伐之器，炼成后可以放出去攻击他人，也可以留在身边御敌。',
      '同时在外的飞剑默认最多五把，「万剑诀」每升一级可多放一把。',
      '',
      '飞剑的速度决定飞行快慢，敏捷决定缠斗时长，吸收决定能带回多少真气，',
      '击退决定把对方打飞多远。速度与击退不随品质和淬炼变化。',
      '交锋时受到的伤害若达到耐久，飞剑就会被斩断。',
    ],
    links: ['拥有法宝', '护身法宝'],
  },
  护身法宝: {
    paragraphs: [
      '护身法宝只能御敌，不能放出去攻击。炼制它需要「灵宝真经」。',
      '有人来袭时，护身法宝先于飞剑迎战，能撑住的时长由它的敏捷决定——',
      '护身的敏捷与攻击、耐久同一量级，所以能把缠斗拖上很久，好让护法赶来支援。',
      '护身法宝可以和飞剑同时炼制，互不占用炉子。',
    ],
    links: ['飞剑', '拥有法宝'],
  },
  丹药: {
    paragraphs: [
      '丹药由「炼丹之术」炼成，服下可以补充真气——尤其是自己炼化不出的那一种。',
      '丹药分紫金丹、碧罗丹、冰雪丹、烈炎丹、微尘丹、五行丹六种，各有一炼至九炼九个档次，',
      '炼丹之术每升一级，能炼的档次就高一档。',
      '炼丹一次只能一炉，且耗时不受「手熟无他」影响。',
    ],
    links: ['拥有法宝', '真气增长'],
  },
  任务物品: {
    paragraphs: [
      '任务物品是任务过程中获得的凭据，多数会在任务完成时自动消耗。',
      '它们不占用法宝格，也不能淬炼。',
    ],
    links: ['拥有法宝'],
  },
  战斗事件: {
    paragraphs: [
      '战斗事件栏显示你放出去的飞剑与打过来的飞剑，点开可以看战斗事件总览。',
      '',
      '出击后飞剑先飞向目标，到达后进入缠斗，缠斗时长由双方敏捷之和决定，',
      '分出胜负后飞剑带着吸到的真气飞回来——真气要等剑回到身边才入丹田。',
      '缠斗中可以向道友求援，也可以支援别人的战斗。',
    ],
    links: ['飞剑', '护身法宝'],
  },
  炼器事件: {
    paragraphs: [
      '炼器事件栏显示正在炼制的飞剑、护身法宝与丹药。',
      '炼器不占用修炼队列，飞剑与护身可以同时开炉，丹药另算一炉。',
      '除炼丹外，炼制耗时受「手熟无他」影响，满级时可缩短到五分之一。',
    ],
    links: ['飞剑', '护身法宝', '丹药'],
  },
  移动事件: {
    paragraphs: [
      '移动事件栏显示当前正走到哪一格、下一个目标是哪里。',
      '耗时按「目标地形」计算，平原最快、青山与江河最慢，「行万里路」可以缩短。',
      '移动途中可以随时取消，取消后停在当前这一格。',
    ],
    links: ['场景中的玩家'],
  },
  修炼事件: {
    paragraphs: [
      '修炼事件栏显示正在升级的经脉、本体与法术。',
      '普通用户同时只能进行一项修炼，购买 VIP 可以再加一项，最多两项。炼器不计入。',
      '修炼中可以花仙石加速：「半」减半剩余时间，「完」立刻完成。',
    ],
    links: ['经脉'],
  },
  场景中的NPC: {
    paragraphs: [
      '走进村庄、小镇或城池，场景里会出现可以对话的人。',
      '镖局老板发放运镖任务，私塾先生讲书，钱庄掌柜兑换银票，',
      '村长（镇长、太守）受理产业投资；城池另有驿站可以传送，以及收取千金的李员外。',
    ],
    links: ['产业', '银两', '银票'],
  },
  场景中的玩家: {
    paragraphs: [
      '同一格上的其他修真者会列在这里，可以攻击、推算、发消息或邀为护法。',
      '能看见多远由「穷千里目」决定。看不见的人，得先用九宫飞星法推算出位置才能打。',
    ],
    links: ['飞剑', '移动事件'],
  },
  筑基期: {
    paragraphs: [
      '筑基期是修真的起点，人人由此入道。',
      '此期经脉最高可升至十三级，丹田容量有限，主要任务是打通经脉、攒下第一批真气。',
      '完成境界任务后可进辟谷期，奖励会把丹田充满。',
    ],
    links: ['境界', '经脉'],
  },
  辟谷期: {
    paragraphs: [
      '辟谷期不再需要五谷，丹田大开，真气容量远胜筑基期。',
      '此期仍受十三级经脉之限，要到心动期才能突破。',
    ],
    links: ['境界', '经脉'],
  },
}

export const HELP_ENTRIES: Readonly<Record<string, HelpEntry>> = {
  经脉: MERIDIAN_ENTRY,
  银票: NOTE_ENTRY,
  秘笈: BOOKLET_ENTRY,
  书籍: BOOK_ENTRY,
  游戏指南: INDEX_ENTRY,
  ...LOCAL_ENTRIES,
}

/** 哪四条是原版逐字的。其余是本地版补写，页面上要标出来。 */
export const VERBATIM_TOPICS: readonly string[] = ['经脉', '银票', '秘笈', '书籍']

/** 正文里把词条名替换成绿色粗体链接（#110 的「银两」就是这么做的）。 */
function linkify(text: string, links: readonly string[]): string {
  let out = esc(text)
  for (const name of links) {
    out = out.replaceAll(
      esc(name),
      `<A class=skillup href="#" onclick="hlp('${js(name)}')">${esc(name)}</A>`,
    )
  }
  return out
}

function entryTable(t: HelpTable): string {
  return `<TABLE class="tablebg middle" cellSpacing=1 cellPadding=3 width="100%" border=0><TBODY>
<TR class="titlebg middlebold" align=middle>${each(t.head, (h) =>
    `<TD${h.span ? ` colSpan=${h.span}` : ''}>${esc(h.text)}</TD>`)}</TR>
${each(t.rows, (r) =>
    `<TR class="trbg small" align=middle>${each(r, (c) => `<TD>${esc(c)}</TD>`)}</TR>`)}
</TBODY></TABLE>`
}

/** 22 条目录，做成词条链接（原版首页的正文没有存档，目录是本地版补的）。 */
function topicIndex(): string {
  return `<DIV class=small style="padding:4px 0">${each(HELP_TOPICS.filter((t) => t !== '游戏指南'), (t, i) =>
    `${i ? '　' : ''}<A class=skillup href="#" onclick="hlp('${js(t)}')">${esc(t)}</A>`)}</DIV>`
}

/** 渲染游戏指南（H 窗内容；H 窗没有标题条，标题在面包屑里）。 */
export function renderHelp(vm: HelpVm): string {
  const entry = HELP_ENTRIES[vm.topic]
  const isIndex = vm.topic === '游戏指南'

  // 面包屑：`游戏指南 > {词条}`，右侧后退/前进的黑色实心双三角
  const crumb = `<TABLE cellSpacing=0 cellPadding=3 width="100%" border=0><TBODY><TR>
<TD><A class=skillup href="#" onclick="hlp('游戏指南')">游戏指南</A>${
    isIndex ? '' : ` &gt; <SPAN class=title3>${esc(vm.topic)}</SPAN>`}</TD>
<TD align=right class=middlebold><A style="COLOR:black" href="#" onclick="helpBack()">◀◀</A> <A style="COLOR:black" href="#" onclick="helpForward()">▶▶</A></TD>
</TR></TBODY></TABLE>`

  // 原版逐字的四条 vs 本地版补写的，必须让人一眼看出区别 ——
  // 补写的内容讲的是本复刻实际在跑的规则，但它不是当年的原文。
  const localNote = !isIndex && entry?.paragraphs && !VERBATIM_TOPICS.includes(vm.topic)
    ? `<DIV class=smallgray style="padding:4px 0;border-top:1px solid #ccc;margin-top:6px">` +
      `※ 本条正文没有留下存档，是本地版按游戏规则补写的（原版仅存「经脉」「银票」「秘笈」「书籍」四条全文）。</DIV>`
    : ''

  const body = isIndex
    ? topicIndex()
    : entry?.paragraphs
      ? `<DIV class=small>${each(entry.paragraphs, (p) =>
          p === '' ? '<BR>' : `<DIV style="padding:2px 0">${linkify(p, entry.links ?? [])}</DIV>`)}</DIV>`
      : `<DIV class=smallgray style="padding:6px 0">这一条的正文没有留下存档。</DIV>`

  return `${crumb}
<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width="100%" border=0><TBODY><TR>
<TD class=bigbold align=middle>${esc(vm.topic)}</TD>
</TR></TBODY></TABLE>
<DIV class=helpbody>${body}
${when(entry?.table !== undefined, () => entryTable(entry!.table!))}${localNote}</DIV>
<DIV class=small style="padding:4px">历史：${each(vm.history, (h, i) =>
    `${i ? '　' : ''}${h === vm.topic && i === vm.history.length - 1
      ? `<SPAN class=middlebold>${esc(h)}</SPAN>`
      : `<A class=skillup href="#" onclick="hlp('${js(h)}')">${esc(h)}</A>`}`)}</DIV>`
}
