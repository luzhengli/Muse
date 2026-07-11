"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, evidenceCitations, materialChunks, materials } from "@/db";
import { searchChunks } from "@/db/fts";
import { defaultExcerpt, generateCitationKey } from "@/lib/citations";

export interface EvidenceSearchHit {
  chunkId: number;
  materialId: number;
  materialTitle: string;
  sourceUrl: string | null;
  snippet: string;
  content: string;
}

/** 写作台「查找相关资料」：FTS 检索语料块并附上来源信息 */
export async function searchEvidence(query: string): Promise<EvidenceSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const hits = searchChunks(q, 12);
  const results: EvidenceSearchHit[] = [];
  for (const hit of hits) {
    const chunk = await db.query.materialChunks.findFirst({
      where: eq(materialChunks.id, hit.chunkId),
    });
    if (!chunk) continue;
    const material = await db.query.materials.findFirst({
      where: eq(materials.id, chunk.materialId),
    });
    if (!material) continue;
    results.push({
      chunkId: chunk.id,
      materialId: material.id,
      materialTitle: material.title,
      sourceUrl: material.sourceUrl,
      snippet: hit.snippet,
      content: chunk.content,
    });
  }
  return results;
}

export interface CreatedCitation {
  id: number;
  key: string;
  excerpt: string;
  sourceTitle: string;
}

/**
 * 为文章创建一条证据引用（引用身份 + 摘录 + 上下文快照）。
 * 只落库引用行；把 mark 应用到正文由编辑器在成功后执行，失败不改动正文。
 */
export async function citeChunk(
  articleId: number,
  chunkId: number,
): Promise<{ ok: true; citation: CreatedCitation } | { ok: false; message: string }> {
  const chunk = await db.query.materialChunks.findFirst({
    where: eq(materialChunks.id, chunkId),
  });
  if (!chunk) return { ok: false, message: "这段资料已不存在，请重新搜索。" };
  const material = await db.query.materials.findFirst({
    where: eq(materials.id, chunk.materialId),
  });
  if (!material) return { ok: false, message: "资料来源已被删除，请选择其他资料。" };

  const [row] = await db
    .insert(evidenceCitations)
    .values({
      key: generateCitationKey(),
      articleId,
      materialId: material.id,
      chunkId: chunk.id,
      excerpt: defaultExcerpt(chunk.content),
      contextSnapshot: chunk.content,
      sourceTitle: material.title,
      sourceUrl: material.sourceUrl,
    })
    .returning();
  revalidatePath(`/articles/${articleId}`);
  return {
    ok: true,
    citation: {
      id: row.id,
      key: row.key,
      excerpt: row.excerpt,
      sourceTitle: row.sourceTitle,
    },
  };
}

/** 移除证据引用（正文中的 mark 由编辑器同步清除） */
export async function removeEvidence(citationId: number, articleId: number) {
  await db.delete(evidenceCitations).where(eq(evidenceCitations.id, citationId));
  revalidatePath(`/articles/${articleId}`);
}
