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
import { nowUnix } from "@/lib/utils";

/** 从内容母版派生平台版本 */
export async function generateVariant(articleId: number, platform: Platform) {
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });
  const version = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  if (!article || !version) return;
  const gen = await aiVariant(article.title, version.contentText, platform);
  await db.insert(platformVariants).values({
    articleId,
    platform,
    title: gen.title,
    content: gen.content,
    hashtags: gen.hashtags,
    cta: gen.cta,
    summary: gen.summary,
    publishNote: gen.publishNote,
  });
  revalidatePath(`/articles/${articleId}/variants`);
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
