import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderMsgDetail, BATTLE_INTRO, type MsgDetailVm, type BattleSide } from './msgdetail.ts'

const sword = (over: Partial<BattleSide['swords'][number]> = {}) => ({
  ownerId: 73,
  owner: 'Su太上忘情',
  name: '凡品墨叶血浪剑+6',
  itemId: 50102,
  refine: 6,
  attack: 2428,
  endurance: 1203,
  damage: 1203,
  result: '惨被斩断' as const,
  ...over,
})

const vm = (over: Partial<MsgDetailVm> = {}): MsgDetailVm => ({
  id: 39000,
  subject: '秦羽攻击无@痕',
  sender: '系统',
  avatar: null,
  sentAt: '2009-04-19 15:03:32',
  body: { kind: 'battle', sides: [{ title: '攻击方', swords: [sword()] }] },
  ...over,
})

test('外壳三行表头：主题 / 发信人 / 发信时间', () => {
  const h = renderMsgDetail(vm())
  assert.ok(h.includes('<TD class="titlebg bigbold" width=100>主题</TD>'))
  assert.ok(h.includes('<TD class="titlebg big" width=260>秦羽攻击无@痕</TD>'))
  assert.ok(h.includes('>发信人</TD><TD class=small>系统</TD>'))
  assert.ok(h.includes('>发信时间</TD><TD class=small>2009-04-19 15:03:32</TD>'))
  assert.ok(h.includes('<DIV id=msgcontent>'))
})

test('基准期的系统信没有头像格，也没有「回复」钮', () => {
  const h = renderMsgDetail(vm())
  assert.ok(!h.includes('img/avatar/'), '系统信在 2008-12~2009-09 的样本里整格不存在')
  assert.ok(!h.includes('value=回复'))
  assert.ok(h.includes('value=删除'))
  assert.ok(h.includes('value=关闭'))
  assert.ok(h.includes("postForm('removemsg', 'ids=1,39000')"))
})

test('玩家来信有头像格与「回复」钮，回复走 writemsg.jsp?remsg=', () => {
  const h = renderMsgDetail(vm({ sender: '晓风残月', avatar: 'tongtianf', subject: 'Re:你也真可怜' }))
  assert.ok(h.includes('<TD vAlign=center width=100 rowSpan=5><IMG src="img/avatar/tongtianf.gif"></TD>'))
  assert.ok(h.includes("writemsg.jsp?remsg=39000"))
})

test('战报开场白一字不差（含两个全角空格缩进）', () => {
  const h = renderMsgDetail(vm())
  assert.equal(
    BATTLE_INTRO,
    '　　双方的法宝交缠在一起拼斗，破空锐气四散激射，流光四逸。法宝相互绞杀良久，终于分出结果来了！',
  )
  assert.ok(h.includes(BATTLE_INTRO))
})

test('战报表：440 宽四列、每把剑两行、结果格 rowSpan=2', () => {
  const h = renderMsgDetail(vm())
  assert.ok(h.includes('<TABLE class=tablebg cellSpacing=1 cellPadding=3 width=440 align=center border=0>'))
  assert.ok(h.includes('<TD class="titlebg middlebold" align=middle colSpan=4>攻击方</TD>'))
  assert.ok(h.includes('<TR class="trbg2 middle" align=middle><TD width="25%">攻击</TD><TD width="25%">耐久</TD><TD width="25%">受到伤害</TD><TD width="25%">结果</TD></TR>'))
  assert.ok(h.includes('来自<A onclick="openLWindow(\'\', \'playerinfo.jsp?playerid=73\')" href="#">Su太上忘情</A>的'))
  assert.ok(h.includes("itemmid.jsp?item=50102&quality=6"))
  // 结果格照原版：rowSpan=2，且文字后带一个空格
  assert.ok(h.includes('<TD rowSpan=2>惨被斩断 </TD>'))
  assert.ok(h.includes('<TR class="trbg small" align=middle><TD>2428</TD><TD>1203</TD><TD>1203</TD></TR>'))
})

test('结果只有「完好无损」「惨被斩断」两种', () => {
  const h = renderMsgDetail(
    vm({ body: { kind: 'battle', sides: [{ title: '防御方', swords: [sword({ result: '完好无损', damage: 0 })] }] } }),
  )
  assert.ok(h.includes('<TD rowSpan=2>完好无损 </TD>'))
  assert.ok(h.includes('防御方'))
})

test('半表：己方剑被斩断时战报不显示对方的剑', () => {
  const h = renderMsgDetail(vm())
  assert.ok(h.includes('攻击方'))
  assert.ok(!h.includes('防御方'), '官方客服原文：飞剑被斩断时战报里不显示对方的飞剑')
})

