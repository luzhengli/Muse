import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  articles,
  articleVersions,
  articleCitations,
  materials,
  topics,
  reviews,
  reviewFindings,
  packagings,
  assets,
} from "@/db";
import { ArticleHeader } from "@/components/article-header";
import { ArticleTabs } from "@/components/article-tabs";
import { Workbench } from "@/components/workbench/workbench";
import type { WorkbenchData } from "@/components/workbench/types";
import { getDraft, resolveInitialContent } from "@/lib/drafts";

export const dynamic = "force-dynamic";

export default async function ArticleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const articleId = Number(id);
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });
  if (!article) notFound();

  const versions = await db
    .select()
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId))
    .orderBy(desc(articleVersions.versionNo));
  const versionNoById = new Map(versions.map((v) => [v.id, v.versionNo]));

  const citations = await db
    .select()
    .from(articleCitations)
    .where(eq(articleCitations.articleId, articleId));
  const citedMaterials = citations.length
    ? await db
        .select({ id: materials.id, title: materials.title, summary: materials.summary })
        .from(materials)
        .where(inArray(materials.id, citations.map((c) => c.materialId)))
    : [];
  const materialById = new Map(citedMaterials.map((m) => [m.id, m]));

  const reviewRows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.articleId, articleId))
    .orderBy(desc(reviews.createdAt));
  const findingRows = reviewRows.length
    ? await db
        .select()
        .from(reviewFindings)
        .where(inArray(reviewFindings.reviewId, reviewRows.map((r) => r.id)))
    : [];

  const packs = await db
    .select()
    .from(packagings)
    .where(eq(packagings.articleId, articleId))
    .orderBy(desc(packagings.createdAt))
    .limit(1);
  const latestPack = packs[0];

  const assetRows = await db
    .select()
    .from(assets)
    .where(eq(assets.articleId, articleId))
    .orderBy(desc(assets.createdAt));

  const topic = article.topicId
    ? await db.query.topics.findFirst({ where: eq(topics.id, article.topicId) })
    : null;

  const draft = await getDraft(db, articleId);
  const initial = resolveInitialContent(versions[0] ?? null, draft);

  const data: WorkbenchData = {
    articleId,
    title: article.title,
    summary: article.summary,
    coverAssetId: article.coverAssetId,
    versions,
    citations: citations.map((c) => ({
      id: c.id,
      materialId: c.materialId,
      title: materialById.get(c.materialId)?.title ?? `素材#${c.materialId}`,
      summary: materialById.get(c.materialId)?.summary ?? "",
    })),
    reviews: reviewRows.map((r) => ({
      id: r.id,
      type: r.type,
      summary: r.summary,
      createdAt: r.createdAt,
      findings: findingRows
        .filter((f) => f.reviewId === r.id)
        .map((f) => ({
          id: f.id,
          category: f.category,
          severity: f.severity,
          quote: f.quote,
          suggestion: f.suggestion,
          status: f.status,
        })),
    })),
    packaging: latestPack
      ? {
          id: latestPack.id,
          titleCandidates: latestPack.titleCandidates,
          summary: latestPack.summary,
          coverPrompt: latestPack.coverPrompt,
          imagePrompts: latestPack.imagePrompts,
          cards: latestPack.cardStructure?.cards ?? [],
          versionNo: latestPack.versionId
            ? (versionNoById.get(latestPack.versionId) ?? null)
            : null,
          createdAt: latestPack.createdAt,
        }
      : null,
    assets: assetRows.map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.fileName,
      filePath: a.filePath,
      createdAt: a.createdAt,
    })),
    brief: topic?.brief ?? null,
    initialContentHtml: initial.contentHtml,
    restoredFromDraft: initial.restoredFromDraft,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="article-chrome space-y-4">
        <ArticleHeader
          articleId={articleId}
          title={article.title}
          status={article.status}
          topicTitle={topic?.title}
        />
        <ArticleTabs articleId={articleId} />
      </div>
      <Workbench data={data} />
    </div>
  );
}
