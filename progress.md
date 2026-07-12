# Session Progress Log

## Muse v1.0 — PRD 落地（M1 进行中）

**Last Updated:** 2026-07-13
**Active Feature:** 无 —— feat-029、feat-030 已完成；下一个为 feat-031（X 单条 + Thread 编辑器）

### feat-030 实现前契约（破坏式数据重构 · 数据地基阶段）

- **Staging 决策（重要）**：FR-0.1 的终验收（「代码库无 packagings」「全新库跑通全部动线」）依赖 feat-031~033 的新编辑器就位，中途删除旧 UI 会让应用长期断裂。故 feat-030 交付**新数据模型地基**（§3.3 全部新表 + 重置/种子脚本 + 数据层核心 + 导出覆盖），旧模型（articles/packagings/platform_variants/publish_tasks）与其 UI 共存运行；**切换与删除收口在 feat-034**（feature_list 已同步该验收）。
- **新表（§3.3 全量）**：creations（工作标题≠平台标题、brief、目标平台集合、hypothesis 假设登记列随 M1 建表/UI 在 M2）、source_documents（0..1/项目，行内承载可变工作稿，替代旧 drafts 表模式）、source_revisions（不可变）、platform_outputs(platform, format, active_revision_id 无 FK 代码维护, source_revision_id?, derived_from_output_id 适配溯源, rules_version 镜像活动修订)、platform_output_revisions(payload_json 判别联合, schema_version, rules_version 权威值)、output_assets(修订级快照关联：role 首图/正文图/封面/post_media、order、postIndex、alt、crop)、publications(冻结 output_revision_id + 可编辑 url/时间/note + published_with_risk/risk_reason)、performance_snapshots(metrics JSON + captured_at + days_since_publish 口径)。
- **兼容补列**：reviews.source_revision_id / output_revision_id（多态挂载 §3.3，reviews.article_id 的 NOT NULL 放开留到 feat-034 重置时）、assets.creation_id（项目级资产池归属；旧资产 NULL 不伪造）。新库由 BOOTSTRAP_SQL 原生带列，旧库 PRAGMA 幂等 ALTER。
- **数据层核心语义**：payload 未过 Zod 校验零写入；平台由格式经注册表推导；资产引用必须属于本项目资产池（跨项目/幽灵资产拒绝）；output_assets 结构由 payload 派生（结构权威在 payload，本表承载 alt/裁剪并按资产反查），仅 alt 变化也产生新修订（发布快照不可事后篡改），未指定时按 assetId 从上一修订继承；修订内容+资产元数据均相同才复用；发布检查未过默认阻断、显式 acceptRisk 才放行并落 risk 字段；发布冻结活动修订，updatePublicationMetaCore 只能改元数据；快照口径天数 = floor((captured-published)/86400)。
- **脚本**：db:reset 需 --yes（破坏式：删 muse.db* 重建空库，不迁移不备份，资产文件目录保留）；db:seed 幂等（已有 creations 即跳过）：2 素材（1 条含语料块+FTS）、1 选题、创作 A 多平台（通用稿 r1 → x_thread/小红书图文/公众号文章，公众号**刻意缺封面**演示平台级 readiness 独立）、创作 B 单平台直写（x_single_post 已发布 + 3 天口径快照）、2 张占位 PNG 写入资产池。脚本用 bun:sqlite（规避 better-sqlite3 的 Node/Bun ABI 冲突）。
- **验证门槛**：内存库单测覆盖上述全部语义 + resetDatabase 清旧建新 + seedCore 幂等 + 旧库补列；/api/export 覆盖 27 表（补漏 evidence_citations）；./init.sh 全绿；dev 库启动迁移后旧数据无损。

### feat-030 完成证据

- **实现**：schema.ts/bootstrap.ts（8 新表 + 7 索引 + 兼容补列扩签名）、lib/creations.ts、lib/platform-outputs.ts、lib/seed.ts、scripts/reset-db.ts、scripts/seed-db.ts、package.json db:reset/db:seed、/api/export 27 表。
- **测试**：`bun test tests` 191/191（creations 6 项 + platform-outputs 16 项新增；revisions/citations 兼容测试适配新签名）。
- **脚本端到端**（临时 MUSE_DATA_DIR，不动 dev 库）：无 --yes 拒绝并退出 1；reset → 33 表空库；seed → 2 创作/4 作品/1 发布/1 快照/2 素材/2 图片；重复 seed 幂等跳过；库内容抽查全部正确（4 作品 rules_version 双记、output_assets 角色/顺序/alt、发布冻结 revision 4、快照口径 3 天、FTS 命中）。
- **验证**：`./init.sh` 单次完整退出 0（typecheck / ESLint 0 警告 / build / DESIGN lint 0 errors）。dev 库启动迁移后新表+新列就位、旧数据无损（9 articles）。
- **已知限制/后续**：公众号正文内图片的 output_assets 追踪随 feat-033 编辑器接线（HTML 引用无法在数据层可靠解析，当前仅封面行）；reviews.article_id NOT NULL 放开与旧模型删除随 feat-034 重置收口；无 DB 事务先例沿用「写前全量预校验」惯例，多语句写入非原子（本地单用户可接受，若引入事务应全库统一）。

