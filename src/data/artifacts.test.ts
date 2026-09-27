import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  QUALITY_MULTIPLIER,
  refineMultiplier,
  refinePieces,
  panelStat,
  statAtQuality,
  refineSuccessRate,
  DEFENSIVE_ARTIFACTS,
  MAX_SWORDS_OUT,
} from './artifacts.ts'

type Sword = {
  name: string
  element: string | null
  forgeLevel: number
  wieldLevel: number
  attack: [number, number]
  durability: [number, number]
  absorb: [number, number]
  speed: number | null
  agility: number | null
  knockback: number | null
  upkeepPerHour: number[] | null
  craftCost: number[] | null
  craftSeconds: number | null
}
const swords: Sword[] = JSON.parse(
  readFileSync(new URL('../../tools/fixtures/swords.json', import.meta.url), 'utf8'),
).swords

test('飞剑全表 14 把（原版物品窗逐字）', () => {
  assert.equal(swords.length, 14)
})

test('极品 = 废品 ×10：14 把剑无一例外（品质倍率的硬证据）', () => {
  for (const s of swords) {
    for (const field of ['attack', 'durability', 'absorb'] as const) {
      const [lo, hi] = s[field]
      if (lo === 0) continue // 天雷万磁剑/三阴绝脉剑的吸收为 0
      assert.equal(hi / lo, 10, `${s.name} 的${field} ${lo}~${hi}`)
    }
  }
  assert.equal(QUALITY_MULTIPLIER['极品'], 10)
})

test('面板属性 = 基础 × 品质 × 2^淬炼（对齐三张截图）', () => {
  const qinglong = swords.find((s) => s.name === '青龙伏魔剑')!
  // 截图 #82：极品青龙伏魔剑 攻击160 耐久80 吸收240
  assert.equal(panelStat(qinglong.attack, '极品', 0), 160)
  assert.equal(panelStat(qinglong.durability, '极品', 0), 80)
  assert.equal(panelStat(qinglong.absorb, '极品', 0), 240)

  const qixing = swords.find((s) => s.name === '七星磐龙剑')!
  // 截图 #85：极品七星磐龙剑 攻击1200 耐久600 吸收2080
  assert.equal(panelStat(qixing.attack, '极品', 0), 1200)
  assert.equal(panelStat(qixing.absorb, '极品', 0), 2080)
  // 截图 #99：同一把 +8 → 攻击307200 耐久153600 吸收532480
  assert.equal(panelStat(qixing.attack, '极品', 8), 307200)
  assert.equal(panelStat(qixing.durability, '极品', 8), 153600)
  assert.equal(panelStat(qixing.absorb, '极品', 8), 532480)
  // 敏捷原版写成 1~1 → 不吃品质，只吃淬炼：1 × 2^8 = 256（截图正是 256）
  assert.equal(panelStat([qixing.agility!, qixing.agility!], '极品', 8), 256)
})

test('上善若水剑 +10 上品对齐截图 #90', () => {
  const s = swords.find((x) => x.name === '上善若水剑')!
  // 截图：攻击36864 耐久73728 吸收73728 敏捷5120
  assert.equal(panelStat(s.attack, '上品', 10), 36864)
  assert.equal(panelStat(s.durability, '上品', 10), 73728)
  assert.equal(panelStat(s.absorb, '上品', 10), 73728)
  // 敏捷 5~5：不吃品质倍率，5 × 2^10 = 5120（若误乘 1.5 会得 7680）
  assert.equal(panelStat([s.agility!, s.agility!], '上品', 10), 5120)
})

test('速度与击退不随品质淬炼变化（原版写成 10~10 / 2~2）', () => {
  const s = swords.find((x) => x.name === '玉虚桃木剑')!
  assert.equal(s.speed, 10)
  assert.equal(s.knockback, 2)
  // 截图 #99 里 +8 的七星磐龙剑速度仍是 11、击退仍是 2
  const q = swords.find((x) => x.name === '七星磐龙剑')!
  assert.equal(q.speed, 11)
  assert.equal(q.knockback, 2)
})

test('淬炼：+N 需要 2^N 件，属性与耗气同步 ×2^N', () => {
  assert.equal(refinePieces(1), 2)
  assert.equal(refinePieces(6), 64) // 官方攻略原文「+6要64个」
  assert.equal(refineMultiplier(6), 64)
  // 官方攻略：0 级指玄道藏碑每小时耗气各 10，+6 时各 640
  assert.equal(10 * refineMultiplier(6), 640)
  // 截图交叉验证：七星磐龙 +8 = ×256，上善若水 +10 = ×1024
  assert.equal(refineMultiplier(8), 256)
  assert.equal(refineMultiplier(10), 1024)
})

