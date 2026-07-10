import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db, collections, collectionMaterials, materials, topics } from "@/db";
import { generateTopicsFromCollection } from "@/actions/topics";
import { Badge } from "@/components/ui/badge";
import { AiActionForm, AiResultTransition } from "@/components/ai-action";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const typeLabel: Record<string, string> = {
  url: "网页",
  text: "文本",
  file: "文件",
  note: "笔记",
};

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const collectionId = Number(id);
  const collection = await db.query.collections.findFirst({
    where: eq(collections.id, collectionId),
  });
  if (!collection) notFound();

  const links = await db
    .select({ materialId: collectionMaterials.materialId })
    .from(collectionMaterials)
    .where(eq(collectionMaterials.collectionId, collectionId));
  const rows = links.length
    ? await db
        .select()
        .from(materials)
        .where(inArray(materials.id, links.map((l) => l.materialId)))
        .orderBy(desc(materials.createdAt))
    : [];
  const cleanedCount = rows.filter((m) => m.cleanStatus === "cleaned").length;
  const allTags = [...new Set(rows.flatMap((m) => m.tags))];

  const generatedTopics = await db
    .select()
    .from(topics)
    .where(eq(topics.collectionId, collectionId))
    .orderBy(desc(topics.createdAt));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center gap-2 text-xs text-(--color-muted)">
        <Link href="/materials" className="hover:text-(--color-primary)">
          ← 素材库
        </Link>
        <span>· 素材集合</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{collection.name}</h1>
          <p className="mt-1 text-sm text-(--color-muted)">
            {collection.description || "（这个集合还没有描述）"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-(--color-muted)">
            <Badge tone="primary">{rows.length} 条素材</Badge>
            <Badge tone={cleanedCount === rows.length && rows.length > 0 ? "success" : "warning"}>
              已清洗 {cleanedCount}/{rows.length}
            </Badge>
            <span>创建于 {fmtTime(collection.createdAt)}</span>
          </div>
          {allTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {allTags.map((t) => (
                <Link key={t} href={`/materials?tag=${encodeURIComponent(t)}`}>
                  <Badge>{t}</Badge>
                </Link>
              ))}
            </div>
          )}
        </div>
        <AiActionForm
          action={generateTopicsFromCollection}
          label="从集合生成选题 →"
          pendingLabel="选题生成中…"
          disabled={rows.length === 0}
        >
          <input type="hidden" name="collectionId" value={collectionId} />
        </AiActionForm>
      </div>

      {/* 集合内素材 */}
      <div className="grid grid-cols-2 gap-3">
        {rows.length === 0 && (
          <Card className="col-span-2">
            <CardContent className="py-10 text-center text-sm text-(--color-muted)">
              集合还是空的。到素材库勾选素材后「+加入所选」。
            </CardContent>
          </Card>
        )}
        {rows.map((m) => (
          <Link key={m.id} href={`/materials/${m.id}`} className="block">
            <Card className="h-full transition-colors hover:border-(--color-primary)">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="line-clamp-1 text-sm font-semibold">{m.title}</div>
                  <Badge tone={m.cleanStatus === "cleaned" ? "success" : "warning"}>
                    {m.cleanStatus === "cleaned" ? "已清洗" : "待清洗"}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-xs text-(--color-muted)">
                  {m.summary || m.rawContent.slice(0, 100)}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-(--color-muted)">
                  <Badge>{typeLabel[m.type]}</Badge>
                  {m.tags.slice(0, 4).map((t) => (
                    <Badge key={t} tone="primary">
                      {t}
                    </Badge>
                  ))}
                  <span className="ml-auto">{fmtTime(m.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* 由该集合生成的选题 */}
      <AiResultTransition
        signature={generatedTopics.map((t) => t.id).join("|") || "empty"}
      >
        {generatedTopics.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>由该集合生成的选题（{generatedTopics.length}）</CardTitle>
              <CardDescription>
                到<Link href="/topics" className="text-(--color-primary) underline">选题板</Link>
                继续生成 Brief 与初稿。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {generatedTopics.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-(--radius-control) border border-(--color-border) p-2 text-sm"
                >
                  <span className="line-clamp-1 flex-1">{t.title}</span>
                  <span className="text-xs text-(--color-muted)">{fmtTime(t.createdAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </AiResultTransition>
    </div>
  );
}
