/**
 * 世界：九州、地形、天地元气。
 *
 * 【照原版】的部分：
 *  - 世界朝向。五岳坐标代入屏幕公式后，泰山最右=东、华山最左=西、恒山最上=北、
 *    衡山最下=南、嵩山居中 —— 所以屏幕「上北下南左西右东」，世界是一块立起来的大菱形，
 *    地理北 = (−x,+y)、地理东 = (+x,+y)。已知 7 个州的落点与真实地理一致。
 *  - 19 个地名的实测坐标（见 `LANDMARKS`）。
 *  - 普通格五行总和恒为 20；森林木 5、青山金 5、江河水 5。
 *  - 场景按开服周龄解锁：村庄 1 周、福地与小镇 2 周、城池 3 周、洞天 4 周。
 *  - 移动耗时按**目标格**地形计。
 *
 * 【重建】的部分：地形的具体分布。原版的地图数据没有存档，只能用种子函数生成，
 * 已知地名与五岳钉死在实测坐标上。基准期世界 200×200（2009-06-30 才扩到 300×300）。
 */

import { rand, randInt } from '../engine/rng.ts'
import type { FiveQi } from '../engine/state.ts'

export const WORLD_SIZE = 200

export type Terrain =
  | '平原' | '森林' | '青山' | '江河'
  | '村庄' | '小镇' | '城池'
  | '福地' | '洞天'

/** 地块基名 → 地图素材 `img/map/{base}{n}.gif` 与插画 `img/scene/{base}{nn}.gif`。 */
export const TERRAIN_KEY: Record<Terrain, string> = {
  平原: 'plain', 森林: 'forest', 青山: 'mountain', 江河: 'river',
  村庄: 'village', 小镇: 'town', 城池: 'city',
  福地: 'fudi', 洞天: 'dongtian',
}

/** 每种地形的地块图有几个变体（原版 plain 有 4 个、mountain 3 个、forest/river 2 个）。 */
const TERRAIN_VARIANTS: Record<Terrain, number> = {
  平原: 4, 森林: 2, 青山: 3, 江河: 2,
  村庄: 1, 小镇: 1, 城池: 1, 福地: 1, 洞天: 1,
}

/**
 * 移动到该地形需要的秒数。[原文]
 * 出处：游戏内指南（`docs/research/02-guides-and-rules.md` §1.6）。
 * 注意是按**目标格**算，不是按出发格。
 */
export const MOVE_SECONDS: Record<Terrain, number> = {
  平原: 10 * 60,
  森林: 20 * 60,
  青山: 30 * 60,
  江河: 40 * 60,
  村庄: 20 * 60,
  小镇: 30 * 60,
  城池: 40 * 60,
  福地: 30 * 60,
  洞天: 30 * 60,
}

/**
 * 场景按开服周龄解锁。[原文]
 * 出处：官方 FAQ 2009-02-03（`reference/text/guides/50102-p1.txt`）。
 */
export const UNLOCK_WEEKS: Partial<Record<Terrain, number>> = {
  村庄: 1,
  小镇: 2,
  福地: 2,
  城池: 3,
  洞天: 4,
}

/** 九州方位。地理北 = (−x,+y)、东 = (+x,+y)，所以用「沿菱形轴」的坐标判断。 */
export const PROVINCES = [
  '凉州', '并州', '幽州', '雍州', '冀州', '徐州', '益州', '荆州', '扬州',
] as const
export type Province = (typeof PROVINCES)[number]

/** 建号页的出生方位取值 → 州名（取值照原版 HTML）。 */
export const PROVINCE_BY_POSI: Record<number, Province> = {
  1: '雍州', 2: '凉州', 3: '并州', 4: '益州', 5: '冀州',
  6: '幽州', 7: '荆州', 8: '扬州', 9: '徐州',
}

/**
 * 实测到的地名与坐标。[原文/截图]
 * 这些点在世界生成时被钉死，不受种子影响。
 */