test('九宫飞星：定位句 + 丹田五行真气 + 固本培元等级', () => {
  const h = renderMsgDetail(
    vm({
      subject: '仙缘005推算晓风残月',
      body: {
        kind: 'spy-locate',
        target: '晓风残月',
        at: [80, 126],
        qi: [39023, 14031, 35856, 30900, 8194],
        rootLevel: 16,
      },
    }),
  )
  assert.ok(h.includes('你掐指一算，发现晓风残月正位于(80,126)。'))
  assert.ok(h.includes('晓风残月丹田中的真气情况'))
  assert.ok(h.includes('<TD>39023</TD>'))
  assert.ok(h.includes('<TD>8194</TD>'))
  assert.ok(h.includes('晓风残月的本体拥有固本培元Lv.16'))
})

test('太乙神数：「{玩家}拥有的法宝」四列表，类型带方头括号', () => {
  const h = renderMsgDetail(
    vm({
      body: {
        kind: 'spy-items',
        target: '昨夜',
        items: [
          { name: '二十炼五行丹', itemId: 620, refine: 0, type: '丹药', count: 52, status: '空闲' },
          { name: '凡品墨叶血浪剑+6', itemId: 50102, refine: 6, type: '飞剑', count: 1, status: '空闲' },
        ],
      },
    }),
  )
  assert.ok(h.includes('<TD class="titlebg middlebold" align=middle colSpan=4>昨夜拥有的法宝</TD>'))
  assert.ok(h.includes('<TD width="40%">名称</TD><TD width="20%">类型</TD><TD width="15%">数量</TD><TD width="25%">状态</TD>'))
  assert.ok(h.includes('<TD>【丹药】</TD>'))
  assert.ok(h.includes('<TD>【飞剑】</TD>'))
  assert.ok(h.includes('<TD>52</TD>'))
  assert.ok(h.includes('空闲'))
})

test('太乙神数低等级版没有「状态」列', () => {
  const h = renderMsgDetail(
    vm({
      body: {
        kind: 'spy-items',
        target: '昨夜',
        items: [{ name: '凡品玉虚桃木剑', itemId: 50002, refine: 0, type: '飞剑', count: 1 }],
      },
    }),
  )
  assert.ok(h.includes('colSpan=3>昨夜拥有的法宝'))
  assert.ok(!h.includes('>状态</TD>'))
})

test('紫微斗数：「{目标}的经脉修炼情况」，12 正经、每组只在第一条标属性', () => {
  const h = renderMsgDetail(
    vm({
      body: {
        kind: 'spy-meridian',
        target: '晓风残月',
        // 样本 A：手三阴=火 → 本命属性为火
        element: '火',
        levels: [14, 14, 14, 13, 13, 14, 13, 13, 13, 13, 13, 13],
      },
    }),
  )
  assert.ok(h.includes('晓风残月的经脉修炼情况'))
  // 原文的出场顺序：手三阴 → 足三阴 → 足三阳 → 手三阳
  const order = ['手太阴肺经', '手厥阴心包经', '手少阴心经', '足太阴脾经', '足阳明胃经', '手阳明大肠经']
  let at = -1
  for (const name of order) {
    const i = h.indexOf(name)
    assert.ok(i > at, `${name} 的出场顺序不对`)
    at = i
  }
  // Lv.13 = 200 倍、Lv.14 = 270 倍 [原文]
  assert.ok(h.includes('<TD>Lv.14</TD><TD>火</TD><TD>270倍</TD>'), '手三阴 = 本命，火')
  assert.ok(h.includes('<TD>Lv.13</TD><TD>金</TD><TD>200倍</TD>'), '足三阴 = 我克，火克金')
  assert.ok(h.includes('<TD>Lv.13</TD><TD>土</TD><TD>200倍</TD>'), '足三阳 = 我生，火生土')
  assert.ok(h.includes('<TD>Lv.13</TD><TD>木</TD><TD>200倍</TD>'), '手三阳 = 生我，木生火')
  assert.ok(!h.includes('<TD>水</TD>'), '火属性缺水 —— 克我的那一行不出现')
})

test('法宝名进内联 onclick 时做了 JS + HTML 两层转义', () => {
  const h = renderMsgDetail(
    vm({
      body: {
        kind: 'spy-items',
        target: 'x',
        items: [{ name: "剑'名", itemId: 1, refine: 0, type: '飞剑', count: 1 }],
      },
    }),
  )
  assert.ok(h.includes("openRWindow('剑\\&#39;名'"), '单引号先转 JS 再转 HTML 属性')
})
