"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import {
  db,
  articles,
  articleVersions,
  packagings,
  assets,
  ASSET_DIR,
} from "@/db";
import { aiPackaging } from "@/lib/ai";

/** 生成包装物料并与最新版本关联保存 */
export async function generatePackaging(articleId: number) {
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });
  const version = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  if (!article || !version) return;
  const gen = await aiPackaging(article.title, version.contentText);
  await db.insert(packagings).values({
    articleId,
    versionId: version.id,
    titleCandidates: gen.titleCandidates,
    summary: gen.summary,
    coverPrompt: gen.coverPrompt,
    imagePrompts: gen.imagePrompts,
    cardStructure: { cards: gen.cards },
  });
  await db
    .update(articles)
    .set({ status: "packaged" })
    .where(eq(articles.id, articleId));
  revalidatePath(`/articles/${articleId}/packaging`);
}

/** 采用某个候选标题作为文章标题 */
export async function adoptTitle(articleId: number, title: string) {
  await db.update(articles).set({ title }).where(eq(articles.id, articleId));
  revalidatePath(`/articles/${articleId}/packaging`);
  revalidatePath(`/articles/${articleId}`);
}

/** 上传本地图片资源（封面/配图） */
export async function uploadAsset(formData: FormData) {
  const articleId = Number(formData.get("articleId"));
  const kind = (String(formData.get("kind")) || "other") as
    | "cover"
    | "illustration"
    | "other";
  const file = formData.get("file");
  if (!articleId || !(file instanceof File) || file.size === 0) return;
  const safeName = `${Date.now()}-${file.name.replace(/[^\w.\-㐀-鿿]/g, "_")}`;
  fs.writeFileSync(
    path.join(ASSET_DIR, safeName),
    Buffer.from(await file.arrayBuffer()),
  );
  await db.insert(assets).values({
    articleId,
    kind,
    fileName: file.name,
    filePath: `data/assets/${safeName}`,
  });
  revalidatePath(`/articles/${articleId}/packaging`);
}

export async function deleteAsset(assetId: number, articleId: number) {
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (asset) {
    const abs = path.resolve(asset.filePath);
    if (abs.startsWith(path.resolve("data")) && fs.existsSync(abs)) {
      fs.unlinkSync(abs);
    }
    await db.delete(assets).where(eq(assets.id, assetId));
  }
  revalidatePath(`/articles/${articleId}/packaging`);
}