### M1 拆解（2026-07-13）

按 docs/PRD.md §5 里程碑映射，把 M1 拆解为 feat-029 ~ feat-035 写入 feature_list.json：029 规则注册表+类型化 payload（FR-0.2）→ 030 破坏式数据重构（FR-0.1 + §3.3）→ 031 X 单条+Thread（FR-1.1）→ 032 小红书图文+资产池（FR-1.2+1.5）→ 033 公众号文章（FR-1.3）→ 034 创作动线（FR-2.1+2.2）→ 035 状态一致/AI 可信/发布记录（FR-3.x+4.1~4.3+5.1）。FR-1.4 三视图随 031~033 各类型编辑器交付。

### feat-029 实现前契约

- **范围**：纯逻辑层（无 UI、无建表）。规则注册表 + X 官方加权计数 + 四类型 Zod payload + 发布检查纯函数，为 feat-030 数据重构与 feat-031~033 编辑器提供地基。旧 `lib/platforms.ts` 写死常量保留（现有 UI 仍在用），待 feat-030 收敛删除。
- **规则注册表**（`lib/platform-rules/registry.ts`）：每条规则 `{id, value, description, source:{url,title,checkedAt}}`；每个「平台×格式」规则集带 `rulesVersion`（格式 `format/N@YYYY-MM-DD`，数值或语义变化必须递增）；`listAllRules()` 供未来设置页/文档展示来源与核对日期。规则数值：X 加权 280/URL 23/媒体 ≤4（GIF/视频单独 1 个）、Thread ≥2 条、小红书图 1-18/标题 ≤20 字/正文 ≤1000 字、公众号封面必填/标题 ≤64/作者 ≤8/摘要 ≤120。
- **X 计数**（`x-text.ts`）：新依赖官方 `twitter-text@3.1.0`（v3 加权配置：CJK/emoji 计 2、多数拉丁与常用标点计 1、URL 一律 t.co 23），`parseXText` 返回 weightedLength/remaining/valid；全站禁止 `string.length` 判断 X 可发布性。其传递依赖 core-js@2 的 postinstall（资助提示脚本）保持 bun 默认阻止，不影响运行。
- **payload**（`payloads.ts`）：Zod 判别联合（type 判别）+ `schemaVersion` 字面量。Schema 只约束「可存储结构」（草稿可不完整：空文本、0 图可存），「可发布性」由检查函数出具——两者职责分离。结构硬上限（X 媒体 ≤4、小红书图 ≤18、Thread ≥1 条）进 schema（编辑器同样拦截）。媒体/图片以 assetId 引用资产池，顺序即数组顺序；alt/crop 归 output_assets 关联表（feat-030），payload 不重复存储。小红书首图 = images[0]（发布器以第 1 张为封面，「设首图」即移到首位，不设独立标记避免双源失同步）。X 链接直接在 text 内（与 composer 一致）；internalNote 仅 Muse 侧不发布。
- **发布检查**（`checks.ts`）：纯函数 `checkPlatformOutput(payload)` → checklist（blocker 红/warning 黄），结果携带出具时 rulesVersion 与逐项 ruleId；Thread 逐条检查带 postIndex 定位。语义要点：X 空文本但有媒体可发布（与 X 一致）；小红书无标题仅提醒（平台允许无标题）、0 图硬阻断；公众号摘要缺失仅提醒、封面/标题/正文缺失硬阻断、原文链接格式仅提醒；中文字数按 Unicode 码点计（emoji 不被代理对算成 2 字）。
- **验证门槛**：≥10 例中文/emoji/URL 加权计数与官方算法对照 + 边界（280/281、140/141 汉字）+ string.length 误判反例；注册表每条规则来源/日期断言；payload 判别与越界拒绝；四类型 §3.2 硬条件 checklist 断言。bun test 全绿 + ./init.sh 全绿。

### feat-029 完成证据

- **实现**：`src/lib/platform-rules/`（registry.ts / x-text.ts / payloads.ts / checks.ts / index.ts），依赖新增 twitter-text@3.1.0 + @types/twitter-text。
- **测试**：`bun test tests` 169/169（platform-rules 35 项新增：12 例加权计数抽样——纯拉丁 11、纯中文 8、假名 10、中英混排 13、单 emoji 2、ZWJ 家庭 emoji 2、旗帜 2、长短 URL 均 23、中文+URL+emoji 33/51、U+2014 计 1;280/281 与 140 汉/141 汉边界;300 字符 URL 有效与 150 汉字无效的 string.length 误判反例;规则来源 URL/核对日期/rulesVersion 断言;四类型 payload 解析与默认值、未知类型/schemaVersion=2/媒体 5 个/图 19 张/空 Thread 拒绝;X 恰 280 就绪与超限阻断、URL 按 23 计、仅媒体可发布、GIF 混用阻断;Thread 1 条阻断、第 2 条超限 postIndex=1 定位、3 条合规就绪;小红书 0 图「缺少图片，不可发布」、21 字标题阻断/20 字通过、1001 字正文阻断、emoji 码点计数、无标题仅提醒;公众号缺封面「缺少封面，不可发布」、摘要缺失仅提醒不阻断、65 字标题/121 字摘要/9 字作者/空标签正文阻断、完整就绪、坏链接仅提醒）。
- **验证**：`./init.sh` 单次完整退出 0（bun install / typecheck / lint / build / DESIGN lint 0 errors 0 warnings）。纯逻辑层无 UI，无浏览器验收项。
- **决策与已知限制**：小红书标题按码点「中英文同计 1」为保守解释（若发布器实测英文按半字计，放宽为规则集版本递增）；小红书话题数上限无可靠官方来源，未立规则;公众号原文链接格式无官方文档背书，降为提醒;X 规则来源 docs.x.com 字符计数规范与 help.x.com,小红书来源创作服务平台发布器（实测口径）,公众号来源新建草稿接口文档。feat-030 接线时 platform_output_revisions 落库前必须过 `parsePlatformOutputPayload`,并记录生成时 rulesVersion。

