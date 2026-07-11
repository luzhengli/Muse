import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { db, topics, materials, collections, articles, type Topic } from "@/db";
import {
  generateTopicsFromCollection,
  createManualTopic,
  deleteTopic,
} from "@/actions/topics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Select } from "@/components/ui/input";
import { ListFilter } from "@/components/list-filter";
import { Timeline } from "@/components/timeline";
import { AiActionForm, AiResultTransition } from "@/components/ai-action";
import { BriefEditor } from "@/components/brief-editor";
import { PLATFORM_IDS, platformName } from "@/lib/platforms";
import { groupByDay, inDateRange, parseDateRange } from "@/lib/utils";
import { normalizeTopicBrief } from "@/lib/briefs";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, { text: string; tone: "default" | "primary" | "success" | "warning" }> = {
  idea: { text: "想法", tone: "default" },
  briefed: { text: "已有 Brief", tone: "primary" },
  drafting: { text: "写作中", tone: "warning" },
  done: { text: "完成", tone: "success" },
};

const originLabel: Record<string, string> = {
  ai: "AI 生成",
  manual: "手动创建",
  retro: "复盘反哺",
};

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    platform?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  const { q, status, platform, from, to, view } = await searchParams;
  let rows = await db.select().from(topics).orderBy(desc(topics.createdAt));
  if (q?.trim()) {
    const kw = q.trim();
    rows = rows.filter(
      (t) =>
        t.title.includes(kw) ||
        t.angle.includes(kw) ||
        t.targetAudience.includes(kw) ||
        t.corePoints.some((p) => p.includes(kw)),
    );
  }
  if (status) rows = rows.filter((t) => t.status === status);
  if (platform) rows = rows.filter((t) => t.recommendedPlatforms.includes(platform));
  const range = parseDateRange(from, to);
  if (range.fromUnix !== null || range.toUnix !== null) {
    rows = rows.filter((t) => inDateRange(t.createdAt, range));
  }
  const cols = await db.select().from(collections).orderBy(desc(collections.createdAt));
  const allMaterialIds = [...new Set(rows.flatMap((t) => t.materialIds))];
  const mats = allMaterialIds.length
    ? await db
        .select({ id: materials.id, title: materials.title })
        .from(materials)
        .where(inArray(materials.id, allMaterialIds))
    : [];
  const matTitle = new Map(mats.map((m) => [m.id, m.title]));
  const articleRows = rows.length
    ? await db
        .select({ topicId: articles.topicId })
        .from(articles)
        .where(inArray(articles.topicId, rows.map((row) => row.id)))
    : [];
  const articleTopicIds = new Set(articleRows.map((row) => row.topicId));

  function renderTopicCard(t: Topic) {
    const st = statusLabel[t.status];
    const brief = normalizeTopicBrief(t.brief, t);
    return (
      <Card key={t.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  <div className="flex shrink-0 gap-1">
                    <Badge tone={st.tone}>{st.text}</Badge>
                    <Badge>{originLabel[t.origin]}</Badge>
                  </div>
                </div>
                <CardDescription>
                  {t.targetAudience && <>读者：{t.targetAudience} · </>}
                  角度：{t.angle || "未定"} · 推荐平台：
                  {t.recommendedPlatforms.map(platformName).join("、") || "未定"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {t.corePoints.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-4 text-xs text-(--color-foreground)">
                    {t.corePoints.slice(0, 4).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                {t.materialIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] text-(--color-muted)">可引用素材：</span>
                    {t.materialIds.slice(0, 5).map((id) => (
                      <Link key={id} href={`/materials/${id}`}>
                        <Badge tone="primary">{matTitle.get(id) ?? `素材#${id}`}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
                <BriefEditor
                  topicId={t.id}
                  initialBrief={brief}
                  materials={t.materialIds.map((id) => ({ id, title: matTitle.get(id) ?? `素材#${id}` }))}
                  hasArticle={articleTopicIds.has(t.id)}
                  compact
                />
                <div className="flex gap-2">
                  <form
                    action={async () => {
                      "use server";
                      await deleteTopic(t.id);
                    }}
                    className="ml-auto"
                  >
                    <Button size="sm" variant="ghost">
                      删除
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">选题板</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          基于素材集合生成选题卡片，展开为创作 brief，再一键生成初稿进入写作台。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* 从集合生成 */}
        <Card>
          <CardHeader>
            <CardTitle>从素材集合生成选题</CardTitle>
            <CardDescription>AI 会阅读集合内的语料，生成 3 个差异化选题卡片。</CardDescription>
          </CardHeader>
          <CardContent>
            <AiActionForm
              action={generateTopicsFromCollection}
              label="生成选题卡片"
              pendingLabel="选题生成中…"
              formClassName="flex gap-2"
            >
              <Select name="collectionId" required className="flex-1">
                <option value="">选择素材集合…</option>
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </AiActionForm>
            {cols.length === 0 && (
              <p className="mt-2 text-xs text-(--color-muted)">
                还没有素材集合，先到
                <Link href="/materials" className="text-(--color-primary) underline">
                  素材库
                </Link>
                勾选素材创建集合。
              </p>
            )}
          </CardContent>
        </Card>

        {/* 手动创建 */}
        <Card>
          <CardHeader>
            <CardTitle>手动创建选题</CardTitle>
            <CardDescription>已有明确想法时直接建卡。</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createManualTopic} className="space-y-2">
              <Input name="title" required placeholder="选题标题方向" />
              <div className="flex gap-2">
                <Input name="targetAudience" placeholder="目标读者" className="flex-1" />
                <Input name="angle" placeholder="内容角度" className="flex-1" />
              </div>
              <Textarea name="corePoints" placeholder="核心观点，每行一条" className="min-h-16" />
              <div className="flex items-center gap-3 text-xs">
                {(["xiaohongshu", "x", "wechat"] as const).map((p) => (
                  <label key={p} className="flex items-center gap-1">
                    <input type="checkbox" name="platforms" value={p} />
                    {platformName(p)}
                  </label>
                ))}
                <Button size="sm" className="ml-auto">
                  创建
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <ListFilter
        basePath="/topics"
        keywordPlaceholder="按标题 / 角度 / 读者 / 核心观点搜索"
        statusOptions={[
          { value: "idea", label: "想法" },
          { value: "briefed", label: "已有 Brief" },
          { value: "drafting", label: "写作中" },
          { value: "done", label: "完成" },
        ]}
        platformOptions={PLATFORM_IDS.map((p) => ({ value: p, label: platformName(p) }))}
      />

      <AiResultTransition
        signature={
          rows
            .map((t) => `${t.id}:${t.status}:${t.brief ? JSON.stringify(t.brief) : ""}`)
            .join("|") || "empty"
        }
      >
        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-(--color-muted)">
              {q || status || platform || from || to
                ? "没有匹配的选题。"
                : "还没有选题。从素材集合生成，或手动创建。"}
            </CardContent>
          </Card>
        ) : view === "timeline" ? (
          <Timeline
            groups={groupByDay(rows, (t) => t.createdAt).map((g) => ({
              label: g.label,
              children: g.items.map(renderTopicCard),
            }))}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{rows.map(renderTopicCard)}</div>
        )}
      </AiResultTransition>
    </div>
  );
}
