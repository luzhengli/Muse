# Session Handoff

## Current Objective

- Goal: Muse v0.2「沉浸式写作与本地配置」—— 已完成（feat-017 / 018 / 019 全部 done）。
- Current status: 响应式 app shell、沉浸式 Markdown 编辑器、设置中心全部交付并验证。
- Branch / commit: main，见 `git log --oneline -5`（三个 feature 各一个独立 commit）。

## Completed This Session

- [x] feat-017：窄屏顶栏+抽屉导航、工作台响应式双栏/堆叠、全站栅格断点；375/768/1280 真实浏览器验证；reduced-motion 用 Playwright emulateMedia 实测降级与恢复。
- [x] feat-018：Markdown 双向转换层（可测试、未知节点不丢内容）、lowlight 代码块+语言选择、KaTeX 公式、表格/任务列表/链接、Bubble Menu（含 AI 改写选区 mapping 保护）、/ 插入菜单、自动保存（article_drafts 与版本检查点分离）+ 刷新恢复、专注模式、字数/保存状态。
- [x] feat-019：/settings 四区块（编辑器/AI/外观/数据）、app_settings KV + zod 校验默认兼容、配置优先级 设置>环境变量>默认、密钥仅环境变量+脱敏展示、连接测试、mock 兜底开关、动效偏好 data-motion、JSON 全量导出。

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| 单元测试 | `bun test tests` | ✅ 61/61 | markdown 39 + drafts 10 + settings 12 |
| 类型检查 | `bun run typecheck` | ✅ | |
| Lint | `bun run lint` | ✅ 0 警告 | next lint 弃用提示仍在（Next 16 前迁移） |
| 构建 | `bun run build` | ✅ | 含 /settings、/api/export 新路由 |
| 设计规范 | `npx @google/design.md lint DESIGN.md` | ✅ 0 errors | 已补编辑器/抽屉/设置相关规范 |
| 浏览器 | dev server 冒烟 | ✅ | 证据逐条见 feature_list.json 与 progress.md |

## Decisions Made

- Markdown 边界自研序列化器（Tiptap JSON→MD）+ markdown-it 解析；未知节点降级为文本并上报，绝不静默丢内容。
- 工作稿（article_drafts）与不可变版本检查点分离；恢复规则 resolveInitialContent 纯函数可测。
- 公式：KaTeX + 自研极薄 atom 节点；MD 表达 $..$ / $$..$$。
- 设置存储：app_settings 单行 JSON + zod（.catch 字段级回退）；优先级 设置 > 环境变量 > 默认；密钥永不落库。
- 测试与运行时 SQLite ABI 冲突（bun test vs Node better-sqlite3）→ 核心库函数显式传 db，测试用 bun:sqlite 内存库 + 共享 BOOTSTRAP_SQL。
- 教训：`./init.sh`（next build）不能与运行中的 dev server 并存（共写 .next 会损坏 webpack runtime）；先停 dev server 再跑完整验证。

## Blockers / Risks

- 无阻塞。已知限制：真实中文 IME 组字仅能以 composition 事件序列模拟（建议真机补一次手动冒烟）；暗色主题未实现（设置仅持久化策略并明示）；.env.local 含真实 DeepSeek key，已被 .gitignore 覆盖，勿提交。

## Next Session Startup

1. `./init.sh`（应全绿；如有 dev server 先停）。
2. 读 `feature_list.json`：剩余 not-started 为 feat-006（真实平台发布器）、feat-007（复盘数据 API / AI 生图）。
3. UI 改动前读 `DESIGN.md`（已含编辑器与设置中心规范）。

## Recommended Next Step

- feat-006：实现某一平台真实 `PublisherAdapter`（src/lib/publish/adapters.ts）；或为编辑器补真机 IME 手动冒烟记录。
