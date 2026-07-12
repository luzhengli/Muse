import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db, publishTasks, platformVariants, articles, publishResults } from "@/db";
import { deleteTask } from "@/actions/publish";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { taskStatusLabel } from "@/lib/labels";
import { platformName } from "@/lib/platforms";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * 发布记录（feat-026）：只读记录 + 「记录这次表现」入口。
 * 真实发布由发布助手手动完成；mock 适配器不进入普通流程。
 */
export default async function PublishRecordsPage() {
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
  const recordedTaskIds = new Set(
    (await db.select({ taskId: publishResults.taskId }).from(publishResults))
      .map((r) => r.taskId)
      .filter((id): id is number => id !== null),
  );

  const published = tasks.filter((t) => t.status === "published");
  const legacy = tasks.filter((t) => t.status !== "published");

  function taskRow(t: (typeof tasks)[number], isLegacy: boolean) {
    const st = taskStatusLabel[t.status];
    const variant = variantMap.get(t.variantId);
    const articleTitle = variant ? articleMap.get(variant.articleId) : undefined;
    const recorded = recordedTaskIds.has(t.id);
    return (
      <Card key={t.id}>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Badge tone={st.tone}>{st.text}</Badge>
          {isLegacy && <Badge>历史任务</Badge>}
          <div className="min-w-0 flex-1">
            <div className="line-clamp-1 text-sm font-medium">
              {variant?.title ?? "（平台稿已删除）"}
              <span className="ml-2 text-xs text-(--color-muted)">
                {platformName(t.platform)}
                {articleTitle && variant && (
                  <>
                    {" · "}
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
              {t.publishedAt ? `发布于 ${fmtTime(t.publishedAt)}` : `创建于 ${fmtTime(t.createdAt)}`}
              {t.lastError && <span className="text-(--color-danger)"> · {t.lastError}</span>}
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
            {t.status === "published" &&
              (recorded ? (
                <Badge tone="success">表现已记录</Badge>
              ) : (
                <Link href={`/retro/record?taskId=${t.id}`}>
                  <Button size="sm">记录这次表现 →</Button>
                </Link>
              ))}
            <form
              action={async () => {
                "use server";
                await deleteTask(t.id);
              }}
            >
              <ConfirmButton message="删除这条发布记录？已记录的复盘不受影响。">
                删除
              </ConfirmButton>
            </form>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">发布记录</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          在创作的「发布准备」里用发布助手手动发布并标记；这里跟踪记录，并把每次发布引向复盘。
        </p>
      </div>

      {tasks.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            还没有发布记录。到创作的「发布准备」步骤，用发布助手完成第一次发布。
          </CardContent>
        </Card>
      )}

      {published.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-(--color-muted)">已发布</div>
          {published.map((t) => taskRow(t, false))}
        </div>
      )}

      {legacy.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-(--color-muted)">
            历史任务（旧的定时发布已停用，仅可删除）
          </div>
          {legacy.map((t) => taskRow(t, true))}
        </div>
      )}
    </div>
  );
}
