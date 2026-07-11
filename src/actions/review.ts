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
import { aiReview, aiPolishWithSuggestion, aiFactCheck } from "@/lib/ai";
import type { AiActionResult, FactCheckEvidenceInput } from "@/lib/ai";
import {
  aiProvenance,
  completedAiAction,
  runExclusiveAiAction,
} from "@/lib/ai/action";
import { ensureActiveCheckpointCore } from "@/lib/revisions";
import { getCitationStatesCore } from "@/lib/citations";

interface PolishPreview {
  mode: "fragment" | "document";
  original: string;
  revised: string;
}

/** 对文章最新版本执行 AI 审阅 */
export async function runAiReview(
  articleId: number,
  currentContentHtml?: string,
  platformId?: string,
): Promise<AiActionResult> {
  return runExclusiveAiAction(
    `review:article:${articleId}:${platformId ?? "general"}`,
    "review-article",
    async () => {
      const checkpoint = await ensureActiveCheckpointCore(
        db,
        articleId,
        currentContentHtml,
        "审阅前自动检查点",
      );
      const version = checkpoint
        ? await db.query.articleVersions.findFirst({ where: eq(articleVersions.id, checkpoint.id) })
        : null;
      if (!version) {
        return { ok: false, message: "没有可审阅的文章版本。", tone: "danger" };
      }
      const result = await aiReview(version.contentText, platformId);
      const [review] = await db
        .insert(reviews)
        .values({
          articleId,
          sourceVersionId: version.id,
          type: "ai",
          summary: `【${aiProvenance(result.meta)}】${result.data.summary}`,
        })
        .returning();
      if (result.data.findings.length) {
        await db.insert(reviewFindings).values(
          result.data.findings.map((f) => ({
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
      return completedAiAction(result, "AI 审阅完成。");
    },
  );
}

/**
 * AI 事实检查：只依据本文关联的本地资料核对，
 * 区分资料支持 / 缺少资料 / 资料冲突 / 来源不可用；缺少资料不是事实错误。
 */
export async function runFactCheck(
  articleId: number,
  currentContentHtml?: string,
): Promise<AiActionResult> {
  return runExclusiveAiAction(
    `fact-check:article:${articleId}`,
    "fact-check-article",
    async () => {
      const checkpoint = await ensureActiveCheckpointCore(
        db,
        articleId,
        currentContentHtml,
        "事实检查前自动检查点",
      );
      const version = checkpoint
        ? await db.query.articleVersions.findFirst({ where: eq(articleVersions.id, checkpoint.id) })
        : null;
      if (!version) {
        return { ok: false, message: "没有可检查的文章内容。", tone: "danger" };
      }
      const citations = await getCitationStatesCore(db, articleId);
      const evidence: FactCheckEvidenceInput[] = citations.map((c) => ({
        key: c.key,
        sourceTitle: c.sourceTitle,
        excerpt: c.excerpt,
        state:
          c.validity === "valid"
            ? "available"
            : c.validity === "source-changed"
              ? "changed"
              : "missing",
      }));
      const result = await aiFactCheck(version.contentText, evidence);
      const [review] = await db
        .insert(reviews)
        .values({
          articleId,
          sourceVersionId: version.id,
          type: "ai",
          summary: `【${aiProvenance(result.meta)}】事实检查：${result.data.summary}`,
        })
        .returning();
      if (result.data.claims.length) {
        await db.insert(reviewFindings).values(
          result.data.claims.map((claim) => ({
            reviewId: review.id,
            category: "fact" as const,
            // 缺少资料不是错误 → info；冲突与来源不可用需要处理 → warn
            severity:
              claim.verdict === "conflict" || claim.verdict === "unavailable"
                ? ("warn" as const)
                : ("info" as const),
            quote: claim.quote,
            suggestion: claim.explanation,
            evidenceState: claim.verdict,
          })),
        );
      }
      revalidatePath(`/articles/${articleId}/review`);
      revalidatePath(`/articles/${articleId}`);
      return completedAiAction(result, "事实检查完成。");
    },
  );
}

export async function runAiReviewFromForm(formData: FormData): Promise<AiActionResult> {
  const articleId = Number(formData.get("articleId"));
  const platform = String(formData.get("platform") ?? "");
  if (!articleId) return { ok: false, message: "文章不存在。", tone: "danger" };
  return runAiReview(articleId, undefined, platform || undefined);
}

/** 人工审阅意见 */
export async function addHumanFinding(formData: FormData) {
  const articleId = Number(formData.get("articleId"));
  const suggestion = String(formData.get("suggestion") ?? "").trim();
  if (!articleId || !suggestion) return;
  const checkpoint = await ensureActiveCheckpointCore(db, articleId, undefined, "人工审阅前自动检查点");
  // 复用或创建当前版本的人工审阅记录
  let review = await db.query.reviews.findFirst({
    where: eq(reviews.articleId, articleId),
    orderBy: desc(reviews.createdAt),
  });
  if (!review || review.type !== "human" || review.sourceVersionId !== checkpoint?.id) {
    [review] = await db
      .insert(reviews)
      .values({
        articleId,
        sourceVersionId: checkpoint?.id,
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
export async function polishFinding(
  articleId: number,
  findingId: number,
  currentContentHtml?: string,
): Promise<AiActionResult<PolishPreview>> {
  return runExclusiveAiAction<PolishPreview>(`polish:finding:${findingId}`, "polish-review-finding", async () => {
    const finding = await db.query.reviewFindings.findFirst({
      where: eq(reviewFindings.id, findingId),
    });
    const review = finding
      ? await db.query.reviews.findFirst({ where: eq(reviews.id, finding.reviewId) })
      : null;
    const checkpoint = await ensureActiveCheckpointCore(
      db,
      articleId,
      currentContentHtml,
      "润色前自动检查点",
    );
    if (!finding || !review?.sourceVersionId || !checkpoint) {
      return { ok: false, message: "润色失败：没有可用版本。", tone: "danger" };
    }
    if (review.sourceVersionId !== checkpoint.id) {
      return {
        ok: false,
        message: "这条意见来自旧版本，当前工作稿已变化。请重新审阅后再润色。",
        tone: "warning",
      };
    }
    const version = await db.query.articleVersions.findFirst({
      where: eq(articleVersions.id, review.sourceVersionId),
    });
    if (!version) {
      return { ok: false, message: "润色失败：来源版本已不可用。", tone: "danger" };
    }

    const quote = finding.quote.trim();
    if (quote && version.contentHtml.includes(quote)) {
      const result = await aiPolishWithSuggestion(quote, finding.suggestion, false);
      return completedAiAction(result, "润色预览已生成。", {
        mode: "fragment",
        original: quote,
        revised: result.data,
      });
    }
    const result = await aiPolishWithSuggestion(
      version.contentHtml,
      quote ? `${finding.suggestion}（相关原文：${quote}）` : finding.suggestion,
      true,
    );
    return completedAiAction(result, "润色预览已生成。", {
      mode: "document",
      original: version.contentHtml,
      revised: result.data,
    });
  });
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
