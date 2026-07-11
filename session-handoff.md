# Session Handoff

## Current Objective

- Goal: Muse v0.4「小白也能无脑推进的可信创作飞轮」（feat-022 → 023 → 新增并实现 024/025/026）。
- Current status: feat-022 Evidence and Citation Loop 已完成；feat-023 Readiness Gate and Stale Derivatives 未开始。
- Branch: `main`。feat-022 以本次会话末的描述性提交为准。

## Completed

- [x] feat-020：活动修订契约（检查点 + sourceVersionId + 过期标记）。
- [x] feat-021：可编辑创作 Brief（预览→确认、指纹防过期写入）。
- [x] feat-022：证据引用闭环——`evidence_citations`（key 身份/摘录/上下文快照/SET NULL 外键）、有效状态读取时纯函数计算、重清洗按摘录重定位、Tiptap citation mark + `[text](muse://cite/KEY)` Markdown 往返、资料面板搜索→预览→插入/关联、点击正文引用文字看「这句话有什么依据」、AI 事实检查四分类（缺少资料≠事实错误）。
- [ ] feat-023：Readiness 与 NextAction（not-started）。
- [ ] feat-024~026：待在 feature_list.json 新增后依序实现。

## Verification Evidence

| Check | Result | Notes |
|---|---|---|
| `bun test tests` | ✅ 88/88 | 新增 tests/citations.test.ts 15 项 |
| `bun run typecheck` | ✅ | |
| `bun run lint` | ✅ | 仅 Next 16 前迁移 ESLint CLI 的弃用提示 |
| `bun run build` | ✅ | |
| `npx @google/design.md lint DESIGN.md` | ✅ | 0 errors / 0 warnings |
| 浏览器 | ✅ | 真实 DeepSeek 事实检查 supported/missing/unavailable；重清洗与删除降级；刷新持久；375/768/1280 无溢出；控制台 0 error；测试数据（文章 12/素材 8）已清理 |

## Architecture Decisions

- 引用有效状态不落库：读取时按「素材是否存在 + 当前语料块是否包含摘录（空白归一）」计算；素材/语料块外键 `ON DELETE SET NULL`，快照字段保证降级后仍可解释。
- 引用身份 = `evidence_citations.key`，正文 mark 与 Markdown 边界共用；重清洗时按摘录重定位（命中更新 chunk_id/快照，未命中只降级，绝不伪造关联）。
- 事实检查落在 reviews/review_findings（复用来源版本与过期机制），新增可空列 `evidence_state`；「缺少资料」severity 恒为 info，文案不得称为错误。
- `compatibilityMigrationSql` 扩签名（reviewFindings 列），旧库幂等补 `evidence_state`。

## Next Session Startup

1. 严格执行 `AGENTS.md` Startup Workflow，运行 `./init.sh`。
2. feat-023：先在 progress.md 写实现前契约（readiness 纯函数输入事实集合、NextAction 输出结构、服务端发布校验、URL/旧数据兼容、验收用例），再实现。
3. readiness 至少基于：正文安全保存、Brief 完整与变更后确认、重点观点有效证据（用 feat-022 的 citation validity）、未处理 critical、下游产物基于当前检查点。禁止依赖 `articles.status` 或“执行过某动作”。
4. 每次仅一个 feature；测试+浏览器验证+文档+提交后才进入下一个。

## Risks / Notes

- 开发服务器不要与 `next build`/`./init.sh` 并行运行（共享 `.next` 会损坏）。
- Browser pane 自动化对右侧工作台面板的合成点击存在坐标偏差（工具限制）；验证时用完整 DOM 事件序列或真实指针。
- `data/`、`.env.local` 与构建产物不得提交。
