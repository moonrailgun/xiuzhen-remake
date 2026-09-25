/**
 * 法宝：品质、淬炼、飞剑、护身。
 *
 * 品质倍率与淬炼规律是【照原版】——由原版物品窗的「废品~极品」区间直接读出并三重验证。
 * 飞剑全表是【照原版】——`tools/fixtures/swords.json`（14/14 把）。
 * 护身只有 1 级「指玄道藏碑」是【照原版】，其余【只能重建】。
 * 淬炼成功率是【按推断】——只有几个散点。
 */

import type { Element } from './meridian.ts'

// —— 品质 ——

export const QUALITIES = ['废品', '凡品', '上品', '极品'] as const
export type Quality = (typeof QUALITIES)[number]

/**
 * 品质倍率。[原文验证]
 *
 * 原版物品窗把基础属性写成「废品~极品」区间，如玉虚桃木剑 `8~80` → 极品/废品 = 10。
 * 14 把剑无一例外都是 10 倍，所以极品 = ×10 是硬证据。
 * 上品 ×1.5：官方攻略《护身揭密》写 1 级护身基础 120，「实际炼制,上品为180的攻耐敏捷」
 * → 180/120 = 1.5 [原文]。
 * 凡品 ×1.25：只有 `docs/research/03` 从战报反推的弱证据 [推断]。
 */
export const QUALITY_MULTIPLIER: Record<Quality, number> = {
  废品: 1,
  凡品: 1.25,
  上品: 1.5,
  极品: 10,
}

/** 商城卖的是极品；「物理通明」秘笈让炼器有机会出极品。 */
export const QUALITY_SOURCE_NOTE =
  'reference/text/guides/4295-p1.txt（上品=1.5×）；tools/fixtures/swords.json（极品=10×，14/14 把一致）'

// —— 淬炼 ——

/**
 * 淬炼：两把**完全相同**的法宝合成一把 +1。
 *
 * 所以 +N 需要 2^N 把基础件，属性也随之 ×2^N。
 * 官方攻略原文（`reference/text/guides/4295-p1.txt`）：
 *   「+1要2个，+2要4个，……+6要64个，也就是说+6的炼制时间是128小时」
 *   「0的指玄道藏碑，每小时消耗真气为各种能吸收真气各10，这是数字每阶是要翻倍的，
 *     到+6就消耗各种能吸收真气各640」——10 × 2^6 = 640 ✓
 *
 * 截图交叉验证：七星磐龙剑 +8 = 基础 ×256（2^8）、上善若水剑 +10 = ×1024（2^10）。
 */
export const refineMultiplier = (refine: number): number => 2 ** refine
/** 淬炼 +N 需要的基础件数量。 */
export const refinePieces = (refine: number): number => 2 ** refine

/**
 * 哪些字段随品质变化，原版物品窗**自己写在区间里**：
 *  - 攻击/耐久/吸收写成 `8~80`（废品~极品）→ 随品质变化；
 *  - 飞剑的速度/敏捷/击退写成 `10~10`、`3~3`、`2~2` → 不随品质变化；
 *  - 但护身的敏捷写成 `120~1200` → 随品质变化。
 * 所以不能按字段名硬编码，要按区间本身判断。
 */
export function statAtQuality(range: readonly [number, number], quality: Quality): number {
  const [lo, hi] = range
  if (lo === hi) return lo
  return quality === '极品' ? hi : Math.floor(lo * QUALITY_MULTIPLIER[quality])
}

/**
 * 哪些字段吃淬炼，由截图交叉验证得出：
 *  - 攻击/耐久/吸收/敏捷 ×2^N（七星磐龙 +8 敏捷 1→256；上善若水 +10 敏捷 5→5120）；
 *  - 速度/击退不变（同两张截图里速度仍 11、击退仍 2）。
 */
export const REFINE_SCALES = ['attack', 'durability', 'absorb', 'agility'] as const
export const REFINE_KEEPS = ['speed', 'knockback'] as const

/** 面板值 = 按品质取值 × 2^淬炼。速度/击退请直接用原值，不要过这个函数。 */
export function panelStat(
  range: readonly [number, number],
  quality: Quality,
  refine: number,
): number {
  return Math.floor(statAtQuality(range, quality) * refineMultiplier(refine))
}

/** @deprecated 用 `panelStat(区间, 品质, 淬炼)`——品质是否生效要看原版区间 */
export function scaledStat(base: number, quality: Quality, refine: number): number {
  return panelStat([base, base * 10], quality, refine)
}

/**
 * 淬炼成功率。[按推断 —— 界面上直接显示百分比，但只有散点]
 *
 * 已知事实：
 *  - 界面显示成功率，玩家帖引用过 95%、98%、99%、100%（`reference/text/forum162/article-78920-p*.txt`）；
 *  - 「想练好武器、好护身就必须百炼之法到20级。这样就可以淬练+10的了。至于+11开始嘛，
 *     有石头点包，没石头点保」[原文] → 百炼满级时 +10 及以下是 100%；
 *  - 失败的后果是**两把俱毁**（失败文案「双双剧震…震裂成碎片」）；
 *  - 花 1 仙石保不毁、2 仙石保必成。
 *
 * 重建方案：成功率随百炼之法等级升高、随目标淬炼等级降低；百炼 20 级时 +10 及以下必成。
 * 这条曲线**没有原版依据**，`docs/LEDGER.md` 记为 reconstructed。
 */