## Muse v0.5 — 全局命令面板与跨域搜索（已完成）

**Last Updated:** 2026-07-12
**Active Feature:** 无 —— feat-028 已完成

### feat-028 完成证据

- **实现**：`src/lib/command-search.ts`（跨域只读查询核心：文章 title/summary LIKE + 逐命中 `getReadinessFactsCore → computeReadiness → deriveJourneyStep → getJourneyDestination` 得自然语言状态与直达 href；素材 FTS5 短语匹配按素材去重 + 标题 LIKE 兜底未清洗素材；选题 title/brief JSON LIKE，已有文章时直达 `?panel=materials`；复盘 title/insights/next_topic_hint LIKE；LIKE 统一 `ESCAPE '\'` 转义，FTS 沿用双引号短语转义；已发布/复盘步骤的文章直达文章本身而非全局页）；`/api/command-search` GET route（force-dynamic，纯 SELECT，异常 500 + 中文消息）；`src/components/command-palette.tsx`（Radix Dialog 焦点圈闭 + 背景 aria-hidden、combobox/listbox/aria-activedescendant、↑↓ 循环 Enter 直达 Esc 关闭、200ms 防抖 + AbortController 取消陈旧请求、关闭后焦点还原到唤起前元素、错误态「重试」项、无结果引导 + 去新建一次创作、IME 组字 Enter 不误触发）；导航入口（桌面侧栏「搜索… ⌘K」按钮 + 移动端顶栏搜索图标，经自定义事件唤起）；`segmentCjk` 从 db/fts 字节不变迁至 lib/utils（db/fts 改导入，纯函数归位供测试内存库复用）。
- **快捷键冲突决策**：编辑器 Bubble Menu 的 ⌘K 链接编辑改为仅在选区非空时 preventDefault + stopPropagation（原实现空选区也 preventDefault），其余场景 ⌘K 一律唤起面板；DESIGN.md 已记录优先级。
- **测试**：`bun test tests` 134/134（command-search 8 项新增：四域中文命中含 readiness 状态与 panel href、Brief/Learning 独立命中、空/空白查询零结果、无结果不报错、%/_ 字面匹配不通配误命中、引号/单引号/反斜杠不炸、分组固定顺序与文章按 updated_at 倒序、空查询首屏继续上次创作与最近列表）；`./init.sh` 单次完整退出 0（install/typecheck/lint/build/DESIGN lint 0 errors 0 warnings）。
- **浏览器证据**（dev server，真实渲染）：⌘K 唤起（空查询显示动作+最近更新，均带 readiness 状态）；「未知」跨 文章/选题/复盘经验 命中、「独立开发」命中素材 FTS（[独立开发] 高亮片段 + 已整理状态）与文章；Enter 直达 `/articles/1?panel=review` 且工作台审阅面板 aria-pressed 打开、选题命中直达 `/articles/11?panel=materials`；编辑器输入未保存文本（170→186 字符）→ ⌘K 唤起 → Esc 关闭 → 文本完好且焦点还原回编辑器；选区非空时 ⌘K 打开链接编辑输入框、面板不开；焦点圈闭（Tab 后焦点留在对话框、背景 aria-hidden=true）；劫持 fetch 模拟失败 → 面板内中文报错「搜索暂时不可用，请重试。」→ 恢复后点「重试」同面板恢复结果；无结果显示引导 + 「去新建一次创作」；375px 顶栏搜索图标点击唤起、点按选题结果直达、`scrollWidth=375` 无溢出；1280px `scrollWidth=1280` 无溢出；干净刷新后完整走一遍唤起→搜索→Esc，控制台 0 error；服务端日志仅 GET 请求，面板全程零写库（route 仅 SELECT）。测试期间输入的验收文本已从文章 1 草稿逐字删除（恢复 170 字符），未产生任何新版本。
- **已知限制**：自动化工具（Browser pane）合成的方向键 keydown 的 `key` 为空字符串，无法驱动高亮移动（真实键盘发送 `ArrowDown` 正常；已用标准 KeyboardEvent 走同一 React 处理器验证，并兼容旧浏览器的 `Down/Up` 键名）；「最近访问」以最近更新的创作代替，避免为访问记录引入写库，恪守只读约束。

