/**
 * 怀旧版设置面板。
 *
 * **这不是原版的页面**，是本地版加的（原版没有倍速，也不需要导出存档）。
 * 所以它不追求还原，只求和周围风格一致：用同一套 `tablebg` / `skillup` class。
 * 放在 L 窗里，从顶栏「关于」进入。
 *
 * 倍速的意义见 `docs/PLAN.md` §0 #4：原版升一级几十分钟到几百小时，
 * 怀旧 = 慢，但单机下不给倍速会劝退。默认仍是原速。
 */

import { esc, each } from './html.ts'

export type SettingsVm = {
  /** 当前倍速 */
  readonly rate: number
  /** 游戏内已过去的天数 */
  readonly dayOfServer: number
  /** 存档占用字节数 */
  readonly saveBytes: number
  /** 存档是否可用（隐私模式下可能不可用） */
  readonly storageOk: boolean
}

/** 可选倍速。1× 是原版节奏。 */
export const RATES: readonly { readonly value: number; readonly label: string; readonly note: string }[] = [
  { value: 1, label: '1×', note: '原速（原版节奏：升一级几十分钟到几百小时）' },
  { value: 10, label: '10×', note: '十倍速' },
  { value: 60, label: '60×', note: '一分钟顶一小时' },
  { value: 600, label: '600×', note: '一分钟顶十小时' },
]

export function renderSettings(vm: SettingsVm): string {
  const row = (label: string, value: string) =>
    `<TR class="trbg middle"><TD class=middlebold width=90>${esc(label)}</TD><TD>${value}</TD></TR>`

  return `<DIV class=middle style="padding:8px">
<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=440 border=0><TBODY>
<TR class="titlebg bigbold" align=middle><TD colSpan=2>怀旧版设置</TD></TR>
${row('游戏时间', `开服第 ${vm.dayOfServer} 天`)}
${row(
    '时间流速',
    each(RATES, (r) =>
      r.value === vm.rate
        ? `<B>${esc(r.label)}</B> `
        : `<A class=skillup href="#" onclick="setRate(${r.value})">${esc(r.label)}</A> `,
    ) + `<BR><SPAN class=smallgray>${esc(RATES.find((r) => r.value === vm.rate)?.note ?? '')}</SPAN>`,
  )}
${row(
    '存档',
    vm.storageOk
      ? `占用 ${Math.round(vm.saveBytes / 1024)} KB　` +
        `<A class=skillup href="#" onclick="exportSave()">导出</A>　` +
        `<A class=skillup href="#" onclick="importSavePrompt()">导入</A>　` +
        `<A class=skillup href="#" onclick="resetGame()">重新开始</A>`
      : `<SPAN class=smallred>浏览器禁用了本地存储，进度不会被保存。请用导出功能手动备份。</SPAN>`,
  )}
</TBODY></TABLE>

<DIV class=smallgray style="padding:8px 2px">
这是 2008 年网页游戏《修真》（广州昆冈开发、广州游艺运营，2011-02-21 停运）的本地复刻。<BR>
界面与规则以存档资料为准，无据可考处按推断重建；数值表大多是从散落的锚点重建的，不等同于原版。<BR>
仅供个人怀旧使用。
</DIV>
</DIV>`
}
