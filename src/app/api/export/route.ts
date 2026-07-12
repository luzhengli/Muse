import {
  db,
  articles,
  articleVersions,
  articleDrafts,
  articleCitations,
  appSettings,
  assets,
  collections,
  collectionMaterials,
  creations,
  evidenceCitations,
  materials,
  materialChunks,
  outputAssets,
  packagings,
  performanceSnapshots,
  platformOutputRevisions,
  platformOutputs,
  platformVariants,
  publications,
  publishResults,
  publishTasks,
  retroNotes,
  reviews,
  reviewFindings,
  sourceDocuments,
  sourceRevisions,
  topics,
} from "@/db";

export const dynamic = "force-dynamic";

/**
 * 本地数据导出：全表 JSON dump 下载。
 * 只包含 SQLite 业务数据与非敏感设置；不读取任何环境变量或密钥。
 */
export async function GET() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "muse",
    tables: {
      materials: await db.select().from(materials),
      material_chunks: await db.select().from(materialChunks),
      collections: await db.select().from(collections),
      collection_materials: await db.select().from(collectionMaterials),
      topics: await db.select().from(topics),
      articles: await db.select().from(articles),
      article_versions: await db.select().from(articleVersions),
      article_drafts: await db.select().from(articleDrafts),
      article_citations: await db.select().from(articleCitations),
      evidence_citations: await db.select().from(evidenceCitations),
      reviews: await db.select().from(reviews),
      review_findings: await db.select().from(reviewFindings),
      packagings: await db.select().from(packagings),
      assets: await db.select().from(assets),
      platform_variants: await db.select().from(platformVariants),
      publish_tasks: await db.select().from(publishTasks),
      publish_results: await db.select().from(publishResults),
      retro_notes: await db.select().from(retroNotes),
      creations: await db.select().from(creations),
      source_documents: await db.select().from(sourceDocuments),
      source_revisions: await db.select().from(sourceRevisions),
      platform_outputs: await db.select().from(platformOutputs),
      platform_output_revisions: await db.select().from(platformOutputRevisions),
      output_assets: await db.select().from(outputAssets),
      publications: await db.select().from(publications),
      performance_snapshots: await db.select().from(performanceSnapshots),
      app_settings: await db.select().from(appSettings),
    },
  };
  const fileName = `muse-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
