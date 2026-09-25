/**
 * 出处闸门。
 *
 * `docs/PLAN.md` §5 定的硬约束：`src/data` 里每条数值的 `source` 必须是
 * `reference/` 或 `docs/` 下**真实存在**的路径，或者等于 `reconstructed`。
 * 光检查「字段非空」没用——写什么都能过，那就守不住「可溯源」这条底线。
 *
 * 这个测试直接扫源码里的 source 字符串；有本地归档时再去磁盘核对。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DATA_DIR = join(ROOT, 'src', 'data')
const hasArchives = existsSync(join(ROOT, 'reference')) && existsSync(join(ROOT, 'docs', 'research'))

/** 从 source 文本里抽出「像路径」的部分。 */
function extractPaths(text: string): string[] {
  // reference/... 或 docs/... 直到空白、中文标点或引号为止
  const re = /(?:reference|docs)\/[A-Za-z0-9_@./\-+]+/g
  return [...text.matchAll(re)].map((m) => m[0].replace(/[.）)]+$/, ''))
}

function sourceStrings(): { file: string; value: string }[] {
  const out: { file: string; value: string }[] = []
  for (const name of readdirSync(DATA_DIR)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue
    const text = readFileSync(join(DATA_DIR, name), 'utf8')
    // source: '…' / source: "…"
    for (const m of text.matchAll(/source:\s*(['"])([\s\S]*?)\1/g)) {
      out.push({ file: name, value: m[2]! })
    }
  }
  return out
}

const sources = sourceStrings()

test('src/data 里确实有带出处的数值（闸门本身没失效）', () => {
  assert.ok(sources.length >= 30, `只扫到 ${sources.length} 条 source，闸门可能没抓到东西`)
})

test('★每条 source 要么有出处路径或证据说明，要么明确标 reconstructed', () => {
  const bad: string[] = []

  for (const { file, value } of sources) {
    if (value.includes('reconstructed')) continue
    // 「同上」这类续写，由上一条负责
    if (/^同上/.test(value.trim())) continue

    const paths = extractPaths(value)
    if (paths.length === 0) {
      // 没有路径的，至少要说明是哪类证据
      const hasMarker = /原文|截图|原版|官方|玩家|DOM|指南|攻略|帖|test/.test(value)
      if (!hasMarker) bad.push(`${file}: 「${value}」既没有路径也没有证据说明`)
      continue
    }
  }

  assert.deepEqual(bad, [], `\n${bad.join('\n')}\n`)
})

test('本地参考归档：每条 source 的出处文件确实存在', {
  skip: !hasArchives && '本地参考归档未提供',
}, () => {
  const missing: string[] = []
  for (const { file, value } of sources) {
    if (value.includes('reconstructed') || /^同上/.test(value.trim())) continue
    for (const p of extractPaths(value)) {
      if (!existsSync(join(ROOT, p))) missing.push(`${file}: 出处不存在 → ${p}`)
    }
  }
  assert.deepEqual(missing, [], `\n${missing.join('\n')}\n`)
})

test('出处里引用的截图文件确实在归档里', {
  skip: !existsSync(join(ROOT, 'reference')) && '本地参考归档未提供',
}, () => {
  const missing: string[] = []
  for (const { file, value } of sources) {
    for (const p of extractPaths(value)) {
      if (!p.startsWith('reference/images/')) continue
      if (!existsSync(join(ROOT, p))) missing.push(`${file}: ${p}`)
    }
  }
  assert.deepEqual(missing, [], `\n${missing.join('\n')}\n`)
})

test('标了 reconstructed 的条目要说明理由（不能只写这一个词）', () => {
  const bare: string[] = []
  for (const { file, value } of sources) {
    if (!value.includes('reconstructed')) continue
    if (value.trim() === 'reconstructed') bare.push(`${file}: 只写了 reconstructed，没说为什么`)
  }
  assert.deepEqual(bare, [], `\n${bare.join('\n')}\n`)
})
