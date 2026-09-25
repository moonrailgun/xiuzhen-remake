/**
 * 存档：版本号 + 迁移链 + 损坏防护。
 *
 * 为什么要这么小心（`docs/spec/DECISIONS.md` §3.7）：原版升一级动辄几十小时，
 * 丹田 27→28 要 222:13:20。用户会一边用原速玩长期存档，一边我还在改代码。
 * 所以从阶段 2 起，**每次改 state 结构都必须加一步迁移**，否则等于丢档。
 *
 * 防护措施：
 *  - 每次写入前把上一份挪到备份 key，写坏了还能回退；
 *  - 结算抛异常时不落盘（调用方负责），并从上次成功的存档重载；
 *  - 写入失败（QuotaExceededError / 隐私模式）不静默吞掉，交给调用方提示导出；
 *  - 读档时校验形状，杂数据不会被当成存档加载。
 */

/** 当前存档格式版本。**改 state 结构必须 +1 并加一条迁移。** */
export const SAVE_VERSION = 7

const KEY = 'xiuzhen.save'
const BACKUP_KEY = 'xiuzhen.save.backup'

/** 最小存储接口，便于在 Node 测试里替换掉 localStorage。 */
export type Storage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type Envelope<S> = {
  readonly v: number
  readonly savedAt: number
  readonly state: S
}

/** 迁移：把版本 from 的存档升到 from+1。 */
export type Migration = {
  readonly from: number
  readonly migrate: (state: unknown) => unknown
}

export type SaveValidator = (state: unknown) => void

export type SaveErrorKind = 'corrupt' | 'too-new' | 'no-migration' | 'write-failed' | 'empty'

// 注意：不能用构造函数参数属性（`constructor(readonly kind: ...)`）。
// Node 原生跑 TS 只做类型擦除，参数属性需要真正的代码生成，会直接报
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX。tsconfig 的 erasableSyntaxOnly 会在 typecheck 时拦住。
export class SaveError extends Error {
  readonly kind: SaveErrorKind

  constructor(message: string, kind: SaveErrorKind, cause?: unknown) {
    super(message, { cause })
    this.name = 'SaveError'
    this.kind = kind
  }
}

function parseEnvelope(raw: string): Envelope<unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new SaveError('存档不是合法的 JSON', 'corrupt', e)
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Number.isInteger((parsed as { v?: unknown }).v) ||
    ((parsed as { v: number }).v < 1) ||
    !Number.isFinite((parsed as { savedAt?: unknown }).savedAt) ||
    !('state' in parsed)
  ) {
    throw new SaveError('存档缺少版本号或数据体', 'corrupt')
  }
  return parsed as Envelope<unknown>
}

/**
 * 把任意版本的存档升到当前版本。
 * @throws SaveError 版本比程序还新、或缺少中间迁移时
 */
export function migrateToCurrent(env: Envelope<unknown>, migrations: readonly Migration[]): unknown {
  if (env.v > SAVE_VERSION) {
    throw new SaveError(
      `存档版本 v${env.v} 比当前程序（v${SAVE_VERSION}）还新，可能是降级运行`,
      'too-new',
    )
  }
  let state = env.state
  for (let v = env.v; v < SAVE_VERSION; v++) {
    const step = migrations.find((m) => m.from === v)
    if (!step) throw new SaveError(`缺少 v${v} → v${v + 1} 的迁移`, 'no-migration')
    state = step.migrate(state)
  }
  return state
}

export function serialize<S>(state: S, now: number): string {
  return JSON.stringify({ v: SAVE_VERSION, savedAt: now, state } satisfies Envelope<S>)
}

/**
 * 写存档。先把现有存档挪到备份 key，再写新的。
 * @throws SaveError('write-failed') 配额不足或存储不可用时，调用方应提示用户导出
 */
export function save<S>(
  storage: Storage,
  state: S,
  now: number,
  options: { migrations?: readonly Migration[]; validate?: SaveValidator } = {},
): void {
  options.validate?.(state)
  const payload = serialize(state, now)
  try {
    const previous = storage.getItem(KEY)
    if (previous !== null) {
      let healthy = false
      try {
        importSave(previous, options.migrations, options.validate)
        healthy = true
      } catch (e) {
        // 用健康备份恢复后，坏主档不能再覆盖掉这份救命备份。
        if (e instanceof SaveError && e.kind === 'too-new') throw e
      }
      if (healthy) storage.setItem(BACKUP_KEY, previous)
    }
    storage.setItem(KEY, payload)
  } catch (e) {
    if (e instanceof SaveError) throw e
    throw new SaveError('存档写入失败（可能是空间不足或浏览器禁用了存储）', 'write-failed', e)
  }
}

/**
 * 读存档并迁移到当前版本。存档损坏时自动尝试备份。
 * @returns 没有存档时返回 null
 */
export function load(
  storage: Storage,
  migrations: readonly Migration[] = [],
  validate?: SaveValidator,
): { state: unknown; usedBackup: boolean } | null {
  const raw = storage.getItem(KEY)
  if (raw === null) {
    const backup = storage.getItem(BACKUP_KEY)
    return backup === null ? null : { state: importSave(backup, migrations, validate), usedBackup: true }
  }

  try {
    return { state: importSave(raw, migrations, validate), usedBackup: false }
  } catch (primaryError) {
    if (primaryError instanceof SaveError && primaryError.kind !== 'corrupt') throw primaryError
    const backup = storage.getItem(BACKUP_KEY)
    if (backup === null) throw primaryError
    try {
      return { state: importSave(backup, migrations, validate), usedBackup: true }
    } catch {
      throw primaryError // 备份也坏了，报原始错误更有用
    }
  }
}

/** 导出成给用户下载的 JSON 文本。 */
export const exportSave = <S>(state: S, now: number): string => serialize(state, now)

/**
 * 导入用户给的 JSON 文本。先校验形状与版本，再迁移。
 * 不直接写入存储，由调用方决定（通常是让用户确认覆盖）。
 */
export function importSave(text: string, migrations: readonly Migration[] = [], validate?: SaveValidator): unknown {
  if (text.trim() === '') throw new SaveError('导入内容为空', 'empty')
  const state = migrateToCurrent(parseEnvelope(text), migrations)
  validate?.(state)
  return state
}

export function clear(storage: Storage): void {
  storage.removeItem(KEY)
  storage.removeItem(BACKUP_KEY)
}

export const SAVE_KEYS = { main: KEY, backup: BACKUP_KEY } as const
