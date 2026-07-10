"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import {
  db,
  materials,
  materialChunks,
  collections,
  collectionMaterials,
  UPLOAD_DIR,
} from "@/db";
import { indexChunk, removeChunksFromIndex } from "@/db/fts";
import { aiClean } from "@/lib/ai";
import type { AiActionResult } from "@/lib/ai";
import { completedAiAction, runExclusiveAiAction } from "@/lib/ai/action";
import { nowUnix } from "@/lib/utils";

function parseTags(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,，、\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

async function insertMaterial(values: typeof materials.$inferInsert) {
  const [row] = await db.insert(materials).values(values).returning();
  return row;
}

/** 快速灵感捕捉 / 手动笔记 */
export async function createNoteMaterial(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  const title =
    String(formData.get("title") ?? "").trim() ||
    content.slice(0, 24).replace(/\n/g, " ");
  await insertMaterial({
    type: "note",
    title,
    rawContent: content,
    tags: parseTags(formData.get("tags") as string),
  });
  revalidatePath("/materials");
  revalidatePath("/");
}

/** 粘贴文本导入 */
export async function createTextMaterial(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!content || !title) return;
  await insertMaterial({
    type: "text",
    title,
    rawContent: content,
    tags: parseTags(formData.get("tags") as string),
  });
  revalidatePath("/materials");
}

/** URL 导入：抓取网页并粗提取正文 */
export async function createUrlMaterial(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim();
  if (!/^https?:\/\//.test(url)) return;
  let title = url;
  let text = "";
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (Muse Local Importer)" },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || url;
    text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
      .slice(0, 50000);
  } catch (e) {
    text = `抓取失败：${e instanceof Error ? e.message : String(e)}。可手动粘贴原文后再清洗。`;
  }
  await insertMaterial({
    type: "url",
    title,
    sourceUrl: url,
    rawContent: text,
    tags: parseTags(formData.get("tags") as string),
  });
  revalidatePath("/materials");
}

/** 文件导入：保存到本地 data/uploads，文本类文件读入原文 */
export async function createFileMaterial(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-㐀-鿿]/g, "_")}`;
  const filePath = path.join(UPLOAD_DIR, safeName);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buf);

  const isTextLike =
    /\.(txt|md|markdown|csv|json|html?)$/i.test(file.name) ||
    (file.type ?? "").startsWith("text/");
  const rawContent = isTextLike
    ? buf.toString("utf-8").slice(0, 100000)
    : `[二进制文件 ${file.name}，${(file.size / 1024).toFixed(1)}KB，已保存到本地]`;

  await insertMaterial({
    type: "file",
    title: String(formData.get("title") ?? "").trim() || file.name,
    filePath: `data/uploads/${safeName}`,
    rawContent,
    tags: parseTags(formData.get("tags") as string),
  });
  revalidatePath("/materials");
}

/** 知识整理：清洗素材为语料块并生成摘要与标签 */
export async function cleanMaterial(id: number): Promise<AiActionResult> {
  return runExclusiveAiAction(`clean:material:${id}`, "clean-material", async () => {
    const material = await db.query.materials.findFirst({
      where: eq(materials.id, id),
    });
    if (!material) return { ok: false, message: "素材不存在。", tone: "danger" };
    const result = await aiClean(material.title, material.rawContent);

    // AI 完成后一次性重建语料块，避免请求失败时破坏现有索引。
    removeChunksFromIndex(id);
    await db.delete(materialChunks).where(eq(materialChunks.materialId, id));
    for (const [i, content] of result.data.chunks.entries()) {
      const [chunk] = await db
        .insert(materialChunks)
        .values({ materialId: id, orderIndex: i, content })
        .returning();
      indexChunk(chunk.id, id, content);
    }
    const mergedTags = [...new Set([...material.tags, ...result.data.tags])].slice(0, 8);
    await db
      .update(materials)
      .set({
        summary: result.data.summary,
        tags: mergedTags,
        cleanStatus: "cleaned",
        updatedAt: nowUnix(),
      })
      .where(eq(materials.id, id));
    revalidatePath("/materials");
    revalidatePath(`/materials/${id}`);
    return completedAiAction(result, "素材清洗完成。");
  });
}

export async function deleteMaterial(id: number) {
  removeChunksFromIndex(id);
  await db.delete(materials).where(eq(materials.id, id));
  revalidatePath("/materials");
}

export async function updateMaterialTags(id: number, tagsRaw: string) {
  await db
    .update(materials)
    .set({ tags: parseTags(tagsRaw), updatedAt: nowUnix() })
    .where(eq(materials.id, id));
  revalidatePath(`/materials/${id}`);
  revalidatePath("/materials");
}

/** 素材集合 */
export async function createCollection(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const materialIds = formData
    .getAll("materialIds")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const [col] = await db
    .insert(collections)
    .values({ name, description: String(formData.get("description") ?? "") })
    .returning();
  if (materialIds.length) {
    await db
      .insert(collectionMaterials)
      .values(materialIds.map((materialId) => ({ collectionId: col.id, materialId })));
  }
  revalidatePath("/materials");
  revalidatePath("/topics");
}

export async function addMaterialsToCollection(collectionId: number, materialIds: number[]) {
  if (!materialIds.length) return;
  const existing = await db
    .select({ materialId: collectionMaterials.materialId })
    .from(collectionMaterials)
    .where(eq(collectionMaterials.collectionId, collectionId));
  const have = new Set(existing.map((e) => e.materialId));
  const fresh = materialIds.filter((id) => !have.has(id));
  if (fresh.length) {
    await db
      .insert(collectionMaterials)
      .values(fresh.map((materialId) => ({ collectionId, materialId })));
  }
  revalidatePath("/materials");
}

export async function getMaterialsByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(materials).where(inArray(materials.id, ids));
}
