# Session Progress Log

## Muse v0.4 — 小白也能无脑推进的可信创作飞轮（进行中）

**Last Updated:** 2026-07-11
**Active Feature:** feat-022 — Evidence and Citation Loop

### feat-022 实现前契约

- **数据模型**：新表 `evidence_citations`（`key` 唯一引用身份、`article_id` CASCADE、`material_id`/`chunk_id` 均 `ON DELETE SET NULL`、`excerpt` 摘录、`context_snapshot` 引用时语料块全文快照、`source_title`/`source_url` 来源快照）。素材删除/重清洗不删除引用行，只让外键置空后依赖快照降级展示。`review_findings` 兼容补可空列 `evidence_state`（supported/missing/conflict/unavailable），旧行保持 NULL。旧 `article_citations`（素材级关联）保留不动。
- **引用身份与有效状态**：有效性不落库、读取时由纯函数计算——素材不存在 → `source-missing`（来源已删除，仅展示快照）；当前语料块内容包含摘录（空白归一后）→ `valid`；否则 `source-changed`（来源已变化，请核对）。素材重清洗后按摘录文本在新语料块中重定位（命中则更新 `chunk_id` 与上下文快照，保持引用身份延续；未命中保持置空降级），绝不伪造关联。
- **编辑器与 Markdown 往返**：新增 Tiptap `citation` mark（attrs.key，`<span data-citation>` 持久化于 contentHtml，`inclusive:false`）；Markdown 边界表达为 `[文本](muse://cite/KEY)`，导入解析回 citation mark，往返不丢失；同一文本同时存在 link 与 citation 时以 citation 优先并有单测锁定。
- **状态转换**：写作台「资料」面板支持 FTS 搜索语料块 → 预览 → 「插入摘录并引用」（插入摘录文本并打 mark + 落库引用行）或「为选中文字关联依据」（对选区打 mark + 落库）；移除引用删除行并同步清除正文中该 key 的 mark。AI 事实检查走 `ensureActiveCheckpointCore` 版本契约，结果作为 review（category=fact）落库，`evidence_state` 区分资料支持/缺少资料/资料冲突/来源不可用；「缺少资料」severity 最高为 info，文案不得表述为事实错误。
- **失败路径**：素材未清洗无语料块时搜索给出明确提示；引用落库失败不改动正文；正文中 mark 被用户删除时引用行保留并在面板显示「未出现在正文中」，不静默删除；事实检查无可用检查点时明确失败不调用 AI。
- **兼容策略**：新表用 `CREATE TABLE IF NOT EXISTS` 建立；`review_findings.evidence_state` 用 `PRAGMA table_info` 幂等补列；旧审阅/引用数据不迁移不删除；`compatibilityMigrationSql` 扩签名并更新既有单测。
- **验证门槛**：单测覆盖有效性纯函数、重清洗重定位与降级、素材删除快照保留、Markdown 引用往返、link/citation 共存、mock 事实检查确定性分类、旧库补列；typecheck/lint/build/DESIGN lint 后做真实浏览器验证（搜索→引用→插入→事实检查→素材重清洗与删除降级→刷新持久化），全部通过才置 done。

### feat-022 完成证据

- **实现**：`src/lib/citations.ts`（有效性纯函数 + 重定位 + 状态读取，DI 可测）、`src/actions/citations.ts`（searchEvidence/citeChunk/removeEvidence）、`src/components/editor/citation-mark.ts`（citation mark + 点击回调 + 定位/清除工具）、Markdown serialize/parse 支持 `[text](muse://cite/KEY)` 往返、`aiFactCheck` + `mockFactCheck` + `runFactCheck`（走 ensureActiveCheckpointCore 版本契约）、素材 cleanMaterial 重清洗后重定位引用、资料面板三段式（查找/本文依据/相关素材）。
- **测试**：`bun test tests` 88/88（citations 15 项新增）；typecheck、lint、build、DESIGN lint 全绿。
- **浏览器**（真实 DeepSeek，测试数据文章 12/素材 8 已按 ID 清理）：FTS 搜索命中→预览→「插入摘录并引用」正文出现带 mark 摘录并落库；「为选中文字关联」对选区打 mark；点击正文引用文字自动切到资料面板并高亮「这句话有什么依据」；事实检查区分 supported（72% 论断）/missing（300% 论断，文案「无法核实」非「错误」）/unavailable（素材删除后）；重清洗改变内容→「来源已变化」+引用时快照；删除素材→「来源已删除」+快照保留；移除引用删行+清 mark 留文字；刷新后 mark 持久；Markdown 预览含 muse://cite；375/768/1280 无横向溢出；控制台 0 error。
- **已知限制**：Browser pane 自动化对右侧面板的合成点击存在坐标空间偏差（已知工具限制，feat-017 亦记录过），改用完整 DOM 事件序列验证同一代码路径；真实指针操作不受影响。

