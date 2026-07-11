import { desc, eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/schema";
import { articleDrafts, articleVersions, articles } from "@/db/schema";
import { htmlToText, nowUnix } from "@/lib/utils";

/**
 * 工作稿与版本检查点的核心逻辑。
 * db 显式传入：运行时用 better-sqlite3 实例，测试用 bun:sqlite 内存库。
 *
 * - 工作稿（article_drafts）：每篇文章一行，自动保存反复覆写；
 * - 版本检查点（article_versions）：不可变，只由显式「保存为新版本」产生。
 */

// eslint-disable-next-line
export type MuseDb = BaseSQLiteDatabase<"sync", any, typeof schema>;

/** 自动保存工作稿；内容与现有草稿相同时跳过（去重，返回 saved:false） */
export async function saveDraftCore(
  db: MuseDb,
  articleId: number,
  contentHtml: string,
) {
  const existing = await db.query.articleDrafts.findFirst({
    where: eq(articleDrafts.articleId, articleId),
  });
  if (existing && existing.contentHtml === contentHtml) {
    return { saved: false as const };
  }
  const values = {
    contentHtml,
    contentText: htmlToText(contentHtml),
    updatedAt: nowUnix(),
  };
  if (existing) {
    await db
      .update(articleDrafts)
      .set(values)
      .where(eq(articleDrafts.articleId, articleId));
  } else {
    await db.insert(articleDrafts).values({ articleId, ...values });
  }
  return { saved: true as const };
}

export async function getDraft(db: MuseDb, articleId: number) {
  return (
    (await db.query.articleDrafts.findFirst({
      where: eq(articleDrafts.articleId, articleId),
    })) ?? null
  );
}

/**
 * 显式保存版本检查点：写入不可变 articleVersions，
 * 并把工作稿基线同步到该版本（草稿与版本一致 → 无未保存更改）。
 */
export async function saveVersionCore(
  db: MuseDb,
  articleId: number,
  contentHtml: string,
  note: string,
) {
  const latest = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  const versionNo = (latest?.versionNo ?? 0) + 1;
  const [version] = await db
    .insert(articleVersions)
    .values({
      articleId,
      versionNo,
      contentHtml,
      contentText: htmlToText(contentHtml),
      note: note || `手动保存 v${versionNo}`,
    })
    .returning();
  await db
    .update(articles)
    .set({ updatedAt: nowUnix() })
    .where(eq(articles.id, articleId));

  // 同步工作稿基线
  const draftValues = {
    contentHtml,
    contentText: version.contentText,
    baseVersionId: version.id,
    updatedAt: nowUnix(),
  };
  const existing = await db.query.articleDrafts.findFirst({
    where: eq(articleDrafts.articleId, articleId),
  });
  if (existing) {
    await db
      .update(articleDrafts)
      .set(draftValues)
      .where(eq(articleDrafts.articleId, articleId));
  } else {
    await db.insert(articleDrafts).values({ articleId, ...draftValues });
  }
  return { versionNo, versionId: version.id };
}

/**
 * 页面加载时决定编辑器初始内容：
 * 工作稿与最新版本不同且不落后于它 → 恢复工作稿。
 */
export function resolveInitialContent(
  latestVersion: { contentHtml: string; createdAt: number } | null,
  draft: { contentHtml: string; updatedAt: number } | null,
): { contentHtml: string; restoredFromDraft: boolean } {
  const versionHtml = latestVersion?.contentHtml ?? "<p></p>";
  if (!draft) return { contentHtml: versionHtml, restoredFromDraft: false };
  if (draft.contentHtml === versionHtml) {
    return { contentHtml: versionHtml, restoredFromDraft: false };
  }
  if (latestVersion && draft.updatedAt < latestVersion.createdAt) {
    // 版本检查点比草稿新（例如从历史版本恢复）→ 以版本为准
    return { contentHtml: versionHtml, restoredFromDraft: false };
  }
  return { contentHtml: draft.contentHtml, restoredFromDraft: true };
}
