/**
 * 客户端入口。
 *
 * 默认进**真实游戏**（`app.ts`）：读档，没有存档就进建号页。
 * 带 `?demo=1` 时进阶段 1 的页面预览（用夹具数据逐字重现当年的截图，
 * 供 `tools/parity/shoot.mjs` 做叠图比对）。
 */

import { renderShell } from '../pages/shell.ts'
import { renderPlayer } from '../pages/player.ts'
import { renderMid, renderRight } from '../pages/sidebar.ts'
import { installGlobals, setPageResolver, startCountdowns } from './windows.ts'
import { renderDemoPage } from './demo.ts'
import { boot as bootGame } from './app.ts'
import { SHELL_2008, PLAYER_2008, MID_2008, RIGHT_2008, PLAYER_BODY_2010, MID_2010 } from './fixtures.ts'

function demoFixtures(params: URLSearchParams) {
  if (params.get('fixture') === '2010') {
    return {
      shell: {
        ...SHELL_2008,
        resources: {
          ...SHELL_2008.resources,
          capacity: 10000,
          current: [1469, 713, 271, 532, 0] as const,
          perHour: [0, 394, 96, 96, 0] as const,
        },
      },
      player: PLAYER_BODY_2010,
      mid: MID_2010,
      right: { ...RIGHT_2008, quests: [] },
    }
  }
  return { shell: SHELL_2008, player: PLAYER_2008, mid: MID_2008, right: RIGHT_2008 }
}

function bootDemo(params: URLSearchParams): void {
  installGlobals()
  setPageResolver((url) => `<DIV class=middle style="padding:12px">（${url} 尚未接入）</DIV>`)
  const app = document.getElementById('app')
  if (!app) return

  const f = demoFixtures(params)
  const demo = renderDemoPage(params, f.player)
  app.innerHTML = renderShell({
    ...f.shell,
    tab: demo.tab,
    left: demo.html,
    mid: renderMid(f.mid),
    right: renderRight(f.right),
  })
  startCountdowns(app)
}

function boot(): void {
  const params = new URLSearchParams(location.search)
  // 预览模式：有 demo 或 page 参数时走夹具渲染
  if (params.has('demo') || params.has('page')) {
    installGlobals()
    bootDemo(params)
    return
  }
  installGlobals()
  bootGame()
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
}