## Muse v0.3 — 可信创作闭环（进行中）

**Last Updated:** 2026-07-11
**Active Feature:** feat-020 — Active Revision Contract

### feat-020 实现前契约

- **数据模型**：`article_drafts` 继续承载唯一可变工作稿，`article_versions` 继续承载不可变内容快照；不新增正文模型。`reviews.version_id` 与 `packagings.version_id` 在 TypeScript 层改名为 `sourceVersionId` 但沿用原列，`platform_variants` 通过启动兼容迁移新增可空 `source_version_id`。
- **状态转换**：下游操作收到编辑器当前 HTML 时先保存工作稿，再查找同 article、同 `content_html` 的既有版本；命中则复用并同步 draft 基线，未命中才创建下一版本。下游产物只引用该检查点。正文不同于来源检查点时产物为过期；旧平台稿无来源版本时按“来源未知 / 已过期”降级。
- **失败路径**：文章不存在或没有工作稿/版本时明确失败且不调用 AI；检查点建立失败不写下游产物；旧审阅润色只允许在其来源版本仍是当前检查点时执行，否则要求重新审阅，禁止对最新版本或旧引用片段静默改写。
- **兼容策略**：启动时以 `PRAGMA table_info` 幂等补列，不删除、不覆盖历史数据；既有 review/packaging 精确来源不变，既有 variant 保留但来源为空，不伪造追溯关系。
- **验证门槛**：覆盖版本选择、相同内容去重、draft 基线同步、过期判断和旧库补列单测；再跑 typecheck、lint 与针对性浏览器验证后，才把 feat-020 标记 done。

### feat-020 完成证据

- **实现**：新增 `src/lib/revisions.ts`，所有下游动作统一执行「实时编辑器/自动保存工作稿 → 内容去重检查点 → sourceVersionId」；`reviews`、`packagings` 沿用旧 `version_id`，`platform_variants` 兼容新增 `source_version_id`。工作台活动修订条与各结果 Badge 即时显示最新/过期；旧审阅润色在来源过期时禁用且服务端二次拒绝。
- **测试**：`bun test tests/revisions.test.ts tests/drafts.test.ts` 16/16；`bun run typecheck`、`bun run lint` 通过。旧库真实迁移测试确认旧平台稿保留且 `source_version_id=null`，不会伪造来源。
- **浏览器**：文章 8 未手动保存直接审阅创建 v2；重复审阅复用 v2；包装关联 v2；继续编辑后审阅/包装立即过期；从自动保存稿派生 X 版创建 v3 且 variant 来源为 v3。控制台 0 error/0 warning。
- **修复的基线兼容缺陷**：首次浏览器启动发现旧库会在补 `source_version_id` 前创建索引而 500；索引创建已移到兼容迁移之后，并新增回归测试。

### feat-021 实现前契约

- **数据模型**：保持旧 `TopicBrief.keyPoints: string[]`、`outline: string[]` 与现有 topic JSON 列；增量补 `objective`、`coreClaim`、逐要点 `evidence[]`。`normalizeTopicBrief` 是唯一兼容边界，旧 JSON 自动补默认，不做破坏性迁移。
- **状态转换**：编辑 Brief 只更新 topic.brief；若已有文章，返回“正文可能需要重新对齐”提示但不写正文。AI 生成 Brief 先返回预览，确认应用到表单后仍需保存；AI 初稿先返回 HTML 预览，确认后才新建文章或追加不可变文章版本。
- **失败路径**：未保存的 Brief 禁止生成初稿预览；Brief/预览无效时不写库；放弃预览不改变 Brief、工作稿或版本；所有 pending/error/source 继续沿用通用 AI 反馈。
- **兼容策略**：旧 Brief 核心主张默认取首个 keyPoint；新增证据映射按 keyPoint 文本保留，删除或改名的要点不会错误继承旧证据。
- **验证门槛**：旧 JSON 默认、证据映射、必填完整性单测；topics 与写作台浏览器验证编辑持久化、刷新、正文不覆盖、初稿预览/放弃/确认；typecheck、lint 后方可标记 done。

