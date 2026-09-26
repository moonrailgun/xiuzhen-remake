import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderPlayer, type PlayerVm } from './player.ts'

const vm = (over: Partial<PlayerVm> = {}): PlayerVm => ({
  view: 'body',
  name: '晓风残月',
  element: '木',
  gender: 'm',
  school: '蜀山',
  realm: '炼气期',
  experience: [0, 100],
  silver: 0,
  meridianLevels: Array<number>(12).fill(0),
  bodyLevels: [0, 0, 0, 0, 0, 9, 0, 0],
  qiPerHour: [0, 0, 0, 0, 0],
  ...over,
})

test('本体视图：一张整图底图 + 8 个原位盖住烧图白盘的圆盘，不显示信息表', () => {
  const h = renderPlayer(vm())
  assert.ok(h.includes('src="img/pipe/bodym.gif" width=460 height=410'))
  assert.ok(!h.includes('bodylabel'), '标签、引线、光晕都在底图里，没有第二张图')
  assert.equal((h.match(/class="mnode bodynode"/g) ?? []).length, 8)
  // 04 §5.2：穷千里目圆心在图内 (228,46)；底图下移 21px；21px 圆盘左上角 = 圆心 − 10
  assert.ok(h.includes('style="left:218px;top:57px">0</A>'))
  assert.ok(h.includes('style="left:220px;top:209px">9</A>'), '丹田气海显示存档等级')
  assert.ok(!h.includes('class=playerinfo'), '04 §5.1：本体视图占满左栏，无人物信息表')
  assert.ok(renderPlayer(vm({ gender: 'f' })).includes('img/pipe/bodyf.gif'))
})

test('经脉视图仍带人物信息表和 12 个节点', () => {
  const h = renderPlayer(vm({ view: 'meridian' }))
  assert.ok(h.includes('class=playerinfo'))
  assert.equal((h.match(/class=mnode /g) ?? []).length, 12)
})

test('本体底图男女各一张 460×410，且不是同一文件', () => {
  // 曾经 bodym.gif 与 bodylabel.gif 是同一裁片（MD5 相同），页面把它压成 250×430 叠了两遍
  const png = (name: string) => readFileSync(new URL(`../../public/img/pipe/${name}`, import.meta.url))
  const dims = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)]
  const m = png('bodym.gif')
  const f = png('bodyf.gif')
  assert.deepEqual(dims(m), [460, 410])
  assert.deepEqual(dims(f), [460, 410])
  assert.ok(!m.equals(f))
})
