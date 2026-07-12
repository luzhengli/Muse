# Session Handoff

## Current Objective

- Goal: Muse v0.4「小白也能无脑推进的可信创作飞轮」（feat-022 → 023 → 新增并实现 024/025/026）。
- Current status: feat-022~026 全部完成，v0.4「可信创作飞轮」目标交付；最终验收（./init.sh + 三视口端到端）已通过。
- Branch: `main`。

## Completed

- [x] feat-020：活动修订契约（检查点 + sourceVersionId + 过期标记）。
- [x] feat-021：可编辑创作 Brief（预览→确认、指纹防过期写入）。
- [x] feat-022：证据引用闭环——`evidence_citations`（key 身份/摘录/上下文快照/SET NULL 外键）、有效状态读取时纯函数计算、重清洗按摘录重定位、Tiptap citation mark + `[text](muse://cite/KEY)` Markdown 往返、资料面板搜索→预览→插入/关联、点击正文引用文字看「这句话有什么依据」、AI 事实检查四分类（缺少资料≠事实错误）。
- [x] feat-023：Readiness 与 NextAction——`lib/readiness.ts` 唯一状态计算（八类事实 + 纯函数缺口/NextAction + assertPublishable）、`articles.aligned_brief_fingerprint` 对齐事实、写作台 ReadinessStrip（状态/唯一主行动/阻塞原因/可跳过风险/待办直达/确认对齐）、发布创建与执行双重服务端拦截、删除手动状态入口。
- [x] feat-024：首次引导（3 步可跳过、答案作默认、只读示例）、首页收敛（继续上次创作 + 新创作 + ≤3 待处理，均复用 computeReadiness）、/create 三入口向导（AI 候选预览-推荐-查重、确认才落库、创作说明 6 问全默认值）。
- [x] feat-025：创作驾驶舱——旅程步骤条（deriveJourneyStep + publishing 事实）、旧 review/packaging URL 重定向、NextAction 自动开面板、导航收敛（首页/创作/资料/发布记录/复盘经验/设置）、编辑器渐进披露 +「已保存」极简状态、AI 修改一键撤销、破坏性操作二次确认、界面术语清理（无检查点/工作稿/mock）。
- [x] feat-026：手动发布助手（平台稿页内复制/下载/粘贴链接标记已发布，服务端拦截旧稿）、发布记录只读化（mock 撤出普通流程）、复盘向导（自动带入上下文、五步、「观察/暂时支持」措辞）、Learning 溯源展示与「在新创作中复用」回流（convertedTopicId 延伸溯源）。

## Verification Evidence

| Check | Result | Notes |
|---|---|---|
| `bun test tests` | ✅ 123/123 | citations 15 + readiness 17 + create 9 + retro 10 等 |
| `bun run typecheck` | ✅ | |
| `bun run lint` | ✅ | 仅 Next 16 前迁移 ESLint CLI 的弃用提示 |
| `bun run build` | ✅ | |
| `npx @google/design.md lint DESIGN.md` | ✅ | 0 errors / 0 warnings |
| 浏览器 | ✅ | feat-026：发布助手复制/下载/标记已发布、首页下一步变「记录这次表现」、复盘向导五步→摘要→保存、溯源链自然语言展示、经验回流创建新创作（convertedTopicId 回写）；375/768/1280 无溢出、控制台 0 error；测试数据验后清理 |

## Architecture Decisions

- 引用有效状态不落库：读取时按「素材是否存在 + 当前语料块是否包含摘录（空白归一）」计算；素材/语料块外键 `ON DELETE SET NULL`，快照字段保证降级后仍可解释。
- 引用身份 = `evidence_citations.key`，正文 mark 与 Markdown 边界共用；重清洗时按摘录重定位（命中更新 chunk_id/快照，未命中只降级，绝不伪造关联）。
- 事实检查落在 reviews/review_findings（复用来源版本与过期机制），新增可空列 `evidence_state`；「缺少资料」severity 恒为 info，文案不得称为错误。
- `compatibilityMigrationSql` 扩签名（reviewFindings 列），旧库幂等补 `evidence_state` 与 `aligned_brief_fingerprint`。
- readiness 唯一来源是 `lib/readiness.ts` 事实计算；`articles.status` 仅存留供列表筛选，不参与任何决策，写作台不展示；对齐指纹 NULL（旧数据）不产生缺口，在下一次 Brief 编辑时回填编辑前指纹。
- 发布拦截在创建与执行两个入口都强制：拒绝创建用 redirect 查询参数回显；已排队任务执行前再校验，旧稿置 failed 并写明 lastError。

## Next Session Startup

1. 严格执行 `AGENTS.md` Startup Workflow，运行 `./init.sh`。
2. v0.4 已收官。后续候选方向（未开始）：feat-006 真实平台 API 适配器、feat-007 复盘数据 API/生图接入、next lint → ESLint CLI 迁移（Next 16 前）、暗色主题（设置中已预留偏好）。
3. 保持既有边界：不放宽 readiness、不引入假发布、密钥只走环境变量。

## Risks / Notes

- 开发服务器不要与 `next build`/`./init.sh` 并行运行（共享 `.next` 会损坏）。
- Browser pane 自动化对右侧工作台面板的合成点击存在坐标偏差（工具限制）；验证时用完整 DOM 事件序列或真实指针。
- `data/`、`.env.local` 与构建产物不得提交。