### feat-021 完成证据

- **实现**：`normalizeTopicBrief` 为旧 JSON 补 `objective/coreClaim/evidence`；共享 `BriefEditor` 同时进入选题卡和写作台素材面板。所有字段可编辑，逐要点可勾选素材或“无需引用”。已有正文时常驻重新对齐提示，保存 Brief 不写正文。
- **安全 AI 流**：AI Brief 只返回预览，应用到表单后仍需显式保存；AI 新初稿只返回 HTML 预览，确认后才创建文章或通过 `saveVersionCore` 追加版本，放弃不写库。
- **测试**：`tests/briefs.test.ts` 6/6（含旧 JSON、缺失 Brief、直接 Topic 字段 fallback、证据保留、必填判断、指纹过期）；全套 `bun test tests` 73/73，typecheck、lint、build、DESIGN lint 全绿。
- **浏览器**：一次性 topic 18 完成完整 Brief 编辑与持久化，真实 AI 初稿预览在确认前不写库，确认后创建 article 10/v1（版本备注记录真实 AI 来源）。写作台素材面板回显读者、目标、主张、角度、语气、平台、大纲与“无需引用”；已有正文时显示“可能需重新对齐”，保存修改后仍为 1 个版本、正文长度仍为 1105，证明不会自动覆盖正文。
- **响应式与健康**：写作台在 375/768/1280px 的 `scrollWidth` 分别等于视口宽度，无横向溢出；控制台无应用错误或警告，唯一错误为开发环境请求缺失 `favicon.ico` 的既有 404。验收 topic/article 已按精确 ID 清理。
- **安全边界**：初稿确认仍由 Brief 指纹进行服务端过期校验；所有 AI 产物先预览、覆盖性写入需显式确认。feat-022 尚未开始，按用户指定在其正式实现前停止。

## Current State

**Last Updated:** 2026-07-11
**Session ID:** muse-v0.2-01
**Active Feature:** feat-019 已完成（设置中心）。Muse v0.2「沉浸式写作与本地配置」三个 feature（017/018/019）全部交付。

## Status

### Current Work（本轮 feat-019 设置中心）

- [x] **存储与校验**：新表 `app_settings`（KV，单行 key='app' 存 JSON）；`src/lib/settings.ts` zod schema（每字段 .catch 单独回退 + 区块级回退），缺失补默认、未知忽略、损坏整体回退——向前向后兼容无需迁移脚本。
- [x] **配置优先级落地**：`resolveAiConfig` 纯函数实现「设置中心 > 环境变量 > 内置默认」，`provider.ts/index.ts` 改为读 effective config；密钥仍仅从环境变量读取，`credentialStatus` 只暴露布尔。
- [x] **mock 兜底开关**：设置关闭后未配置/失败抛 `AiUnavailableError`，action 层透出明确中文报错，不产生 mock 内容、不写库。
- [x] **/settings 页面**：四区块卡片（编辑器/AI/外观与交互/数据）+ 全局导航入口（桌面侧栏与移动抽屉）；AI 区显示生效配置（值+来源 Badge）与脱敏凭据状态、密钥配置指引；数据区显示数据目录、muse.db 大小与行数、资产统计、/api/export JSON 全量导出。
- [x] **表单与校验反馈**：原生 HTML 约束为第一道，服务端 zod safeParse 为第二道（返回具体中文错误，不写库）；保存/恢复默认/测试连接均有即时反馈；恢复默认后表单本地 state 同步。
- [x] **编辑器偏好接线**：写作台加载时读取（自动保存间隔→useAutosave debounce、字号/行高→画布 inline style、拼写检查→editorProps、默认专注模式→初始 focused）；修改不影响已打开的编辑页。
- [x] **动效偏好**：<html data-motion> + `:root[data-motion="reduced"]` 复制降级规则组，设置驱动的减少动效与系统偏好并行生效；主题策略仅持久化并明示暗色未提供。
- [x] **测试**：tests/settings.test.ts 12 项（schema 兼容 6 + 优先级解析 5 + 凭据脱敏 1），总计 61/61。

### Verification（feat-019，2026-07-11）