test('1 级护身「指玄道藏碑」逐字对齐官方攻略', () => {
  const a = DEFENSIVE_ARTIFACTS.find((x) => x.name === '指玄道藏碑')!
  assert.deepEqual([...a.attack], [120, 1200])
  assert.deepEqual([...a.durability], [120, 1200])
  assert.deepEqual([...a.agility], [120, 1200])
  assert.equal(a.upkeepPerHour, 10)
  assert.equal(a.craftSeconds, 7500) // 2:05:00
  // 攻略原文「实际炼制,上品为180的攻耐敏捷」
  assert.equal(panelStat(a.attack, '上品', 0), 180)
  // 「连最低级的JP0级指玄道藏碑的攻击、耐久和敏捷都是1200」（JP = 极品）
  assert.equal(panelStat(a.attack, '极品', 0), 1200)
})

test('护身敏捷=缠斗秒数：+5 最低级护身约 1.6 小时（对齐攻略说法）', () => {
  const a = DEFENSIVE_ARTIFACTS[0]!
  const hours = panelStat(a.agility, '上品', 5) / 3600
  assert.ok(hours > 1.5 && hours < 1.7, `算得 ${hours.toFixed(2)} 小时，攻略说约 1.6 小时`)
})

test('飞剑敏捷换算：+6/+7 约 300 多秒 ≈ 5 分钟（对齐攻略说法）', () => {
  // 攻略：「飞剑的敏捷极低，+6、+7不过300多，换算出来不过5分钟」
  // 飞剑基础敏捷只有 1~5，所以「300 多」对应敏捷 5 的剑 +6（320）或敏捷 3 的剑 +7（384）。
  const agi = (name: string, refine: number) => {
    const s = swords.find((x) => x.name === name)!
    return panelStat([s.agility!, s.agility!], '上品', refine)
  }
  assert.equal(agi('上善若水剑', 6), 320) // 敏捷 5
  assert.equal(agi('青龙伏魔剑', 7), 384) // 敏捷 3
  for (const v of [320, 384]) assert.ok(v / 60 < 7, '都是几分钟量级，护法根本来不及')
})

test('淬炼成功率：百炼满级时 +10 及以下必成（官方攻略说法）', () => {
  for (let r = 1; r <= 10; r++) {
    assert.equal(refineSuccessRate({ targetRefine: r, baihuanLevel: 20 }), 1, `+${r}`)
  }
  assert.ok(refineSuccessRate({ targetRefine: 11, baihuanLevel: 20 }) < 1, '+11 起要仙石保')
})

test('淬炼成功率随百炼等级升高、随目标等级降低', () => {
  const low = refineSuccessRate({ targetRefine: 5, baihuanLevel: 1 })
  const high = refineSuccessRate({ targetRefine: 5, baihuanLevel: 20 })
  assert.ok(high > low)
  const easy = refineSuccessRate({ targetRefine: 3, baihuanLevel: 10 })
  const hard = refineSuccessRate({ targetRefine: 9, baihuanLevel: 10 })
  assert.ok(easy > hard)
  for (let r = 0; r <= 15; r++) {
    for (let b = 0; b <= 20; b++) {
      const p = refineSuccessRate({ targetRefine: r, baihuanLevel: b })
      assert.ok(p >= 0 && p <= 1, `越界 ${p}`)
    }
  }
})

test('三阴绝脉剑与天雷万磁剑的耗气不同（纠正归档里抄串行的错误）', () => {
  const tianlei = swords.find((s) => s.name === '天雷万磁剑')!
  const sanyin = swords.find((s) => s.name === '三阴绝脉剑')!
  assert.deepEqual(tianlei.upkeepPerHour, [3, 3, 3, 3, 0], '天雷万磁剑是 3')
  assert.deepEqual(sanyin.upkeepPerHour, [6, 6, 6, 6, 0], '三阴绝脉剑才是 6')
})

test('每小时耗气第 5 项恒为 0：水属性角色的克我（土）不扣', () => {
  for (const s of swords) {
    if (!s.upkeepPerHour) continue
    assert.equal(s.upkeepPerHour[4], 0, `${s.name}`)
  }
})

test('初期最多 5 把飞剑在外', () => {
  assert.equal(MAX_SWORDS_OUT, 5)
})


test('F21：已知高阶护身均有注明重建的数值及配方', () => {
  for (const name of ['六阳神火鉴', '先天太极图', '镜花水月幡', '东皇太一钟']) {
    const guard = DEFENSIVE_ARTIFACTS.find(g => g.name === name)
    assert.ok(guard, name)
    assert.ok(guard.craftSeconds > 86400)
    assert.ok(guard.craftCost?.every(v => v >= 0))
    assert.match(guard.source, /reconstructed/)
  }
})