export const LANDMARKS: readonly {
  readonly x: number
  readonly y: number
  readonly province: Province
  readonly terrain: Terrain
  readonly name: string
  readonly qi?: FiveQi
  readonly source: string
}[] = [
  // 五岳（境界任务「剑斩五岳」的目标）
  { x: 168, y: 198, province: '徐州', terrain: '青山', name: '玉皇顶', source: 'reference/text/guides/66877-p1.txt（五岳·木）' },
  { x: 41, y: 59, province: '雍州', terrain: '青山', name: '落雁峰', source: '同上（五岳·金）' },
  { x: 53, y: 181, province: '并州', terrain: '青山', name: '天峰岭', source: '同上（五岳·水）' },
  { x: 194, y: 17, province: '荆州', terrain: '青山', name: '祝融峰', source: '同上（五岳·火）' },
  { x: 100, y: 89, province: '冀州', terrain: '青山', name: '峻极峰', source: '同上（五岳·土，居中）' },
  // 截图与 DOM 里出现过的地点
  { x: 77, y: 57, province: '益州', terrain: '森林', name: '森林', qi: [4, 5, 4, 4, 3] as unknown as FiveQi, source: '原版 map.jsp 整页 DOM（s14，2009-02-13）' },
  { x: 115, y: 6, province: '益州', terrain: '青山', name: '青山', qi: [5, 3, 4, 4, 4] as unknown as FiveQi, source: '截图 #106' },
  { x: 95, y: 52, province: '益州', terrain: '森林', name: '森林', qi: [4, 4, 3, 5, 4] as unknown as FiveQi, source: '截图 #104' },
  { x: 116, y: 52, province: '益州', terrain: '平原', name: '平原', qi: [4, 4, 3, 4, 5] as unknown as FiveQi, source: '截图 #130 #147' },
  { x: 160, y: 9, province: '荆州', terrain: '平原', name: '平原', qi: [5, 5, 0, 5, 0] as unknown as FiveQi, source: '截图 #88 #96（特殊格，和为 15）' },
  { x: 134, y: 88, province: '扬州', terrain: '青山', name: '青山', qi: [5, 4, 4, 3, 4] as unknown as FiveQi, source: '截图 #19' },
  { x: 14, y: 50, province: '雍州', terrain: '洞天', name: '不见山', qi: [4, 4, 4, 4, 4] as unknown as FiveQi, source: '截图 #131 #52' },
]

const landmarkAt = (x: number, y: number) => LANDMARKS.find((l) => l.x === x && l.y === y)

/** 州的中心点（用于建号出生与方位判断）。按菱形轴排布，与已知州的落点一致。 */
export const PROVINCE_CENTER: Record<Province, readonly [number, number]> = {
  // 地理北 = (−x,+y)、东 = (+x,+y)；中央冀州取五岳中岳「峻极峰」
  冀州: [100, 89],
  并州: [53, 181], // 北
  徐州: [168, 198], // 东
  荆州: [194, 17], // 南
  雍州: [41, 59], // 西
  幽州: [110, 190], // 东北
  扬州: [180, 110], // 东南
  益州: [60, 30], // 西南
  凉州: [20, 120], // 西北
}