- [x] `bun test tests` 61 pass / 0 fail；`./init.sh` 全绿（dev server 已先停止再 build）。
- [x] 浏览器：/settings 四区块 1280px/375px 渲染无溢出、控制台 0 error；编辑器设置保存（字号 18/间隔 3000）→ 写作台实测 font-size 18px、行高 1.8、spellcheck=false；服务端 zod 拒绝字号 8 并显示「字号范围 12-22」；测试连接真实 DeepSeek 成功（896ms）；动效=始终减少 → html[data-motion=reduced] + page-transition animation none + interactive transition 0s，恢复默认后动画回归、表单同步；mock 兜底关闭 + provider=anthropic（无密钥）→ 写作台 AI 改写显式报错且正文不变，随后恢复默认；/api/export 200 + attachment 头 + 18 表 + 导出内容无 api_key 字样。

### Remaining Risk（feat-019）

- 主题跟随策略仅持久化偏好（暗色主题未实现，UI 已明示）；实现暗色需要设计系统扩展，留待后续 feature。
- 设置读取在每次 AI 调用/布局渲染时同步查 SQLite 单行，本地单用户开销可忽略；若未来多实例部署需加缓存失效策略。

### Current Work（本轮 feat-018 沉浸式 Markdown 编辑器）

- [x] **Markdown 转换层**：新增 `src/lib/markdown/`（serialize：Tiptap JSON→MD 显式节点表、未知节点降级为文本并 onUnknown 上报；parse：markdown-it default 预设 + 自研 $..$/$$..$$ 数学规则 + 任务列表识别；detect：保守的粘贴 Markdown 识别）。旧正则 `htmlToMarkdown` 删除，`html-md.ts` 仅保留 HTML 导出包装。
- [x] **编辑器扩展**：`src/components/editor/extensions.ts` 统一 StarterKit（关 codeBlock）+ CodeBlockLowlight（common 语言集，React NodeView 语言下拉）+ Link + Table 全家 + TaskList/TaskItem + 自研 InlineMath/BlockMath（KaTeX 原子节点，插入即 NodeSelection）+ CharacterCount + Placeholder。
- [x] **Bubble Menu**：选区浮出 B/I/S/行内代码/链接（⌘K）/H2/H3 + AI 扩写/改写/重组；公式节点选中时切换为 LaTeX 输入框（更新/删除）；修复事务后输入框抢焦点缺陷（仅首次选中空公式聚焦）。
- [x] **/ 插入菜单**：@tiptap/suggestion + SlashMenuBus 桥接 React 浮层，13 项（标题/列表/任务/引用/代码块/两种公式/表格/图片/分隔线），↑↓ Enter Esc 键盘导航、中文+拼音关键词过滤；`allowedPrefixes: null` 修复中文句号后无法触发。
- [x] **AI 选区安全**：`track-range.ts` 用 ProseMirror mapping 跟踪原始选区；EditorCanvas 内固定位置的 pending/预览卡（原文摘录+结果+接受/取消）；选区被删则禁用接受并警示，取消与失败均不改正文。
- [x] **自动保存**：新表 `article_drafts`（每文一行）与 `lib/drafts.ts` 核心逻辑（内容去重、版本基线同步、恢复规则），Server Action `saveDraft` 不 revalidate；`use-autosave.ts` 状态机 idle/dirty/saving/saved/error（8s 重试、composition 中不落库、visibilitychange 抢救、beforeunload 提示）；页面加载 `resolveInitialContent` 决定恢复工作稿并显示提示条。
- [x] **工具栏与状态栏**：撤销/重做、H1-H3、B/I/S/行内代码、三类列表、引用、代码块、插图、图文预览/Markdown 预览/导入 .md/导出 .md/.html、专注模式；底部字符/词数 + 保存状态 + 快捷键提示。
- [x] **专注模式**：隐藏文章页头、tabs 与右侧面板，画布居中 max-w-3xl；CSS `:has(.workbench-focus)` 控制 article-chrome。
- [x] **测试**：`bun test` 49/49（tests/markdown.test.ts 39 项 + tests/drafts.test.ts 10 项，后者用 bun:sqlite 内存库 + 共享 BOOTSTRAP_SQL，lib/drafts 改为显式传 db 依赖注入以绕开 better-sqlite3 Node/Bun ABI 冲突）。
- [x] **文档**：DESIGN.md 增补编辑器/Bubble/代码块/公式/表格/保存状态/专注模式/移动端规范；README 更新写作台能力。