### feat-028 实现前契约

- **数据模型**：不新增表、不迁移、零写库。搜索是纯读查询：文章（title/summary LIKE）、素材（复用既有 chunk_fts FTS5 短语匹配 + 素材标题 LIKE 兜底未清洗素材，按素材去重）、选题（title LIKE + brief JSON 文本 LIKE）、复盘经验（retro_notes 的 title/insights/nextTopicHint LIKE）。LIKE 统一 `ESCAPE '\'` 转义 `\ % _`，FTS 沿用双引号短语转义；`segmentCjk` 从 db/fts 移至 lib/utils（纯函数归位，db/fts 改为导入，行为不变）。
- **核心查询（可测）**：新增 `src/lib/command-search.ts`，`searchCommandCore({ db, sqlite }, query, limit)` 显式传入 drizzle 句柄 + 最小 `prepare().all()` 原生句柄（运行时 better-sqlite3，测试 bun:sqlite 内存库）。返回按固定顺序分组（文章→素材→选题→复盘经验）；文章命中复用 `getReadinessFactsCore + computeReadiness + deriveJourneyStep + getJourneyDestination`，附自然语言状态（readiness state + 下一步）与直达 href（含 `?panel=` 写作台面板目标）；`getCommandHomeCore` 返回空查询数据（最近更新的创作 + 「继续上次创作」目标）。空/纯空白查询返回空分组，不查库。
- **服务端入口**：GET route handler `/api/command-search?q=`（只读，force-dynamic）。成功返回 `{ ok, groups, recent, continueArticle }`；异常返回 500 + 中文错误消息，由面板呈现并支持重试。
- **面板 UI**：新增 `src/components/command-palette.tsx`（client），挂载于根布局，基于既有依赖 @radix-ui/react-dialog（焦点圈闭、Esc 关闭、关闭后焦点还原到唤起前元素，遵循 shadcn/ui 可访问性约定）；输入框 role=combobox + aria-activedescendant，结果 listbox/option，↑↓ 循环、Enter 直达（router.push）、鼠标悬停同步激活。全站 ⌘K/Ctrl+K 监听 window keydown；移动端顶栏与桌面侧栏各加可点击搜索入口（自定义事件唤起同一面板）。输入 200ms 防抖 + AbortController 取消陈旧请求。空查询显示「动作」（开始一次新创作 /create、继续上次创作=最近更新文章、打开设置 /settings）与「最近更新」；动作在搜索时按标签过滤与结果同面板呈现。
- **快捷键冲突**：编辑器 Bubble Menu 现占用 ⌘K（选区非空时打开链接编辑，feat-018 已文档化）。约定：选区非空时链接编辑优先（编辑器侧 stopPropagation），光标无选区或编辑器外 ⌘K 一律唤起面板；Bubble 菜单原「空选区也 preventDefault」的行为收敛为仅在真正处理时拦截。DESIGN.md 同步记录。
- **失败路径**：查询请求失败/非 200 → 面板内明确报错 + 「重试」；无结果 → 引导文案 + 「去新建一次创作」动作；面板为纯覆盖层不卸载页面，编辑器未保存输入不受唤起/关闭影响（浏览器实测验证）。「最近访问」以最近更新代替（不引入访问记录表，恪守零写库约束）。
- **验证门槛**：新增 tests/command-search.test.ts 覆盖 ①中文关键词四域命中（含 readiness 状态文案与 panel 直达 href）②空/空白查询零结果不报错 ③特殊字符转义（% _ \ 双引号单引号不炸、不通配误命中）④分组固定顺序与组内排序（文章按 updatedAt 倒序）。bun test tests 全绿 + typecheck/lint/build/DESIGN lint（./init.sh）+ 真实浏览器：⌘K 唤起→中文跨域命中→Enter 直达面板/页面→编辑器未保存内容不丢；空查询动作+最近更新；无结果引导；375px 入口可点且两档无横向溢出；控制台 0 error。

### feat-027 Journey Step Navigation Feedback

### feat-027 Journey Step Navigation Feedback

