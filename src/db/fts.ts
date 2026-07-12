import { sqlite } from "./index";
import { segmentCjk } from "@/lib/utils";

export { segmentCjk };


export function indexChunk(chunkId: number, materialId: number, content: string) {
  sqlite
    .prepare("INSERT INTO chunk_fts (content, chunk_id, material_id) VALUES (?, ?, ?)")
    .run(segmentCjk(content), chunkId, materialId);
}

export function removeChunksFromIndex(materialId: number) {
  sqlite.prepare("DELETE FROM chunk_fts WHERE material_id = ?").run(materialId);
}

export interface FtsHit {
  chunkId: number;
  materialId: number;
  snippet: string;
  rank: number;
}

/** 全文检索语料块，返回带高亮片段的命中结果 */
export function searchChunks(query: string, limit = 30): FtsHit[] {
  const q = segmentCjk(query.trim());
  if (!q) return [];
  // 短语匹配，保证连续中文子串命中；双引号转义防注入
  const phrase = `"${q.replace(/"/g, '""')}"`;
  try {
    const rows = sqlite
      .prepare(
        `SELECT chunk_id AS chunkId, material_id AS materialId,
                snippet(chunk_fts, 0, '[', ']', '…', 24) AS snippet,
                rank
         FROM chunk_fts WHERE chunk_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(phrase, limit) as FtsHit[];
    return rows.map((r) => ({ ...r, snippet: r.snippet.replace(/ ?([㐀-鿿]) ?/g, "$1") }));
  } catch {
    return [];
  }
}
