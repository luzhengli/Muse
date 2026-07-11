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
  platforms: string[];
  keyPoints: string[];
  angle: string;
  tone: string;
  outline: string[];
  citedMaterialIds: number[];
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

/** 审阅：一次 AI 或人工审阅 */
export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id, { onDelete: "cascade" }),
  versionId: integer("version_id").references(() => articleVersions.id, {
    onDelete: "set null",
  }),
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
  versionId: integer("version_id").references(() => articleVersions.id, {
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

/** 本地图片资源 */
export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id").references(() => articles.id, {
    onDelete: "cascade",
  }),
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

export type Material = typeof materials.$inferSelect;
export type MaterialChunk = typeof materialChunks.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type ArticleVersion = typeof articleVersions.$inferSelect;
export type ArticleDraft = typeof articleDrafts.$inferSelect;
export type ArticleCitation = typeof articleCitations.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type ReviewFinding = typeof reviewFindings.$inferSelect;
export type Packaging = typeof packagings.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type PlatformVariant = typeof platformVariants.$inferSelect;
export type PublishTask = typeof publishTasks.$inferSelect;
export type PublishResult = typeof publishResults.$inferSelect;
export type RetroNote = typeof retroNotes.$inferSelect;
