/**
 * 就地更新 DOM：把新 HTML 和现有子树逐节点比对，只改有差异的属性和文本。
 *
 * 为什么不直接 `innerHTML = html`：整块重建会让每张 `<img>` 变成新元素，浏览器按缓存策略
 * 重新取图（dev 服务器发 `no-cache`，线上是 `must-revalidate`），肉眼就是"图片重新加载"；
 * 输入框焦点、光标和滚动位置也一并丢失。原版是整页跳转本来没这个问题，本地版所有刷新
 * 都落到这里，所以在这一处解决。
 *
 * 比对规则很朴素：同位置、同类型、同标签就复用，否则换成新节点。页面模块的 DOM 结构照原版
 * 逐字固定，这就够了；不做按 key 的列表 diff。
 */
export function morph(target: Element, source: string | Node, opts: { keepDrafts?: boolean } = {}): void {
  let from: Node = source as Node
  if (typeof source === 'string') {
    const tpl = document.createElement('template')
    tpl.innerHTML = source
    from = tpl.content
  }
  morphChildren(target, from, opts.keepDrafts === true)
}

function morphChildren(target: Node, source: Node, keepDrafts: boolean): void {
  let cur = target.firstChild
  // 先快照：下面会把 source 的子节点挪进 target
  for (const next of [...source.childNodes]) {
    if (cur && cur.nodeType === next.nodeType && cur.nodeName === next.nodeName) {
      morphNode(cur, next, keepDrafts)
      cur = cur.nextSibling
    } else if (cur) {
      const after = cur.nextSibling
      target.replaceChild(next, cur)
      cur = after
    } else {
      target.appendChild(next)
    }
  }
  while (cur) {
    const gone = cur
    cur = cur.nextSibling
    target.removeChild(gone)
  }
}

function morphNode(cur: Node, next: Node, keepDrafts: boolean): void {
  if (!(cur instanceof Element) || !(next instanceof Element)) {
    if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue
    return
  }
  for (const { name } of [...cur.attributes]) if (!next.hasAttribute(name)) cur.removeAttribute(name)
  for (const { name, value } of next.attributes) if (cur.getAttribute(name) !== value) cur.setAttribute(name, value)
  morphChildren(cur, next, keepDrafts)
  // value/checked/selected 属性只决定初始值，玩家改过之后就不再跟随；
  // 定时刷新（keepDrafts）要留住正在填的内容，其余渲染按新 HTML 复位。
  if (!keepDrafts) resetFormState(cur)
}

function resetFormState(el: Element): void {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = el.defaultChecked
    else el.value = el.defaultValue
  } else if (el instanceof HTMLTextAreaElement) el.value = el.defaultValue
  else if (el instanceof HTMLOptionElement) el.selected = el.defaultSelected
}