### Verification（feat-018，2026-07-11）

- [x] `bun test tests` 49 pass / 0 fail。
- [x] `./init.sh` 全绿（typecheck / lint 0 警告 / build / DESIGN lint 0 errors）。
- [x] 浏览器冒烟（Chrome dev server，文章 1）：/ 菜单键盘全流程、代码块语言+高亮+多行、行内与块级公式 KaTeX、表格+Tab、任务列表勾选、Bubble 格式/链接、AI 接受（预览期间前置编辑后 mapping 替换正确段落）/取消/选区删除保护、粘贴 Markdown 结构化、IME composition 序列、Markdown 预览往返、导出反馈、自动保存与失败重试提示、刷新恢复+保存 v9 后基线干净、恢复 v7→v10 同步、专注模式、375px 无溢出、控制台 0 error、AI 审阅旧闭环不回归。
- [x] 服务器 build 与 dev 冲突教训：`./init.sh`（含 next build）与运行中 dev server 共写 `.next` 会损坏 webpack runtime（vendor-chunks 丢失、server action 500）→ 验证期间先停 dev server 再跑 init.sh，或跑完清 `.next` 重启。

### Remaining Risk（feat-018）

- 真实中文 IME 组字仅以 composition 事件序列模拟（浏览器自动化无法驱动系统输入法）；PM 原生 composition 处理 + autosave composing 保护已覆盖，建议真机手动补一次。
- .md 文件导入的文件选择框未在自动化中触发（与粘贴导入共用 markdownToDoc 路径，已由粘贴路径与单测覆盖）。
- 偶发一次 slash 菜单首个 Enter 未消费（HMR 重载间隙 keyHandler 注册竞态，刷新后未复现；生产 build 无 HMR）。

### Architecture Decisions（feat-019，实现前记录）

- **存储**：新表 `app_settings`（key TEXT PRIMARY KEY, value TEXT, updated_at），单行 key='app' 存 JSON。zod schema 负责校验、默认值与向后兼容（缺失字段补默认、未知字段忽略、解析失败整体回退默认并告警），不需要逐版本迁移脚本。
- **配置优先级**（从高到低）：① 密钥永远只来自环境变量（ANTHROPIC_API_KEY / OPENAI_API_KEY / MUSE_AI_API_KEY），不落库不入日志；② AI 非敏感项（provider/baseURL/model/timeout/mock 延迟）：设置中心非空值 > 环境变量 > 内置默认；③ 编辑器与外观偏好：设置中心 > 内置默认。设置页对每个 AI 生效值标注来源（设置/环境变量/默认）。
- **AI 接入方式**：`lib/settings.ts` 暴露 getEffectiveAiConfig()（同步读 SQLite 单行，better-sqlite3 开销可忽略），provider.ts / index.ts 的 env 读取改为走 effective config；设置保存后下一次 AI 调用即生效，无需重启。
- **动效偏好**：设置 system|reduced；layout 在 <html data-motion> 输出，globals.css 为 `:root[data-motion="reduced"]` 复制一份 reduced-motion 降级规则，真实可验证。主题跟随策略仅持久化 light|system（暗色主题未实现，UI 明示"当前仅浅色"，不伪装）。
- **编辑器偏好生效语义**：写作台在页面加载时读取（自动保存间隔/字号/行高/拼写检查/默认专注模式），设置修改不强刷已打开的编辑页，绝不打断正在编辑的文章。
- **数据导出**：/api/export 全表 JSON dump 下载（本地优先，不含任何密钥或环境变量）。

### Architecture Decisions（feat-018，实现前记录）

