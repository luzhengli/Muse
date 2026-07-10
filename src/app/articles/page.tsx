import Link from "next/link";
import { desc, count } from "drizzle-orm";
import { db, articles, articleVersions, topics, type Article } from "@/db";
import { createBlankArticle } from "@/actions/articles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ListFilter } from "@/components/list-filter";
import { Timeline } from "@/components/timeline";
import { fmtTime, groupByDay, inDateRange, parseDateRange } from "@/lib/utils";
import { articleStatusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  const { q, status, from, to, view } = await searchParams;

  let rows = await db.select().from(articles).orderBy(desc(articles.updatedAt));
  const topicRows = await db.select({ id: topics.id, title: topics.title }).from(topics);
  const topicTitle = new Map(topicRows.map((t) => [t.id, t.title]));
  const versionCounts = await db
    .select({ articleId: articleVersions.articleId, n: count() })
    .from(articleVersions)
    .groupBy(articleVersions.articleId);
  const vc = new Map(versionCounts.map((v) => [v.articleId, v.n]));

  if (q?.trim()) {
    const kw = q.trim();
    rows = rows.filter(
      (a) =>
        a.title.includes(kw) ||
        a.summary.includes(kw) ||
        (a.topicId ? (topicTitle.get(a.topicId) ?? "").includes(kw) : false),
    );
  }
  if (status) rows = rows.filter((a) => a.status === status);
  const range = parseDateRange(from, to);
  if (range.fromUnix !== null || range.toUnix !== null) {
    rows = rows.filter((a) => inDateRange(a.updatedAt, range));
  }

  function renderArticleCard(a: Article) {
    const st = articleStatusLabel[a.status];
    return (
      <Link key={a.id} href={`/articles/${a.id}`} className="block">
        <Card className="transition-colors hover:border-(--color-primary)">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-sm font-semibold">{a.title}</div>
              <div className="mt-0.5 text-xs text-(--color-muted)">
                {a.topicId && topicTitle.get(a.topicId) && (
                  <>选题：{topicTitle.get(a.topicId)} · </>
                )}
                {vc.get(a.id) ?? 0} 个版本 · 更新于 {fmtTime(a.updatedAt)}
              </div>
              {a.summary && (
                <p className="mt-1 line-clamp-1 text-xs text-(--color-muted)">
                  {a.summary}
                </p>
              )}
            </div>
            <Badge tone={st.tone}>{st.text}</Badge>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">写作台</h1>
          <p className="mt-1 text-sm text-(--color-muted)">
            文章母版在这里生产与迭代；从选题生成初稿，或从空白开始。
          </p>
        </div>
        <form action={createBlankArticle} className="flex flex-wrap gap-2">
          <Input name="title" placeholder="新文章标题" className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
          <Button variant="outline">新建空白文章</Button>
        </form>
      </div>

      <ListFilter
        basePath="/articles"
        keywordPlaceholder="按标题 / 摘要 / 选题搜索"
        statusOptions={Object.entries(articleStatusLabel).map(([value, v]) => ({
          value,
          label: v.text,
        }))}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            {q || status || from || to ? (
              "没有匹配的文章。"
            ) : (
              <>
                还没有文章。到
                <Link href="/topics" className="text-(--color-primary) underline">
                  选题板
                </Link>
                生成初稿，或新建空白文章。
              </>
            )}
          </CardContent>
        </Card>
      ) : view === "timeline" ? (
        <Timeline
          groups={groupByDay(rows, (a) => a.updatedAt).map((g) => ({
            label: g.label,
            children: g.items.map(renderArticleCard),
          }))}
        />
      ) : (
        <div className="space-y-2">{rows.map(renderArticleCard)}</div>
      )}
    </div>
  );
}
