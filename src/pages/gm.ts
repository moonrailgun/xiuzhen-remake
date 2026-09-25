/**
 * GM 面板。
 *
 * **这不是原版的页面**，原版不可能有。和「怀旧版设置」一样，不追求还原，
 * 只借周围那套 `tablebg` / `titlebg` / `skillup` class，免得看起来像另一个软件。
 * 顶上那条红字是认真的：这一页能把存档改成任何样子，必须一眼看出它不是游戏的一部分。
 *
 * 分组顺序按「改的频率」排：身份与资源在最上面，经脉/本体/法术折在下面，
 * 法宝单独一块（因为它是列表，不是几个数字）。
 *
 * 所有 `NAME` 都以 `gm-` 开头，`client/app.ts` 的 `readGmForm()` 按这个前缀取值。
 */

import { esc, each, js, num, when } from './html.ts'

export type GmArtifactRow = {
  readonly id: string
  readonly kind: string
  readonly name: string
  readonly quality: string
  readonly refine: number
  readonly status: string
  readonly count: number
}

export type GmVm = {
  readonly name: string
  readonly gender: 'm' | 'f'
  readonly element: string
  readonly school: string
  readonly realm: string
  readonly x: number
  readonly y: number
  /** 已经取过整（`floorQi`），和顶栏资源条显示的是同一个数 */
  readonly qi: readonly number[]
  /** 当前丹田上限（改了丹田气海之后会变，这里显示的是应用前的值） */
  readonly qiCap: number
  readonly silver: number
  readonly coin: number
  readonly bonusCoin: number
  readonly daoxing: number
  /** 道行折算的年数，如「18 年」 */
  readonly daoxingText: string
  readonly experience: number
  readonly vip: boolean
  /** 12 条：名称 + 当前等级 + 上限 */
  readonly meridians: readonly { readonly name: string; readonly level: number; readonly cap: number }[]
  readonly body: readonly { readonly name: string; readonly level: number; readonly cap: number }[]
  /** 全部法术节点（含没学的），按树分组 */
  readonly skills: readonly { readonly tree: string; readonly name: string; readonly level: number; readonly cap: number }[]
  readonly artifacts: readonly GmArtifactRow[]
  /** 背包占用 / 格数 */
  readonly used: number
  readonly slots: number
  /** 可添加的法宝目录，按类别分组 */
  readonly catalog: readonly { readonly group: string; readonly names: readonly string[] }[]
  readonly qualities: readonly string[]
  readonly statuses: readonly string[]
  readonly elements: readonly string[]
  readonly schools: readonly string[]
  readonly realms: readonly string[]
  /** 待办事件条数（清空按钮旁边显示） */
  readonly events: number
  /** 上一次应用的结果：收拢说明或错误 */
  readonly notice?: { readonly ok: boolean; readonly lines: readonly string[] }
}

const WIDTH = 460

/** `Artifact.kind` 的中文名，和法宝页的分类一致。 */
const KIND_LABEL: Readonly<Record<string, string>> = {
  sword: '飞剑', guard: '护身', pill: '丹药', book: '书', misc: '杂物',
}

const textInput = (name: string, value: string | number, size = 10): string =>
  `<INPUT class=small type=text name="${esc(name)}" value="${esc(String(value))}" size=${num(size)}>`

/**
 * 数字格。`width` 要留够 —— 整张表是 4 列的固定版式，某一格的内容撑宽了，
 * 表就会整体变宽，右边的东西直接被挤出 L 窗（460px）。
 */
const numInput = (name: string, value: number, max?: number, width = 76): string =>
  `<INPUT class=small type=number name="${esc(name)}" value="${num(value)}" min=0${
    max === undefined ? '' : ` max=${num(max)}`} style="width:${num(width)}px">`

const select = (name: string, options: readonly string[], current: string, width?: number): string =>
  `<SELECT class=small name="${esc(name)}"${width === undefined ? '' : ` style="width:${num(width)}px"`}>${
    each(options, (o) => `<OPTION value="${esc(o)}"${o === current ? ' selected' : ''}>${esc(o)}</OPTION>`)
  }</SELECT>`

const sectionHead = (title: string, note = ''): string =>
  `<TR class="titlebg middlebold"><TD colSpan=4>${esc(title)}${
    note ? `　<SPAN class=smallgray>${esc(note)}</SPAN>` : ''}</TD></TR>`

const row = (label: string, body: string): string =>
  `<TR class="trbg middle"><TD class=middlebold width=76>${esc(label)}</TD><TD colSpan=3>${body}</TD></TR>`

