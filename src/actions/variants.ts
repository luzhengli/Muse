"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import {
  db,
  articles,
  articleVersions,
  platformVariants,
  type Platform,
} from "@/db";
import { aiVariant } from "@/lib/ai";
import type { AiActionResult } from "@/lib/ai";
import { completedAiAction, runExclusiveAiAction } from "@/lib/ai/action";
import { nowUnix } from "@/lib/utils";

/** 从内容母版派生平台版本 */
export async function generateVariant(
  articleId: number,
  platform: Platform,
): Promise<AiActionResult> {
  return runExclusiveAiAction(
    `variant:article:${articleId}:${platform}`,
    `generate-variant-${platform}`,
    async () => {
      const article = await db.query.articles.findFirst({
        where: eq(articles.id, articleId),
      });
      const version = await db.query.articleVersions.findFirst({
        where: eq(articleVersions.articleId, articleId),
        orderBy: desc(articleVersions.versionNo),
      });
      if (!article || !version) {
        return { ok: false, message: "没有可派生的文章版本。", tone: "danger" };
      }
      const result = await aiVariant(article.title, version.contentText, platform);
      await db.insert(platformVariants).values({
        articleId,
        platform,
        title: result.data.title,
        content: result.data.content,
        hashtags: result.data.hashtags,
        cta: result.data.cta,
        summary: result.data.summary,
        publishNote: result.data.publishNote,
      });
      revalidatePath(`/articles/${articleId}/variants`);
      return completedAiAction(result, "平台版本已派生。");
    },
  );
}

export async function updateVariant(formData: FormData) {
  const id = Number(formData.get("id"));
  const articleId = Number(formData.get("articleId"));
  if (!id) return;
  await db
    .update(platformVariants)
    .set({
      title: String(formData.get("title") ?? ""),
      content: String(formData.get("content") ?? ""),
      cta: String(formData.get("cta") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      publishNote: String(formData.get("publishNote") ?? ""),
      hashtags: String(formData.get("hashtags") ?? "")
        .split(/[\s,，]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      updatedAt: nowUnix(),
    })
    .where(eq(platformVariants.id, id));
  revalidatePath(`/articles/${articleId}/variants`);
}

export async function deleteVariant(id: number, articleId: number) {
  await db.delete(platformVariants).where(eq(platformVariants.id, id));
  revalidatePath(`/articles/${articleId}/variants`);
}
