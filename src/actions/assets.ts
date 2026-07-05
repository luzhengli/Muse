"use server";

import { revalidatePath } from "next/cache";
import fs from "node:fs";
import path from "node:path";
import { db, assets, ASSET_DIR } from "@/db";

/**
 * 编辑器图片上传（工具栏/粘贴/拖拽共用）。
 * 保存到 data/assets 并登记资产表，返回可插入正文的 URL。
 */
export async function uploadEditorImage(articleId: number, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!(file.type ?? "").startsWith("image/")) return null;
  const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-㐀-鿿]/g, "_") || "image"}`;
  fs.writeFileSync(
    path.join(ASSET_DIR, safeName),
    Buffer.from(await file.arrayBuffer()),
  );
  const [asset] = await db
    .insert(assets)
    .values({
      articleId,
      kind: "illustration",
      fileName: file.name,
      filePath: `data/assets/${safeName}`,
    })
    .returning();
  revalidatePath(`/articles/${articleId}`);
  return { assetId: asset.id, url: `/api/assets/${encodeURIComponent(safeName)}` };
}
