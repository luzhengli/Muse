"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import {
  db,
  articles,
  articleVersions,
  reviews,
  reviewFindings,
  type ReviewCategory,
} from "@/db";
import { aiReview, aiPolishWithSuggestion } from "@/lib/ai";

/** 对文章最新版本执行 AI 审阅 */
export async function runAiReview(articleId: number, platformId?: string) {
  const version = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  if (!version) return;
  const result = await aiReview(version.contentText, platformId);
  const [review] = await db
    .insert(reviews)
    .values({
      articleId,
      versionId: version.id,
      type: "ai",
      summary: result.summary,
    })
    .returning();
  if (result.findings.length) {
    await db.insert(reviewFindings).values(
      result.findings.map((f) => ({
        reviewId: review.id,
        category: f.category,
        severity: f.severity,
        quote: f.quote,
        suggestion: f.suggestion,
      })),
    );
  }
  await db
    .update(articles)
    .set({ status: "reviewing" })
    .where(eq(articles.id, articleId));
  revalidatePath(`/articles/${articleId}/review`);
  revalidatePath(`/articles/${articleId}`);
}

/** 人工审阅意见 */
export async function addHumanFinding(formData: FormData) {
  const articleId = Number(formData.get("articleId"));
  const suggestion = String(formData.get("suggestion") ?? "").trim();
  if (!articleId || !suggestion) return;
  const version = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  // 复用或创建当前版本的人工审阅记录
  let review = await db.query.reviews.findFirst({
    where: eq(reviews.articleId, articleId),
    orderBy: desc(reviews.createdAt),
  });
  if (!review || review.type !== "human" || review.versionId !== version?.id) {
    [review] = await db
      .insert(reviews)
      .values({
        articleId,
        versionId: version?.id,
        type: "human",
        summary: "人工审阅",
      })
      .returning();
  }
  await db.insert(reviewFindings).values({
    reviewId: review.id,
    category: (String(formData.get("category")) || "polish") as ReviewCategory,
    severity: (String(formData.get("severity")) || "info") as
      | "info"
      | "warn"
      | "critical",
    quote: String(formData.get("quote") ?? ""),
    suggestion,
  });
  revalidatePath(`/articles/${articleId}/review`);
  revalidatePath(`/articles/${articleId}`);
}

/**
 * AI 润色预览：按建议改写引用片段（找得到原文时）或整篇（找不到时）。
 * 只生成预览，不落库；用户在写作页确认后由编辑器回写并保存新版本。
 */
export async function polishFinding(articleId: number, findingId: number) {
  const finding = await db.query.reviewFindings.findFirst({
    where: eq(reviewFindings.id, findingId),
  });
  const version = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  if (!finding || !version) return null;

  const quote = finding.quote.trim();
  if (quote && version.contentHtml.includes(quote)) {
    const revised = await aiPolishWithSuggestion(quote, finding.suggestion, false);
    return { mode: "fragment" as const, original: quote, revised };
  }
  const revisedHtml = await aiPolishWithSuggestion(
    version.contentHtml,
    quote ? `${finding.suggestion}（相关原文：${quote}）` : finding.suggestion,
    true,
  );
  return { mode: "document" as const, original: version.contentHtml, revised: revisedHtml };
}

/** 接受或忽略审阅建议 */
export async function setFindingStatus(
  findingId: number,
  articleId: number,
  status: "accepted" | "ignored" | "open",
) {
  await db
    .update(reviewFindings)
    .set({ status })
    .where(eq(reviewFindings.id, findingId));
  revalidatePath(`/articles/${articleId}/review`);
  revalidatePath(`/articles/${articleId}`);
}