/** 等级格子：一行四个，省得 12 条经脉占 12 行。 */
function levelGrid(prefix: string, items: readonly { name: string; level: number; cap: number }[]): string {
  const cells = items.map((it, i) =>
    `<TD width="25%" class=small noWrap>${esc(it.name)}<BR>${
      numInput(`${prefix}${i}`, it.level, it.cap, 62)}<SPAN class=smallgray>/${num(it.cap)}</SPAN></TD>`)
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += 4) {
    const chunk = cells.slice(i, i + 4)
    while (chunk.length < 4) chunk.push('<TD width="25%"></TD>')
    rows.push(`<TR class="trbg middle" align=middle>${chunk.join('')}</TR>`)
  }
  return rows.join('\n')
}

function skillRows(vm: GmVm): string {
  const trees = [...new Set(vm.skills.map((s) => s.tree))]
  return trees.map((tree) => {
    const items = vm.skills.filter((s) => s.tree === tree)
    const cells = items.map((s) =>
      `<TD width="25%" class=small noWrap>${esc(s.name)}<BR>` +
      `<INPUT class=small type=number name="gm-skill:${esc(s.name)}" value="${num(s.level)}" min=0 max=${num(s.cap)} style="width:62px">` +
      `<SPAN class=smallgray>/${num(s.cap)}</SPAN></TD>`)
    const out: string[] = [`<TR class="trbg2 middlebold"><TD colSpan=4>${esc(tree)}</TD></TR>`]
    for (let i = 0; i < cells.length; i += 4) {
      const chunk = cells.slice(i, i + 4)
      while (chunk.length < 4) chunk.push('<TD width="25%"></TD>')
      out.push(`<TR class="trbg middle" align=middle>${chunk.join('')}</TR>`)
    }
    return out.join('\n')
  }).join('\n')
}

/**
 * 法宝列表。
 *
 * 嵌在一个 `colSpan=4` 的格子里，而不是直接发 4 个 `<TD>` —— 一行要放
 * 名称 + 品质 + 淬炼 + 数量 + 状态 + 删除，列宽跟外层那张 4 列等宽的表对不上，
 * 直接发 TD 会把整张表撑过 460，右边的内容被挤出 L 窗（真气那行踩过同一个坑）。
 */
function artifactRows(vm: GmVm): string {
  if (vm.artifacts.length === 0) {
    return '<TR class="trbg middle" align=middle><TD colSpan=4><SPAN class=smallgray>背包是空的</SPAN></TD></TR>'
  }
  const rows = each(vm.artifacts, (a, i) =>
    `<TR class=small>
<TD width="34%">${esc(a.name)}<SPAN class=smallgray>（${esc(KIND_LABEL[a.kind] ?? a.kind)}）</SPAN>
<INPUT type=hidden name="gm-item-id:${num(i)}" value="${esc(a.id)}"></TD>
<TD width="17%" noWrap>${select(`gm-item-quality:${i}`, vm.qualities, a.quality, 60)}</TD>
<TD width="20%" noWrap>+<INPUT class=small type=number name="gm-item-refine:${num(i)}" value="${
      num(a.refine)}" min=0 max=20 style="width:38px">×<INPUT class=small type=number name="gm-item-count:${
      num(i)}" value="${num(a.count)}" min=1 style="width:38px"></TD>
<TD width="19%" noWrap>${select(`gm-item-status:${i}`, vm.statuses, a.status, 64)}</TD>
<TD width="10%" align=right noWrap><A class=skillup href="#" onclick="gmDropItem('${js(a.id)}')">删除</A></TD></TR>`)
  return `<TR class="trbg middle"><TD colSpan=4>
<TABLE cellSpacing=0 cellPadding=2 width="100%" border=0><TBODY>
<TR class=smallgray align=left><TD>名称</TD><TD>品质</TD><TD>淬炼 × 数量</TD><TD>状态</TD><TD></TD></TR>
${rows}
</TBODY></TABLE></TD></TR>`
}

