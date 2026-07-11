# Muse · 创作工厂

面向自媒体创作者的一站式创作工厂（本地优先、单用户，v0.3「可信创作闭环」建设中：feat-020/021 已完成，feat-022/023 待实现）。覆盖完整创作闭环：

**采集收件箱 → 知识整理 → 选题策划 → 内容生产 → 审阅优化 → 图文包装 → 多平台分发 → 数据复盘 ↺**

## 快速开始

```bash
bun install   # 安装依赖（唯一包管理器为 Bun）
bun dev       # 启动本地开发（http://localhost:3000）
bun run build # 生产构建
bun run lint  # 代码检查
```

数据库（SQLite）与上传文件保存在 `./data/`，首次启动自动建表，无需手动迁移。
Drizzle 工具链：`bun run db:generate | db:migrate | db:push | db:studio`。

## AI 配置（可选）

复制 `.env.example` 为 `.env` 并填入任一供应商密钥（Anthropic / OpenAI / OpenAI 兼容网关），
通过 Vercel AI SDK 抽象。**密钥只从环境变量读取**；provider / Base URL / 模型 / 超时等
非敏感项可在应用内 `/settings` 管理，优先级为「设置中心 > 环境变量 > 内置默认」，
设置页会标注每项生效值的来源并提供连接测试。**不配置密钥时所有 AI 能力自动降级为本地确定性
mock，整条闭环仍可完整跑通**（可在设置中关闭 mock 兜底改为显式报错）。真实 AI 请求默认
30 秒超时；失败或超时后会明确提示 mock 兜底来源，不会静默伪装为真实 AI 成功。
需要观察 AI pending 动效时，可临时设置 `MUSE_AI_PROVIDER=mock` 与
`MUSE_AI_MOCK_DELAY_MS=800`；该延迟默认关闭，最大 10 秒，不影响正常使用。

## 核心模块

| 模块 | 路径 | 能力 |
|---|---|---|
| 素材库 | `/materials` | URL/文本/文件/笔记导入、清洗为语料块、FTS5 中文全文搜索、标签、素材集合 |
| 选题板 | `/topics` | 基于素材集合生成选题卡片；可编辑并持久化完整创作 Brief（要点证据映射）；AI Brief 与初稿先预览、确认后写入 |
| 写作台 | `/articles/[id]` | 沉浸式 Markdown 编辑、自动保存工作稿 + 显式/下游自动检查点、版本与下游过期状态；素材面板可编辑 Brief，并先预览后确认生成新的初稿版本 |
| 审阅台 | `/articles/[id]/review` | AI 六维审阅（事实/结构/风格/安全/合规/润色）+ 人工意见，可接受/忽略 |
| 包装台 | `/articles/[id]/packaging` | 标题候选、摘要、封面/配图提示词、图文卡片、本地图片管理 |
| 平台适配 | `/articles/[id]/variants` | 派生小红书 / X / 微信公众号版本（标题、标签、CTA、发布说明） |
| 发布中心 | `/publish` | 定时任务、状态跟踪、失败重试；mock 发布器 + 可扩展平台适配器接口 |
| 复盘中心 | `/retro` | 手动录入互动数据、沉淀复盘结论、一键反哺为下一轮选题 |
| 设置 | `/settings` | 编辑器偏好（自动保存/字号/行高/拼写检查/专注模式）、AI 配置（provider/模型/超时/mock 兜底 + 连接测试）、外观与动效偏好、数据目录状态与 JSON 全量导出 |

首页工作台提供「快速灵感捕捉」，随手记录直接进素材库。

## 技术栈

Bun · Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui 风格组件 ·
Tiptap · SQLite (better-sqlite3 + FTS5) · Drizzle ORM · Vercel AI SDK

## 接入真实平台发布

实现 `src/lib/publish/adapters.ts` 中的 `PublisherAdapter` 接口并替换 `ADAPTERS`
对应条目即可；发布任务调度、重试与状态跟踪无需改动。