/** 离哪个州中心最近就属于哪个州。 */
export function provinceOf(x: number, y: number): Province {
  let best: Province = '冀州'
  let bestDist = Infinity
  for (const p of PROVINCES) {
    const [cx, cy] = PROVINCE_CENTER[p]
    const d = Math.abs(x - cx) + Math.abs(y - cy)
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return best
}

/**
 * 某格的地形。[重建 —— 原版地图数据未存档]
 *
 * 规则：实测地名钉死；其余按种子生成，比例参考原版那一屏的 113 格样本
 * （平原 89、青山 13、森林 5、江河 6 → 约 79% 平原）。
 * 村镇城与福地洞天按开服周龄解锁，且分布稀疏。
 */
export function terrainAt(seed: number, x: number, y: number, weeksOpen = 99): Terrain {
  const mark = landmarkAt(x, y)
  if (mark) {
    // 实测地名也受开服日历约束：洞天「不见山」要到第 4 周才出现，
    // 在那之前这一格先当普通地形（原版「场景随开服时间越久出现越多」）。
    const need = UNLOCK_WEEKS[mark.terrain]
    if (need === undefined || weeksOpen >= need) return mark.terrain
  }

  // 稀疏的聚落：用低频噪声挑出少量格子
  const settle = rand(seed, 'settle', x, y)
  if (settle > 0.995 && (weeksOpen >= (UNLOCK_WEEKS['城池'] ?? 99))) return '城池'
  if (settle > 0.985 && (weeksOpen >= (UNLOCK_WEEKS['小镇'] ?? 99))) return '小镇'
  if (settle > 0.96 && (weeksOpen >= (UNLOCK_WEEKS['村庄'] ?? 99))) return '村庄'
  if (settle < 0.004 && (weeksOpen >= (UNLOCK_WEEKS['洞天'] ?? 99))) return '洞天'
  if (settle < 0.012 && (weeksOpen >= (UNLOCK_WEEKS['福地'] ?? 99))) return '福地'

  const r = rand(seed, 'terrain', x, y)
  if (r > 0.94) return '江河'
  if (r > 0.88) return '青山'
  if (r > 0.79) return '森林'
  return '平原'
}

/** 地块图的变体编号（同一地形有几张不同的图）。 */
export const terrainVariant = (seed: number, x: number, y: number, t: Terrain): number =>
  randInt(TERRAIN_VARIANTS[t], seed, 'variant', x, y)

/**
 * 天地元气。[原文规则 + 重建分布]
 *
 * 规则（原版那一屏 113 格实测）：普通格五行**总和恒为 20**，地形决定哪一行偏高 ——
 * 森林木 5、青山金 5、江河水 5，另有一行 −1 作平衡。
 * 少数特殊格总和为 15 或 13（如荆州平原 5/5/0/5/0）。
 * 城池按 `DECISIONS-rules.md` §2 取全 10（总和 50）；福地 5/5/5/5/5、洞天 6/6/6/6/6 [原文]。
 */
export function qiAt(seed: number, x: number, y: number, terrain?: Terrain): FiveQi {
  const mark = landmarkAt(x, y)
  if (mark?.qi) return mark.qi

  const t = terrain ?? terrainAt(seed, x, y)
  if (t === '城池') return [10, 10, 10, 10, 10] as unknown as FiveQi
  if (t === '小镇') return [8, 8, 8, 8, 8] as unknown as FiveQi
  if (t === '村庄') return [5, 5, 5, 5, 5] as unknown as FiveQi
  if (t === '福地') return [5, 5, 5, 5, 5] as unknown as FiveQi
  if (t === '洞天') return [6, 6, 6, 6, 6] as unknown as FiveQi

  // 普通格：基线全 4（总和 20）
  const qi = [4, 4, 4, 4, 4]
  const boost = { 森林: 1, 青山: 0, 江河: 2, 平原: -1 }[t as '森林' | '青山' | '江河' | '平原']
  if (boost !== undefined && boost >= 0) {
    qi[boost] = 5
    // 随机挑另一行 −1，保持总和 20
    let drop = randInt(5, seed, 'qidrop', x, y)
    if (drop === boost) drop = (drop + 1) % 5
    qi[drop] = (qi[drop] ?? 4) - 1
  } else {
    // 平原：多数是全 4，少数有一高一低
    if (rand(seed, 'plainvar', x, y) > 0.7) {
      const up = randInt(5, seed, 'plainup', x, y)
      let down = randInt(5, seed, 'plaindown', x, y)
      if (down === up) down = (down + 1) % 5
      qi[up] = (qi[up] ?? 4) + 1
      qi[down] = (qi[down] ?? 4) - 1
    }
  }
  return qi as unknown as FiveQi
}

/** 场景名，如「益州 森林」。有地名的用地名（如「雍州 不见山」）。 */
export function sceneName(seed: number, x: number, y: number): string {
  const mark = landmarkAt(x, y)
  const province = mark?.province ?? provinceOf(x, y)
  const label = mark?.name ?? terrainAt(seed, x, y)
  return `${province} ${label}`
}

/** 坐标是否在世界内。 */
export const inWorld = (x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < WORLD_SIZE && y < WORLD_SIZE

/** 两格之间的距离（原版视野与移动都按曼哈顿距离算）。 */
export const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.abs(ax - bx) + Math.abs(ay - by)
