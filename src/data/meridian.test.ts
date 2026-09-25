import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MERIDIANS,
  MULTIPLIER_ANCHORS,
  groupElement,
  multiplier,
  hourlyQi,
  overcomeBy,
  generates,
  generatedBy,
  overcomes,
  ELEMENTS,
  type Element,
} from './meridian.ts'

test('十二正经：4 组 × 3 条', () => {
  assert.equal(MERIDIANS.length, 12)
  for (const g of ['手三阴', '手三阳', '足三阴', '足三阳'] as const) {
    assert.equal(MERIDIANS.filter((m) => m.group === g).length, 3, g)
  }
})

test('五行生克闭环', () => {
  for (const e of ELEMENTS) {
    assert.equal(generatedBy(generates(e)), e, `${e} 生克闭环`)
    assert.equal(overcomeBy(overcomes(e)), e, `${e} 相克闭环`)
    // 生我 / 我生 / 我克 / 克我 / 本命 恰好覆盖五行，不重不漏
    const five = new Set([e, generates(e), generatedBy(e), overcomes(e), overcomeBy(e)])
    assert.equal(five.size, 5, `${e} 的五种关系应覆盖全部五行`)
  }
})

// —— 下面两条是对【原文样本】的回归：改了映射规则就会失败 ——

test('样本 A：火属性角色的推算信（reference/text/forum162/article-96998-p1.txt）', () => {
  // 原文：手三阴=火 足三阴=金 足三阳=土 手三阳=木，缺水
  assert.equal(groupElement('火', '手三阴'), '火')
  assert.equal(groupElement('火', '足三阴'), '金')
  assert.equal(groupElement('火', '足三阳'), '土')
  assert.equal(groupElement('火', '手三阳'), '木')
  assert.equal(overcomeBy('火'), '水', '火属性的五行一缺应为水')
})

test('样本 B：木属性角色的足阳明胃经掌管火（截图 #3）', () => {
  const wei = MERIDIANS.find((m) => m.name === '足阳明胃经')!
  assert.equal(groupElement('木', wei.group), '火')
  assert.equal(overcomeBy('木'), '金', '木属性的五行一缺应为金（截图 #2 显示金 0/小时）')
})

test('倍率曲线过全部 9 个锚点', () => {
  for (const a of MULTIPLIER_ANCHORS) {
    assert.equal(multiplier(a.level), a.value, `Lv.${a.level}`)
  }
})

test('倍率单调不减，且 Lv.0 = 1 倍', () => {
  assert.equal(multiplier(0), 1)
  let prev = 0
  for (let lv = 0; lv <= 20; lv++) {
    const v = multiplier(lv)
    assert.ok(v >= prev, `Lv.${lv}`)
    prev = v
  }
})

test('产量公式：截图 #2「173小鱼」木属性、12 脉全 Lv.2、五个 4 的地块 → 每种 59/小时', () => {
  // 出处 reference/images/17173-live/20081225104603605_all/xiuzhen801.jpg：
  // 木/水/火/土 各 59，金 0（金克木 → 五行一缺）。
  // Lv.2 = 5 倍 × 3 条 = 15；地块元气 4 → 4 × 15 = 60。
  // 实际显示 59，差 1 —— 身上带着飞剑会持续耗气（报告 02 §13c 明确"真气增长可为负"）。
  const raw = hourlyQi({ terrainQi: 4, meridianLevels: [2, 2, 2] })
  assert.equal(raw, 60, '不计法宝耗气时应为 60')
  assert.equal(hourlyQi({ terrainQi: 4, meridianLevels: [2, 2, 2], itemUpkeep: 1 }), 59)
})

test('产量公式：出保后同格玩家平分元气', () => {
  const alone = hourlyQi({ terrainQi: 10, meridianLevels: [3, 3, 3] })
  const shared = hourlyQi({ terrainQi: 10, meridianLevels: [3, 3, 3], sharingPlayers: 2 })
  assert.equal(shared, Math.floor(alone / 2))
})

test('五行一缺：克我的那一种没有对应经脉组', () => {
  const groups = ['手三阴', '手三阳', '足三阴', '足三阳'] as const
  for (const self of ELEMENTS) {
    const covered = new Set<Element>(groups.map((g) => groupElement(self, g)))
    assert.equal(covered.size, 4, `${self} 应恰好覆盖 4 种真气`)
    assert.ok(!covered.has(overcomeBy(self)), `${self} 不应能炼化克我的 ${overcomeBy(self)}`)
  }
})
