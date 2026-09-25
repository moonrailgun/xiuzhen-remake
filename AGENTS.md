# AGENTS.md

本文件适用于整个仓库。与用户本次明确要求冲突时，以用户要求为准。

## 项目定位

- 这是 2008 年网页游戏《修真》的本地单机怀旧复刻，重视原版证据、界面保真和长期存档兼容。
- 规则基准为 **2009-03-24 维护后、2009-06-30「仙府开光」之前**；界面骨架采用 2009-02 原版 DOM，外观优先参考 2008-10/12 的原生截图。
- 保持纯静态前端：TypeScript + Vite，无运行时依赖。沿用现有实现，不主动引入前端框架、后端、数据库或新的依赖。
- 仅供个人本地怀旧使用，不公开发布仓库或部署游戏，不接入真实付费，不将归档中的个人联系方式带入游戏。

## 开始工作

- 先检查 `git status --short --branch`，保留已有修改和未跟踪文件；只修改当前任务需要的内容。
- 先读 `README.md`、`docs/PROGRESS.md`；按任务查阅以下资料，避免全量扫描庞大的 `reference/`：
  - 规则与版本：`docs/spec/DECISIONS.md`、`docs/spec/DECISIONS-rules.md`。
  - 界面与页面证据：`docs/spec/DECISIONS-ui.md`、`docs/spec/PAGE-INDEX.md`。
  - 推断与重建：`docs/UNCERTAIN.md`；完整设计背景：`docs/PLAN.md`。
- 历史计划可能包含尚未更新的状态或设想。实现现状以代码和本次验证为准；原版事实回到原始证据核对，冲突裁决记录在 `docs/spec/`。
- `reference/` 是原始证据归档，`docs/research/` 是研究底稿；普通开发不改写它们。修正结论写入决策记录，并引用出处。

## 目录与职责

| 路径 | 职责 |
| --- | --- |
| `src/engine/` | 纯游戏规则、状态、时钟、事件、存档；不依赖 DOM 或浏览器存储全局对象 |
| `src/data/` | 数值表与文案，保留出处及重建说明 |
| `src/pages/` | 页面与浮窗的 HTML 字符串渲染，沿用原版路由、DOM、class/id 和图片名 |
| `src/client/` | `app.ts` 连接动作与引擎，`vm.ts` 投影视图数据，`windows.ts` 管理浮窗与倒计时 |
| `public/css/oui.css`、`public/img/` | 原版风格样式与静态素材 |
| `tools/assets/` | 素材清单与生成、裁切、检查脚本 |
| `tools/parity/` | Playwright 试玩、回归、冒烟与截图对齐 |
| `tools/fixtures/` | 从原始资料解析的回归数据 |

## 实现约定

- 先追踪真实调用链和同一函数的其他调用者，再修改共享逻辑；优先复用已有规则、数据表和工具函数，不为单个需求增加通用框架。
- 使用 Node.js 24 和 npm，沿用 `package-lock.json`。相对 TypeScript 导入带 `.ts`，类型导入用 `import type`；遵守现有严格类型检查，不用 `enum`、运行时 `namespace` 或构造函数参数属性。
- `engine`、`data`、`pages` 必须可直接由 Node 测试，不引入 Vite 专属导入或路径别名。
- 数值与规则区分原文、截图、推断和重建。`source` 指向真实存在的出处；无证据的内容标注 `reconstructed` 并说明原因，不把补写内容当作原文。
- 调整数值、推断或重建范围时，同步更新 `docs/UNCERTAIN.md` 和相关决策；功能进度变化时更新 `docs/PROGRESS.md`。不要复制过期的测试数量或通过结论。
- 保留定宽 1000px、左对齐的怀旧布局和现有浮窗体系。未经要求不做现代化 UI 改版；界面争议先查证据和既有裁决。
- 动态 HTML 复用 `src/pages/html.ts`：正文和普通属性用 `esc()`，内联事件中的 JS 字符串用 `js()`，URL 参数用 `encodeURIComponent()`。嵌套上下文逐层转义，不能只转义其中一层；导入存档中的文本也视为不可信输入。

