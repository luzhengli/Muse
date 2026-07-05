import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  articles,
  articleVersions,
  articleCitations,
  materials,
  topics,
} from "@/db";
import { ArticleHeader } from "@/components/article-header";
import { ArticleTabs } from "@/components/article-tabs";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtTime } from "@/lib/utils";

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
  const latest = versions[0];

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

  const topic = article.topicId
    ? await db.query.topics.findFirst({ where: eq(topics.id, article.topicId) })
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ArticleHeader
        articleId={articleId}
        title={article.title}
        status={article.status}
        topicTitle={topic?.title}
      />
      <ArticleTabs articleId={articleId} />

      <div className="grid grid-cols-[1fr_16rem] gap-4">
        <TiptapEditor
          articleId={articleId}
          initialHtml={latest?.contentHtml ?? "<p></p>"}
        />

        <div className="space-y-3">
          {/* 引用素材，可追溯来源 */}
          <Card>
            <CardHeader>
              <CardTitle>引用素材（{citedMaterials.length}）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {citedMaterials.length === 0 && (
                <p className="text-xs text-(--color-muted)">
                  暂无引用。从选题生成的初稿会自动关联选题素材。
                </p>
              )}
              {citedMaterials.map((m) => (
                <Link
                  key={m.id}
                  href={`/materials/${m.id}`}
                  className="block rounded-(--radius-control) border border-(--color-border) p-2 text-xs hover:border-(--color-primary)"
                >
                  <div className="line-clamp-1 font-medium">{m.title}</div>
                  {m.summary && (
                    <div className="mt-0.5 line-clamp-2 text-(--color-muted)">{m.summary}</div>
                  )}
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* 版本历史 */}
          <Card>
            <CardHeader>
              <CardTitle>版本历史（{versions.length}）</CardTitle>
            </CardHeader>
            <CardContent className="max-h-72 space-y-1.5 overflow-auto">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="rounded-(--radius-control) border border-(--color-border) p-2 text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <Badge tone={v.id === latest?.id ? "primary" : "default"}>
                      v{v.versionNo}
                    </Badge>
                    <span className="text-(--color-muted)">{fmtTime(v.createdAt)}</span>
                  </div>
                  {v.note && <div className="mt-1 text-(--color-muted)">{v.note}</div>}
                </div>
              ))}
            </CardContent>
          </Card>

          {topic?.brief && (
            <Card>
              <CardHeader>
                <CardTitle>创作 Brief</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-(--color-muted)">
                <div>读者：{topic.brief.audience}</div>
                <div>语气：{topic.brief.tone}</div>
                <div>要点：{topic.brief.keyPoints.join("；")}</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
