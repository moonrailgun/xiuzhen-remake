/**
 * HTML 拼装的小工具。
 *
 * 原版是服务端出 HTML + 客户端 innerHTML 换内容，我们照搬这套结构，
 * 所以页面就是模板字符串。唯一要小心的是转义：玩家名会出现在正文、
 * 也会出现在内联 `onclick` 的 JS 字符串里（如 `writemsg.jsp?receiver=名字`）。
 *
 * 防线有两道：
 *  1. 建号时就限制名字字符集（中文/字母/数字，见 `docs/spec/DECISIONS.md` §3.10）；
 *  2. 输出时一律转义。
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** 转义到 HTML 文本/属性里。 */
export const esc = (v: unknown): string =>
  String(v).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!)

/** 转义到内联 JS 的字符串字面量里（原版内联 onclick 大量用单引号）。 */
export const escJs = (v: unknown): string =>
  String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    // </script> 与 HTML 注释开头在内联脚本里会提前结束上下文
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')

/**
 * **内联 onclick 里的 JS 字符串字面量，必须用这个。**
 *
 * 浏览器对 `onclick="foo('…')"` 的处理顺序是：先把属性值做 **HTML 解码**，
 * 再把结果当 JS 解析。所以只做一层都会破：
 *
 *  - 只 `escJs()`：它把 `"` 变成 `\"`，可反斜杠救不了 HTML —— 属性在那个 `"` 处就结束了，
 *    后面的内容会被解析成新的属性（实测能塞进一个 `onmouseover=...` 直接执行）。
 *  - 只 `esc()`：它把 `'` 变成 `&#39;`，而 HTML 解码会把它**还原成 `'`** 再交给 JS，
 *    于是字符串被提前闭合（实测 `李'+(window.x=1)+'四` 会被求值）。
 *
 * 正确顺序是**先 JS 转义、再 HTML 转义**：HTML 解码之后恰好得到已经 JS 转义好的文本。
 *
 * 正文和普通属性用 `esc()`；URL 参数用 `encodeURIComponent()`。
 */
export const js = (v: unknown): string => esc(escJs(v))

/** 数字按原版习惯直接输出（原版不加千分位）。 */
export const num = (n: number): string => String(Math.floor(n))

/** 把若干片段拼起来，忽略 null/undefined/false。 */
export const join = (...parts: readonly (string | null | undefined | false)[]): string =>
  parts.filter((p): p is string => typeof p === 'string').join('')

/** 条件渲染。 */
export const when = (cond: unknown, then: () => string, otherwise?: () => string): string =>
  cond ? then() : otherwise ? otherwise() : ''

/** 列表渲染。 */
export const each = <T>(items: readonly T[], fn: (item: T, i: number) => string): string =>
  items.map(fn).join('')
