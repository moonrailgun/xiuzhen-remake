/**
 * 客户端入口。
 *
 * 阶段 1 的目标是把**界面**做出来并能和当年的截图叠图比对，所以这里先用
 * 「夹具 vm」——逐字抄截图上的数字。真正的 `vm(state,…)` 选择器在阶段 2 接上。
 * 这么分的原因见 `docs/spec/DECISIONS.md` §3.4：截图里的产量、消耗都是原版引擎
 * 用原版数值表算出来的，我们重建的表算不出同样的数；先对齐界面，再接引擎。
 */

import { renderShell, type ShellVm } from '../pages/shell.ts'
import { installGlobals, setPageResolver, startCountdowns } from './windows.ts'

/** 截图 #2（xiuzhen801.jpg，2008-12，1051×588）上的角色「173小鱼」。 */
const FIXTURE_MAIN: ShellVm = {
  tab: 'player',
  resources: {
    current: [1132, 1364, 2164, 2071, 1401],
    capacity: 2900,
    perHour: [0, 59, 59, 59, 59], // 木属性 → 金为 0（五行一缺）
    coin: 0,
    bonusCoin: 73,
  },
  serverTime: '16:47:58',
  version: '版本号:1.2.1-yyge',
  left: '',
  mid: '',
  right: '',
}

function boot(): void {
  installGlobals()
  setPageResolver((url) => `<div class="middle">（${url} 尚未接入）</div>`)

  const app = document.getElementById('app')
  if (!app) return
  app.innerHTML = renderShell(FIXTURE_MAIN)
  startCountdowns(app)
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
}
