/**
 * 客户端入口。
 *
 * 阶段 1 的目标是把**界面**做出来并能和当年的截图叠图比对，所以这里用「夹具 vm」——
 * 逐字抄截图上的数字（见 `fixtures.ts` 顶部的说明）。真正的 `vm(state,…)` 选择器在阶段 2 接上。
 *
 * 开发期可以用 `?fixture=2010` 切到 2010-08 那张截图的场景（本体视图 + 多段移动事件）。
 */

import { renderShell } from '../pages/shell.ts'
import { renderPlayer } from '../pages/player.ts'
import { renderMid, renderRight } from '../pages/sidebar.ts'
import { installGlobals, setPageResolver, startCountdowns } from './windows.ts'
import {
  SHELL_2008,
  PLAYER_2008,
  MID_2008,
  RIGHT_2008,
  PLAYER_BODY_2010,
  MID_2010,
} from './fixtures.ts'

function pick() {
  const which = new URLSearchParams(location.search).get('fixture')
  if (which === '2010') {
    return {
      shell: { ...SHELL_2008, resources: { ...SHELL_2008.resources, capacity: 10000, current: [1469, 713, 271, 532, 0] as const, perHour: [0, 394, 96, 96, 0] as const } },
      player: PLAYER_BODY_2010,
      mid: MID_2010,
      right: { ...RIGHT_2008, quests: [] },
    }
  }
  return { shell: SHELL_2008, player: PLAYER_2008, mid: MID_2008, right: RIGHT_2008 }
}

function boot(): void {
  installGlobals()
  setPageResolver((url) => `<DIV class=middle style="padding:12px">（${url} 尚未接入）</DIV>`)

  const app = document.getElementById('app')
  if (!app) return

  const f = pick()
  app.innerHTML = renderShell({
    ...f.shell,
    left: renderPlayer(f.player),
    mid: renderMid(f.mid),
    right: renderRight(f.right),
  })
  startCountdowns(app)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
}
