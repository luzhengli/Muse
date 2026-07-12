import Link from "next/link";
import { desc, eq, notInArray } from "drizzle-orm";
import { db, publishResults, publishTasks, retroNotes } from "@/db";
import { deleteRetroNote } from "@/actions/retro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { ListFilter } from "@/components/list-filter";
import { Timeline } from "@/components/timeline";
import { getRetroTraceCore, type RetroTrace } from "@/lib/retro";
import { PLATFORM_IDS, platformName } from "@/lib/platforms";
import { fmtTime, groupByDay, inDateRange, parseDateRange } from "@/lib/utils";
import type { RetroNote } from "@/db";

export const dynamic = "force-dynamic";

/**
 * 复盘经验（feat-026）：向导记录 → 经验列表（含全链溯源）→ 在新创作中复用。
 * 旧的手动录入表单已由复盘向导取代；一键转选题改为 /create 的预览-查重-确认。
 */
export default async function RetroPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    q?: string;
    platform?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  const { saved, q, platform, from, to, view } = await searchParams;

  let notes = await db.select().from(retroNotes).orderBy(desc(retroNotes.createdAt));
  const range = parseDateRange(from, to);
  if (q?.trim()) {
    const kw = q.trim();
    notes = notes.filter(
      (n) =>
        n.title.includes(kw) || n.insights.includes(kw) || n.nextTopicHint.includes(kw),
    );
  }
  if (range.fromUnix !== null || range.toUnix !== null) {
    notes = notes.filter((n) => inDateRange(n.createdAt, range));
  }

  // 待记录表现的发布（发布了但还没有对应结果记录）
  const recordedTaskIds = (
    await db.select({ taskId: publishResults.taskId }).from(publishResults)
  )
    .map((r) => r.taskId)
    .filter((id): id is number => id !== null);
  const pendingTasks = await db
    .select()
    .from(publishTasks)
    .where(
      recordedTaskIds.length
        ? notInArray(publishTasks.id, recordedTaskIds)
        : eq(publishTasks.status, "published"),
    )
    .orderBy(desc(publishTasks.publishedAt));
  const pendingRecord = pendingTasks.filter((t) => t.status === "published").slice(0, 3);

  const traces = new Map<number, RetroTrace | null>();
  for (const note of notes.slice(0, 20)) {
    traces.set(note.id, await getRetroTraceCore(db, note.id));
  }
  let platformNotes = notes;
  if (platform) {
    platformNotes = notes.filter((n) => traces.get(n.id)?.platform === platform);
  }

  function renderNoteCard(n: RetroNote) {
    const trace = traces.get(n.id);
    return (
      <Card key={n.id} className={saved === String(n.id) ? "border-(--color-success)" : undefined}>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{n.title}</span>
            <span className="text-xs text-(--color-muted)">{fmtTime(n.createdAt)}</span>
            <div className="ml-auto flex gap-1.5">
              {n.convertedTopicId ? (
                <Badge tone="success">已复用为新方向</Badge>
              ) : (
                <Link href="/create?entry=retro">
                  <Button size="sm" variant="secondary">
                    在新创作中复用 →
                  </Button>
                </Link>
              )}
              <form
                action={async () => {
                  "use server";
                  await deleteRetroNote(n.id);
                }}
              >
                <ConfirmButton message="删除这条经验？之后无法在新创作中复用它。">
                  删除
                </ConfirmButton>
              </form>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{n.insights}</p>
          {n.nextTopicHint && (
            <p className="mt-1 text-xs text-(--color-muted)">下一步方向：{n.nextTopicHint}</p>
          )}
          {trace && trace.platform && (
            <p className="mt-2 border-t border-(--color-border) pt-2 text-xs text-(--color-muted)">
              溯源：{platformName(trace.platform)}
              {trace.articleId && trace.articleTitle && (
                <>
                  {" · "}
                  <Link
                    href={`/articles/${trace.articleId}`}
                    className="underline hover:text-(--color-primary)"
                  >
                    {trace.articleTitle}
                  </Link>
                </>
              )}
              {trace.sourceVersionNo && ` · 基于已保存版本 v${trace.sourceVersionNo}`}
              {trace.topicTitle && ` · 创作说明「${trace.topicTitle}」`}
              {trace.externalUrl && (
                <>
                  {" · "}
                  <a
                    href={trace.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-(--color-primary)"
                  >
                    发布链接
                  </a>
                </>
              )}
              {trace.convertedTopicTitle && ` → 新方向「${trace.convertedTopicTitle}」`}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">复盘经验</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          每次发布后记录表现、沉淀经验；经验可以直接用来开始下一次创作。
        </p>
      </div>

      {saved && (
        <div
          role="status"
          className="ai-feedback rounded-(--radius-control) border border-(--color-success) bg-(--color-success-soft) px-3 py-2 text-sm text-(--color-success)"
        >
          经验已保存。可以「在新创作中复用」，也可以随时回来编辑认识。
        </div>
      )}

      {/* 待记录表现的发布 */}
      {pendingRecord.length > 0 && (
        <Card className="border-(--color-primary)">
          <CardHeader>
            <CardTitle>有 {pendingRecord.length} 次发布还没记录表现</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingRecord.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-2 rounded-(--radius-control) border border-(--color-border) p-2.5 text-sm"
              >
                <Badge tone="primary">{platformName(t.platform)}</Badge>
                <span className="text-xs text-(--color-muted)">
                  发布于 {fmtTime(t.publishedAt)}
                </span>
                <Link href={`/retro/record?taskId=${t.id}`} className="ml-auto">
                  <Button size="sm">记录这次表现 →</Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <ListFilter
        basePath="/retro"
        keywordPlaceholder="按经验标题 / 内容 / 方向提示搜索"
        platformOptions={PLATFORM_IDS.map((p) => ({ value: p, label: platformName(p) }))}
      />

      {platformNotes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            {q || platform || from || to
              ? "没有匹配的经验。"
              : "还没有沉淀的经验。完成一次发布后，从发布记录进入「记录这次表现」。"}
          </CardContent>
        </Card>
      ) : view === "timeline" ? (
        <Timeline
          groups={groupByDay(platformNotes, (n) => n.createdAt).map((g) => ({
            label: g.label,
            children: g.items.map(renderNoteCard),
          }))}
        />
      ) : (
        <div className="space-y-2">{platformNotes.map(renderNoteCard)}</div>
      )}
    </div>
  );
}
