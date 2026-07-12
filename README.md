# Muse · 创作工厂

面向自媒体创作者的一站式创作工厂（本地优先、单用户，v0.4「可信创作飞轮」建设中：feat-020~025 已完成，feat-026 待实现）。覆盖完整创作闭环：

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
| 创作驾驶舱 | `/articles/[id]` | 单篇创作中心：顶部「方向→写作→检查→发布准备→已发布→复盘」步骤条 + NextAction 条（自然语言状态、唯一下一步、阻塞原因、可跳过风险、待办直达）；沉浸式 Markdown 编辑（常用工具直出、高级进「更多」、自动保存只显示已保存/错误、AI 修改预览→接受→可撤销）；右侧检查/包装/版本/资料面板按 NextAction 自动打开；旧 /review /packaging URL 重定向到对应面板 |
| 平台稿 | `/articles/[id]/variants` | 同一创作上下文内派生小红书 / X / 微信公众号版本；发布任务创建与执行均经服务端就绪校验 |
| 发布助手 / 发布记录 | `/articles/[id]/variants` + `/publish` | 平台稿页内发布助手：一键复制整稿/标题/标签/CTA、下载正文与本地图片、粘贴真实链接标记已发布（服务端校验旧稿不可发布）；发布记录页只读跟踪并直达「记录这次表现」；mock 适配器仅供开发测试 |
| 复盘经验 | `/retro` | 复盘向导自动带入文章/平台/平台稿/链接，五步生成可编辑经验摘要（只记观察，不下因果结论），保留发布结果→平台稿→正文版本→创作说明→新选题溯源，经验可一键在新创作中复用 |
| 设置 | `/settings` | 编辑器偏好（自动保存/字号/行高/拼写检查/专注模式）、AI 配置（provider/模型/超时/mock 兜底 + 连接测试）、外观与动效偏好、数据目录状态与 JSON 全量导出 |

首页收敛为「继续上次创作（含就绪状态与下一步）+ 开始一次新创作 + 最多 3 个进行中创作」；
首次使用有 3 步可跳过的引导（答案只作默认值）。`/create` 创建向导支持从想法 / 资料 /
过往经验开始，AI 方向候选先预览、推荐并与既有选题查重，确认后才创建；创作说明是
可跳过的普通问题，全部带默认值。

## 技术栈

Bun · Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui 风格组件 ·
Tiptap · SQLite (better-sqlite3 + FTS5) · Drizzle ORM · Vercel AI SDK

## 接入真实平台发布

实现 `src/lib/publish/adapters.ts` 中的 `PublisherAdapter` 接口并替换 `ADAPTERS`
对应条目即可；发布任务调度、重试与状态跟踪无需改动。
