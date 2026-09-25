/**
 * 建号页（createplayer.jsp）。
 *
 * 这是全项目**证据最硬**的一页：原版 HTML 完整留存
 * （`reference/raw/game-server/s1-createplayer.jsp-*.html`，共 43 份，
 * 2008-11 → 2010-09 除 `<title>` 外逐字节相同）。所以这里是照抄结构，
 * 只把提交动作换成本地逻辑。
 *
 * 表单取值也照原版（`docs/research/07-original-html-dom.md` §2）：
 *   attr   0金 1木 2土 3水 4火，5=随机   ← 注意 2 是土、3 是水，不是常见的顺序
 *   posi   1雍 2凉 3并 4益 5冀 6幽 7荆 8扬 9徐，0=随机
 *   school 1蜀山 2昆仑 3通天，0=随机
 *   gender 1男 2女
 * 原版 `mapData` 的字段顺序是 gold,wood,earth,water,fire，与 attr 的编号一致，
 * 说明「金木土水火」是引擎内部的五行顺序（界面上另按「金木水火土」显示）。
 */

import { esc } from './html.ts'

/** 五行选项，value 照原版。 */
export const ATTR_OPTIONS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 5, label: '随机' },
  { value: 0, label: '金' },
  { value: 1, label: '木' },
  { value: 3, label: '水' },
  { value: 4, label: '火' },
  { value: 2, label: '土' },
]

export const SCHOOL_OPTIONS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 0, label: '随机' },
  { value: 1, label: '蜀山' },
  { value: 2, label: '昆仑' },
  { value: 3, label: '通天' },
]

/** 九州出生方位，value 与排布照原版（3 行 × 3 列，左侧「随机」跨 3 行）。 */
export const POSITION_ROWS: readonly (readonly { readonly value: number; readonly label: string }[])[] = [
  [
    { value: 2, label: '西北凉州' },
    { value: 3, label: '北方并州' },
    { value: 6, label: '东北幽州' },
  ],
  [
    { value: 1, label: '西方雍州' },
    { value: 5, label: '中央冀州' },
    { value: 9, label: '东方徐州' },
  ],
  [
    { value: 4, label: '西南益州' },
    { value: 7, label: '南方荆州' },
    { value: 8, label: '东南扬州' },
  ],
]

/** 姓名限制，原版说明文字里写死的。 */
export const NAME_MAX_HANZI = 7
export const NAME_MAX_LETTERS = 14

const sectionTitle = (text: string) =>
  `<TABLE width="460" border="0" cellspacing="0" cellpadding="0" class="titlebg2 bigbold">
<TR align="center"><TD>${esc(text)}</TD></TR>
</TABLE>`

const option = (o: { value: number; label: string }, selected: number) =>
  `<OPTION${o.value === selected ? ' selected="selected"' : ''} value="${o.value}">${esc(o.label)}</OPTION>`

export type CreatePlayerVm = {
  readonly gender: 1 | 2
  readonly attr: number
  readonly school: number
  readonly posi: number
  /** 校验失败时的红字提示（原版文案未存档，这里是重建） */
  readonly error?: string
}

