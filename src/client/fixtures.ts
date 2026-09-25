/**
 * 夹具数据：逐字抄自当年的截图。
 *
 * 为什么不用引擎算（`docs/spec/DECISIONS.md` §3.4）：截图上的产量、升级消耗、剩余时间
 * 都是原版引擎用**原版数值表**算出来的，而我们的逐级表是重建的，算不出同样的数。
 * 阶段 1 的目标是把界面做到能和截图叠图，所以先用夹具把数字钉死；
 * 阶段 2 再写 `vm(state, …)` 选择器，用真实存档驱动同一套 render。
 */

import type { ShellVm } from '../pages/shell.ts'
import type { PlayerVm } from '../pages/player.ts'
import type { MidVm, RightVm } from '../pages/sidebar.ts'

/**
 * 截图 #2 `17173-live/20081225104603605_all/xiuzhen801.jpg`（1051×588，2008-12，原生 1:1）
 * 角色「173小鱼」，木属性、通天、筑基期。
 */
export const SHELL_2008: ShellVm = {
  tab: 'player',
  resources: {
    current: [1132, 1364, 2164, 2071, 1401],
    capacity: 2900,
    // 木属性 → 金克木 → 金为「五行一缺」，恒 0
    perHour: [0, 59, 59, 59, 59],
    coin: 0,
    bonusCoin: 73,
  },
  serverTime: '16:47:58',
  version: '版本号:1.2.1-yyge',
  left: '',
  mid: '',
  right: '',
}

export const PLAYER_2008: PlayerVm = {
  view: 'meridian',
  name: '173小鱼',
  element: '木',
  gender: 'f',
  school: '通天',
  realm: '筑基期',
  experience: [0, 345600],
  silver: 0,
  // 截图上 12 个节点全是 2 级
  meridianLevels: Array(12).fill(2),
  bodyLevels: Array(8).fill(0),
  qiPerHour: [0, 59, 59, 59, 59],
}

export const MID_2008: MidVm = {
  battle: [{ icon: 'event/sword.gif', text: '1 返回', seconds: 56 }],
  craft: [{ icon: 'event/mark.gif', text: '炼制丹药 × 1', seconds: 11 * 3600 + 2 * 60 + 8 }],
  move: [],
  cultivate: [
    { icon: 'event/mark.gif', text: '百炼之法 Lv1', seconds: 16 * 60 + 27, speedup: true },
  ],
  npcs: [],
  players: [
    { name: '．•●葬', suffix: 'n', avatar: 'tongtianf' },
    { name: '擎天渌流', suffix: 'n', avatar: 'shushanf' },
    { name: '举头望明月', suffix: 'n', avatar: 'kunlunm' },
  ],
}

export const RIGHT_2008: RightVm = {
  quests: [
    { id: '1', title: '《百妖记》第一回 (1/100)', detail: '目标地点：(154,102)' },
    { id: '2', title: '初涉炼剑 － 无锤百炼' },
  ],
  guardingMe: 0,
  guardingOthers: 0,
  guardCap: 7,
}

/**
 * 截图 #114 `17173-live/20100811104141572/z0811xz01.jpg`（755×564，2010-08）
 * 本体视图 + 多段移动事件。用来验证本体视图与移动事件的渲染。
 */
export const PLAYER_BODY_2010: PlayerVm = {
  ...PLAYER_2008,
  view: 'body',
  name: '',
  bodyLevels: [0, 0, 0, 0, 1, 9, 0, 0], // 固本培元 1、丹田气海 9，其余 0
  qiPerHour: [0, 394, 96, 96, 0],
}

export const MID_2010: MidVm = {
  battle: [],
  craft: [{ icon: 'event/mark.gif', text: '炼制丹药 × 1', seconds: 20 * 3600 + 25 * 60 + 21 }],
  move: [
    {
      icon: 'event/move.gif',
      text: '(120, 35)',
      seconds: 3 * 3600 + 18 * 60 + 19,
      cancelId: 'move1',
      nextLeg: { text: '下个目标(130,35)', seconds: 28 * 60 + 19 },
    },
  ],
  cultivate: [{ icon: 'event/mark.gif', text: '足厥阴肝经 Lv4', seconds: 4 * 60 + 17, speedup: true }],
  npcs: [],
  players: [],
}
