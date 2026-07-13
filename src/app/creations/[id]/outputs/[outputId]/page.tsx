import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, creations, publications } from "@/db";
import { getOutputDetailCore } from "@/lib/platform-outputs";
import { XOutputWorkbench } from "@/components/outputs/x-output-workbench";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { outputFormatLabel } from "@/lib/labels";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** 平台作品工作台：编辑 / 平台预览 / 发布检查 三视图（feat-031：X 单条 + Thread） */
export default async function OutputPage({
  params,
}: {
  params: Promise<{ id: string; outputId: string }>;
}) {
  const { id, outputId } = await params;
  const creationId = Number(id);
  const detail = await getOutputDetailCore(db, Number(outputId));
  if (!detail || detail.output.creationId !== creationId) notFound();
  const creation = await db.query.creations.findFirst({
    where: eq(creations.id, creationId),
  });
  if (!creation) notFound();

  const publicationRows = await db
    .select()
    .from(publications)
    .where(eq(publications.outputId, detail.output.id))
    .orderBy(desc(publications.publishedAt));

  const label = outputFormatLabel[detail.output.format];
  const xPayload =
    detail.payload &&
    (detail.payload.type === "x_single_post" || detail.payload.type === "x_thread")
      ? detail.payload
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link
          href={`/creations/${creationId}`}
          className="text-xs text-(--color-muted) hover:text-(--color-primary)"
        >
          ← {creation.workingTitle}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">
            {label ? `${label.platform} · ${label.format}` : detail.output.format}
          </h1>
          <Badge tone="default">修订 r{detail.activeRevision?.revisionNo ?? "-"}</Badge>
        </div>
      </div>

      {xPayload ? (
        <XOutputWorkbench
          outputId={detail.output.id}
          initialPayload={xPayload}
          hasPublication={publicationRows.length > 0}
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-(--color-muted)">
            {label
              ? `${label.platform}${label.format}编辑器随后续版本提供。`
              : "该作品内容无法解析，请检查数据。"}
          </CardContent>
        </Card>
      )}

      {publicationRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>发布记录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {publicationRows.map((publication) => (
              <div
                key={publication.id}
                className="flex flex-wrap items-center gap-2 rounded-(--radius-control) border border-(--color-border) px-3 py-2 text-sm"
              >
                <Badge tone={publication.publishedWithRisk ? "warning" : "success"}>
                  {publication.publishedWithRisk ? "带风险发布" : "已发布"}
                </Badge>
                <span className="text-xs text-(--color-muted)">
                  {fmtTime(publication.publishedAt)}
                </span>
                {publication.url ? (
                  <a
                    href={publication.url}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-full truncate text-xs text-(--color-primary) underline"
                  >
                    {publication.url}
                  </a>
                ) : (
                  <span className="text-xs text-(--color-muted)">链接待补充</span>
                )}
                {publication.publishedWithRisk === 1 && publication.riskReason && (
                  <span className="w-full text-xs text-(--color-warning)">
                    风险说明：{publication.riskReason}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