- **文档模型**：Tiptap（ProseMirror）JSON/HTML 保持唯一结构化文档源；数据库继续存 contentHtml（版本兼容），Markdown 只作为导入 / 预览 / 导出边界，不引入双源状态。
- **Markdown 转换**：弃用正则 HTML→MD。新增 `src/lib/markdown/`：serialize（Tiptap JSON→MD，显式节点处理表 + 未知节点降级输出其文本内容并 console 警告，绝不静默丢内容）+ parse（markdown-it CommonMark+GFM → Tiptap JSON）。两个方向均为纯函数，bun:test 可测。
- **公式**：渲染用 KaTeX（成熟开源）；Tiptap 侧用自研极薄 inlineMath / blockMath atom 节点（attrs.latex），避免第三方扩展与 Tiptap 2.14 的兼容风险；MD 边界表达为 `$...$` / `$$...$$`。
- **代码块**：官方 @tiptap/extension-code-block-lowlight + lowlight（common 语言集），语言下拉写入 attrs.language，MD 边界为带语言标识的 fenced block。
- **表格/任务列表/链接**：官方 @tiptap/extension-table*、task-list/task-item、link，全部 ^2.14。
- **自动保存数据模型**：新增 `article_drafts` 表（article_id 唯一、content_html、content_text、base_version_id、updated_at）。debounce 自动保存只写 draft（内容哈希去重，不产生版本）；「保存为新版本」才写 articleVersions 并同步 draft 基线。加载时 draft 比最新版本新则恢复 draft。状态机 dirty→saving→saved / error（可重试）。
- **AI 选区安全**：发起 AI 时记录 {from,to} 并订阅 editor transaction，用 ProseMirror mapping 随每次编辑重映射；结果以预览卡呈现，接受时替换映射后的选区，映射失效（被删除）则提示失败且不动正文。

### Current Work（本轮 feat-017 响应式收口）

- [x] **窄屏导航**：`nav.tsx` 拆分为桌面 `SideNav`（hidden md:flex）与 `MobileNav`（md:hidden 置顶 56px 头部栏 + 汉堡按钮 + 左侧抽屉）；抽屉带遮罩、Esc/路由变化自动收起、body 滚动锁定、aria-expanded/aria-controls/role=dialog。
- [x] **抽屉动效**：`muse-drawer-enter` 220ms 滑入 + `muse-backdrop-enter` 120ms 淡入，纳入 prefers-reduced-motion 降级组。
- [x] **工作台响应式**：`workbench.tsx` 栅格改为 grid-cols-1 / lg:[1fr_20rem] / xl:[1fr_22rem]，面板 max-h 限制仅 lg+ 生效，窄屏为纵向区域。
- [x] **页面栅格断点**：首页统计/双卡、素材库、集合详情、选题板、写作台列表、发布中心、复盘中心、审阅页、包装页、平台版本页的 grid-cols-2/3/4 全部加 sm:/md: 断点；窄屏单列或 2 列。
- [x] **页头行与表单**：写作台新建表单、包装/变体/集合详情的「说明+操作」行窄屏改纵向堆叠；上传表单 flex-wrap；文章 tabs overflow-x-auto；复盘数据表格改卡片内横滚（min-w-96 + overflow-x-auto）。
- [x] **布局规范落档**：DESIGN.md Layout 补 768/1024/1280 断点规则与抽屉导航规范，Motion 补抽屉动效。

### Verification（feat-017 收口，2026-07-11）

- [x] `./init.sh` 全绿（bun install / typecheck / lint 0 警告 / build / DESIGN.md lint 0 errors）。
- [x] **375px 真实浏览器**：/、/materials、/materials/1、/materials/collections/1、/topics、/articles、/articles/1（工作台）、/articles/1/review、/articles/1/packaging、/articles/1/variants、/publish、/retro 全部 scrollWidth=375、无溢出元素；工作台工具栏换行可用、面板纵向堆叠；控制台 0 error/warning。
- [x] **抽屉导航闭环**：打开（图标+高亮+遮罩正常）→ 点击「选题板」→ 路由跳转 /topics → 抽屉自动收起 → body overflow 恢复。
- [x] **768px**：侧栏显示、移动顶栏隐藏、无横向溢出，工作台纵向堆叠可用。
- [x] **1280px**：工作台双栏 625px+352px（22rem），桌面视觉层级与动效不变。
- [x] **prefers-reduced-motion 实测**（Playwright emulateMedia reduce）：page-transition/panel-transition/app-main/route-progress/interactive-motion 全部 animationName=none、transition 0s；ai-action-pending::after display=none；抽屉打开但无动画。切回 no-preference 后 muse-drawer-enter 0.22s、muse-page-enter 恢复。
- [x] 复盘数据表格在自身容器内横滚，页面不产生横向滚动。

### Remaining Risk（feat-017）

- 已知无阻塞小问题：favicon.ico 404（既有，未在本轮范围）；Browser pane 的合成点击对汉堡按钮偶发双触发 toggle（真实指针与 Playwright 点击均正常，判定为自动化工具行为差异，非产品缺陷）。

