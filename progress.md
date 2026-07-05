# Session Progress Log

## Current State

**Last Updated:** 2026-07-06
**Session ID:** real-ai-workbench-02
**Active Feature:** feat-008 ~ feat-015 全部完成（真实 AI + 统一写作工作台 + 信息查找升级）

## Status

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