- **根因**：步骤 href 正确写入 `?panel=`，但 Workbench 只在首次 `useState` 初始化读取 `data.initialPanel`，已挂载后 App Router 更新、前进/后退不会同步 tab；“写作”原本只链接到无参数文章 URL，没有可恢复的编辑器目标，也没有滚动或焦点反馈。规则同时分散在 JourneySteps、页面参数校验与本地 tab state。
- **实现**：新增 `src/lib/journey-navigation.ts` 作为步骤目的地与 panel 解析的单一规则；`panel=writing` 明确表达编辑器目标。Workbench 监听当前 `useSearchParams()`：materials/review/packaging/versions 切换面板并滚动，writing 滚动并聚焦 Tiptap；增加稳定 DOM 锚点、面板 `aria-pressed` 和 2px focus-visible。JourneySteps 对同页入口执行幂等即时揭示，保证重复激活相同 URL 仍有反馈；滚动在 reduced-motion 下即时定位。readiness 的 `aria-current=step` 仍只来自服务端事实推导。
- **TDD**：首轮 `bun test tests/journey-navigation.test.ts` 因缺少统一模块失败；实现后新增 3 项导航语义测试，并与 readiness 17 项共同通过（20/20）。测试覆盖合法/非法初始与后续 panel、方向/写作/检查目标、后三步跨页目的地；既有 journey readiness 映射保持通过。
- **浏览器证据**（文章 11，事实阶段=复盘）：方向→资料面板 pressed 且 panelTop 17px；写作→contenteditable 获得焦点且 top 198px；检查→审阅 pressed 且 panelTop 20px。后退 materials、前进 review、刷新 review 均恢复，`aria-current=step` 全程为复盘。发布准备/已发布/复盘分别到达 `/articles/11/variants`、`/publish`、`/retro` 并可返回；重复方向从 scrollY 1601 回到 126（panelTop 16）。六入口均可 Tab 到达，准确 aria-label，focus-visible 为 solid 2px，Enter 可激活。375px 与 1280px 均无页面级横向溢出，控制台 0 error。导航前后文章 11 仍为 2 个版本，未产生新版本。
- **验证**：`bun test tests` 126/126；最终 `./init.sh` 单次完整退出 0（bun install、typecheck、lint、build、DESIGN lint 0 errors / 0 warnings）。无残余产品风险；受限沙箱内 `npx` 曾无输出停滞，切换到可访问本机缓存的验证环境后同一标准命令稳定通过。

### feat-026 实现前契约

- **数据模型**：不新增表、不迁移。手动发布复用 `publish_tasks`（status=published、publishedAt、externalUrl，由「标记已发布」写入，不经适配器）；复盘向导写既有 `publish_results` + `retro_notes`（resultId 保持溯源）。溯源链依既有外键成立：发布结果→平台稿(variantId)→正文版本(sourceVersionId)/文章(articleId)→创作说明(topicId)→新选题(convertedTopicId)。
- **发布助手（平台稿页内，同一创作上下文）**：每份平台稿附「发布助手」——①发布前检查（服务端 assertPublishable，同拦截语义）；②一键复制整稿/标题/标签/CTA，展示发布说明；③下载正文（新增 /api/articles/[id]/export 输出当前已保存版本 HTML 文档）与本地图片（既有 /api/assets 链接逐张下载）；④粘贴真实链接→「标记已发布」（服务端再次校验，旧稿拒绝；成功写 published 任务记录）。定时任务+mock 适配器 UI 从普通流程移除（executeTask 代码保留供开发测试，发布记录页不再提供执行/重试 mock 按钮）。
- **发布记录（/publish 改名）**：只读记录列表；已发布行主行动「记录这次表现 →」直达复盘向导；遗留 pending/failed 任务标注「历史任务」仅可删除。
- **复盘向导（/retro/record?taskId=）**：自动带入文章标题/平台/平台稿标题/链接（不要求选内部 ID）；四步——表现数据、读者关注、支持/未支持的假设、下一次保持/调整/停止；`buildRetroSummary` 纯函数生成可编辑摘要（措辞固定为「观察/暂时支持」，绝不写因果结论）；确认时一次事务化写入 publish_results + retro_notes（Learning）。旧 /retro 手动录入表单退位为向导入口 + 经验列表（含溯源展示）。
- **回流与查重**：Learning 复用 /create「从过往经验开始」入口（feat-024 已实现预览-查重-确认）；`nextAction` 扩展——已发布未记录表现时首页与驾驶舱唯一下一步变为「记录这次表现」（target=retro），已记录后状态变为「已完成复盘」。
- **不做假能力**：不实现 AI 生图（包装台维持提示词复制 + 本地上传，无不可用按钮）；不做真实平台 API/无人值守发布。
- **失败路径**：标记已发布被拦截时回显原因且不写记录；向导每步输入在客户端 state 保留，保存失败可重试不丢输入；链接允许留空（先记录后补）。
- **验证门槛**：单测覆盖 buildRetroSummary 措辞（含观察/暂时支持、无因果断言）、recordRetroCore 溯源落库、markManualPublishedCore 新旧稿放行/拒绝、readiness 已发布→记录表现的 NextAction；浏览器验证复制/下载/标记已发布/拦截、向导四步→摘要编辑→保存→经验列表溯源、首页下一步变化、/create 经验回流、375/1280 无溢出、控制台 0 error。

### feat-026 完成证据

