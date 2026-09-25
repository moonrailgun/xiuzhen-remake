/**
 * 游戏时钟。
 *
 * 为什么需要它：原版大量规则绑在日历上——开服 1/2/3/4 周解锁村庄/福地·小镇/城池/洞天、
 * 保护期「18 年或建号 10 天」、三尸只在周六刷新、VIP 按 7 天、免战按天、删号 3 天生效、
 * 每周发 20 附加仙石工资，加上战报和出击页上的绝对「到达时间」、顶栏的服务器时间。
 * 一旦有倍速开关，这些全都不能再读墙上时钟。
 *
 * 规则（`docs/spec/DECISIONS.md` §3.6）：
 *  - 全局只有一个 `gameNow()`，一切日历规则、事件时刻、时间戳都用它；
 *  - 存档存 `{gameT, wallT, rate}`；
 *  - 读档或改倍速前，**先按旧 rate 结算到当前**，再换 rate —— 否则游戏时间会整体跳变；
 *  - 墙钟回拨（Δ<0）按 0 处理，不让游戏时间倒流。
 */

/** 游戏时间的单位是**秒**（原版倒计时以秒为单位，`<span start="秒">`）。墙钟是毫秒。 */
export type Clock = {
  /** 游戏内已流逝的秒数（从开服日 0 点起算） */
  readonly gameT: number
  /** 上次结算时的墙钟毫秒数 */
  readonly wallT: number
  /** 倍速：1 = 原速，10 = 十倍速 */
  readonly rate: number
}

export const createClock = (nowWall: number, startGameT = 0): Clock => ({
  gameT: startGameT,
  wallT: nowWall,
  rate: 1,
})

/**
 * 把时钟推进到当前墙钟时刻。幂等：同一个 nowWall 连续调用结果相同。
 */
export function advance(clock: Clock, nowWall: number): Clock {
  const deltaWallMs = nowWall - clock.wallT
  // 墙钟回拨（改系统时间、夏令时、NTP 校正）按 0 处理，游戏时间只进不退。
  const elapsedSec = deltaWallMs > 0 ? (deltaWallMs / 1000) * clock.rate : 0
  return { gameT: clock.gameT + elapsedSec, wallT: nowWall, rate: clock.rate }
}

/**
 * 倍速上限。
 *
 * 界面只给 1/10/60/600 四档（`pages/settings.ts`），**更高的值游戏本身产生不出来**。
 * 但导入存档是不受信边界：一份 `rate: 1e9` 的存档以前能过校验，随后第一次 `tick`
 * 要按游戏小时切段循环约 1e9 次 —— 同步循环不返回，浏览器标签页直接冻死。
 * 所以这里钉一个上限，`setRate` 与存档校验共用它。
 *
 * 取 600 而不是更大的数：超过它的倍速没有任何合法来源，放宽只会放大风险。
 */
export const MAX_RATE = 600

/**
 * 改倍速。必须先结算再换 rate，否则历史时间会按新倍率重算，游戏时间整体跳变。
 */
export function setRate(clock: Clock, nowWall: number, rate: number): Clock {
  if (!(rate > 0) || !Number.isFinite(rate)) throw new Error(`倍速必须是正数，收到 ${rate}`)
  if (rate > MAX_RATE) throw new Error(`倍速最高 ${MAX_RATE}×，收到 ${rate}`)
  return { ...advance(clock, nowWall), rate }
}

// —— 日历换算 ——
// 原版是真实世界时间流逝，所以游戏内的「天」就是 24 小时。

export const MINUTE = 60
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
export const WEEK = 7 * DAY

/** 开服后的第几天（0 起）。用于开服日历：村庄 1 周、福地·小镇 2 周、城池 3 周、洞天 4 周。 */
export const dayOfServer = (clock: Clock): number => Math.floor(clock.gameT / DAY)
export const weekOfServer = (clock: Clock): number => Math.floor(clock.gameT / WEEK)

/**
 * 星期几（0 = 周日）。原版「斩三尸」只在周六刷新，需要这个。
 * 基准：开服日是星期几由存档记录（`serverOpenWeekday`），默认按 2008-10-28 首服开服日
 * （星期二，weekday = 2）—— 出处 `reference/text/news/gonggao-2008-10-27-464.txt`。
 */
export const weekdayOf = (clock: Clock, serverOpenWeekday = 2): number =>
  (serverOpenWeekday + dayOfServer(clock)) % 7

/** 游戏内的一天中的秒数（0..86399），用于顶栏「服务器时间」显示。 */
export const secondsOfDay = (clock: Clock): number => Math.floor(clock.gameT % DAY)

/** 格式化成原版顶栏的 `HH:MM:SS`。 */
export function formatServerTime(clock: Clock): string {
  const s = secondsOfDay(clock)
  const hh = String(Math.floor(s / HOUR)).padStart(2, '0')
  const mm = String(Math.floor((s % HOUR) / MINUTE)).padStart(2, '0')
  const ss = String(s % MINUTE).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/**
 * 开服日（UTC 毫秒）。2008-10-28 是首服开服日
 * （`reference/text/news/gonggao-2008-10-27-464.txt`），本地版就从这天算起，
 * 这样战报和收件箱里的绝对时间戳读起来是「当年那个日历」。
 */
export const SERVER_OPEN_MS = Date.UTC(2008, 9, 28)

/**
 * 游戏时刻 → `YYYY-MM-DD HH:MM:SS`。收件箱的「发信时间」、炼制表的「完成时间」用它。
 * 用 UTC 取字段，避免随使用者所在时区漂移（游戏日历与本机时区无关）。
 */
export function formatGameDate(gameT: number): string {
  const d = new Date(SERVER_OPEN_MS + Math.max(0, Math.floor(gameT)) * 1000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/** 门派新闻用的短格式 `YY-MM-DD HH:MM`（截图与原版 DOM 都是这个写法）。 */
export const formatGameDateShort = (gameT: number): string =>
  formatGameDate(gameT).slice(2, 16)

/**
 * 格式化成原版事件栏的倒计时 `H:MM:SS`（小时不补零，可超过 24，如 `1222:13:20`）。
 * 出处：截图 #3「需要时间 0:24:01」、#33「1527:46:40」。
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / HOUR)
  const m = String(Math.floor((total % HOUR) / MINUTE)).padStart(2, '0')
  const s = String(total % MINUTE).padStart(2, '0')
  return `${h}:${m}:${s}`
}