## 时间与存档

- 游戏规则使用 `src/engine/clock.ts` 的游戏时间；墙钟由客户端传入。在线、离线和倍速共用 `tick` 与事件时间线，不另写逐秒模拟或离线专用规则。
- 影响游戏结果的随机数复用 `src/engine/rng.ts`，保持种子、序列状态和重放一致性，不随意改用 `Math.random()`。
- 存档结构变更须维护 `src/engine/save.ts` 的版本、`src/engine/game.ts` 的迁移链和状态校验，并验证旧档迁移及导入导出；不得通过清空存档解决兼容问题。
- 保留主档/备份、写入失败提示、导入确认及多标签页保护。验证资源、背包或 GM 修改时，检查拒绝操作是否留下部分扣费或数据丢失。
- 开发与预览固定为 `http://localhost:5273`，保留 `--strictPort`。localStorage 按 origin 隔离，随意更换主机名或端口会看不到原来的存档。
- 浏览器回归使用独立 Playwright 上下文，不清理或覆盖用户正在玩的存档。

## 开发与验证

```bash
npm ci                         # 按锁文件安装依赖
npm run dev                    # 开发服务，固定端口 5273
npm run check                  # 类型检查 + 全部 Node 单元测试
node --test src/engine/save.test.ts  # 示例：针对单个模块验证
npm run build                  # 生产构建
npm run play                   # 预览已构建产物，不能与 dev 同时占用 5273
```

浏览器检查需先启动开发服务，并确保 Playwright Chromium 可用：

```bash
npm run playtest                # 端到端试玩
npm run regression              # 正式入口：任务、存档、经济、战斗、GM、XSS
npm run smoke                   # 全页面冒烟
npm run parity                  # 与原版截图参考框进行区块几何对齐
```

- 代码变更补充与风险相称的 `node:test` / `node:assert/strict` 检查，优先在已有相邻 `*.test.ts` 中覆盖回归；完成后运行 `npm run check` 和 `npm run build`。
- 涉及交互或跨层行为时运行对应浏览器回归；涉及界面、CSS 或素材时运行 `smoke`、`parity`，并实际查看相关页面截图。`parity` 通过只证明所检查的区块几何，不能代替整体视觉检查。
- 正式入口默认读取真实游戏状态；`?demo=1` 或带 `page` 参数走夹具预览。夹具截图不能证明真实存档和操作链路正确。
- 截图验证遵守 `tools/parity/manifest.json`：固定 `deviceScaleFactor=1`，原生图才做 ±2px 对齐，缩放图只比较区块比例，并排除水印和基准期外内容。截图输出位于 `tools/parity/shots/`，不提交临时产物。
- 纯文档修改核对路径、命令和 `git diff --check` 即可，无需跑游戏全套测试。交付时说明实际执行的检查及未验证部分，不把旧记录当成本次结果。

## 协作与 Git

- 默认用中文沟通，结论简洁，说明具体改动和验证结果。
- 除非用户明确说明希望操控其电脑，否则不要使用 Computer Use；优先使用源码、命令行和独立测试浏览器。
- 不擅自提交、推送、创建 PR 或发布；需要执行这些操作时，以当前会话授权为准，不把历史计划中的授权当作本次授权。
- 创建 PR 时，标题使用 Angular / Conventional Commits 格式：`<type>(<scope>): <summary>`。type 使用小写，如 `fix`、`feat`、`chore`、`refactor`、`test`、`docs`、`build`、`ci`、`perf`、`revert`；scope 明确时使用简短小写名称；summary 简短、祈使语气、末尾无句号。
- PR 标题示例：`fix(save): preserve backup during import`。**除非用户明确要求，不添加 PR body。**
