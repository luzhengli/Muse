import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, articles, platformVariants, topics, type Platform } from "@/db";
import { generateVariant, updateVariant, deleteVariant } from "@/actions/variants";
import { createPublishTask } from "@/actions/publish";
import { ArticleHeader } from "@/components/article-header";
import { ArticleTabs } from "@/components/article-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { PLATFORM_IDS, PLATFORMS, platformName } from "@/lib/platforms";
import { fmtTime } from "@/lib/utils";
import { AiActionButton, AiResultTransition } from "@/components/ai-action";

export const dynamic = "force-dynamic";

export default async function VariantsPage({
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

  const variants = await db
    .select()
    .from(platformVariants)
    .where(eq(platformVariants.articleId, articleId))
    .orderBy(desc(platformVariants.updatedAt));
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

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-(--color-muted)">
          从同一内容母版派生平台版本：标题长度、段落结构、话题标签、CTA、摘要与发布说明分别适配。
        </p>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_IDS.map((p) => (
            <AiActionButton
              key={p}
              action={generateVariant.bind(null, articleId, p as Platform)}
              label={`派生${platformName(p)}版`}
              pendingLabel="派生中…"
              variant="secondary"
              size="sm"
            />
          ))}
        </div>
      </div>

      {variants.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            还没有平台版本。点击右上角按钮，从当前最新版本派生。
          </CardContent>
        </Card>
      )}

      <AiResultTransition
        signature={variants.map((v) => `${v.id}:${v.updatedAt}`).join("|") || "empty"}
        className="space-y-4"
      >
        {variants.map((v) => {
          const spec = PLATFORMS[v.platform];
          return (
            <Card key={v.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{spec.name} 版本</CardTitle>
                  <Badge tone="primary">#{v.id}</Badge>
                  <span className="text-xs text-(--color-muted)">
                    更新于 {fmtTime(v.updatedAt)}
                  </span>
                  <form
                    action={async () => {
                      "use server";
                      await deleteVariant(v.id, articleId);
                    }}
                    className="ml-auto"
                  >
                    <Button size="sm" variant="ghost">
                      删除
                    </Button>
                  </form>
                </div>
                <CardDescription>
                  {spec.style}
                  {spec.contentMaxLen > 0 && ` · 建议长度 ≤ ${spec.contentMaxLen} 字`}
                  {v.content.length > 0 && `（当前 ${v.content.length} 字）`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={updateVariant} className="space-y-2">
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="articleId" value={articleId} />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <Label>标题{spec.titleMaxLen ? `（≤${spec.titleMaxLen} 字）` : ""}</Label>
                      <Input name="title" defaultValue={v.title} />
                    </div>
                    <div>
                      <Label>话题标签（空格分隔）</Label>
                      <Input name="hashtags" defaultValue={v.hashtags.join(" ")} />
                    </div>
                  </div>
                  <div>
                    <Label>正文</Label>
                    <Textarea name="content" defaultValue={v.content} className="min-h-40 font-mono text-xs" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <Label>CTA</Label>
                      <Input name="cta" defaultValue={v.cta} />
                    </div>
                    <div>
                      <Label>摘要</Label>
                      <Input name="summary" defaultValue={v.summary} />
                    </div>
                  </div>
                  <div>
                    <Label>发布说明</Label>
                    <Input name="publishNote" defaultValue={v.publishNote} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline">
                      保存修改
                    </Button>
                  </div>
                </form>

                {/* 创建发布任务 */}
                <form action={createPublishTask} className="mt-3 flex items-end gap-2 rounded-(--radius-control) bg-(--color-muted-bg) p-3">
                  <input type="hidden" name="variantId" value={v.id} />
                  <div>
                    <Label>定时发布（留空 = 立即排队）</Label>
                    <Input type="datetime-local" name="scheduledAt" className="w-56" />
                  </div>
                  <Button size="sm">创建发布任务 →</Button>
                  <span className="text-xs text-(--color-muted)">任务在发布中心统一跟踪</span>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </AiResultTransition>
    </div>
  );
}
