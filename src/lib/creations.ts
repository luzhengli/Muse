import { desc, eq } from "drizzle-orm";
import {
  creations,
  sourceDocuments,
  sourceRevisions,
  type Platform,
  type TopicBrief,
} from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import { htmlToText, nowUnix } from "@/lib/utils";

/**
 * 创作项目与可选通用稿的核心逻辑（PRD §3.1/§3.3，feat-030）。
 * db 显式传入：运行时 better-sqlite3，测试 bun:sqlite 内存库。
 *
 * - creations：一次创作的容器（内部工作标题 ≠ 任何平台发布标题）；
 * - source_documents：0..1 可变通用稿工作稿（单平台直写时不创建）;
 * - source_revisions：不可变修订，内容相同复用不新增。
 */

export const CREATION_PLATFORMS: Platform[] = ["x", "xiaohongshu", "wechat"];

export interface CreateCreationInput {
  workingTitle: string;
  targetPlatforms: Platform[];
  brief?: TopicBrief | null;
  topicId?: number | null;
  hypothesis?: string;
}

export type CreationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function invalidPlatforms(platforms: Platform[]): boolean {
  return platforms.some((p) => !CREATION_PLATFORMS.includes(p));
}

/** 创建创作项目。创建即选平台（FR-2.1）：目标平台至少 1 个。 */
export async function createCreationCore(
  db: MuseDb,
  input: CreateCreationInput,
): Promise<CreationResult<{ creationId: number }>> {
  const workingTitle = input.workingTitle.trim();
  if (!workingTitle) {
    return { ok: false, error: "工作标题不能为空" };
  }
  if (input.targetPlatforms.length === 0) {
    return { ok: false, error: "请至少选择 1 个目标平台" };
  }
  if (invalidPlatforms(input.targetPlatforms)) {
    return { ok: false, error: "包含不支持的平台" };
  }
  const [row] = await db
    .insert(creations)
    .values({
      workingTitle,
      targetPlatforms: [...new Set(input.targetPlatforms)],
      brief: input.brief ?? null,
      topicId: input.topicId ?? null,
      hypothesis: input.hypothesis?.trim() ?? "",
    })
    .returning();
  return { ok: true, value: { creationId: row.id } };
}

export async function getCreationCore(db: MuseDb, creationId: number) {
  const creation = await db.query.creations.findFirst({
    where: eq(creations.id, creationId),
  });
  if (!creation) return null;
  const sourceDocument =
    (await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.creationId, creationId),
    })) ?? null;
  return { creation, sourceDocument };
}

export interface UpdateCreationInput {
  workingTitle?: string;
  targetPlatforms?: Platform[];
  brief?: TopicBrief | null;
  hypothesis?: string;
}

export async function updateCreationCore(
  db: MuseDb,
  creationId: number,
  input: UpdateCreationInput,
): Promise<CreationResult<{ creationId: number }>> {
  const existing = await db.query.creations.findFirst({
    where: eq(creations.id, creationId),
  });
  if (!existing) return { ok: false, error: "创作项目不存在" };

  const values: Partial<typeof creations.$inferInsert> = {
    updatedAt: nowUnix(),
  };
  if (input.workingTitle !== undefined) {
    const title = input.workingTitle.trim();
    if (!title) return { ok: false, error: "工作标题不能为空" };
    values.workingTitle = title;
  }
  if (input.targetPlatforms !== undefined) {
    if (input.targetPlatforms.length === 0) {
      return { ok: false, error: "请至少选择 1 个目标平台" };
    }
    if (invalidPlatforms(input.targetPlatforms)) {
      return { ok: false, error: "包含不支持的平台" };
    }
    values.targetPlatforms = [...new Set(input.targetPlatforms)];
  }
  if (input.brief !== undefined) values.brief = input.brief;
  if (input.hypothesis !== undefined) values.hypothesis = input.hypothesis.trim();

  await db.update(creations).set(values).where(eq(creations.id, creationId));
  return { ok: true, value: { creationId } };
}

/** 确保通用稿存在（0..1，幂等）；单平台直写路径永远不要调用它。 */
export async function ensureSourceDocumentCore(db: MuseDb, creationId: number) {
  const creation = await db.query.creations.findFirst({
    where: eq(creations.id, creationId),
  });
  if (!creation) return null;
  const existing = await db.query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.creationId, creationId),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(sourceDocuments)
    .values({ creationId })
    .returning();
  return created;
}

/** 自动保存通用稿工作稿；内容相同跳过（去重） */
export async function saveSourceDraftCore(
  db: MuseDb,
  creationId: number,
  contentHtml: string,
) {
  const doc = await ensureSourceDocumentCore(db, creationId);
  if (!doc) return { saved: false as const, error: "创作项目不存在" };
  if (doc.contentHtml === contentHtml) return { saved: false as const };
  await db
    .update(sourceDocuments)
    .set({
      contentHtml,
      contentText: htmlToText(contentHtml),
      updatedAt: nowUnix(),
    })
    .where(eq(sourceDocuments.id, doc.id));
  return { saved: true as const };
}

/**
 * 把当前通用稿固定为不可变修订。内容与最新修订相同时复用（不新增），
 * 并同步工作稿基线；传入 contentHtml 时先落工作稿，避免读到旧内容。
 */
export async function saveSourceRevisionCore(
  db: MuseDb,
  creationId: number,
  contentHtml?: string,
  note = "",
) {
  if (contentHtml !== undefined) {
    const saved = await saveSourceDraftCore(db, creationId, contentHtml);
    if ("error" in saved) return null;
  }
  const doc = await ensureSourceDocumentCore(db, creationId);
  if (!doc) return null;
  const current = await db.query.sourceDocuments.findFirst({
    where: eq(sourceDocuments.id, doc.id),
  });
  if (!current) return null;

  const latest = await db.query.sourceRevisions.findFirst({
    where: eq(sourceRevisions.sourceDocumentId, doc.id),
    orderBy: desc(sourceRevisions.revisionNo),
  });
  if (latest && latest.contentHtml === current.contentHtml) {
    if (current.baseRevisionId !== latest.id) {
      await db
        .update(sourceDocuments)
        .set({ baseRevisionId: latest.id, updatedAt: nowUnix() })
        .where(eq(sourceDocuments.id, doc.id));
    }
    return { revisionId: latest.id, revisionNo: latest.revisionNo, reused: true };
  }

  const revisionNo = (latest?.revisionNo ?? 0) + 1;
  const [revision] = await db
    .insert(sourceRevisions)
    .values({
      sourceDocumentId: doc.id,
      revisionNo,
      contentHtml: current.contentHtml,
      contentText: current.contentText,
      note: note || `通用稿修订 r${revisionNo}`,
    })
    .returning();
  await db
    .update(sourceDocuments)
    .set({ baseRevisionId: revision.id, updatedAt: nowUnix() })
    .where(eq(sourceDocuments.id, doc.id));
  await db
    .update(creations)
    .set({ updatedAt: nowUnix() })
    .where(eq(creations.id, creationId));
  return { revisionId: revision.id, revisionNo, reused: false };
}
