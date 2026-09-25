import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderPayment, PAY_SECTIONS, type PaymentVm } from './payment.ts'

/** 截图 #9：金木水土买了，火没买（该角色缺火，买了也没用）。 */
const vm = (over: Partial<PaymentVm> = {}): PaymentVm => ({
  remaining: {
    1: '还有11.82天，到14:10结束',
    2: '还有11.82天，到14:10结束',
    3: '还有11.82天，到14:10结束',
    5: '还有11.82天，到14:11结束',
    13: '还有5.81天，到14:03结束',
    14: '还有5.81天，到14:03结束',
    15: '还有5.81天，到14:03结束',
  },
  ...over,
})

test('表头四列：描述（占两格，218）｜时间 67｜价格 87｜操作 87（#9 实测列宽）', () => {
  const h = renderPayment(vm())
  assert.ok(h.includes('<TD colSpan=2 width=218>描述</TD>'))
  assert.ok(h.includes('<TD width=67>时间</TD>'))
  assert.ok(h.includes('<TD width=87>价格</TD>'))
  assert.ok(h.includes('<TD width=87>操作</TD>'))
  assert.ok(h.includes('width=460'), '表宽 460')
})

test('五行真气吸收提速：各 7 天 5 仙石，五行齐全且各带自己的图标', () => {
  const h = renderPayment(vm())
  for (const [e, icon] of [
    ['金', 'gold'],
    ['木', 'wood'],
    ['水', 'water'],
    ['火', 'fire'],
    ['土', 'earth'],
  ] as const) {
    assert.ok(
      h.includes(`<IMG src="img/res/${icon}.gif">+25%${e}真气吸收速度`),
      `缺少 +25%${e}真气吸收速度`,
    )
  }
  assert.equal((h.match(/>5仙石</g) ?? []).length, 5, '五行各 5 仙石')
  assert.ok(h.includes('<TD>7天</TD><TD>5仙石</TD>'), '单条说明的项不拆行，时间/价格不用 rowSpan')
})

test('法宝三项：+10%攻击 / +10%耐久 / +50%击退，各 7 天 2 仙石', () => {
  const h = renderPayment(vm())
  assert.ok(h.includes('+10%法宝攻击'))
  assert.ok(h.includes('+10%法宝耐久'))
  assert.ok(h.includes('+50%法宝击退'))
  // 全页共 4 处「2仙石」：法宝三项 + 立即生效的「减半所有修炼事件剩余时间」
  assert.equal((h.match(/>2仙石</g) ?? []).length, 4)
})

test('VIP 套餐：三条功能 7 天 10 仙石，右侧三列 rowSpan 合并（照原版 DOM pay=18）', () => {
  const h = renderPayment(vm())
  assert.ok(h.includes('>VIP功能</TD>'))
  assert.ok(h.includes('增加1个修炼事件队列'))
  assert.ok(h.includes('拥有法宝数量上限增加5个'))
  assert.ok(h.includes('自动淬炼'))
  assert.ok(h.includes('<TD rowSpan=3>7天</TD><TD rowSpan=3>10仙石</TD><TD rowSpan=4>'))
  assert.ok(h.includes('暂未开放'))
  assert.ok(!h.includes('pay=18'))
  // 套餐最后一条说明不带 colSpan，右边空一格（#79 上那道竖线）
  assert.ok(h.includes('<TD align=left>自动淬炼</TD><TD>&nbsp;</TD>'))
})

test('高级 VIP：7 天 20「普通」仙石（#80 特地写明是普通仙石）', () => {
  const h = renderPayment(vm())
  assert.ok(h.includes('>高级VIP功能</TD>'))
  assert.ok(h.includes('移动范围外自动寻路'))
  assert.ok(h.includes('拥有法宝数量上限增加15个'))
  assert.ok(h.includes('自动炼制'))
  assert.ok(h.includes('>20普通仙石</TD>'))
})

test('三个立即生效项：2 / 10 / 3 仙石，时间列写「立即生效」，没有剩余时间行', () => {
  const h = renderPayment(vm())
  assert.equal((h.match(/>立即生效</g) ?? []).length, 3)
  assert.ok(h.includes('<TD>立即生效</TD><TD>2仙石</TD>'))
  assert.ok(h.includes('直接完成所有修炼事件'))
  assert.ok(h.includes('>3仙石</TD>'))
})

test('修炼减半 / 完成走 M2 确认框，文案是原版 DOM 原文', () => {
  const h = renderPayment(vm())
  assert.ok(h.includes('减半所有修炼事件剩余时间，需要花费2个仙石'))
  assert.ok(h.includes('直接完成所有修炼事件，需要花费10个仙石'))
  assert.ok(h.includes("ajaxPost(&#39;paycoin&#39;, &#39;pay=10&#39;);"))
  assert.ok(h.includes("ajaxPost(&#39;paycoin&#39;, &#39;pay=11&#39;);"))
})

test('自由分配丹田比例：链接文字是「开始分配」，打开五行互化浮窗', () => {
  const h = renderPayment(vm())
  assert.ok(h.includes('自由分配丹田中五种真气的比例'))
  assert.ok(h.includes('>开始分配</A>'))
  assert.ok(h.includes("openLWindow(&#39;&#39;, &#39;turnres.jsp&#39;)"))
})

test('已购项显示剩余时间行（右对齐），未购的是空行', () => {
  const h = renderPayment(vm())
  assert.ok(h.includes('<DIV align=right>还有11.82天，到14:10结束</DIV>'))
  assert.ok(h.includes('还有11.82天，到14:11结束'), '土那行到 14:11（比其它四行晚一分钟）')
  assert.ok(h.includes('还有5.81天，到14:03结束'))
  assert.ok(h.includes('+25%火真气吸收速度<DIV align=right>&nbsp;</DIV>'), '火没买，剩余时间是空行')
  assert.ok(h.includes('<TD align=right colSpan=2>&nbsp;</TD>'), 'VIP 套餐未买，末尾是整空行')
})

test('全部套餐都没有重复的 pay 编号，且避开已被移动事件占用的 8/9', () => {
  const pays = PAY_SECTIONS.flatMap((s) => s.items.map((i) => i.pay))
  assert.equal(new Set(pays).size, pays.length, 'pay 编号不应重复')
  assert.ok(!pays.includes(8) && !pays.includes(9), '8/9 是移动减半/完成，不在本页')
})

test('分节之间有 6px 空行（#9 实测的组间距）', () => {
  const h = renderPayment(vm())
  assert.equal((h.match(/class=paygap/g) ?? []).length, PAY_SECTIONS.length - 1)
})
