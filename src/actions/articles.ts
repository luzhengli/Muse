"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  db,
  articles,
  articleVersions,
  articleCitations,
} from "@/db";
import { aiRewrite, type RewriteMode } from "@/lib/ai";
import type { AiActionResult } from "@/lib/ai";
import { completedAiAction, runExclusiveAiAction } from "@/lib/ai/action";
import { htmlToText, nowUnix } from "@/lib/utils";

export async function createBlankArticle(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || "未命名文章";
  const [article] = await db
    .insert(articles)
    .values({ title, status: "draft" })
    .returning();
  await db.insert(articleVersions).values({
    articleId: article.id,
    versionNo: 1,
    contentHtml: "<p></p>",
    contentText: "",
    note: "空白稿",
  });
  revalidatePath("/articles");
  redirect(`/articles/${article.id}`);
}

/** 保存新版本 */
export async function saveVersion(
  articleId: number,
  contentHtml: string,
  note: string,
) {
  const latest = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  const versionNo = (latest?.versionNo ?? 0) + 1;
  await db.insert(articleVersions).values({
    articleId,
    versionNo,
    contentHtml,
    contentText: htmlToText(contentHtml),
    note: note || `手动保存 v${versionNo}`,
  });
  await db
    .update(articles)
    .set({ updatedAt: nowUnix() })
    .where(eq(articles.id, articleId));
  revalidatePath(`/articles/${articleId}`);
  return { versionNo };
}

/** 从历史版本恢复：把该版本内容另存为新版本，不破坏历史 */
export async function restoreVersion(articleId: number, versionId: number) {
  const source = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.id, versionId),
  });
  if (!source || source.articleId !== articleId) return;
  const { versionNo } = await saveVersion(
    articleId,
    source.contentHtml,
    `从 v${source.versionNo} 恢复`,
  );
  return { versionNo };
}

export async function updateArticleTitle(articleId: number, title: string) {
  if (!title.trim()) return;
  await db
    .update(articles)
    .set({ title: title.trim(), updatedAt: nowUnix() })
    .where(eq(articles.id, articleId));
  revalidatePath(`/articles/${articleId}`);
  revalidatePath("/articles");
}

export async function updateArticleStatus(
  articleId: number,
  status: "draft" | "reviewing" | "packaged" | "ready" | "published",
) {
  await db
    .update(articles)
    .set({ status, updatedAt: nowUnix() })
    .where(eq(articles.id, articleId));
  revalidatePath(`/articles/${articleId}`);
  revalidatePath("/articles");
}

/** 对选中文本执行扩写/改写/重组，返回结果由编辑器替换 */
export async function rewriteText(
  text: string,
  mode: RewriteMode,
): Promise<AiActionResult<string>> {
  if (!text.trim()) {
    return { ok: false, message: "请先选中要处理的文字。", tone: "danger" };
  }
  return runExclusiveAiAction(`rewrite:${mode}:${text}`, `rewrite-${mode}`, async () => {
    const result = await aiRewrite(text, mode);
    const label = mode === "expand" ? "扩写" : mode === "restructure" ? "重组" : "改写";
    return completedAiAction(result, `${label}完成。`, result.data);
  });
}

export async function addCitation(articleId: number, materialId: number, note: string) {
  await db.insert(articleCitations).values({ articleId, materialId, note });
  revalidatePath(`/articles/${articleId}`);
}

export async function removeCitation(citationId: number, articleId: number) {
  await db.delete(articleCitations).where(eq(articleCitations.id, citationId));
  revalidatePath(`/articles/${articleId}`);
}

export async function deleteArticle(id: number) {
  await db.delete(articles).where(eq(articles.id, id));
  revalidatePath("/articles");
  redirect("/articles");
}