export function renderGm(vm: GmVm): string {
  const notice = vm.notice
    ? `<DIV class="${vm.notice.ok ? 'smallgray' : 'smallred'}" style="padding:6px 2px">` +
      each(vm.notice.lines, (l) => `${esc(l)}<BR>`) + '</DIV>'
    : ''

  return `<DIV class=middle style="padding:8px">
<DIV class=smallred style="padding:0 2px 6px">
<B>GM 面板 · 本地版工具，不是原版的东西。</B><BR>
改动会直接覆盖当前存档且无法撤销，要留后路请先「导出备份」。超出上限的值会被收拢到上限，
因为超限的存档在游戏里是死数据：真气会被下一次产出抹平、21 级经脉收益为零、法宝超格之后炼器和购买全被拒。
</DIV>
${notice}
<FORM id=gmform onsubmit="return false">
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=${num(WIDTH)} border=0><TBODY>

${sectionHead('身份')}
${row('名字', `${textInput('gm-name', vm.name, 14)}　性别 ${
    select('gm-gender', ['男', '女'], vm.gender === 'f' ? '女' : '男')}`)}
${row('属性', `本命 ${select('gm-element', vm.elements, vm.element)}　道源 ${
    select('gm-school', vm.schools, vm.school)}`)}
${row('境界', `${select('gm-realm', vm.realms, vm.realm)}<BR>` +
    '<SPAN class=smallgray>境界决定经脉上限：心动期之前封顶 13 级，之后 20 级。</SPAN>')}
${row('坐标', `x ${numInput('gm-x', vm.x, 199)}　y ${numInput('gm-y', vm.y, 199)}` +
    '<SPAN class=smallgray>　0–199</SPAN>')}
${row('VIP', `<INPUT type=checkbox name="gm-vip"${vm.vip ? ' checked' : ''}>` +
    '<SPAN class=smallgray> 多一条修炼队列、多 5 个法宝格</SPAN>')}

${sectionHead('资源', `丹田上限 ${vm.qiCap}`)}
<TR class="trbg middle"><TD colSpan=4>
<TABLE cellSpacing=0 cellPadding=2 width="100%" border=0><TBODY><TR align=middle>${
    each(vm.elements, (e, i) => `<TD width="20%" class=small>${esc(e)}<BR>${
      numInput(`gm-qi${i}`, vm.qi[i] ?? 0, undefined, 62)}</TD>`)}</TR></TBODY></TABLE>
<DIV align=middle style="padding-top:2px">
<A class=skillup href="#" onclick="gmFillQi()">全部填到丹田上限</A>
<SPAN class=smallgray>　|　</SPAN>
<A class=skillup href="#" onclick="gmZeroQi()">全部清零</A></DIV></TD></TR>
${row('银两', `${numInput('gm-silver', vm.silver, undefined, 88)}　仙石 ${
    numInput('gm-coin', vm.coin, undefined, 62)}　附加 ${
    numInput('gm-bonusCoin', vm.bonusCoin, undefined, 62)}`)}
${row('道行', `${numInput('gm-daoxing', vm.daoxing)}<SPAN class=smallgray>　当前 ${esc(vm.daoxingText)}；` +
    '78840 点 = 18 年 = 脱离新手保护期</SPAN>')}
${row('阅历', numInput('gm-experience', vm.experience))}

${sectionHead('经脉', '12 条')}
${levelGrid('gm-meridian', vm.meridians)}

${sectionHead('本体', '8 项，丹田气海上限 36，其余 20')}
${levelGrid('gm-body', vm.body)}

${sectionHead('法术')}
${skillRows(vm)}

${sectionHead('法宝', `${vm.used} / ${vm.slots} 格`)}
${artifactRows(vm)}
<TR class="trbg middle"><TD colSpan=4 class=small>
添加：${select('gm-add-name', vm.catalog.flatMap((c) => c.names), '', 150)}
${select('gm-add-quality', vm.qualities, '极品', 60)}
+<INPUT class=small type=number name="gm-add-refine" value="0" min=0 max=20 style="width:38px">
　<A class=skillup href="#" onclick="gmAddItem()">加入背包</A></TD></TR>

${sectionHead('时间线')}
${row('待办事件', `${num(vm.events)} 条　<INPUT type=checkbox name="gm-clearEvents">` +
    '<SPAN class=smallgray> 勾上并应用 = 清空修炼/炼器/战斗/移动全部队列（不退还已付出的真气）</SPAN>')}

</TBODY></TABLE>

<DIV align=middle style="padding:8px">
<A class=skillup href="#" onclick="gmApply()"><B>应用修改</B></A>
<SPAN class=smallgray>　|　</SPAN>
<A class=skillup href="#" onclick="exportSave()">导出备份</A>
<SPAN class=smallgray>　|　</SPAN>
<A class=skillup href="#" onclick="openSettings()">返回设置</A>
</DIV>
</FORM>
${when(vm.catalog.length > 0, () =>
    `<DIV class=smallgray style="padding:0 2px">可加入的法宝共 ${
      num(vm.catalog.reduce((n, c) => n + c.names.length, 0))} 种：${
      each(vm.catalog, (c, i) => `${i ? '；' : ''}${esc(c.group)} ${num(c.names.length)}`)}。</DIV>`)}
</DIV>`
}
