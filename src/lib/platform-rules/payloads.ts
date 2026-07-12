/**
 * 四种平台作品的类型化 payload（PRD v1.0 §3.2）。
 *
 * - Zod 判别联合（按 `type` 判别）+ `schemaVersion`，platform_output_revisions
 *   的 payload_json 必须通过此处校验后才能落库（feat-030 起接线）。
 * - Schema 只约束「可存储的结构」（草稿可以不完整）；「可发布性」由
 *   ./checks.ts 依据规则注册表出具 checklist，两者职责分离。
 * - 媒体/图片以资产 ID 引用项目资产池（§3.1）；顺序即数组顺序。
 *   alt 文本 / 裁剪等资产级元数据由 output_assets 关联表承载（§3.3），
 *   不在 payload 内重复存储。
 * - 小红书首图 = images[0]（小红书发布器以第 1 张图为封面，「设首图」
 *   即移动到首位，不设独立标记以避免双源失同步）。
 * - X 帖文的链接直接写在 text 内（与 X composer 一致），计数按 t.co 处理。
 */
import { z } from "zod";

/** 结构上限随平台硬限制（编辑器同样拦截）；文本长度等软性内容留给发布检查 */
const assetRefSchema = z.object({
  assetId: z.number().int().positive(),
});

export type OutputAssetRef = z.infer<typeof assetRefSchema>;

const xMediaKindSchema = z.enum(["image", "gif", "video"]);

const xMediaRefSchema = assetRefSchema.extend({
  kind: xMediaKindSchema.default("image"),
});

export type XMediaRef = z.infer<typeof xMediaRefSchema>;

const xPostSchema = z.object({
  text: z.string().default(""),
  media: z.array(xMediaRefSchema).max(4).default([]),
});

export type XPostDraft = z.infer<typeof xPostSchema>;

export const xSinglePostPayloadSchema = z.object({
  type: z.literal("x_single_post"),
  schemaVersion: z.literal(1),
  text: z.string().default(""),
  media: z.array(xMediaRefSchema).max(4).default([]),
  /** 仅 Muse 侧的内部备注，不会出现在任何发布产物中（X 无对外标题/摘要） */
  internalNote: z.string().default(""),
});

export const xThreadPayloadSchema = z.object({
  type: z.literal("x_thread"),
  schemaVersion: z.literal(1),
  /** 有序帖文；草稿允许从 1 条起步，发布检查要求 ≥2 条 */
  posts: z.array(xPostSchema).min(1),
  internalNote: z.string().default(""),
});

export const xiaohongshuImageNotePayloadSchema = z.object({
  type: z.literal("xiaohongshu_image_note"),
  schemaVersion: z.literal(1),
  title: z.string().default(""),
  body: z.string().default(""),
  topics: z.array(z.string()).default([]),
  /** 有序图片（第 1 张为首图/封面）；草稿允许 0 张，发布检查硬阻断 */
  images: z.array(assetRefSchema).max(18).default([]),
});

export const wechatArticlePayloadSchema = z.object({
  type: z.literal("wechat_article"),
  schemaVersion: z.literal(1),
  title: z.string().default(""),
  author: z.string().default(""),
  digest: z.string().default(""),
  /** Tiptap 生成的 HTML 正文（正文内图片以资产 URL 引用，导出时打包/内联） */
  contentHtml: z.string().default(""),
  /** 封面资产；null = 未设置（发布检查硬阻断） */
  coverAssetId: z.number().int().positive().nullable().default(null),
  /** 原文链接（可空字符串 = 未设置） */
  sourceUrl: z.string().default(""),
});

export const platformOutputPayloadSchema = z.discriminatedUnion("type", [
  xSinglePostPayloadSchema,
  xThreadPayloadSchema,
  xiaohongshuImageNotePayloadSchema,
  wechatArticlePayloadSchema,
]);

export type XSinglePostPayload = z.infer<typeof xSinglePostPayloadSchema>;
export type XThreadPayload = z.infer<typeof xThreadPayloadSchema>;
export type XiaohongshuImageNotePayload = z.infer<
  typeof xiaohongshuImageNotePayloadSchema
>;
export type WechatArticlePayload = z.infer<typeof wechatArticlePayloadSchema>;
export type PlatformOutputPayload = z.infer<typeof platformOutputPayloadSchema>;

/** 解析失败返回 null（调用方自行决定报错文案），成功返回带默认值的规范化 payload */
export function parsePlatformOutputPayload(
  raw: unknown,
): PlatformOutputPayload | null {
  const parsed = platformOutputPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
