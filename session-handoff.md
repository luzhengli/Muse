# Session Handoff

## Current Objective

- Goal: Muse v0.4「小白也能无脑推进的可信创作飞轮」（feat-022 → 023 → 新增并实现 024/025/026）。
- Current status: feat-022、feat-023 均已完成并分别提交；下一步在 feature_list.json 新增 feat-024（新手引导、首页与创建向导）并实现。
- Branch: `main`。

## Completed

- [x] feat-020：活动修订契约（检查点 + sourceVersionId + 过期标记）。
- [x] feat-021：可编辑创作 Brief（预览→确认、指纹防过期写入）。
- [x] feat-022：证据引用闭环——`evidence_citations`（key 身份/摘录/上下文快照/SET NULL 外键）、有效状态读取时纯函数计算、重清洗按摘录重定位、Tiptap citation mark + `[text](muse://cite/KEY)` Markdown 往返、资料面板搜索→预览→插入/关联、点击正文引用文字看「这句话有什么依据」、AI 事实检查四分类（缺少资料≠事实错误）。
- [x] feat-023：Readiness 与 NextAction——`lib/readiness.ts` 唯一状态计算（八类事实 + 纯函数缺口/NextAction + assertPublishable）、`articles.aligned_brief_fingerprint` 对齐事实、写作台 ReadinessStrip（状态/唯一主行动/阻塞原因/可跳过风险/待办直达/确认对齐）、发布创建与执行双重服务端拦截、删除手动状态入口。
- [ ] feat-024~026：待在 feature_list.json 新增后依序实现。

## Verification Evidence

| Check | Result | Notes |
|---|---|---|
| `bun test tests` | ✅ 103/103 | citations 15 + readiness 15 新增 |
| `bun run typecheck` | ✅ | |
| `bun run lint` | ✅ | 仅 Next 16 前迁移 ESLint CLI 的弃用提示 |
| `bun run build` | ✅ | |
| `npx @google/design.md lint DESIGN.md` | ✅ | 0 errors / 0 warnings |
| 浏览器 | ✅ | feat-023：NextAction 全流程（空文→critical→平台稿→就绪→过期→恢复）、发布创建/执行双重拦截并回显原因、Brief 对齐确认闭环、刷新与中断不丢输入、375 首屏可见唯一下一步；测试数据（文章 13/选题 19）已清理 |

## Architecture Decisions

- 引用有效状态不落库：读取时按「素材是否存在 + 当前语料块是否包含摘录（空白归一）」计算；素材/语料块外键 `ON DELETE SET NULL`，快照字段保证降级后仍可解释。
- 引用身份 = `evidence_citations.key`，正文 mark 与 Markdown 边界共用；重清洗时按摘录重定位（命中更新 chunk_id/快照，未命中只降级，绝不伪造关联）。
- 事实检查落在 reviews/review_findings（复用来源版本与过期机制），新增可空列 `evidence_state`；「缺少资料」severity 恒为 info，文案不得称为错误。
- `compatibilityMigrationSql` 扩签名（reviewFindings 列），旧库幂等补 `evidence_state` 与 `aligned_brief_fingerprint`。
- readiness 唯一来源是 `lib/readiness.ts` 事实计算；`articles.status` 仅存留供列表筛选，不参与任何决策，写作台不展示；对齐指纹 NULL（旧数据）不产生缺口，在下一次 Brief 编辑时回填编辑前指纹。
- 发布拦截在创建与执行两个入口都强制：拒绝创建用 redirect 查询参数回显；已排队任务执行前再校验，旧稿置 failed 并写明 lastError。

## Next Session Startup

1. 严格执行 `AGENTS.md` Startup Workflow，运行 `./init.sh`。
2. feat-024（新手引导、首页与创建向导）：先在 feature_list.json 新增条目、在 progress.md 写实现前契约（首次引导 ≤3 步可跳过、示例创作隔离、首页收敛为继续/新建+≤3 待处理、想法/资料/经验三入口、AI 选题预览-查重-确认不落垃圾记录、创作说明可跳过带默认值），再实现。
3. 首页「继续上次创作」与待处理项的下一步文案直接复用 `computeReadiness` 的 NextAction。
4. 每次仅一个 feature；测试+浏览器验证+文档+提交后才进入下一个。

## Risks / Notes

- 开发服务器不要与 `next build`/`./init.sh` 并行运行（共享 `.next` 会损坏）。
- Browser pane 自动化对右侧工作台面板的合成点击存在坐标偏差（工具限制）；验证时用完整 DOM 事件序列或真实指针。
- `data/`、`.env.local` 与构建产物不得提交。
