# Session Progress Log

## Current State

**Last Updated:** 2026-07-11
**Session ID:** motion-transition-polish-01
**Active Feature:** feat-017 进行中（全站动效与页面过渡）

## Status

### Current Work（本轮 feat-017）

- [x] **动效方向写入设计系统**：`DESIGN.md` 新增 fast/normal/slow 时长与统一 ease-out 曲线；动效只使用 opacity/transform，保持 Muse「安静的工作室」而不是高调动画站。
- [x] **页面切换连续性**：根布局增加全站顶部细进度线；导航开始时旧工作区用 120ms、4px 轻微上移淡出，App Router `template.tsx` 在新页面挂载时执行 220ms 上移淡入接棒；普通链接、前进/后退、AI 成功跳转和列表筛选的程序化导航统一即时启动进度反馈，12 秒安全收尾防止异常导航留下常驻进度条。
- [x] **基础交互反馈**：Button、侧栏、文章 tabs、筛选视图、素材导入 tabs、编辑器工具栏与工作台 tabs 增加 120~150ms 按压缩放和精确属性过渡。
- [x] **AI pending 动效**：全部通用 AI Action 和工作台改写/审阅/润色/包装按钮使用闪光图标与伪元素流光；空闲态和 pending 态同槽交叉淡入，按钮宽度不跳动。
- [x] **AI 结果过渡**：success/warning/danger 提示增加对应图标、soft 背景与 180ms 弹入；新审阅记录、润色预览、包装结果使用同一结果 reveal。
- [x] **可访问性与性能**：AI 按钮维持 `aria-busy` / 动态 accessible name；`prefers-reduced-motion` 关闭页面、面板、反馈、流光和循环图标动画；未引入动画依赖。

### Verification（feat-017）

- [x] `bun run typecheck`
- [x] `bun run lint`（0 warnings / errors）
- [x] `bun run build`
- [x] `npx @google/design.md lint DESIGN.md`（0 errors / 0 warnings）
- [ ] 真实页面视觉节奏：当前 in-app Browser 安全策略拒绝 localhost，未绕过策略；需要在可访问本地页面的环境确认桌面、375px 与 reduced-motion 实际帧序列。

### Remaining Risk（feat-017）

- 动效实现与生产构建已验证，但“是否足够丝滑”是渲染层与主观节奏问题。在完成真实页面观察前，feat-017 保持 `in-progress`。

### What's Done（本轮 feat-016）

- [x] **AI 入口与调用链审计**：覆盖素材清洗、集合/选题生成、Brief、初稿、编辑器扩写/改写/重组、AI 审阅、按建议润色、包装物料、平台版本、复盘反哺；确认纯 Server Action 表单无 pending、已有工作台入口无异常处理、写库型生成操作存在并发重复窗口。
- [x] **统一即时反馈**：新增 `AiActionButton` / `AiActionForm` / `AiActionFeedback`，topics、variants、素材清洗/集合、旧审阅/包装页、复盘入口均原位显示处理中状态并禁用；工作台改写、审阅、润色、包装增加精确动作文案和 success/warning/danger 反馈，编辑器不被全局锁定。
- [x] **AI 结果状态与超时**：`src/lib/ai/index.ts` 全部真实调用统一返回 `AiResult<T>`；默认 30 秒超时（`MUSE_AI_TIMEOUT_MS` 可设 1~120 秒）；区分 real success、未配置 mock、超时 mock、provider error mock。
- [x] **日志与溯源**：服务端结构化日志记录 action/provider/model/status/reason/durationMs/errorName/errorMessage，不记录 prompt 或密钥；初稿版本备注和 AI 审阅摘要持久化真实 AI / 本地 mock / 超时或失败兜底来源。
- [x] **防重复写库**：写库型 AI Server Action 使用进程全局同键 Promise 互斥；生成初稿额外复用同选题已有文章；前端 handler 使用同步 ref 重入锁。浏览器对 X 平台派生按钮双击只产生 1 条版本记录。
- [x] **同步 IO 收敛**：素材/图片上传、资源读取、stat、删除改用 `node:fs/promises`；数据库模块初始化的同步 mkdir 保留，避免为模块加载边界扩大架构改造。
- [x] **Bun 原生依赖基线修复**：将 `better-sqlite3`、`sharp`、`esbuild` 加入 Bun trustedDependencies，恢复 `better-sqlite3` binding，使标准 build 可重复运行。