### What's Done（上一轮 feat-017 动效部分）

- [x] **动效方向写入设计系统**：`DESIGN.md` 新增 fast/normal/slow 时长与统一 ease-out 曲线；动效只使用 opacity/transform，保持 Muse「安静的工作室」而不是高调动画站。
- [x] **页面切换连续性**：根布局增加全站顶部细进度线；导航开始时旧工作区用 120ms、4px 轻微上移淡出，App Router `template.tsx` 在新页面挂载时执行 220ms 上移淡入接棒；普通链接、前进/后退、AI 成功跳转和列表筛选的程序化导航统一即时启动进度反馈，12 秒安全收尾防止异常导航留下常驻进度条。
- [x] **基础交互反馈**：Button、侧栏、文章 tabs、筛选视图、素材导入 tabs、编辑器工具栏与工作台 tabs 增加 120~150ms 按压缩放和精确属性过渡。
- [x] **AI pending 动效**：全部通用 AI Action 和工作台改写/审阅/润色/包装按钮使用闪光图标与伪元素流光；空闲态和 pending 态同槽交叉淡入，按钮宽度不跳动。
- [x] **AI 结果过渡**：success/warning/danger 提示增加对应图标、soft 背景与 180ms 弹入；新审阅记录、润色预览、包装结果使用同一结果 reveal。
- [x] **AI 产物到达动效**：新增按数据签名变化触发的 `AiResultTransition`，覆盖选题/Brief、素材清洗、AI 审阅、包装重新生成、平台派生和集合生成；首次打开页面不重播已有结果，避免整页同时动画。
- [x] **可重复真实渲染 QA**：新增默认关闭的 `MUSE_AI_MOCK_DELAY_MS`，配合 `MUSE_AI_PROVIDER=mock` 可稳定观察长耗时 pending，不发送用户内容到外部模型；本轮以 800ms 延迟完成采样。
- [x] **可访问性与性能**：AI 按钮维持 `aria-busy` / 动态 accessible name；`prefers-reduced-motion` 关闭页面、面板、反馈、流光和循环图标动画；未引入动画依赖。

### Verification（上一轮 feat-017 动效部分）

- [x] `bun run typecheck`
- [x] `bun run lint`（0 warnings / errors）
- [x] `bun run build`
- [x] `npx @google/design.md lint DESIGN.md`（0 errors / 0 warnings）
- [x] **桌面真实渲染**（1280px）：首页与平台版本页层级、文案、按钮宽度正常，无横向溢出；页面切换点击后 8ms 为 `loading`，53ms 已进入新路由且页面仍在淡入，最终恢复 `idle`。
- [x] **AI pending 真实帧**：60ms / 360ms 均为 `aria-busy=true`、disabled、`ai-action-pending`；流光 `muse-ai-shimmer` 的 transform 从 -62.872px 移至 2.272px，闪光 `muse-ai-sparkle` opacity 从 0.665 变为 0.999。
- [x] **AI 结果真实帧**：新版本到达时 `muse-feedback-enter` 从 opacity 0、scale 0.98、translateY 4px 开始，180ms 后稳定为 opacity 1、transform identity；mock 来源 warning 清晰可见。
- [x] **浏览器健康**：控制台 0 error / 0 warning；服务端 mock 日志两次均为 801ms；测试生成的平台版本已全部删除，文章 3 平台版本计数恢复为 0。
- [x] **375px 验证已执行但失败**：视口 375px 时页面 `scrollWidth=627px`，固定 208px 侧栏导致主区逐字竖排与横向滚动；这是 app shell 响应式缺陷，不是动效导致。
- [x] **reduced-motion 运行时规则检查**：真实页面 CSSOM 中加载 2 组 `prefers-reduced-motion: reduce` 规则，覆盖自定义动效和 Tailwind `motion-reduce` 工具；当前浏览器系统偏好为 false，控制接口不支持切换媒体偏好，未取得实际降级帧。

### Remaining Risk（上一轮 feat-017，已在本轮解决）

- ~~375px app shell 失败~~ → 本轮已修复并逐页验证；~~reduced-motion 缺实际降级帧~~ → 本轮用 Playwright emulateMedia 实测降级与恢复。feat-017 已置 `done`。

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