- **实现**：`lib/publish-assist.ts`（markManualPublishedCore：assertPublishable 服务端校验 + URL 校验 + 写 published 任务）、`lib/retro.ts`（getRetroContextCore 自动带入上下文、buildRetroSummary 观察/暂时支持措辞、recordRetroCore 落库、getRetroTraceCore 溯源链）、`/api/articles/[id]/export` 正文下载、平台稿页内 PublishAssistant 三步（复制→下载→粘贴链接标记）、/publish 改「发布记录」只读+「记录这次表现」入口（mock 执行/重试按钮撤出普通流程）、/retro/record 五步向导（表现数据→读者关注→假设验证→下一次→可编辑摘要）、/retro 改「复盘经验」经验列表+自然语言溯源+「在新创作中复用」、readiness nextAction 扩展 published→记录这次表现。
- **测试**：`bun test tests` 123/123（retro 10 项新增：摘要措辞约束与空段落、手动发布新旧稿放行/拒绝/非法链接、上下文带入、溯源落库与 convertedTopic 延伸、空摘要零写入、发布后 NextAction 推进）；typecheck、lint、build、DESIGN lint 全绿。
- **浏览器**（topic 22/23、article 16/17 等测试数据验后按 ID 清理）：发布助手展开三步、一键复制整稿（clipboard 失败时 prompt 兜底）、无图片时诚实提示、粘贴链接标记已发布（服务端写 published 任务）；首页下一步立即变「记录这次表现」；发布记录页只读 + 直达向导（?taskId= 自动带入文章/平台/平台稿/链接，无内部 ID）；向导四步填答→自动摘要（【表现观察】…不代表因果）→保存→复盘经验页绿框新经验+完整溯源（平台·文章·基于已保存版本 v1·创作说明·发布链接）；「在新创作中复用」→ /create?entry=retro → 真实 AI 方向预览 → 确认创建 topic 23（origin=retro）+ article 17，convertedTopicId 回写溯源延伸；375px 向导/发布记录无溢出；控制台 0 error。

### feat-025 实现前契约

- **数据模型**：不新增表。`ReadinessFacts` 扩展 `publishing`（该创作平台稿的已发布任务数、已记录表现数），由既有 publish_tasks / publish_results 汇集；新增纯函数 `deriveJourneyStep(facts, readiness)` 输出「方向/写作/检查/发布准备/已发布/复盘」六步中的当前步（已发布>0 且未记录表现 → 已发布；已记录 → 复盘；否则按 NextAction 目标映射：brief→方向、editor→写作、review/evidence→检查、packaging/variants/publish→发布准备）。
- **编辑入口收敛（不保留两套）**：`/articles/[id]/review` 与 `/articles/[id]/packaging` 改为服务端 redirect 到写作台对应面板（`/articles/[id]?panel=review|packaging`），历史 URL 不失效；平台稿唯一编辑入口保持 `/articles/[id]/variants`（本就在创作上下文内，带同一页头与步骤条）。文章页顶部的旧四 tab（写作/审阅/包装/平台版本）替换为六步步骤条：当前步高亮、可点击回看（方向/检查→对应面板，写作→编辑器，发布准备→平台稿页，已发布→发布记录，复盘→复盘经验）；回到早前步骤修改时，ReadinessStrip 徽章继续即时标明哪些后续产物待更新。
- **辅助区自动打开**：写作台右侧面板初始 tab 由 NextAction 目标决定（brief/evidence→资料、review→检查、packaging→包装），URL `?panel=` 优先。
- **导航收敛**：全局导航改为 首页 / 创作(/articles) / 资料(/materials) / 发布记录(/publish) / 复盘经验(/retro) / 设置；选题板退出导航，作为「创作」页头部的库视图链接保留（/topics 本身不失效）。
- **编辑器渐进披露**：工具栏默认仅保留常用（撤销重做、H2/H3、加粗斜体、列表、引用、插图、专注）；删除线/行内代码/任务列表/代码块/H1/预览/导入导出等收进「更多」弹出层。自动保存状态只显示「已保存」或错误+重试（dirty/saving 不再展示文案）。
- **AI 覆盖与破坏性操作**：既有 AI 改写/润色已是预览→接受；接受后的成功反馈附「撤销本次修改」（编辑器事务级 undo）。平台稿删除、复盘记录删除补二次确认（文章删除已有）；引用移除本就保留正文文字属非破坏。领域级软删除/回收站不在本轮范围，作为已知限制记录。
- **失败路径**：redirect 只读迁移不改数据；面板初始 tab 计算失败回退「检查」；工具栏「更多」为纯客户端展示不影响命令可用性。
- **验证门槛**：单测覆盖 deriveJourneyStep 六步映射与 publishing 事实汇集、facts 扩展后既有 readiness 测试全绿；浏览器验证旧 URL 重定向、步骤条随状态推进（写作→检查→发布准备→已发布→复盘）、NextAction 自动开面板、更多菜单与保存状态、AI 接受后撤销恢复原文、平台稿删除二次确认、375/1280 无溢出、控制台 0 error。

### feat-025 完成证据