### Verification（feat-016）

- [x] `./init.sh`（完整标准验证通过）
- [x] `bun run typecheck`
- [x] `bun run lint`（0 warnings / errors；保留 Next 16 前迁移 ESLint CLI 的既有提示）
- [x] `bun run build`
- [x] `npx @google/design.md lint DESIGN.md`（0 errors / 0 warnings）
- [x] 浏览器：Brief/审阅/润色/包装/平台派生的 mock 来源提示可见；初稿跳转正常；工作台 AI 长操作不锁编辑器；双击平台派生只生成 1 条记录；测试数据已清理。
- [x] 服务端：实测日志包含 `action/provider/model/status/reason/durationMs`。

### Decisions / Remaining Risks（feat-016）

- **不引入后台队列**：本地单用户 MVP 继续使用 Server Action，请求最长占用到 AI 超时；局部 pending 让页面保持可交互。若未来部署多实例或任务超过 2 分钟，再引入持久任务表与轮询。
- **互斥范围**：当前进程全局 Map 能覆盖本地单实例与 HMR 模块重载，不是跨进程分布式锁；多实例部署需数据库唯一键或幂等任务表。
- **真实 provider 失败路径**：本工作树未配置密钥，浏览器验证覆盖未配置 mock 分支；真实 success/provider-error/timeout 分支由统一类型、AbortController、构建检查覆盖，仍建议在带密钥环境做一次超时与错误注入冒烟。
- **既有窄屏限制**：375px 检查发现固定 208px 侧栏使平台版本页产生横向滚动，这是现有 app shell 响应式限制，本次未扩大到全站移动端重构。

### What's Done（本轮 feat-008 ~ feat-015）

