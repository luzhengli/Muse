import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = () => sql`(unixepoch())`;

/** 素材库：URL / 文本 / 文件 / 手动笔记（快速灵感也走 note） */
export const materials = sqliteTable("materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["url", "text", "file", "note"] }).notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  filePath: text("file_path"),
  rawContent: text("raw_content").notNull().default(""),
  summary: text("summary").notNull().default(""),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  cleanStatus: text("clean_status", { enum: ["raw", "cleaned"] })
    .notNull()
    .default("raw"),
  createdAt: integer("created_at").notNull().default(now()),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/** 知识整理：清洗后的可检索语料块 */
export const materialChunks = sqliteTable("material_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  materialId: integer("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull().default(now()),
});

/** 素材集合 */
export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

export const collectionMaterials = sqliteTable(
  "collection_materials",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.materialId] })],
);

export interface TopicBrief {
  audience: string;
  objective: string;
  coreClaim: string;
  platforms: string[];
  keyPoints: string[];
  angle: string;
  tone: string;
  outline: string[];
  citedMaterialIds: number[];
  evidence: {
    keyPoint: string;
    materialIds: number[];
    noCitationRequired: boolean;
  }[];
}

/** 选题板：选题卡片 + 创作 brief */
export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id").references(() => collections.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  targetAudience: text("target_audience").notNull().default(""),
  corePoints: text("core_points", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  angle: text("angle").notNull().default(""),
  recommendedPlatforms: text("recommended_platforms", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  materialIds: text("material_ids", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  brief: text("brief", { mode: "json" }).$type<TopicBrief | null>(),
  status: text("status", { enum: ["idea", "briefed", "drafting", "done"] })
    .notNull()
    .default("idea"),
  /** 来源：ai 生成 / 手动 / 复盘反哺 */
  origin: text("origin", { enum: ["ai", "manual", "retro"] })
    .notNull()
    .default("manual"),
  createdAt: integer("created_at").notNull().default(now()),
});

/** 文章（内容母版） */
export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").references(() => topics.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  /** 包装台应用的文章摘要（元信息） */
  summary: text("summary").notNull().default(""),
  /** 包装台设置的封面图（本地资产） */
  coverAssetId: integer("cover_asset_id"),
  /**
   * 当前正文被确认对齐到的 Brief 指纹（briefFingerprint）。
   * NULL = 从未记录（旧数据），readiness 不据此产生缺口，不伪造状态。
   */
  alignedBriefFingerprint: text("aligned_brief_fingerprint"),
  /** 展示用途保留；决策一律走 lib/readiness 的事实计算（feat-023） */
  status: text("status", {
    enum: ["draft", "reviewing", "packaged", "ready", "published"],
  })
    .notNull()
    .default("draft"),
  createdAt: integer("created_at").notNull().default(now()),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/** 文章版本 */
export const articleVersions = sqliteTable("article_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  versionNo: integer("version_no").notNull(),
  contentHtml: text("content_html").notNull(),
  contentText: text("content_text").notNull(),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

/**
 * 当前工作稿（自动保存）：与不可变的 articleVersions 分离，
 * debounce 自动保存只更新这一行，不污染版本历史。
 */
export const articleDrafts = sqliteTable("article_drafts", {
  articleId: integer("article_id")
    .primaryKey()
    .references(() => articles.id, { onDelete: "cascade" }),
  contentHtml: text("content_html").notNull(),
  contentText: text("content_text").notNull().default(""),
  /** 该草稿基于哪个版本检查点（保存新版本后同步） */
  baseVersionId: integer("base_version_id"),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/** 引用关系：文章引用了哪些素材 */
export const articleCitations = sqliteTable("article_citations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  materialId: integer("material_id")
    .notNull()
    .references(() => materials.id, { onDelete: "cascade" }),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

/**
 * 证据引用：正文中的引用精确关联到语料块。
 * 素材删除或重清洗时外键置空，摘录与快照保留，永远不静默丢失用户的引用依据；
 * 有效状态不落库，读取时由 src/lib/citations.ts 的纯函数按当前事实计算。
 */
export const evidenceCitations = sqliteTable("evidence_citations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** 稳定引用身份，正文 citation mark 与 Markdown 边界均使用它 */
  key: text("key").notNull().unique(),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  materialId: integer("material_id").references(() => materials.id, {
    onDelete: "set null",
  }),
  chunkId: integer("chunk_id").references(() => materialChunks.id, {
    onDelete: "set null",
  }),
  /** 引用时选定的语料摘录（用于插入正文与失效判断） */
  excerpt: text("excerpt").notNull().default(""),
  /** 引用时语料块全文快照（来源降级后仍可解释「当时依据是什么」） */
  contextSnapshot: text("context_snapshot").notNull().default(""),
  sourceTitle: text("source_title").notNull().default(""),
  sourceUrl: text("source_url"),
  createdAt: integer("created_at").notNull().default(now()),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/**
 * 审阅：一次 AI 或人工审阅。
 * v1.0 多态挂载（§3.3）：新模型下审阅作用于通用稿修订（sourceRevisionId）
 * 或平台作品修订（outputRevisionId）之一；旧模型经 articleId/versionId 挂载。
 * articleId 的 NOT NULL 约束在切换重置时放开（feat-034，破坏式不做表重建迁移）。
 */
export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  sourceVersionId: integer("version_id").references(() => articleVersions.id, {
    onDelete: "set null",
  }),
  /** v1.0 多态：通用稿修订（与 outputRevisionId 至多一个非空） */
  sourceRevisionId: integer("source_revision_id"),
  /** v1.0 多态：平台作品修订 */
  outputRevisionId: integer("output_revision_id"),
  type: text("type", { enum: ["ai", "human"] }).notNull(),
  summary: text("summary").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

export type ReviewCategory =
  | "fact"
  | "structure"
  | "style"
  | "safety"
  | "compliance"
  | "polish";

/** 事实检查结论：资料支持 / 缺少资料 / 资料冲突 / 来源不可用 */
export type EvidenceState = "supported" | "missing" | "conflict" | "unavailable";

/** 审阅意见条目 */
export const reviewFindings = sqliteTable("review_findings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reviewId: integer("review_id")
    .notNull()
    .references(() => reviews.id, { onDelete: "cascade" }),
  category: text("category", {
    enum: ["fact", "structure", "style", "safety", "compliance", "polish"],
  }).notNull(),
  severity: text("severity", { enum: ["info", "warn", "critical"] })
    .notNull()
    .default("info"),
  quote: text("quote").notNull().default(""),
  suggestion: text("suggestion").notNull(),
  status: text("status", { enum: ["open", "accepted", "ignored"] })
    .notNull()
    .default("open"),
  /** 仅 AI 事实检查产生的意见携带；缺少本地资料不是事实错误 */
  evidenceState: text("evidence_state", {
    enum: ["supported", "missing", "conflict", "unavailable"],
  }),
});

export interface CardStructure {
  cards: { heading: string; body: string }[];
}

/** 包装台：标题候选、摘要、封面/配图提示词、图文卡片 */
export const packagings = sqliteTable("packagings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  sourceVersionId: integer("version_id").references(() => articleVersions.id, {
    onDelete: "set null",
  }),
  titleCandidates: text("title_candidates", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  summary: text("summary").notNull().default(""),
  coverPrompt: text("cover_prompt").notNull().default(""),
  imagePrompts: text("image_prompts", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  cardStructure: text("card_structure", { mode: "json" })
    .$type<CardStructure | null>(),
  createdAt: integer("created_at").notNull().default(now()),
});

/**
 * 本地图片资源。v1.0 起为项目级图片资产池（§3.1）：creationId 归属创作项目，
 * 「封面/首图/正文图/Post 附件」等角色只在具体作品内经 outputAssets 指定。
 * articleId 与 kind 为旧模型残留，切换后收口（feat-034）。
 */
export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id").references(() => articles.id, {
    onDelete: "cascade",
  }),
  /** v1.0 资产池归属（无 FK 兼容补列，代码保证有效性；重置后新数据必填） */
  creationId: integer("creation_id"),
  kind: text("kind", { enum: ["cover", "illustration", "other"] })
    .notNull()
    .default("other"),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  createdAt: integer("created_at").notNull().default(now()),
});

