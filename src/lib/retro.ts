import { eq } from "drizzle-orm";
import {
  articles,
  articleVersions,
  platformVariants,
  publishResults,
  publishTasks,
  retroNotes,
  topics,
} from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import { platformName } from "@/lib/platforms";

/**
 * 复盘向导核心（feat-026）。
 * 摘要措辞固定为「观察 / 暂时支持」——单次表现绝不写成因果结论。
 */

export interface RetroAnswers {
  metrics: { views: number; likes: number; comments: number; shares: number };
  audienceFocus: string;
  supportedHypothesis: string;
  unsupportedHypothesis: string;
  keep: string;
  adjust: string;
  stop: string;
}

/** 由向导答案生成可编辑复盘摘要（确定性模板，用户可再编辑） */
export function buildRetroSummary(
  context: { articleTitle: string; platform: string },
  answers: RetroAnswers,
): string {
  const { metrics } = answers;
  const lines = [
    `【表现观察】《${context.articleTitle}》在${platformName(context.platform)}：浏览 ${metrics.views} · 点赞 ${metrics.likes} · 评论 ${metrics.comments} · 转发 ${metrics.shares}。单次表现只作观察，不代表因果。`,
  ];
  if (answers.audienceFocus.trim()) {
    lines.push(`【读者关注】${answers.audienceFocus.trim()}`);
  }
  if (answers.supportedHypothesis.trim()) {
    lines.push(`【暂时支持的假设】${answers.supportedHypothesis.trim()}（待更多数据验证）`);
  }
  if (answers.unsupportedHypothesis.trim()) {
    lines.push(`【未获支持的假设】${answers.unsupportedHypothesis.trim()}`);
  }
  const next = [
    answers.keep.trim() && `保持：${answers.keep.trim()}`,
    answers.adjust.trim() && `调整：${answers.adjust.trim()}`,
    answers.stop.trim() && `停止：${answers.stop.trim()}`,
  ].filter(Boolean);
  if (next.length) lines.push(`【下一次】${next.join("；")}`);
  return lines.join("\n");
}

export interface RetroContext {
  taskId: number | null;
  variantId: number | null;
  articleId: number | null;
  articleTitle: string;
  variantTitle: string;
  platform: string;
  externalUrl: string;
}

/** 复盘入口自动带入上下文：文章、平台、平台稿、链接（不要求用户选内部 ID） */
export async function getRetroContextCore(
  db: MuseDb,
  taskId: number,
): Promise<RetroContext | null> {
  const task = await db.query.publishTasks.findFirst({ where: eq(publishTasks.id, taskId) });
  if (!task) return null;
  const variant = await db.query.platformVariants.findFirst({
    where: eq(platformVariants.id, task.variantId),
  });
  const article = variant
    ? await db.query.articles.findFirst({ where: eq(articles.id, variant.articleId) })
    : null;
  return {
    taskId: task.id,
    variantId: variant?.id ?? null,
    articleId: article?.id ?? null,
    articleTitle: article?.title ?? "（文章已删除）",
    variantTitle: variant?.title ?? "（平台稿已删除）",
    platform: task.platform,
    externalUrl: task.externalUrl,
  };
}

/** 保存复盘：一次写入表现数据 + Learning，resultId 保持全链溯源 */
export async function recordRetroCore(
  db: MuseDb,
  input: {
    taskId: number | null;
    variantId: number | null;
    platform: string;
    externalUrl: string;
    answers: RetroAnswers;
    summary: string;
    title: string;
    nextTopicHint: string;
  },
): Promise<{ ok: true; resultId: number; noteId: number } | { ok: false; message: string }> {
  if (!input.summary.trim()) {
    return { ok: false, message: "复盘摘要不能为空。" };
  }
  const [result] = await db
    .insert(publishResults)
    .values({
      taskId: input.taskId,
      variantId: input.variantId,
      platform: input.platform as "xiaohongshu" | "x" | "wechat",
      externalUrl: input.externalUrl,
      views: input.answers.metrics.views,
      likes: input.answers.metrics.likes,
      comments: input.answers.metrics.comments,
      shares: input.answers.metrics.shares,
      commentFeedback: input.answers.audienceFocus,
    })
    .returning();
  const [note] = await db
    .insert(retroNotes)
    .values({
      resultId: result.id,
      title: input.title.trim() || `复盘：${input.answers.supportedHypothesis.slice(0, 20) || "本次发布"}`,
      insights: input.summary.trim(),
      nextTopicHint: input.nextTopicHint,
    })
    .returning();
  return { ok: true, resultId: result.id, noteId: note.id };
}

export interface RetroTrace {
  platform: string;
  externalUrl: string;
  variantTitle: string | null;
  articleId: number | null;
  articleTitle: string | null;
  sourceVersionNo: number | null;
  topicTitle: string | null;
  convertedTopicTitle: string | null;
}

/** 溯源：发布结果 → 平台稿 → 正文版本 → 创作说明 → 新选题 */
export async function getRetroTraceCore(
  db: MuseDb,
  noteId: number,
): Promise<RetroTrace | null> {
  const note = await db.query.retroNotes.findFirst({ where: eq(retroNotes.id, noteId) });
  if (!note) return null;
  const result = note.resultId
    ? await db.query.publishResults.findFirst({ where: eq(publishResults.id, note.resultId) })
    : null;
  const variant = result?.variantId
    ? await db.query.platformVariants.findFirst({
        where: eq(platformVariants.id, result.variantId),
      })
    : null;
  const article = variant
    ? await db.query.articles.findFirst({ where: eq(articles.id, variant.articleId) })
    : null;
  const version = variant?.sourceVersionId
    ? await db.query.articleVersions.findFirst({
        where: eq(articleVersions.id, variant.sourceVersionId),
      })
    : null;
  const topic = article?.topicId
    ? await db.query.topics.findFirst({ where: eq(topics.id, article.topicId) })
    : null;
  const converted = note.convertedTopicId
    ? await db.query.topics.findFirst({ where: eq(topics.id, note.convertedTopicId) })
    : null;
  return {
    platform: result?.platform ?? "",
    externalUrl: result?.externalUrl ?? "",
    variantTitle: variant?.title ?? null,
    articleId: article?.id ?? null,
    articleTitle: article?.title ?? null,
    sourceVersionNo: version?.versionNo ?? null,
    topicTitle: topic?.title ?? null,
    convertedTopicTitle: converted?.title ?? null,
  };
}
