import { and, desc, eq } from "drizzle-orm";
import { articleDrafts, articleVersions, articles } from "@/db/schema";
import { getDraft, saveDraftCore, saveVersionCore, type MuseDb } from "@/lib/drafts";
import { nowUnix } from "@/lib/utils";

export interface ActiveRevisionState {
  contentHtml: string;
  checkpoint: { id: number; versionNo: number; contentHtml: string } | null;
  latestVersionId: number | null;
  draftBaseVersionId: number | null;
}

export function isDerivativeStale(
  sourceVersionId: number | null,
  activeCheckpointId: number | null,
) {
  return sourceVersionId === null || activeCheckpointId === null || sourceVersionId !== activeCheckpointId;
}

/** 当前内容优先取工作稿；内容相同的检查点优先复用版本号最高的一条。 */
export async function getActiveRevisionCore(
  db: MuseDb,
  articleId: number,
): Promise<ActiveRevisionState | null> {
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });
  if (!article) return null;
  const draft = await getDraft(db, articleId);
  const latest = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  const contentHtml = draft?.contentHtml ?? latest?.contentHtml ?? "<p></p>";
  const checkpoint = await db.query.articleVersions.findFirst({
    where: and(
      eq(articleVersions.articleId, articleId),
      eq(articleVersions.contentHtml, contentHtml),
    ),
    orderBy: desc(articleVersions.versionNo),
  });
  return {
    contentHtml,
    checkpoint: checkpoint
      ? { id: checkpoint.id, versionNo: checkpoint.versionNo, contentHtml: checkpoint.contentHtml }
      : null,
    latestVersionId: latest?.id ?? null,
    draftBaseVersionId: draft?.baseVersionId ?? null,
  };
}

/**
 * 把当前工作稿固定为不可变检查点。传入编辑器 HTML 时先同步工作稿，
 * 避免 debounce 尚未落库导致下游操作静默读取旧内容。
 */
export async function ensureActiveCheckpointCore(
  db: MuseDb,
  articleId: number,
  currentContentHtml?: string,
  note = "自动保存的版本",
) {
  if (currentContentHtml !== undefined) {
    await saveDraftCore(db, articleId, currentContentHtml);
  }
  let state = await getActiveRevisionCore(db, articleId);
  if (!state) return null;
  if (!state.checkpoint) {
    await saveVersionCore(db, articleId, state.contentHtml, note);
    state = await getActiveRevisionCore(db, articleId);
  } else if (state.draftBaseVersionId !== state.checkpoint.id) {
    await db
      .update(articleDrafts)
      .set({ baseVersionId: state.checkpoint.id, updatedAt: nowUnix() })
      .where(eq(articleDrafts.articleId, articleId));
  }
  return state?.checkpoint ?? null;
}
