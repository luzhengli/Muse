import { eq } from "drizzle-orm";
import {
  evidenceCitations,
  materialChunks,
  materials,
  type EvidenceCitation,
} from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import { nowUnix } from "@/lib/utils";

/**
 * 证据引用核心逻辑（feat-022）。
 * 有效状态不落库：读取时依据「素材是否存在、当前语料块是否仍包含摘录」计算，
 * 素材重清洗后按摘录文本在新语料块中重定位，未命中只降级、不伪造关联。
 */

export type CitationValidity = "valid" | "source-changed" | "source-missing";

/** 空白归一：语料重清洗常见的仅空白差异不应导致引用失效 */
export function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

export function computeCitationValidity(input: {
  materialExists: boolean;
  chunkContent: string | null;
  excerpt: string;
}): CitationValidity {
  if (!input.materialExists) return "source-missing";
  const excerpt = normalizeForMatch(input.excerpt);
  if (
    excerpt &&
    input.chunkContent !== null &&
    normalizeForMatch(input.chunkContent).includes(excerpt)
  ) {
    return "valid";
  }
  return "source-changed";
}

/** 在素材当前语料块中按摘录重定位，命中返回块 id */
export function findChunkForExcerpt(
  chunks: { id: number; content: string }[],
  excerpt: string,
): number | null {
  const target = normalizeForMatch(excerpt);
  if (!target) return null;
  for (const chunk of chunks) {
    if (normalizeForMatch(chunk.content).includes(target)) return chunk.id;
  }
  return null;
}

/** 摘录默认取语料块开头的完整句子（不超过 maxLen），插入正文时保持可读 */
export function defaultExcerpt(content: string, maxLen = 240): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLen) return compact;
  const head = compact.slice(0, maxLen);
  const lastStop = Math.max(
    head.lastIndexOf("。"),
    head.lastIndexOf("！"),
    head.lastIndexOf("？"),
    head.lastIndexOf("；"),
    head.lastIndexOf("."),
  );
  return lastStop >= maxLen / 3 ? head.slice(0, lastStop + 1) : head;
}

export function generateCitationKey(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `c${Date.now().toString(36)}${rand()}`;
}

/**
 * 素材重清洗后重定位该素材的全部引用：
 * 命中新语料块 → 更新 chunk_id 与上下文快照（引用身份延续）；
 * 未命中 → 保持 chunk_id 为空（读取时降级为「来源已变化」）。
 */
export async function relinkCitationsForMaterialCore(db: MuseDb, materialId: number) {
  const rows = await db
    .select()
    .from(evidenceCitations)
    .where(eq(evidenceCitations.materialId, materialId));
  if (!rows.length) return { relinked: 0, degraded: 0 };
  const chunks = await db
    .select({ id: materialChunks.id, content: materialChunks.content })
    .from(materialChunks)
    .where(eq(materialChunks.materialId, materialId));
  let relinked = 0;
  let degraded = 0;
  for (const row of rows) {
    const chunkId = findChunkForExcerpt(chunks, row.excerpt);
    if (chunkId !== null) {
      const chunk = chunks.find((c) => c.id === chunkId);
      await db
        .update(evidenceCitations)
        .set({
          chunkId,
          contextSnapshot: chunk?.content ?? row.contextSnapshot,
          updatedAt: nowUnix(),
        })
        .where(eq(evidenceCitations.id, row.id));
      relinked++;
    } else {
      if (row.chunkId !== null) {
        await db
          .update(evidenceCitations)
          .set({ chunkId: null, updatedAt: nowUnix() })
          .where(eq(evidenceCitations.id, row.id));
      }
      degraded++;
    }
  }
  return { relinked, degraded };
}

export interface CitationState extends EvidenceCitation {
  validity: CitationValidity;
  /** 当前语料块内容（存在时），用于「这句话有什么依据」展示 */
  currentChunkContent: string | null;
}

/** 读取文章全部证据引用，并按当前事实计算有效状态 */
export async function getCitationStatesCore(
  db: MuseDb,
  articleId: number,
): Promise<CitationState[]> {
  const rows = await db
    .select()
    .from(evidenceCitations)
    .where(eq(evidenceCitations.articleId, articleId));
  const states: CitationState[] = [];
  for (const row of rows) {
    const material = row.materialId
      ? await db.query.materials.findFirst({ where: eq(materials.id, row.materialId) })
      : null;
    const chunk = row.chunkId
      ? await db.query.materialChunks.findFirst({
          where: eq(materialChunks.id, row.chunkId),
        })
      : null;
    states.push({
      ...row,
      validity: computeCitationValidity({
        materialExists: Boolean(material),
        chunkContent: chunk?.content ?? null,
        excerpt: row.excerpt,
      }),
      currentChunkContent: chunk?.content ?? null,
    });
  }
  return states.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
}