export function renderCreatePlayer(vm: CreatePlayerVm): string {
  const radio = (name: string, value: number, label: string, checked: boolean, onclick?: string) =>
    `<INPUT type="radio" name="${name}" value="${value}"${checked ? ' checked="checked"' : ''}` +
    `${onclick ? ` onclick="${onclick}"` : ''} />${esc(label)}`

  return `<FORM id="createplayerform">
<TABLE width="1000" border="0" cellspacing="0" cellpadding="0"><TBODY>
<TR><TD height="100" background="img/top/back2.jpg">&nbsp;</TD></TR>
<TR><TD align="center" valign="top">

<TABLE width="100%" height="50" border="0" cellpadding="0" cellspacing="0"><TBODY>
<TR align="left"><TD><IMG src="img/title/titlecreatechr.gif"/></TD></TR>
</TBODY></TABLE>

${sectionTitle('人物资料')}
<TABLE width="460" border="0" cellspacing="1" cellpadding="3" class="tablebg middle"><TBODY>
<TR class="trbg">
<TD width="120" align="center"><INPUT id="playername" name="textfield" type="text" size="14" class="middle"/></TD>
<TD class="middlegray">为你在游戏里的人物起一个名字，可以使用中英文字符和数字，最多${NAME_MAX_HANZI}个汉字(${NAME_MAX_LETTERS}个英文字母)长度。</TD>
</TR>
<TR class="trbg">
<TD align="center">${radio('gender', 1, '男', vm.gender === 1, 'updateAvatar()')}　${radio('gender', 2, '女', vm.gender === 2, 'updateAvatar()')}</TD>
<TD class="middlegray">请选择你在游戏中的人物性别。</TD>
</TR>
</TBODY></TABLE>

${sectionTitle('五行属性')}
<TABLE width="460" border="0" cellspacing="1" cellpadding="3" class="tablebg middle"><TBODY>
<TR class="trbg">
<TD width="120" align="center">
<SELECT name="attr">${ATTR_OPTIONS.map((o) => option(o, vm.attr)).join('')}</SELECT></TD>
<TD class="middlegray">五行属性将会影响你在游戏中修行的场所。</TD>
</TR>
</TBODY></TABLE>

${sectionTitle('道源宗法')}
<TABLE width="460" border="0" cellspacing="1" cellpadding="3" class="tablebg middle"><TBODY>
<TR class="trbg">
<TD width="150" align="center" valign="middle"><IMG id="avatar" src="img/avatar/random.gif"></TD>
<TD width="120" align="center"><SELECT name="school" onchange="updateAvatar()">${SCHOOL_OPTIONS.map((o) => option(o, vm.school)).join('')}</SELECT></TD>
<TD class="middlegray">蜀山以剑仙著称，拥有最为刚猛的攻击；昆仑以炼器著称，在炼制法宝上有所专长；而通天则信奉弱肉强食的自由思想，最具掠夺性。</TD>
</TR>
</TBODY></TABLE>

${sectionTitle('出生方位')}
<TABLE width="460" border="0" cellspacing="1" cellpadding="3" class="tablebg middle"><TBODY>
${POSITION_ROWS.map((row, i) =>
    `<TR class="trbg" align="center">` +
    (i === 0
      ? `<TD width="25%" rowspan="3">${radio('posi', 0, '随机', vm.posi === 0)}</TD>`
      : '') +
    row.map((p) => `<TD width="25%">${radio('posi', p.value, p.label, vm.posi === p.value)}</TD>`).join('') +
    `</TR>`,
  ).join('\n')}
</TBODY></TABLE>
${vm.error ? `<BR><SPAN class="smallred">${esc(vm.error)}</SPAN>` : ''}
<BR />
<A href="#" onclick="sendCreatePlayer()"><IMG src="img/btn/btnok.gif" border="0"/></A></TD></TR>
</TBODY></TABLE>
</FORM>`
}

/**
 * 姓名校验。原版说明是「可以使用中英文字符和数字，最多 7 个汉字(14 个英文字母)长度」。
 * 半角按 1、全角按 2 计，上限 14 —— 这样「7 个汉字」与「14 个字母」正好是同一个上限。
 * 限制字符集还有一层好处：玩家名会出现在内联 onclick 的 JS 字符串里，
 * 从源头挡掉注入（`docs/spec/DECISIONS.md` §3.10）。
 */
export function validateName(name: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: '请输入人物姓名。' }
  if (!/^[一-龥A-Za-z0-9]+$/.test(trimmed)) {
    return { ok: false, reason: '姓名只能使用中英文字符和数字。' }
  }
  let width = 0
  for (const ch of trimmed) width += /[一-龥]/.test(ch) ? 2 : 1
  if (width > NAME_MAX_LETTERS) {
    return { ok: false, reason: `姓名最多${NAME_MAX_HANZI}个汉字(${NAME_MAX_LETTERS}个英文字母)长度。` }
  }
  return { ok: true }
}

/** 头像文件名：随机时用 `random.gif`，否则 `{门派}{性别}.gif`。 */
export function avatarFor(school: number, gender: number): string {
  const s = { 1: 'shushan', 2: 'kunlun', 3: 'tongtian' }[school]
  if (!s) return 'random.gif'
  return `${s}${gender === 2 ? 'f' : 'm'}.gif`
}