export type Platform = "xiaohongshu" | "x" | "wechat";

/** 平台版本：从内容母版派生 */
export const platformVariants = sqliteTable("platform_variants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  sourceVersionId: integer("source_version_id").references(() => articleVersions.id, {
    onDelete: "set null",
  }),
  platform: text("platform", { enum: ["xiaohongshu", "x", "wechat"] }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  hashtags: text("hashtags", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  cta: text("cta").notNull().default(""),
  summary: text("summary").notNull().default(""),
  publishNote: text("publish_note").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/** 发布任务 */
export const publishTasks = sqliteTable("publish_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  variantId: integer("variant_id")
    .notNull()
    .references(() => platformVariants.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["xiaohongshu", "x", "wechat"] }).notNull(),
  scheduledAt: integer("scheduled_at").notNull(),
  status: text("status", {
    enum: ["pending", "publishing", "published", "failed"],
  })
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error").notNull().default(""),
  publishedAt: integer("published_at"),
  externalUrl: text("external_url").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

/** 复盘中心：发布结果与互动数据（第一版手动录入） */
export const publishResults = sqliteTable("publish_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").references(() => publishTasks.id, {
    onDelete: "set null",
  }),
  variantId: integer("variant_id").references(() => platformVariants.id, {
    onDelete: "set null",
  }),
  platform: text("platform", { enum: ["xiaohongshu", "x", "wechat"] }).notNull(),
  externalUrl: text("external_url").notNull().default(""),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  commentFeedback: text("comment_feedback").notNull().default(""),
  recordedAt: integer("recorded_at").notNull().default(now()),
});