- [x] **feat-008 DeepSeek 实接入**：密钥从 env.txt 迁到 .env.local（env.txt 已删除并加入 .gitignore）；provider 默认 openai-compatible + api.deepseek.com + deepseek-v4-flash；generateObject 全部加 `mode: "json"`（deepseek-v4-flash 是 thinking 模型，不支持 tool_choice 强制，JSON mode 实测可用）；失败降级 mock 不变；AI 生图标记不支持（IMAGE_GEN_SUPPORTED + 包装台文案）。
- [x] **feat-009 统一写作工作台**：/articles/[id] 重构为「主画布 + 右侧审阅/包装/版本/素材四分区面板」（src/components/workbench/*），面板共享 editor 实例直接回写正文；原审阅/包装/平台版本路由保留。
- [x] **feat-010 版本对比与恢复**：自研行级 LCS diff（src/lib/diff.ts），勾选任意两版本看纯文本/HTML 差异 + 备注 + 时间；恢复=另存新版本，编辑器自动同步。
- [x] **feat-011 编辑器图片与导出**：上传/粘贴/拖拽图片→data/assets + 资产表→/api/assets/[name] 服务→插入正文；图文渲染预览（封面+标题+摘要+正文）与 Markdown 源码预览；导出 .md/.html（src/lib/html-md.ts 自研 HTML→MD，覆盖 Tiptap StarterKit+Image 标签集）。
- [x] **feat-012 审阅闭环**：建议三操作（忽略 / 人工已处理 / AI 润色）；润色分片段替换（quote 命中时）与全文改写两种模式，预览→接受→写回编辑器→自动保存新版本→建议置 accepted。
- [x] **feat-013 包装闭环**：标题采用、摘要应用（articles.summary 新列）、卡片插入正文、提示词复制（标注 AI 生图暂不支持）、图片设为封面（articles.cover_asset_id 新列）/插入正文；图文预览呈现包装后效果。
- [x] **feat-014 信息查找升级**：素材库/选题板/写作台/复盘中心统一 ListFilter（关键词/日期范围/状态/标签/平台，URL 驱动）+ 列表/时间线双视图（Timeline 按日分组）。发布中心未改动（本轮不接外部 API）。
- [x] **feat-015 集合详情页**：/materials/collections/[id] 展示说明、清洗进度、聚合标签、素材列表、由集合生成的选题，支持继续生成选题。

### What's Next

1. feat-006：接入真实平台 API（实现 PublisherAdapter）。
2. feat-007：复盘数据 API + 图像生成模型接入（当前 AI 生图明确不支持）。
3. 可选：next lint → ESLint CLI 迁移（Next 16 前）；@radix-ui 依赖清理。

## Blockers / Risks

- 无阻塞。已知小问题（不影响验收）：
  - 右侧面板 tab 状态在 server action revalidate 后偶发回到默认「审阅」tab（dev 模式下观察到一次，疑似 Fast Refresh full reload 所致，生产未复现）。
  - dev server 长时间多轮 HMR 后曾出现路由编译 hang（重启 dev server 即恢复；production build 正常）。
- .env.local 含真实 DeepSeek key，已被 .gitignore 覆盖，勿提交。

## Decisions Made（本轮新增）

- **DeepSeek 结构化输出用 JSON mode**：deepseek-v4-flash（thinking 模型）拒绝 generateObject 默认的 tool_choice 强制（400 "Thinking mode does not support this tool_choice"），统一 `mode: "json"` 后实测九项能力全通。
- **图片服务走 API 路由**：data/assets 不在 Next 静态目录，新增 /api/assets/[name]（含目录穿越防护 + 长缓存），编辑器/预览统一用 assetUrl() 生成 URL。
- **diff/HTML→MD 自研不引依赖**：文章级数据量小，行级 LCS 与受限标签集转换足够，避免新依赖。
- **文章元信息扩列**：articles 表新增 summary、cover_asset_id，src/db/index.ts 启动时 PRAGMA table_info 检测后 ALTER TABLE，兼容旧库。
- **恢复版本=另存新版本**：不覆盖历史，保持版本链完整可追溯。

## Files Modified This Session

- 环境：.env.local（新增，含 key）、.env.example、.gitignore、env.txt（删除）
- AI：src/lib/ai/{provider,index}.ts（DeepSeek 默认值、JSON mode、aiPolishWithSuggestion、IMAGE_GEN_SUPPORTED）
- 数据：src/db/{schema,index}.ts（articles.summary / cover_asset_id + 兼容迁移）
- 库：src/lib/{diff,html-md}.ts（新增）、src/lib/utils.ts（parseDateRange/inDateRange/groupByDay/assetUrl）
- Actions：articles.ts（restoreVersion）、review.ts（polishFinding）、packaging.ts（applySummary/setCoverAsset）、assets.ts（新增 uploadEditorImage）
- API：src/app/api/assets/[name]/route.ts（新增）
- 工作台：src/components/workbench/{types,workbench,editor-canvas,review-panel,packaging-panel,version-panel,materials-panel}.tsx（新增）
- 通用组件：src/components/{list-filter,timeline}.tsx（新增）
- 页面：articles/[id]/page.tsx（重构为工作台）、articles/page.tsx、materials/{page,toolbar}.tsx、materials/collections/[id]/page.tsx（新增）、topics/page.tsx、retro/page.tsx
- 样式：globals.css（图片/diff/prose 样式）
- 文档：feature_list.json（feat-008~015）、progress.md

## Evidence of Completion

- [x] bun run typecheck / lint / build — 全部通过（2026-07-06）
- [x] npx @google/design.md lint DESIGN.md — 通过（DESIGN.md 未改动）
- [x] 真实 AI 冒烟：aiClean/aiTopics/aiBrief/aiDraft/aiRewrite/aiReview/aiPackaging/aiVariant/aiRetroTopic 九项能力真实调用 DeepSeek 全通
- [x] 浏览器端到端（写作页单页闭环）：编辑 → AI 审阅（真实模型落库 6 条建议）→ AI 润色预览接受（保存 v7 + accepted）→ 粘贴图片自动上传插入 → 包装生成（真实模型）→ 采用标题/应用摘要/设为封面 → 图文预览（封面+摘要+插图）→ Markdown 预览含图片语法
- [x] 版本对比（v2→v4 diff +2/-1）与恢复（v3→v5 编辑器同步）
- [x] 筛选/时间线：素材库（status+timeline）、选题板（platform=x+timeline）、复盘中心（timeline）、集合详情页

## Notes for Next Session

从 ./init.sh 开始。DeepSeek key 在 .env.local；不配 key 时全链路自动回落 mock。
真实平台接入只需实现 src/lib/publish/adapters.ts 的 PublisherAdapter 接口并替换 ADAPTERS 条目。
