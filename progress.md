# Session Progress Log

## Current State

**Last Updated:** 2026-07-06
**Session ID:** mvp-build-01
**Active Feature:** 全部 MVP 特性完成（feat-001 ~ feat-005 done）

## Status

### What's Done

- [x] 完整脚手架：Bun + Next.js 15 (App Router) + TS + Tailwind v4 + Drizzle/SQLite + Vercel AI SDK。
- [x] 数据库 schema（15 张表）+ 启动时幂等建表 + FTS5 中文全文索引（CJK 逐字分词 + 短语匹配）。
- [x] AI 层：可配置 provider（anthropic/openai/openai-compatible），无密钥自动降级确定性 mock。
- [x] 七大模块页面 + 快速灵感捕捉，全中文 UI。
- [x] 发布适配器接口 + mock 发布器（可配置失败率 MUSE_MOCK_PUBLISH_FAIL_RATE）。
- [x] DESIGN.md 填写并通过 design.md lint；令牌映射到 globals.css @theme。
- [x] 验证：typecheck / lint / build / 浏览器端到端冒烟（完整闭环，mock 模式）。

### What's Next

1. feat-006：接入真实平台 API（实现 PublisherAdapter）。
2. feat-007：复盘数据 API + 图像生成模型接入。
3. 可选：next lint → ESLint CLI 迁移（Next 16 前）；zod 升 v4。

## Blockers / Risks

- 无阻塞。注意：本机代理环境下 npmjs 官方源极慢，bunfig.toml 已切 npmmirror；如换网络环境可删除。
- data/ 目录（SQLite + 上传）在 .gitignore 中，属本地数据。

## Decisions Made

- **运行时建表而非 drizzle 迁移文件**：src/db/index.ts 启动时执行幂等 BOOTSTRAP_SQL，保证 clone 后 bun dev 零配置可跑；schema 演进时需同步更新 schema.ts 与 BOOTSTRAP_SQL（或改用 drizzle-kit generate/migrate）。
- **FTS5 中文方案**：unicode61 分词器对连续 CJK 无法子串检索，写入/查询均在 CJK 字符间插空格（src/db/fts.ts segmentCjk），查询用短语匹配。
- **AI mock 降级**：所有 AI 函数 try/catch 真实模型失败或未配置时回落到 src/lib/ai/mock.ts 的确定性生成，闭环离线可演示。
- **不使用 Radix**：MVP 用原生元素 + 少量客户端组件，package.json 中 @radix-ui/* 仍保留（未使用，后续可清理或启用）。

## Files Modified This Session

- 配置：package.json, tsconfig.json, next.config.ts, postcss.config.mjs, .eslintrc.json, drizzle.config.ts, bunfig.toml, .env.example, .gitignore, .claude/launch.json
- 数据层：src/db/{schema,index,fts}.ts
- AI/领域层：src/lib/ai/*, src/lib/platforms.ts, src/lib/publish/adapters.ts, src/lib/{utils,labels}.ts
- Actions：src/actions/*（8 个模块）
- UI：src/app/**（12 个页面）+ src/components/**
- 文档：DESIGN.md, README.md, feature_list.json, progress.md, session-handoff.md

## Evidence of Completion

- [x] bun run typecheck — 通过（2026-07-06）
- [x] bun run lint — 通过（含 next lint 弃用提示，不影响结果）
- [x] bun run build — 通过（12 条路由，全部 dynamic）
- [x] npx @google/design.md lint DESIGN.md — 0 errors / 0 warnings
- [x] 浏览器端到端冒烟：灵感→素材→清洗→FTS搜索→选题 brief→初稿→AI 审阅→包装→3 平台版本→mock 发布→数据录入→复盘→反哺新选题

## Notes for Next Session

从 ./init.sh 开始（全部检查应通过）。挑 feat-006 或 feat-007。
真实平台接入只需实现 src/lib/publish/adapters.ts 的 PublisherAdapter 接口并替换 ADAPTERS 条目。
