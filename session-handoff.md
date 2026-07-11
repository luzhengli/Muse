# Session Handoff

## Current Objective

- Goal: Muse v0.3「可信创作闭环」。
- Current status: feat-020 Active Revision Contract、feat-021 Editable Creative Brief 已完成；按用户要求在 feat-022 正式开始前停止。
- Branch: `main`。feat-020 已提交；feat-021 应以本次会话末的描述性提交为准。

## Completed

- [x] feat-020：当前工作稿统一形成/复用不可变检查点；审阅、包装、平台稿绑定精确来源版本；旧产物保留并显示过期；旧库兼容迁移与版本契约测试。
- [x] feat-021：TopicBrief 增量加入目标、主张和逐要点证据；旧 JSON 自动补默认；选题板与写作台共用可编辑 Brief；AI Brief/初稿先预览再确认；初稿预览以 Brief 指纹防止过期写入。
- [ ] feat-022：Evidence and Citation Loop（not-started）。
- [ ] feat-023：Readiness Gate and Stale Derivatives（not-started）。

## Verification Evidence

| Check | Result | Notes |
|---|---|---|
| `bun test tests` | ✅ 73/73 | markdown 38 + settings 12 + briefs 6 + revisions 6 + drafts 11 |
| `bun run typecheck` | ✅ | |
| `bun run lint` | ✅ | 仅 Next 16 前迁移 ESLint CLI 的弃用提示 |
| `bun run build` | ✅ | 全路由构建通过 |
| `npx @google/design.md lint DESIGN.md` | ✅ | 0 errors / 0 warnings |
| 浏览器 | ✅ | feat-021 真实 AI 初稿确认、工作台 Brief 回显/保存不覆盖正文；375/768/1280 无溢出 |

## Architecture Decisions

- `articleVersions` 继续作为不可变内容快照，`articleDrafts` 作为可变工作稿，不引入第二套正文模型。
- `normalizeTopicBrief` 是 TopicBrief JSON 的唯一兼容边界；新增字段不要求破坏性数据库迁移。
- Brief 修改只更新 topic JSON，不自动覆盖正文；基于 Brief 的 AI 内容先返回预览，确认后才通过既有版本路径写入。
- 初稿预览携带规范化 Brief 指纹，确认时重新计算并拒绝过期预览。

## Next Session Startup

1. 严格执行 `AGENTS.md` Startup Workflow，并运行 `./init.sh`。
2. 读取 `progress.md` 的 feat-022 实现前契约；若尚未记录，先明确数据模型、状态转换、失败路径和兼容策略，再写代码。
3. 只实现 feat-022；通过单测、typecheck、lint、针对性浏览器验证并提交后，才能进入 feat-023。
4. 不改发布中心、复盘中心、真实平台 API；feat-006/007 保持 not-started。

## Risks / Notes

- 开发服务器不要与 `next build`/`./init.sh` 并行运行，避免共享 `.next`。
- 浏览器验收唯一控制台错误是开发环境缺失 `/favicon.ico` 的既有 404，非 feat-021 应用错误。
- `data/`、`.env.local` 与构建产物不得提交。
