import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, publishResults, publishTasks, retroNotes } from "@/db";
import {
  recordResult,
  createRetroNote,
  convertRetroToTopic,
  deleteRetroNote,
} from "@/actions/retro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Select, Label } from "@/components/ui/input";
import { ListFilter } from "@/components/list-filter";
import { Timeline } from "@/components/timeline";
import { PLATFORM_IDS, platformName } from "@/lib/platforms";
import { fmtTime, groupByDay, inDateRange, parseDateRange } from "@/lib/utils";
import type { RetroNote } from "@/db";

export const dynamic = "force-dynamic";

export default async function RetroPage({
  searchParams,
}: {
  searchParams: Promise<{
    taskId?: string;
    q?: string;
    platform?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  const { taskId, q, platform, from, to, view } = await searchParams;
  const preselectedTask = taskId
    ? await db.query.publishTasks.findFirst({
        where: eq(publishTasks.id, Number(taskId)),
      })
    : null;

  const allResults = await db
    .select()
    .from(publishResults)
    .orderBy(desc(publishResults.recordedAt));
  let notes = await db
    .select()
    .from(retroNotes)
    .orderBy(desc(retroNotes.createdAt));

  const range = parseDateRange(from, to);
  let results = allResults;
  if (platform) results = results.filter((r) => r.platform === platform);
  if (q?.trim()) {
    const kw = q.trim();
    results = results.filter(
      (r) => r.commentFeedback.includes(kw) || r.externalUrl.includes(kw),
    );
    notes = notes.filter(
      (n) =>
        n.title.includes(kw) || n.insights.includes(kw) || n.nextTopicHint.includes(kw),
    );
  }
  if (range.fromUnix !== null || range.toUnix !== null) {
    results = results.filter((r) => inDateRange(r.recordedAt, range));
    notes = notes.filter((n) => inDateRange(n.createdAt, range));
  }
  const publishedTasks = await db
    .select()
    .from(publishTasks)
    .where(eq(publishTasks.status, "published"))
    .orderBy(desc(publishTasks.publishedAt));

  function renderNoteCard(n: RetroNote) {
    return (
      <Card key={n.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{n.title}</span>
                <span className="text-xs text-(--color-muted)">{fmtTime(n.createdAt)}</span>
                <div className="ml-auto flex gap-1.5">
                  {n.convertedTopicId ? (
                    <Link href="/topics">
                      <Badge tone="success">已转为选题 #{n.convertedTopicId}</Badge>
                    </Link>
                  ) : (
                    <form
                      action={async () => {
                        "use server";
                        await convertRetroToTopic(n.id);
                      }}
                    >
                      <Button size="sm" variant="secondary">
                        反哺为新选题 →
                      </Button>
                    </form>
                  )}
                  <form
                    action={async () => {
                      "use server";
                      await deleteRetroNote(n.id);
                    }}
                  >
                    <Button size="sm" variant="ghost">
                      删除
                    </Button>
                  </form>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{n.insights}</p>
              {n.nextTopicHint && (
                <p className="mt-1 text-xs text-(--color-muted)">
                  下一步方向：{n.nextTopicHint}
                </p>
              )}
            </CardContent>
          </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">复盘中心</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          记录发布结果与互动数据，沉淀可复用经验，并一键反哺为下一轮选题。
        </p>
      </div>

      <ListFilter
        basePath="/retro"
        keywordPlaceholder="按复盘标题 / 结论 / 反馈摘录搜索"
        platformOptions={PLATFORM_IDS.map((p) => ({ value: p, label: platformName(p) }))}
      />

      <div className="grid grid-cols-2 gap-4">
        {/* 录入发布数据 */}
        <Card>
          <CardHeader>
            <CardTitle>录入发布结果</CardTitle>
            <CardDescription>第一版手动录入，后续可接平台数据 API。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={recordResult} className="space-y-2">
              <div className="flex gap-2">
                <Select
                  name="taskId"
                  defaultValue={preselectedTask ? String(preselectedTask.id) : ""}
                  className="flex-1"
                >
                  <option value="">不关联发布任务（手动记录）</option>
                  {publishedTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.id} · {platformName(t.platform)} · {fmtTime(t.publishedAt)}
                    </option>
                  ))}
                </Select>
                <Select
                  name="platform"
                  defaultValue={preselectedTask?.platform ?? "wechat"}
                  className="w-32"
                >
                  {PLATFORM_IDS.map((p) => (
                    <option key={p} value={p}>
                      {platformName(p)}
                    </option>
                  ))}
                </Select>
              </div>
              <Input name="externalUrl" placeholder="发布链接（可选）" />
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label>阅读/浏览</Label>
                  <Input type="number" name="views" min={0} defaultValue={0} />
                </div>
                <div>
                  <Label>点赞</Label>
                  <Input type="number" name="likes" min={0} defaultValue={0} />
                </div>
                <div>
                  <Label>评论</Label>
                  <Input type="number" name="comments" min={0} defaultValue={0} />
                </div>
                <div>
                  <Label>转发/收藏</Label>
                  <Input type="number" name="shares" min={0} defaultValue={0} />
                </div>
              </div>
              <Textarea
                name="commentFeedback"
                placeholder="典型评论与读者反馈摘录"
                className="min-h-16"
              />
              <Button>保存结果</Button>
            </form>
          </CardContent>
        </Card>

        {/* 沉淀复盘结论 */}
        <Card>
          <CardHeader>
            <CardTitle>沉淀复盘结论</CardTitle>
            <CardDescription>写下这次内容表现的经验，可转为下一轮选题。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createRetroNote} className="space-y-2">
              <div className="flex gap-2">
                <Input name="title" placeholder="复盘标题" className="flex-1" />
                <Select name="resultId" className="w-44">
                  <option value="">不关联数据记录</option>
                  {allResults.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.id} {platformName(r.platform)} · 阅读{r.views}
                    </option>
                  ))}
                </Select>
              </div>
              <Textarea
                name="insights"
                required
                placeholder="结论与经验：什么有效、什么无效、原因是什么…"
                className="min-h-20"
              />
              <Input name="nextTopicHint" placeholder="下一步选题方向提示（可选）" />
              <Button>保存复盘</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* 数据记录 */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>发布数据记录（{results.length}）</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-left text-xs text-(--color-muted)">
                  <th className="py-2">平台</th>
                  <th>阅读</th>
                  <th>点赞</th>
                  <th>评论</th>
                  <th>转发</th>
                  <th>反馈摘录</th>
                  <th>记录时间</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-b border-(--color-border) last:border-0">
                    <td className="py-2">
                      <Badge tone="primary">{platformName(r.platform)}</Badge>
                    </td>
                    <td>{r.views}</td>
                    <td>{r.likes}</td>
                    <td>{r.comments}</td>
                    <td>{r.shares}</td>
                    <td className="max-w-52">
                      <span className="line-clamp-1 text-xs text-(--color-muted)">
                        {r.commentFeedback || "-"}
                      </span>
                    </td>
                    <td className="text-xs text-(--color-muted)">{fmtTime(r.recordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 复盘结论列表 */}
      {notes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            {q || platform || from || to
              ? "没有匹配的复盘结论。"
              : "还没有复盘结论。数据录入后写下经验，形成「发布 → 复盘 → 新选题」的闭环。"}
          </CardContent>
        </Card>
      ) : view === "timeline" ? (
        <Timeline
          groups={groupByDay(notes, (n) => n.createdAt).map((g) => ({
            label: g.label,
            children: g.items.map(renderNoteCard),
          }))}
        />
      ) : (
        <div className="space-y-2">{notes.map(renderNoteCard)}</div>
      )}
    </div>
  );
}
