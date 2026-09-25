import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  save,
  load,
  clear,
  serialize,
  importSave,
  exportSave,
  migrateToCurrent,
  SaveError,
  SAVE_VERSION,
  SAVE_KEYS,
  type Storage,
  type Migration,
} from './save.ts'

function memStorage(opts: { failOnWrite?: boolean } = {}): Storage & { dump(): Map<string, string> } {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      if (opts.failOnWrite) {
        const e = new Error('QuotaExceededError')
        e.name = 'QuotaExceededError'
        throw e
      }
      m.set(k, v)
    },
    removeItem: (k) => void m.delete(k),
    dump: () => m,
  }
}

test('存档往返', () => {
  const s = memStorage()
  save(s, { qi: 1132, level: 2 }, 1000)
  assert.deepEqual(load(s)?.state, { qi: 1132, level: 2 })
})

test('没有存档时返回 null', () => {
  assert.equal(load(memStorage()), null)
})

test('写入前把上一份挪到备份', () => {
  const s = memStorage()
  save(s, { n: 1 }, 1)
  save(s, { n: 2 }, 2)
  assert.deepEqual(load(s)?.state, { n: 2 })
  assert.match(s.dump().get(SAVE_KEYS.backup)!, /"n":1/)
})

test('主存档损坏时自动回退到备份', () => {
  const s = memStorage()
  save(s, { n: 1 }, 1)
  save(s, { n: 2 }, 2)
  s.setItem(SAVE_KEYS.main, '{坏掉的 JSON')
  const out = load(s)
  assert.deepEqual(out?.state, { n: 1 })
  assert.equal(out?.usedBackup, true, '应标记用了备份，界面要提示用户')
})

test('主存档与备份都坏时抛错而不是静默返回空档', () => {
  const s = memStorage()
  s.setItem(SAVE_KEYS.main, 'x')
  s.setItem(SAVE_KEYS.backup, 'y')
  assert.throws(() => load(s), (e: unknown) => e instanceof SaveError && e.kind === 'corrupt')
})

test('杂数据不会被当成存档加载', () => {
  const s = memStorage()
  for (const junk of ['null', '123', '"str"', '[]', '{}', '{"state":1}', '{"v":1}']) {
    s.setItem(SAVE_KEYS.main, junk)
    assert.throws(() => load(s), (e: unknown) => e instanceof SaveError && e.kind === 'corrupt', junk)
  }
})

test('写入失败要抛出来，好让界面提示导出', () => {
  const s = memStorage({ failOnWrite: true })
  assert.throws(
    () => save(s, { n: 1 }, 1),
    (e: unknown) => e instanceof SaveError && e.kind === 'write-failed',
  )
})

test('比程序更新的存档拒绝加载（降级运行时不能损坏存档）', () => {
  const s = memStorage()
  s.setItem(SAVE_KEYS.main, JSON.stringify({ v: SAVE_VERSION + 1, savedAt: 0, state: {} }))
  assert.throws(() => load(s), (e: unknown) => e instanceof SaveError && e.kind === 'too-new')
})

test('新版本主档不能偷偷回退旧备份或被旧程序覆盖', () => {
  const s = memStorage()
  const future = JSON.stringify({ v: SAVE_VERSION + 1, savedAt: 0, state: {} })
  const backup = serialize({ progress: 100 }, 0)
  s.setItem(SAVE_KEYS.main, future)
  s.setItem(SAVE_KEYS.backup, backup)
  assert.throws(() => load(s), (e: unknown) => e instanceof SaveError && e.kind === 'too-new')
  assert.throws(() => save(s, { progress: 0 }, 0), (e: unknown) => e instanceof SaveError && e.kind === 'too-new')
  assert.equal(s.getItem(SAVE_KEYS.main), future)
  assert.equal(s.getItem(SAVE_KEYS.backup), backup)
})

test('迁移链逐步升级', () => {
  const migrations: Migration[] = [
    { from: 1, migrate: (s) => ({ ...(s as object), added: true }) },
    { from: 2, migrate: (s) => ({ ...(s as object), renamed: (s as { old?: number }).old }) },
  ]
  const out = migrateToCurrentWith({ v: 1, savedAt: 0, state: { old: 5 } }, migrations, 3)
  assert.deepEqual(out, { old: 5, added: true, renamed: 5 })
})

// migrateToCurrent 用的是模块常量 SAVE_VERSION，这里用一个小包装测试多步迁移
function migrateToCurrentWith(
  env: { v: number; savedAt: number; state: unknown },
  migrations: readonly Migration[],
  target: number,
): unknown {
  let state = env.state
  for (let v = env.v; v < target; v++) {
    const step = migrations.find((m) => m.from === v)
    if (!step) throw new SaveError(`缺少 v${v} → v${v + 1} 的迁移`, 'no-migration')
    state = step.migrate(state)
  }
  return state
}

test('缺少中间迁移时报错，不静默加载错误结构', () => {
  assert.throws(
    () => migrateToCurrentWith({ v: 1, savedAt: 0, state: {} }, [], 3),
    (e: unknown) => e instanceof SaveError && e.kind === 'no-migration',
  )
})

test('当前版本的存档不经过任何迁移', () => {
  const state = { untouched: 1 }
  assert.equal(migrateToCurrent({ v: SAVE_VERSION, savedAt: 0, state }, []), state)
})

test('导出 / 导入往返', () => {
  const state = { 姓名: '173小鱼', 五行: '木' }
  assert.deepEqual(importSave(exportSave(state, 123)), state)
})

test('导入空内容或杂数据要报错', () => {
  assert.throws(() => importSave('   '), (e: unknown) => e instanceof SaveError && e.kind === 'empty')
  assert.throws(() => importSave('not json'), (e: unknown) => e instanceof SaveError && e.kind === 'corrupt')
})

test('序列化带版本号与时间戳', () => {
  const env = JSON.parse(serialize({ a: 1 }, 999))
  assert.equal(env.v, SAVE_VERSION)
  assert.equal(env.savedAt, 999)
})

test('clear 同时清掉主存档与备份', () => {
  const s = memStorage()
  save(s, { n: 1 }, 1)
  save(s, { n: 2 }, 2)
  clear(s)
  assert.equal(load(s), null)
  assert.equal(s.dump().size, 0)
})

test('中文与 emoji 往返不丢失', () => {
  const s = memStorage()
  const state = { 名: '举头望明月', 门派: '通天', 备注: '出保了🎉' }
  save(s, state, 1)
  assert.deepEqual(load(s)?.state, state)
})
