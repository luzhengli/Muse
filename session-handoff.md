# Session Handoff

## Current Objective

- Goal: Muse 创作工厂 MVP —— 已完成。
- Current status: 全部核心闭环可用（mock AI + mock 发布），验证全绿。
- Branch / commit: main，见 `git log --oneline -5`。

## Completed This Session

- [x] 从零搭建完整应用：脚手架、数据层、AI 层、8 个模块、12 个页面。
- [x] 端到端冒烟通过：素材→选题→初稿→审阅→包装→平台版本→发布→复盘→反哺选题。
- [x] DESIGN.md 填写并 lint 通过；harness 工件更新。

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| 类型检查 | `bun run typecheck` | ✅ | |
| Lint | `bun run lint` | ✅ | next lint 已被 Next 标记弃用，后续迁移 ESLint CLI |
| 构建 | `bun run build` | ✅ | Next.js 15.5.20，12 条路由 |
| 设计规范 | `npx @google/design.md lint DESIGN.md` | ✅ | 0 errors / 0 warnings |
| 端到端 | 浏览器冒烟（dev server） | ✅ | 完整闭环，mock 模式 |

## Decisions Made

- 运行时幂等建表（零配置启动）；schema 改动需同步 BOOTSTRAP_SQL。
- FTS5 中文子串检索：CJK 逐字空格分词 + 短语匹配（src/db/fts.ts）。
- AI 未配置密钥时确定性 mock 降级（src/lib/ai/mock.ts）。
- bunfig.toml 使用 npmmirror（本地代理下 npmjs 极慢；换环境可删）。

## Blockers / Risks

- 无阻塞。@radix-ui/* 依赖已安装但未使用（可清理）。

## Next Session Startup

1. `./init.sh`（应全绿）。
2. 读 `feature_list.json`：feat-006（真实平台发布适配器）或 feat-007（复盘数据 API / 图像生成）。
3. UI 改动前读 `DESIGN.md`（已是正式版，不再是占位符）。

## Recommended Next Step

- feat-006：为某一平台实现真实 `PublisherAdapter`（src/lib/publish/adapters.ts），发布任务/重试/状态跟踪无需改动。
