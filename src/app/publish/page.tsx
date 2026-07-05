import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, publishTasks, platformVariants, articles } from "@/db";
import { runDueTasks, publishNow, retryTask, deleteTask } from "@/actions/publish";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { taskStatusLabel } from "@/lib/labels";
import { platformName } from "@/lib/platforms";
import { fmtTime, nowUnix } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PublishPage() {
  const tasks = await db
    .select()
    .from(publishTasks)
    .orderBy(desc(publishTasks.createdAt));
  const variantIds = [...new Set(tasks.map((t) => t.variantId))];
  const variants = variantIds.length
    ? await db
        .select()
        .from(platformVariants)
        .where(inArray(platformVariants.id, variantIds))
    : [];
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const articleIds = [...new Set(variants.map((v) => v.articleId))];
  const articleRows = articleIds.length
    ? await db
        .select({ id: articles.id, title: articles.title })
        .from(articles)
        .where(inArray(articles.id, articleIds))
    : [];
  const articleMap = new Map(articleRows.map((a) => [a.id, a.title]));

  const dueCount = tasks.filter(
    (t) => t.status === "pending" && t.scheduledAt <= nowUnix(),
  ).length;
  const grouped = {
    pending: tasks.filter((t) => t.status === "pending" || t.status === "publishing"),
    published: tasks.filter((t) => t.status === "published"),
    failed: tasks.filter((t) => t.status === "failed"),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">发布中心</h1>
          <p className="mt-1 text-sm text-(--color-muted)">
            定时计划、状态跟踪与失败重试。当前使用 mock 发布器，真实平台 API 可通过适配器接口接入。
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await runDueTasks();
          }}
        >
          <Button disabled={dueCount === 0}>
            执行到期任务{dueCount > 0 ? `（${dueCount}）` : ""}
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["pending", "待发布 / 发布中"],
            ["published", "已发布"],
            ["failed", "失败"],
          ] as const
        ).map(([key, label]) => (
          <Card key={key}>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{grouped[key].length}</div>
              <div className="text-xs text-(--color-muted)">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {tasks.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            还没有发布任务。到文章的「平台版本」页派生版本后创建任务。
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {tasks.map((t) => {
          const st = taskStatusLabel[t.status];
          const variant = variantMap.get(t.variantId);
          const articleTitle = variant ? articleMap.get(variant.articleId) : undefined;
          return (
            <Card key={t.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <Badge tone={st.tone}>{st.text}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-medium">
                    {variant?.title ?? "（版本已删除）"}
                    <span className="ml-2 text-xs text-(--color-muted)">
                      {platformName(t.platform)}
                      {articleTitle && variant && (
                        <>
                          {" · 母版："}
                          <Link
                            href={`/articles/${variant.articleId}/variants`}
                            className="underline hover:text-(--color-primary)"
                          >
                            {articleTitle}
                          </Link>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-(--color-muted)">
                    计划：{fmtTime(t.scheduledAt)}
                    {t.publishedAt && ` · 发布于 ${fmtTime(t.publishedAt)}`}
                    {t.attempts > 0 && ` · 尝试 ${t.attempts} 次`}
                    {t.lastError && (
                      <span className="text-(--color-danger)"> · {t.lastError}</span>
                    )}
                    {t.externalUrl && (
                      <>
                        {" · "}
                        <a
                          href={t.externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-(--color-primary) underline"
                        >
                          查看链接
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {t.status === "pending" && (
                    <form
                      action={async () => {
                        "use server";
                        await publishNow(t.id);
                      }}
                    >
                      <Button size="sm" variant="secondary">
                        立即发布
                      </Button>
                    </form>
                  )}
                  {t.status === "failed" && (
                    <form
                      action={async () => {
                        "use server";
                        await retryTask(t.id);
                      }}
                    >
                      <Button size="sm" variant="secondary">
                        重试
                      </Button>
                    </form>
                  )}
                  {t.status === "published" && (
                    <Link href={`/retro?taskId=${t.id}`}>
                      <Button size="sm" variant="outline">
                        录入数据 →
                      </Button>
                    </Link>
                  )}
                  <form
                    action={async () => {
                      "use server";
                      await deleteTask(t.id);
                    }}
                  >
                    <Button size="sm" variant="ghost">
                      删除
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
