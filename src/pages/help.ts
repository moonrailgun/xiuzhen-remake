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
 * **其余 18 条正文零存档**（PAGE-INDEX 明列为缺口）。所以这里不编，
 * 而是照实说明「这一条的正文没有留下存档」——和术数那四种一样的处理。
 *
 * 底部「历史：」是**线性访问记录，不去重**（#111/#112 实见
 * `秘笈　游戏指南　书籍　游戏指南　秘笈`），照做。
 */

import { esc, escJs, each, when } from './html.ts'

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

export const HELP_ENTRIES: Readonly<Record<string, HelpEntry>> = {
  经脉: MERIDIAN_ENTRY,
  银票: NOTE_ENTRY,
  秘笈: BOOKLET_ENTRY,
  书籍: BOOK_ENTRY,
  游戏指南: INDEX_ENTRY,
}

/** 正文里把词条名替换成绿色粗体链接（#110 的「银两」就是这么做的）。 */
function linkify(text: string, links: readonly string[]): string {
  let out = esc(text)
  for (const name of links) {
    out = out.replaceAll(
      esc(name),
      `<A class=skillup href="#" onclick="hlp('${escJs(name)}')">${esc(name)}</A>`,
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
    `${i ? '　' : ''}<A class=skillup href="#" onclick="hlp('${escJs(t)}')">${esc(t)}</A>`)}</DIV>`
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

  const body = isIndex
    ? topicIndex()
    : entry?.paragraphs
      ? `<DIV class=small>${each(entry.paragraphs, (p) =>
          p === '' ? '<BR>' : `<DIV style="padding:2px 0">${linkify(p, entry.links ?? [])}</DIV>`)}</DIV>`
      : `<DIV class=smallgray style="padding:6px 0">这一条的正文没有留下存档。<BR>` +
        `原版《修真》的游戏指南共 22 条词条，现存资料里只有「经脉」「银票」「秘笈」「书籍」四条有全文。</DIV>`

  return `${crumb}
<TABLE class=titlebg2 cellSpacing=0 cellPadding=0 width="100%" border=0><TBODY><TR>
<TD class=bigbold align=middle>${esc(vm.topic)}</TD>
</TR></TBODY></TABLE>
<DIV class=helpbody>${body}
${when(entry?.table !== undefined, () => entryTable(entry!.table!))}</DIV>
<DIV class=small style="padding:4px">历史：${each(vm.history, (h, i) =>
    `${i ? '　' : ''}${h === vm.topic && i === vm.history.length - 1
      ? `<SPAN class=middlebold>${esc(h)}</SPAN>`
      : `<A class=skillup href="#" onclick="hlp('${escJs(h)}')">${esc(h)}</A>`}`)}</DIV>`
}