export function refineSuccessRate(params: {
  /** 目标淬炼等级（从 +N-1 合成 +N 时的 N） */
  readonly targetRefine: number
  /** 百炼之法等级 0–20 */
  readonly baihuanLevel: number
}): number {
  const { targetRefine, baihuanLevel } = params
  const mastery = Math.min(20, Math.max(0, baihuanLevel)) / 20
  // 百炼满级：+10 及以下必成（原文）。其上每级递减。
  const freeCeiling = Math.floor(10 * mastery)
  if (targetRefine <= freeCeiling) return 1
  const over = targetRefine - freeCeiling
  return Math.max(0.5, 1 - 0.05 * over)
}

export const MAX_SWORDS_OUT = 5
export const MAX_SWORDS_OUT_NOTE =
  '「同一人初期最多同时控制 5 把飞剑在外」；万剑诀每级 +1（reference/text/third-party/17173-webxz-zhandou.txt）'

// —— 护身法宝 ——

/**
 * 护身法宝。[原文]
 *
 * 机制全部出自官方攻略《护身揭密》（`reference/text/guides/4295-p1.txt`，2008-11-10，官方账号发）：
 *  - 「只有升级了灵宝之术后，才出现炼制护身法宝的选项……道友拥有越高级的灵宝之术，
 *     能炼制和使用的护身就越高级」→ 护身等级受**灵宝之术**制约（飞剑受铸剑之术/御剑术）。
 *  - 「即使对方飞剑凌体之时，护身都可以自动御敌，将敌剑挡在空中，给予各位道友祭起飞剑的时间」
 *  - 「至于抵挡的时间，则是由护身本身的敏捷决定」→ 敏捷 = 缠斗秒数，与飞剑同一套规则。
 *  - 「护身可以和飞剑一起炼制」→ 两条炼器队列并行，互不占用。
 *  - 缺点：**不能出击**、不能撤退（「不能FS」）。
 *  - 「护法的基础是防御方必须要有护身」——飞剑敏捷太低（+6/+7 不过 300 多秒 ≈ 5 分钟），
 *     而 +5 的最低级护身能撑 1.6 小时，护法才来得及支援。
 */
export type DefensiveArtifact = {
  readonly name: string
  readonly lingbaoLevel: number
  /** [废品, 极品] */
  readonly attack: readonly [number, number]
  readonly durability: readonly [number, number]
  readonly agility: readonly [number, number]
  /** 每小时消耗真气（能吸收的四种各这么多） */
  readonly upkeepPerHour: number
  readonly craftSeconds: number
  /** 水属性角色的炼制消耗，金木水火土 */
  readonly craftCost?: readonly [number, number, number, number, number]
  readonly source: string
}

export const DEFENSIVE_ARTIFACTS: readonly DefensiveArtifact[] = [
  {
    name: '指玄道藏碑',
    lingbaoLevel: 1,
    attack: [120, 1200],
    durability: [120, 1200],
    agility: [120, 1200],
    upkeepPerHour: 10,
    craftSeconds: 2 * 3600 + 5 * 60, // 2:05:00
    craftCost: [1700, 1300, 670, 0, 1330],
    source: 'reference/text/guides/4295-p1.txt（官方《护身揭密》逐字）',
  },
]

/**
 * 其余护身法宝只知道名字，数值全缺。[只能重建]
 * 《护身揭密》提到「最高级的护身，六阳神火鉴、先天太极图以及镜花水月幡都是24小时以上的炼制时间」；
 * 战报与玩家帖里另见「东皇太一钟」「半月」「莲台」。
 */
export const DEFENSIVE_ARTIFACT_NAMES_KNOWN: readonly string[] = [
  '指玄道藏碑',
  '六阳神火鉴',
  '先天太极图',
  '镜花水月幡',
  '东皇太一钟',
]

/**
 * 三大被动剑诀**只对离体出击的飞剑生效**，在身上被迫交战没有加成。[原文]
 * 出处同上：「被动，也就是此三大技能是永久加成的，但飞剑飞剑，不飞时候它不算剑。
 * 如果在各位道友身上被迫交战，那就并没有加成。不过飞剑只要离开仙体，即有加成。」
 * 「后期将相差20%攻击和20%耐久」→ 满级时约 +20%。
 */
export const PASSIVE_SWORD_ARTS = {
  心剑诀: '增加飞剑攻击',
  身剑诀: '增加飞剑耐久',
  大周天剑法: '增加飞剑速度',
} as const

export const PASSIVE_ONLY_WHEN_LAUNCHED = true
