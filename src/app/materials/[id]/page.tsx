import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, materials, materialChunks } from "@/db";
import { cleanMaterial, deleteMaterial } from "@/actions/materials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiActionButton, AiResultTransition } from "@/components/ai-action";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const typeLabel: Record<string, string> = {
  url: "网页",
  text: "文本",
  file: "文件",
  note: "笔记",
};

export default async function MaterialDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const materialId = Number(id);
  const material = await db.query.materials.findFirst({
    where: eq(materials.id, materialId),
  });
  if (!material) notFound();

  const chunks = await db
    .select()
    .from(materialChunks)
    .where(eq(materialChunks.materialId, materialId))
    .orderBy(asc(materialChunks.orderIndex));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/materials" className="text-xs text-(--color-muted) hover:text-(--color-primary)">
            ← 返回素材库
          </Link>
          <h1 className="mt-1 text-xl font-bold">{material.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-(--color-muted)">
            <Badge>{typeLabel[material.type]}</Badge>
            <Badge tone={material.cleanStatus === "cleaned" ? "success" : "warning"}>
              {material.cleanStatus === "cleaned" ? "已清洗" : "待清洗"}
            </Badge>
            {material.tags.map((t) => (
              <Badge key={t} tone="primary">
                {t}
              </Badge>
            ))}
            <span>入库于 {fmtTime(material.createdAt)}</span>
            {material.sourceUrl && (
              <a
                href={material.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-(--color-primary) underline"
              >
                来源链接
              </a>
            )}
            {material.filePath && <span>文件：{material.filePath}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <AiActionButton
            action={cleanMaterial.bind(null, materialId)}
            label={material.cleanStatus === "cleaned" ? "重新清洗" : "清洗为语料块"}
            pendingLabel="清洗处理中…"
            variant="secondary"
          />
          <form
            action={async () => {
              "use server";
              await deleteMaterial(materialId);
              redirect("/materials");
            }}
          >
            <Button variant="danger">删除</Button>
          </form>
        </div>
      </div>

      <AiResultTransition
        signature={`${material.updatedAt}:${chunks.map((c) => c.id).join(",")}`}
        className="space-y-4"
      >
        {material.summary && (
          <Card>
            <CardHeader>
              <CardTitle>摘要</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed">{material.summary}</CardContent>
          </Card>
        )}

        {chunks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>语料块（{chunks.length}）· 已进入全文索引</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {chunks.map((c) => (
                <div
                  key={c.id}
                  className="rounded-(--radius-control) border border-(--color-border) bg-(--color-muted-bg) p-3 text-sm leading-relaxed"
                >
                  <span className="mr-2 text-[10px] text-(--color-muted)">#{c.orderIndex + 1}</span>
                  {c.content}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </AiResultTransition>

      <Card>
        <CardHeader>
          <CardTitle>原文</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-(--color-foreground)">
            {material.rawContent || "（无正文）"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
