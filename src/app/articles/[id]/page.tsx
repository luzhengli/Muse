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
  platformVariants,
  assets,
} from "@/db";
import { ArticleHeader } from "@/components/article-header";
import { JourneySteps } from "@/components/journey-steps";
import { Workbench } from "@/components/workbench/workbench";
import type { WorkbenchData } from "@/components/workbench/types";
import { getDraft, resolveInitialContent } from "@/lib/drafts";
import { getAppSettings } from "@/lib/settings-store";
import { isDerivativeStale } from "@/lib/revisions";
import { normalizeTopicBrief } from "@/lib/briefs";
import { getCitationStatesCore } from "@/lib/citations";
import { normalizeJourneyPanel } from "@/lib/journey-navigation";
import {
  computeReadiness,
  deriveJourneyStep,
  getReadinessFactsCore,
} from "@/lib/readiness";

export const dynamic = "force-dynamic";

export default async function ArticleEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ panel?: string }>;
}) {
  const { id } = await params;
  const { panel } = await searchParams;
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

  const evidenceStates = await getCitationStatesCore(db, articleId);

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
    .orderBy(desc(packagings.createdAt));
  const latestPack = packs[0];

  const variantRows = await db
    .select()
    .from(platformVariants)
    .where(eq(platformVariants.articleId, articleId))
    .orderBy(desc(platformVariants.updatedAt));

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
  const activeCheckpoint = versions.find((v) => v.contentHtml === initial.contentHtml) ?? null;
  const activeCheckpointId = activeCheckpoint?.id ?? null;

  const readinessFacts = await getReadinessFactsCore(db, articleId);
  if (!readinessFacts) notFound();
  const readiness = computeReadiness(readinessFacts);
  const journeyStep = deriveJourneyStep(readinessFacts, readiness);
  const initialPanel = normalizeJourneyPanel(panel);

  const data: WorkbenchData = {
    articleId,
    topicId: article.topicId,
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
    evidence: evidenceStates.map((e) => ({
      id: e.id,
      key: e.key,
      materialId: e.materialId,
      excerpt: e.excerpt,
      contextSnapshot: e.contextSnapshot,
      sourceTitle: e.sourceTitle,
      sourceUrl: e.sourceUrl,
      validity: e.validity,
      currentChunkContent: e.currentChunkContent,
      createdAt: e.createdAt,
    })),
    reviews: reviewRows.map((r) => ({
      id: r.id,
      type: r.type,
      summary: r.summary,
      createdAt: r.createdAt,
      sourceVersionId: r.sourceVersionId,
      sourceVersionNo: r.sourceVersionId ? (versionNoById.get(r.sourceVersionId) ?? null) : null,
      stale: isDerivativeStale(r.sourceVersionId, activeCheckpointId),
      findings: findingRows
        .filter((f) => f.reviewId === r.id)
        .map((f) => ({
          id: f.id,
          category: f.category,
          severity: f.severity,
          quote: f.quote,
          suggestion: f.suggestion,
          status: f.status,
          evidenceState: f.evidenceState,
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
          versionNo: latestPack.sourceVersionId
            ? (versionNoById.get(latestPack.sourceVersionId) ?? null)
            : null,
          sourceVersionId: latestPack.sourceVersionId,
          stale: isDerivativeStale(latestPack.sourceVersionId, activeCheckpointId),
          createdAt: latestPack.createdAt,
        }
      : null,
    variants: variantRows.map((v) => ({
      id: v.id,
      platform: v.platform,
      sourceVersionId: v.sourceVersionId,
      sourceVersionNo: v.sourceVersionId ? (versionNoById.get(v.sourceVersionId) ?? null) : null,
      stale: isDerivativeStale(v.sourceVersionId, activeCheckpointId),
      updatedAt: v.updatedAt,
    })),
    assets: assetRows.map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.fileName,
      filePath: a.filePath,
      createdAt: a.createdAt,
    })),
    brief: topic ? normalizeTopicBrief(topic.brief, topic) : null,
    readinessFacts,
    initialPanel,
    activeCheckpoint: activeCheckpoint
      ? { id: activeCheckpoint.id, versionNo: activeCheckpoint.versionNo }
      : null,
    initialContentHtml: initial.contentHtml,
    restoredFromDraft: initial.restoredFromDraft,
    editorPrefs: getAppSettings().editor,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="article-chrome space-y-4">
        <ArticleHeader
          articleId={articleId}
          title={article.title}
          status={article.status}
          topicTitle={topic?.title}
          hideStatus
        />
        <JourneySteps articleId={articleId} current={journeyStep} />
      </div>
      <Workbench data={data} />
    </div>
  );
}