/** 复盘结论：沉淀经验并可反哺为新选题 */
export const retroNotes = sqliteTable("retro_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  resultId: integer("result_id").references(() => publishResults.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  insights: text("insights").notNull(),
  nextTopicHint: text("next_topic_hint").notNull().default(""),
  convertedTopicId: integer("converted_topic_id").references(() => topics.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at").notNull().default(now()),
});

/** 应用设置：单行 key='app' 存 JSON，zod 负责校验/默认/兼容（见 src/lib/settings.ts） */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/* ------------------------------------------------------------------ */
/* v1.0 目标数据模型（PRD §3.3，feat-030 起）。                          */
/* 旧 articles/packagings/platform_variants 模型与其 UI 共存运行，      */
/* 切换与删除在 feat-031~034 的新编辑器就位后收口（破坏式，不迁移）。   */
/* ------------------------------------------------------------------ */

/**
 * 创作项目：一次创作的容器。
 * workingTitle 是内部工作标题，不等同于任何平台的发布标题（§3.1）。
 */
export const creations = sqliteTable("creations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workingTitle: text("working_title").notNull(),
  /** 创作 Brief（沿用 TopicBrief 结构，normalizeTopicBrief 兼容旧 JSON） */
  brief: text("brief", { mode: "json" }).$type<TopicBrief | null>(),
  /** 目标平台集合（创建即选平台，FR-2.1） */
  targetPlatforms: text("target_platforms", { mode: "json" })
    .$type<Platform[]>()
    .notNull()
    .default([]),
  /** 三起点溯源：从哪个选题出发（可空） */
  topicId: integer("topic_id").references(() => topics.id, {
    onDelete: "set null",
  }),
  /** 本次想验证什么（FR-6.1：schema 随 M1 建表，UI 在 M2 交付） */
  hypothesis: text("hypothesis").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/**
 * 可选通用稿（0..1 per creation）：跨平台内容母版的可变工作稿。
 * 单平台直写时不存在；不可变检查点见 sourceRevisions。
 */
export const sourceDocuments = sqliteTable("source_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  creationId: integer("creation_id")
    .notNull()
    .unique()
    .references(() => creations.id, { onDelete: "cascade" }),
  contentHtml: text("content_html").notNull().default(""),
  contentText: text("content_text").notNull().default(""),
  /** 工作稿基于哪个修订（保存新修订后同步；无 FK，代码维护） */
  baseRevisionId: integer("base_revision_id"),
  createdAt: integer("created_at").notNull().default(now()),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/** 不可变通用稿修订 */
export const sourceRevisions = sqliteTable("source_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceDocumentId: integer("source_document_id")
    .notNull()
    .references(() => sourceDocuments.id, { onDelete: "cascade" }),
  revisionNo: integer("revision_no").notNull(),
  contentHtml: text("content_html").notNull(),
  contentText: text("content_text").notNull().default(""),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

export type OutputFormatColumn =
  | "x_single_post"
  | "x_thread"
  | "xiaohongshu_image_note"
  | "wechat_article";

/**
 * 平台作品：某平台某格式的真实作品（§3.1）。
 * 独立修订链与独立 readiness；rulesVersion 镜像活动修订的规则版本（便查询），
 * 修订级的权威值在 platformOutputRevisions.rulesVersion。
 */
export const platformOutputs = sqliteTable("platform_outputs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  creationId: integer("creation_id")
    .notNull()
    .references(() => creations.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["xiaohongshu", "x", "wechat"] }).notNull(),
  format: text("format", {
    enum: [
      "x_single_post",
      "x_thread",
      "xiaohongshu_image_note",
      "wechat_article",
    ],
  }).notNull(),
  /** 活动修订指针（与修订表互为引用，无 FK，代码维护） */
  activeRevisionId: integer("active_revision_id"),
  /** 从通用稿哪个修订派生（可空 = 单平台直写或手工创建） */
  sourceRevisionId: integer("source_revision_id").references(
    () => sourceRevisions.id,
    { onDelete: "set null" },
  ),
  /** output→output 适配溯源（FR-2.1「适配到另一个平台」一等操作） */
  derivedFromOutputId: integer("derived_from_output_id"),
  rulesVersion: text("rules_version").notNull(),
  createdAt: integer("created_at").notNull().default(now()),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/**
 * 作品修订：不可变快照。payloadJson 为 Zod 判别联合
 * （src/lib/platform-rules/payloads.ts），落库前必须通过校验；
 * rulesVersion 记录生成时的规则集版本（FR-0.2）。
 */
export const platformOutputRevisions = sqliteTable("platform_output_revisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  outputId: integer("output_id")
    .notNull()
    .references(() => platformOutputs.id, { onDelete: "cascade" }),
  revisionNo: integer("revision_no").notNull(),
  payloadJson: text("payload_json").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  rulesVersion: text("rules_version").notNull(),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

export type OutputAssetRole =
  | "cover"
  | "first_image"
  | "body_image"
  | "post_media";

/**
 * 修订 ↔ 资产关联（§3.3）。结构（哪张图、什么顺序）以 payload 为权威、
 * 由保存时派生；本表承载资产级元数据（alt/裁剪）与按资产反查。
 */
export const outputAssets = sqliteTable("output_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  outputRevisionId: integer("output_revision_id")
    .notNull()
    .references(() => platformOutputRevisions.id, { onDelete: "cascade" }),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  role: text("role", {
    enum: ["cover", "first_image", "body_image", "post_media"],
  }).notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  /** x_thread：所属帖文序号（0 起）；其他格式为 NULL */
  postIndex: integer("post_index"),
  altText: text("alt_text").notNull().default(""),
  cropJson: text("crop_json"),
  createdAt: integer("created_at").notNull().default(now()),
});

/**
 * 发布记录：对某作品修订的不可变快照 + 可编辑元数据（FR-5.1）。
 * outputRevisionId 一经写入不可变更；url/publishedAt/note 随时可补录修改。
 */
export const publications = sqliteTable("publications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  outputId: integer("output_id")
    .notNull()
    .references(() => platformOutputs.id, { onDelete: "cascade" }),
  outputRevisionId: integer("output_revision_id")
    .notNull()
    .references(() => platformOutputRevisions.id),
  platform: text("platform", { enum: ["xiaohongshu", "x", "wechat"] }).notNull(),
  url: text("url").notNull().default(""),
  note: text("note").notNull().default(""),
  publishedAt: integer("published_at").notNull(),
  /** 显式「带风险发布」的记录（FR-1.4：阻断未清时需二次确认并记录） */
  publishedWithRisk: integer("published_with_risk").notNull().default(0),
  riskReason: text("risk_reason").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

/**
 * 表现快照：同一发布支持多时间点录入（FR-5.2）。
 * metrics 为平台指标 JSON；daysSincePublish 记录「数据截至发布后 N 天」口径。
 */
export const performanceSnapshots = sqliteTable("performance_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  publicationId: integer("publication_id")
    .notNull()
    .references(() => publications.id, { onDelete: "cascade" }),
  metrics: text("metrics", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  capturedAt: integer("captured_at").notNull(),
  daysSincePublish: integer("days_since_publish").notNull().default(0),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now()),
});

export type Material = typeof materials.$inferSelect;
export type MaterialChunk = typeof materialChunks.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type ArticleVersion = typeof articleVersions.$inferSelect;
export type ArticleDraft = typeof articleDrafts.$inferSelect;
export type ArticleCitation = typeof articleCitations.$inferSelect;
export type EvidenceCitation = typeof evidenceCitations.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type ReviewFinding = typeof reviewFindings.$inferSelect;
export type Packaging = typeof packagings.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type PlatformVariant = typeof platformVariants.$inferSelect;
export type PublishTask = typeof publishTasks.$inferSelect;
export type PublishResult = typeof publishResults.$inferSelect;
export type RetroNote = typeof retroNotes.$inferSelect;
export type Creation = typeof creations.$inferSelect;
export type SourceDocument = typeof sourceDocuments.$inferSelect;
export type SourceRevision = typeof sourceRevisions.$inferSelect;
export type PlatformOutput = typeof platformOutputs.$inferSelect;
export type PlatformOutputRevision = typeof platformOutputRevisions.$inferSelect;
export type OutputAsset = typeof outputAssets.$inferSelect;
export type Publication = typeof publications.$inferSelect;
export type PerformanceSnapshot = typeof performanceSnapshots.$inferSelect;
