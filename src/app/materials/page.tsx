import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db, materials, collections, collectionMaterials, type Material } from "@/db";
import { searchChunks } from "@/db/fts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ListFilter } from "@/components/list-filter";
import { Timeline } from "@/components/timeline";
import { fmtTime, groupByDay, inDateRange, parseDateRange } from "@/lib/utils";
import { ImportPanel } from "./import-panel";
import { MaterialToolbar } from "./toolbar";

export const dynamic = "force-dynamic";

const typeLabel: Record<string, string> = {
  url: "网页",
  text: "文本",
  file: "文件",
  note: "笔记",
};

function MaterialCard({
  m,
  snippet,
}: {
  m: Material;
  snippet?: string;
}) {
  return (
    <Link href={`/materials/${m.id}`} className="block">
      <Card className="h-full transition-colors hover:border-(--color-primary)">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="line-clamp-1 text-sm font-semibold">{m.title}</div>
            <Badge tone={m.cleanStatus === "cleaned" ? "success" : "warning"}>
              {m.cleanStatus === "cleaned" ? "已清洗" : "待清洗"}
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs text-(--color-muted)">
            {snippet ?? m.summary ?? ""}
            {!snippet && !m.summary && m.rawContent.slice(0, 100)}
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
  );
}

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    status?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  const { q, tag, status, from, to, view } = await searchParams;

  let rows = await db.select().from(materials).orderBy(desc(materials.createdAt));
  const allTags = [...new Set(rows.flatMap((m) => m.tags))].slice(0, 20);
  const snippetByMaterial = new Map<number, string>();

  if (q?.trim()) {
    const hits = searchChunks(q.trim());
    const idSet = new Set(hits.map((h) => h.materialId));
    for (const h of hits) {
      if (!snippetByMaterial.has(h.materialId)) {
        snippetByMaterial.set(h.materialId, h.snippet);
      }
    }
    // 标题/原文兜底匹配，覆盖未清洗素材
    rows = rows.filter(
      (m) =>
        idSet.has(m.id) ||
        m.title.includes(q) ||
        m.rawContent.includes(q) ||
        m.summary.includes(q),
    );
  }
  if (tag) rows = rows.filter((m) => m.tags.includes(tag));
  if (status) rows = rows.filter((m) => m.cleanStatus === status);
  const range = parseDateRange(from, to);
  if (range.fromUnix !== null || range.toUnix !== null) {
    rows = rows.filter((m) => inDateRange(m.createdAt, range));
  }

  const cols = await db.select().from(collections).orderBy(desc(collections.createdAt));
  const links = cols.length
    ? await db
        .select()
        .from(collectionMaterials)
        .where(inArray(collectionMaterials.collectionId, cols.map((c) => c.id)))
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">素材库</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          采集收件箱 + 知识整理：导入原始素材，清洗为可检索语料块，组织为素材集合。
        </p>
      </div>

      <ImportPanel />

      <ListFilter
        basePath="/materials"
        keywordPlaceholder="全文搜索语料块（FTS5，支持中文子串）"
        statusOptions={[
          { value: "raw", label: "待清洗" },
          { value: "cleaned", label: "已清洗" },
        ]}
        tagOptions={allTags}
      />

      <MaterialToolbar
        collections={cols.map((c) => ({
          id: c.id,
          name: c.name,
          count: links.filter((l) => l.collectionId === c.id).length,
        }))}
        materials={rows.map((m) => ({ id: m.id, title: m.title }))}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            {q || tag || status || from || to
              ? "没有匹配的素材。"
              : "素材库还是空的，从上方导入第一条素材开始。"}
          </CardContent>
        </Card>
      ) : view === "timeline" ? (
        <Timeline
          groups={groupByDay(rows, (m) => m.createdAt).map((g) => ({
            label: g.label,
            children: g.items.map((m) => (
              <MaterialCard key={m.id} m={m} snippet={snippetByMaterial.get(m.id)} />
            )),
          }))}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {rows.map((m) => (
            <MaterialCard key={m.id} m={m} snippet={snippetByMaterial.get(m.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
