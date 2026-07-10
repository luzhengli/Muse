import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db, articles, articleVersions, reviews, reviewFindings, topics } from "@/db";
import { runAiReviewFromForm, addHumanFinding, setFindingStatus } from "@/actions/review";
import { ArticleHeader } from "@/components/article-header";
import { ArticleTabs } from "@/components/article-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Select } from "@/components/ui/input";
import { reviewCategoryLabel, severityLabel } from "@/lib/labels";
import { PLATFORM_IDS, platformName } from "@/lib/platforms";
import { fmtTime } from "@/lib/utils";
import { AiActionForm, AiResultTransition } from "@/components/ai-action";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
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

  const latest = await db.query.articleVersions.findFirst({
    where: eq(articleVersions.articleId, articleId),
    orderBy: desc(articleVersions.versionNo),
  });
  const reviewRows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.articleId, articleId))
    .orderBy(desc(reviews.createdAt));
  const findings = reviewRows.length
    ? await db
        .select()
        .from(reviewFindings)
        .where(inArray(reviewFindings.reviewId, reviewRows.map((r) => r.id)))
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

      <div className="grid grid-cols-2 gap-4">
        {/* AI 审阅 */}
        <Card>
          <CardHeader>
            <CardTitle>AI 审阅</CardTitle>
            <CardDescription>
              对最新版本（v{latest?.versionNo ?? "-"}）执行六维审阅：事实 / 结构 / 风格 / 安全 / 合规 / 润色。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AiActionForm
              action={runAiReviewFromForm}
              label="执行 AI 审阅"
              pendingLabel="审阅中…"
              disabled={!latest}
              formClassName="flex gap-2"
            >
              <input type="hidden" name="articleId" value={articleId} />
              <Select name="platform" className="flex-1">
                <option value="">通用审阅（不限定平台）</option>
                {PLATFORM_IDS.map((p) => (
                  <option key={p} value={p}>
                    面向{platformName(p)}的合规审阅
                  </option>
                ))}
              </Select>
            </AiActionForm>
          </CardContent>
        </Card>

        {/* 人工审阅 */}
        <Card>
          <CardHeader>
            <CardTitle>人工审阅意见</CardTitle>
            <CardDescription>补充 AI 覆盖不到的判断。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={addHumanFinding} className="space-y-2">
              <input type="hidden" name="articleId" value={articleId} />
              <div className="flex gap-2">
                <Select name="category" className="flex-1">
                  {Object.entries(reviewCategoryLabel).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <Select name="severity" className="w-24">
                  <option value="info">建议</option>
                  <option value="warn">注意</option>
                  <option value="critical">严重</option>
                </Select>
              </div>
              <Input name="quote" placeholder="相关原文片段（可选）" />
              <div className="flex gap-2">
                <Textarea name="suggestion" required placeholder="意见与修改建议" className="min-h-9 flex-1" />
                <Button>添加</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* 审阅记录与建议列表 */}
      <AiResultTransition
        signature={reviewRows.map((r) => `${r.id}:${r.createdAt}`).join("|") || "empty"}
        className="space-y-4"
      >
        {reviewRows.map((r) => {
          const items = findings.filter((f) => f.reviewId === r.id);
          return (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>
                    {r.type === "ai" ? "🤖 AI 审阅" : "👤 人工审阅"}
                  </CardTitle>
                  <span className="text-xs text-(--color-muted)">
                    {fmtTime(r.createdAt)}
                  </span>
                </div>
                {r.summary && <CardDescription>{r.summary}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((f) => {
                  const sev = severityLabel[f.severity];
                  return (
                    <div
                      key={f.id}
                      className={`rounded-(--radius-control) border p-3 ${
                        f.status === "ignored"
                          ? "border-(--color-border) opacity-50"
                          : f.status === "accepted"
                            ? "border-(--color-success)"
                            : "border-(--color-border)"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Badge tone="primary">{reviewCategoryLabel[f.category]}</Badge>
                        <Badge tone={sev.tone}>{sev.text}</Badge>
                        {f.status === "accepted" && (
                          <Badge tone="success">已接受</Badge>
                        )}
                        {f.status === "ignored" && <Badge>已忽略</Badge>}
                        <div className="ml-auto flex gap-1">
                          {f.status !== "accepted" && (
                            <form
                              action={async () => {
                                "use server";
                                await setFindingStatus(f.id, articleId, "accepted");
                              }}
                            >
                              <Button size="sm" variant="secondary">
                                接受
                              </Button>
                            </form>
                          )}
                          {f.status !== "ignored" && (
                            <form
                              action={async () => {
                                "use server";
                                await setFindingStatus(f.id, articleId, "ignored");
                              }}
                            >
                              <Button size="sm" variant="ghost">
                                忽略
                              </Button>
                            </form>
                          )}
                        </div>
                      </div>
                      {f.quote && (
                        <blockquote className="mt-2 border-l-2 border-(--color-border) pl-2 text-xs text-(--color-muted)">
                          {f.quote}
                        </blockquote>
                      )}
                      <p className="mt-1.5 text-sm leading-relaxed">{f.suggestion}</p>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <p className="text-xs text-(--color-muted)">此次审阅暂无意见条目。</p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {reviewRows.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-(--color-muted)">
              还没有审阅记录。执行 AI 审阅或添加人工意见后，接受的建议可回到写作台修订并保存新版本。
            </CardContent>
          </Card>
        )}
      </AiResultTransition>
    </div>
  );
}
