import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, creations, platformOutputs, publications } from "@/db";
import { createXOutput } from "@/actions/platform-outputs";
import { getOutputDetailCore } from "@/lib/platform-outputs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { outputFormatLabel } from "@/lib/labels";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** v1.0 创作项目页：平台作品清单 + 新建入口（feat-031：X 单条 / Thread） */
export default async function CreationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const creationId = Number(id);
  const creation = await db.query.creations.findFirst({
    where: eq(creations.id, creationId),
  });
  if (!creation) notFound();

  const outputs = await db
    .select()
    .from(platformOutputs)
    .where(eq(platformOutputs.creationId, creationId))
    .orderBy(asc(platformOutputs.createdAt));
  const details = await Promise.all(
    outputs.map((output) => getOutputDetailCore(db, output.id)),
  );
  const publishedOutputIds = new Set(
    (
      await db.select({ outputId: publications.outputId }).from(publications)
    ).map((p) => p.outputId),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link href="/creations" className="text-xs text-(--color-muted) hover:text-(--color-primary)">
          ← 创作项目
        </Link>
        <h1 className="mt-1 text-xl font-bold">{creation.workingTitle}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-(--color-muted)">
          <span>目标平台：</span>
          {creation.targetPlatforms.map((p) => (
            <Badge key={p} tone="primary">
              {p === "x" ? "X" : p === "xiaohongshu" ? "小红书" : "公众号"}
            </Badge>
          ))}
          <span className="text-xs">（内部工作标题，不会作为任何平台的发布标题）</span>
        </p>
        {creation.hypothesis && (
          <p className="mt-1 text-xs text-(--color-muted)">
            本次想验证：{creation.hypothesis}
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-(--radius-control) border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {details.map((detail) => {
          if (!detail) return null;
          const { output, activeRevision, check } = detail;
          const label = outputFormatLabel[output.format];
          const editable = output.format === "x_single_post" || output.format === "x_thread";
          const isPublished = publishedOutputIds.has(output.id);
          return (
            <Card key={output.id} className="flex flex-col">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <CardTitle>
                    {label ? `${label.platform} · ${label.format}` : output.format}
                  </CardTitle>
                  <span className="flex gap-1.5">
                    {isPublished && <Badge tone="success">已发布</Badge>}
                    {check &&
                      (check.ready ? (
                        <Badge tone="success">检查通过</Badge>
                      ) : (
                        <Badge tone="warning">
                          {check.items.filter((i) => i.level === "blocker" && !i.passed).length}{" "}
                          项阻断
                        </Badge>
                      ))}
                  </span>
                </div>
                <CardDescription>
                  修订 r{activeRevision?.revisionNo ?? "-"} · 更新于 {fmtTime(output.updatedAt)}
                  {output.sourceRevisionId ? " · 派生自通用稿" : " · 直接创作"}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                {editable ? (
                  <Link href={`/creations/${creationId}/outputs/${output.id}`}>
                    <Button size="sm" variant="secondary">
                      打开编辑器 →
                    </Button>
                  </Link>
                ) : (
                  <p className="text-xs text-(--color-muted)">
                    {label?.platform}编辑器随后续版本提供，敬请期待。
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>新建平台作品</CardTitle>
          <CardDescription>
            X 作品可直接创建（小红书 / 公众号编辑器随后续版本开放）。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <form action={createXOutput}>
            <input type="hidden" name="creationId" value={creationId} />
            <input type="hidden" name="format" value="x_single_post" />
            <Button size="sm" type="submit">
              新建 X 单条帖文
            </Button>
          </form>
          <form action={createXOutput}>
            <input type="hidden" name="creationId" value={creationId} />
            <input type="hidden" name="format" value="x_thread" />
            <Button size="sm" type="submit" variant="secondary">
              新建 X Thread
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