- **实现**：`deriveJourneyStep` + `publishing` 事实；`JourneySteps` 步骤条替换旧四 tab；review/packaging 旧 URL redirect 到 `?panel=`（唯一可编辑入口在写作台面板）；面板按 NextAction 自动打开（URL 优先）；导航收敛为 首页/创作/资料/发布记录/复盘经验/设置（选题板改为创作页内链接，/topics 不失效）；工具栏渐进披露（「更多」菜单 9 项）；保存状态只显示「已保存」/错误+重试；AI 接受后「撤销本次 AI 修改」；ConfirmButton 补平台稿/资料/复盘删除二次确认；删除未使用的 article-tabs 组件与手动状态入口残留。
- **术语清理**：普通界面不再出现 检查点/工作稿/mock——已保存版本 vN、有未保存的新修改、当前正文、本地演示、本地兜底；版本备注同步改为「检查前自动保存」等自然语言（历史记录保留旧文案，不改写历史）。
- **测试**：`bun test tests` 114/114；typecheck、lint、build、DESIGN lint 全绿。
- **浏览器**：旧 /review /packaging URL 重定向且面板正确；无参数时按 NextAction 自动开资料面板；步骤条当前步正确、点击「发布准备」跨页直达平台稿页；「更多」菜单开合与命令应用；真实 AI 改写→接受→一键撤销逐字还原并自动保存；平台稿删除 confirm 拒绝后零删除；375px 步骤条+状态条首屏可见、无横向溢出、无内部术语；控制台 0 error。
- **已知限制**：破坏性操作提供二次确认；领域级「短期撤销/回收站」（软删除）未实现，编辑器内容级撤销已覆盖 AI 覆盖性修改。

### feat-024 实现前契约

- **数据模型**：不新增表。`app_settings` JSON 增加 `onboarding` 区块（completed / contentType / primaryPlatform / startFrom），zod `.catch` 默认值保证旧设置兼容；跳过即 completed=true，不逼答。向导确认后走既有 topics + articles + articleVersions 路径：一次确认恰好创建 1 个选题 + 1 篇文章（v1 空白稿）+ 对齐指纹，用户全程只看到「新创作」。
- **首次引导**：首页顶部卡片（onboarding 未完成时显示），3 步单选（创作类型 → 主要平台 → 从想法还是资料开始），每步可跳过、整卡可跳过；答案只写设置作为后续默认值。示例创作以只读预演形式内嵌（静态展示流程，不写任何记录），从根上保证不污染正式数据。
- **首页收敛**：首屏仅「继续上次创作」（最近更新的文章 + `computeReadiness` 的自然语言状态与唯一下一步）与「开始一次新创作」（进入 /create）两个主行动；下方最多 3 个待处理创作，每个直接显示 NextAction 文案；统计块、闭环导航图、快速灵感表单、复盘列表全部退出首屏（能力由向导与侧栏导航承接）。
- **创建向导（/create）**：三个入口——想法（输入一句话 → 「直接开始写」或「让 AI 给几个方向」）、资料（引导去素材库导入并说明系统会自动整理）、历史经验（选择复盘结论 → AI 生成方向预览）。AI 多选题只返回预览：展示 2-3 个候选 + 推荐标记 + 与既有选题的查重提示（纯函数 bigram 相似度），确认后才落库；放弃/刷新不产生任何记录。
- **创作说明降门槛**：确认方向后展示可跳过的普通问题（写给谁 / 希望读者做什么 / 核心观点 / 发布平台 / 哪些观点需要证据 / 语气），全部带默认值（平台默认取引导答案），「全部用默认值开始」一键通过；答案经 normalizeTopicBrief 存为 brief，需要证据的要点默认为「个人观点，无需引用」，勾选才要求证据。
- **失败路径**：想法为空拒绝且不写库；AI 预览失败给出重试且不落任何记录；确认写库失败时保留向导输入。历史 URL 不变（首页仍为 /，新增 /create）。
- **验证门槛**：单测覆盖 onboarding schema 兼容、标题相似度查重、想法标题归一、默认 Brief 答案、confirmCreationCore 恰好创建 topic+article+v1+对齐指纹且空标题拒绝；浏览器验证首次引导 3 步与跳过、首页两主行动与 ≤3 待处理、想法直接开始/AI 预览-查重-确认-放弃不落库、经验入口预览确认、375px 首屏可见状态与下一步、控制台 0 error。

### feat-024 完成证据

- **实现**：设置 onboarding 区块（旧 JSON 自动补默认）；`lib/create.ts` 纯函数（归一/查重/默认答案）+ `confirmCreationCore` 唯一写库入口；`actions/create.ts` 预览动作零写库；首页重构（继续上次创作复用 computeReadiness 的状态与下一步文案）；OnboardingCard 3 步可跳过 + 只读示例流程；/create 三入口向导 + 6 问创作说明全默认值。
- **查重调优**：真实 AI 三轮对照——去标点与虚词后 bigram 阈值 0.35，真语义重复（0.43/0.39）命中、差异化角度候选（0.28-0.33）不误报；这是提示不是拦截。
- **测试**：`bun test tests` 112/112（create 9 项新增）；typecheck、lint、build、DESIGN lint 全绿。
- **浏览器**（topic 20/article 14 验后清理，onboarding 已重置为首装状态）：引导 3 步答案持久化并按「从想法开始」跳转 /create；真实 AI 生成 3 方向，预览期间 topics/articles 计数不变；确认后恰好 1 选题+1 文章+v1+对齐指纹+证据标记，工作台 NextAction 立即显示「1 个重点观点还没有依据」；经验入口基于复盘结论生成方向且不写库；375px 首页 scrollWidth=375、继续卡首屏可见；控制台 0 error。

### feat-023 实现前契约

- **数据模型**：仅新增 `articles.aligned_brief_fingerprint TEXT`（可空，幂等补列），记录「当前正文被确认对齐到哪个 Brief 指纹」。写入时机：① 从 Brief 预览确认生成初稿 / 自动初稿时写当前 Brief 指纹；② 保存 Brief 前，对该选题下指纹为空的既有文章回填「编辑前 Brief 的指纹」（在动作发生时记录合理事实，不凭空猜测）；③ 用户在写作台显式点击「确认正文已对齐」。指纹为 NULL（旧数据、从未记录）不产生缺口，不伪造状态。
- **唯一状态计算**：新增 `src/lib/readiness.ts`。`getReadinessFactsCore(db, articleId)` 汇集六类事实（正文与工作稿、当前检查点、Brief 完整性与对齐指纹、要点证据覆盖、引用有效状态、当前检查点上的审阅与未处理 critical、包装/平台稿来源）；`computeReadiness(facts)` 纯函数输出有序缺口列表（每条含自然语言标题、原因、直达位置、是否可跳过与风险、是否阻断发布）与唯一 NextAction；不读 `articles.status`，不看“执行过某动作”。客户端用同一纯函数在正文变化时即时重算。
- **缺口优先级**：正文为空（阻断）→ 创作说明不完整（可跳过）→ 创作说明修改后未确认对齐（可跳过）→ 需证据要点未覆盖（可跳过）→ 未处理严重问题（阻断）→ 当前正文尚未检查（可跳过）→ 引用依据降级（可跳过）→ 包装基于旧正文（可跳过）→ 无平台稿/平台稿全部过期（阻断发布）。全部缺口保留展示，主行动只取第一条。
- **发布服务端校验**：`assertPublishable(facts, variantSourceVersionId)` 纯函数；`createPublishTask` 拒绝时不落任务并以 redirect 查询参数回显中文原因；`executeTask`（立即发布/到期执行/重试共用）在调用适配器前再次校验，拒绝时任务置 failed 且 lastError 写明「平台稿基于旧正文」等原因——旧稿保留但不可发布。
- **状态表达收敛**：写作台头部撤下 `articles.status` 徽章与人工状态入口，改显示 readiness 自然语言状态（禁止手动状态绕过）；`articles.status` 列保留供列表筛选与旧数据兼容，不再参与任何决策（全站入口收敛在 feat-025 处理并记录）。
- **失败路径**：facts 汇集失败（文章不存在）返回 null 由页面 404；发布校验失败不写任务/不调用适配器；确认对齐失败不改指纹。
- **验证门槛**：单测覆盖 computeReadiness 主要状态组合与优先级、assertPublishable 四类拒绝、getReadinessFactsCore 对内存库的事实汇集、对齐指纹三种来源与 NULL 兼容；跑全套检查后浏览器验证：正文变化→缺口即时更新且旧产物标过期、直达按钮落位、旧平台稿创建任务被拒并回显原因、到期任务对过期稿置 failed、确认对齐闭环、375/1280 无溢出、控制台 0 error。

### feat-023 完成证据

- **实现**：`src/lib/readiness.ts`（事实汇集 + 纯函数 readiness/NextAction + assertPublishable）、`src/components/workbench/readiness-strip.tsx`（状态 + 唯一主行动 + 待办分级 + 确认对齐）、workbench 客户端用同一纯函数在正文变化时即时重算；`articles.aligned_brief_fingerprint` 幂等补列，对齐事实在初稿确认 / Brief 编辑前回填 / 显式确认三处写入；`createPublishTask` 与 `executeTask` 双重服务端校验；删除未使用的 `updateArticleStatus` 手动状态入口，写作台头部撤下 status 徽章。
- **测试**：`bun test tests` 103/103（readiness 15 项新增）；typecheck、lint、build、DESIGN lint 全绿。
- **浏览器**（文章 13/选题 19，验后按 ID 清理）：空文→「从写下第一段开始」+ 开始写作；输入正文即时变为「距离可发布还差 1 步」+ 分级待办；人工 critical →「处理严重问题」阻断，处理后主行动自动切到「生成平台稿」并直达平台版本页；新平台稿创建任务成功横幅；改正文后创建任务被拦（未固化原因），保存 v3 后旧稿被拦（旧正文原因），已排队任务「立即发布」被服务端置 failed 且 lastError 写明原因；重新派生平台稿后发布恢复；Brief 修改→「查看创作说明并确认」缺口→「确认正文已对齐」即清除；dev server 中断+刷新后正文与状态完整恢复（失败不丢输入）；375px 首屏可见状态与唯一下一步、scrollWidth=375；控制台 0 error。
- **决策**：`articles.status` 列保留（列表筛选与旧数据兼容）但不再参与任何决策与写作台展示；全站状态入口收敛留给 feat-025 记录处理。对齐指纹为 NULL 的旧文章不产生缺口（不伪造事实），在下一次 Brief 编辑时回填编辑前指纹。

### feat-022 实现前契约（已完成）

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
