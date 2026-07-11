"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmDraftPreview,
  generateBriefAction,
  previewDraftFromBrief,
  saveTopicBrief,
  type BriefDraftPreview,
} from "@/actions/topics";
import { AiActionFeedback, AiButtonContent } from "@/components/ai-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { TopicBrief } from "@/db/schema";
import { normalizeTopicBrief } from "@/lib/briefs";
import type { AiActionResult } from "@/lib/ai";
import { startRouteProgress } from "@/lib/navigation-motion";
import { PLATFORM_IDS, platformName } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export function BriefEditor({
  topicId,
  initialBrief,
  materials,
  hasArticle,
  compact = false,
}: {
  topicId: number;
  initialBrief: TopicBrief;
  materials: { id: number; title: string }[];
  hasArticle: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(!compact);
  const [brief, setBrief] = useState(initialBrief);
  const [savedBrief, setSavedBrief] = useState(initialBrief);
  const [briefPreview, setBriefPreview] = useState<TopicBrief | null>(null);
  const [draftPreview, setDraftPreview] = useState<BriefDraftPreview | null>(null);
  const [feedback, setFeedback] = useState<AiActionResult<unknown> | null>(null);
  const [pending, startTransition] = useTransition();
  const busyRef = useRef(false);
  const dirty = useMemo(
    () => JSON.stringify(brief) !== JSON.stringify(savedBrief),
    [brief, savedBrief],
  );

  function update<Key extends keyof TopicBrief>(key: Key, value: TopicBrief[Key]) {
    setBrief((current) => normalizeTopicBrief({ ...current, [key]: value }));
    setDraftPreview(null);
  }

  function updateKeyPoints(value: string) {
    update(
      "keyPoints",
      value.split(/\n+/).map((item) => item.trim()).filter(Boolean),
    );
  }

  function setEvidence(keyPoint: string, materialId: number, checked: boolean) {
    const evidence = brief.evidence.map((item) =>
      item.keyPoint === keyPoint
        ? {
            ...item,
            materialIds: checked
              ? [...new Set([...item.materialIds, materialId])]
              : item.materialIds.filter((id) => id !== materialId),
          }
        : item,
    );
    update("evidence", evidence);
  }

  function run(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setFeedback(null);
    startTransition(async () => {
      try {
        await task();
      } catch {
        setFeedback({ ok: false, message: "操作未完成，请重试。", tone: "danger" });
      } finally {
        busyRef.current = false;
      }
    });
  }

  function save() {
    run(async () => {
      const result = await saveTopicBrief(topicId, brief);
      setFeedback(result);
      if (result.ok) {
        setSavedBrief(brief);
        router.refresh();
      }
    });
  }

  function generateBriefPreview() {
    run(async () => {
      const result = await generateBriefAction(topicId);
      setFeedback(result);
      if (result.ok && result.data) setBriefPreview(result.data);
    });
  }

  function generateDraftPreview() {
    if (dirty) {
      setFeedback({ ok: false, message: "请先保存 Brief，再生成与其一致的初稿预览。", tone: "warning" });
      return;
    }
    run(async () => {
      const result = await previewDraftFromBrief(topicId);
      setFeedback(result);
      if (result.ok && result.data) setDraftPreview(result.data);
    });
  }

  function confirmDraft() {
    if (!draftPreview) return;
    run(async () => {
      const result = await confirmDraftPreview(topicId, draftPreview);
      setFeedback(result);
      if (result.ok && result.redirectTo) {
        startRouteProgress();
        router.push(result.redirectTo);
      }
    });
  }

  if (!expanded) {
    return (
      <div className="rounded-(--radius-control) bg-(--color-muted-bg) p-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold">创作 Brief</span>
          {dirty && <Badge tone="warning">有未保存修改</Badge>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setExpanded(true)}>
            编辑 Brief
          </Button>
        </div>
        <p className="mt-1 line-clamp-2 text-(--color-muted)">
          {brief.coreClaim || brief.keyPoints.join("；") || "尚未补全核心主张"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">可编辑创作 Brief</span>
        {dirty && <Badge tone="warning">有未保存修改</Badge>}
        {hasArticle && <Badge tone="warning">已有正文 · 可能需重新对齐</Badge>}
        {compact && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setExpanded(false)}>
            收起
          </Button>
        )}
      </div>
      {hasArticle && (
        <p className="text-[11px] text-(--color-warning)">
          修改 Brief 不会自动覆盖正文；保存后请自行决定是否按大纲生成新初稿版本。
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label><Label>目标读者</Label><Input value={brief.audience} onChange={(e) => update("audience", e.target.value)} /></label>
        <label><Label>创作目标</Label><Input value={brief.objective} onChange={(e) => update("objective", e.target.value)} /></label>
      </div>
      <label><Label>核心主张</Label><Textarea className="min-h-16" value={brief.coreClaim} onChange={(e) => update("coreClaim", e.target.value)} /></label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label><Label>内容角度</Label><Input value={brief.angle} onChange={(e) => update("angle", e.target.value)} /></label>
        <label><Label>语气与人称</Label><Input value={brief.tone} onChange={(e) => update("tone", e.target.value)} /></label>
      </div>
      <fieldset>
        <Label>目标平台</Label>
        <div className="mt-1 flex flex-wrap gap-3 text-xs">
          {PLATFORM_IDS.map((platform) => (
            <label key={platform} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={brief.platforms.includes(platform)}
                onChange={(event) =>
                  update(
                    "platforms",
                    event.target.checked
                      ? [...brief.platforms, platform]
                      : brief.platforms.filter((item) => item !== platform),
                  )
                }
              />
              {platformName(platform)}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        <Label>关键要点（每行一条）</Label>
        <Textarea value={brief.keyPoints.join("\n")} onChange={(e) => updateKeyPoints(e.target.value)} />
      </label>
      <label>
        <Label>大纲（每行一节）</Label>
        <Textarea value={brief.outline.join("\n")} onChange={(e) => update("outline", e.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean))} />
      </label>

      {brief.keyPoints.length > 0 && (
        <div className="space-y-2">
          <Label>关键要点的素材依据</Label>
          {brief.evidence.map((evidence) => (
            <div key={evidence.keyPoint} className="rounded-(--radius-control) bg-(--color-muted-bg) p-2 text-xs">
              <div className="font-medium">{evidence.keyPoint}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {materials.map((material) => (
                  <label key={material.id} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={evidence.materialIds.includes(material.id)}
                      disabled={evidence.noCitationRequired}
                      onChange={(event) => setEvidence(evidence.keyPoint, material.id, event.target.checked)}
                    />
                    {material.title}
                  </label>
                ))}
                <label className="flex items-center gap-1 text-(--color-muted)">
                  <input
                    type="checkbox"
                    checked={evidence.noCitationRequired}
                    onChange={(event) =>
                      update(
                        "evidence",
                        brief.evidence.map((item) =>
                          item.keyPoint === evidence.keyPoint
                            ? { ...item, noCitationRequired: event.target.checked, materialIds: event.target.checked ? [] : item.materialIds }
                            : item,
                        ),
                      )
                    }
                  />
                  无需引用
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !dirty} onClick={save}>保存 Brief</Button>
        <Button size="sm" variant="secondary" disabled={pending} className={cn(pending && "ai-action-pending")} onClick={generateBriefPreview}>
          <AiButtonContent pending={pending && !draftPreview} label="AI 生成 Brief 预览" pendingLabel="生成中…" />
        </Button>
        <Button size="sm" variant="outline" disabled={pending || !savedBrief.audience} onClick={generateDraftPreview}>
          {hasArticle ? "按大纲预览新初稿版本" : "预览初稿"}
        </Button>
      </div>
      <AiActionFeedback result={feedback} />

      {briefPreview && (
        <div className="ai-result-reveal space-y-2 rounded-(--radius-control) bg-(--color-primary-soft) p-2 text-xs">
          <div className="font-semibold text-(--color-primary)">AI Brief 预览（尚未写入）</div>
          <p>核心主张：{briefPreview.coreClaim}</p>
          <p>创作目标：{briefPreview.objective}</p>
          <p>大纲：{briefPreview.outline.join(" / ")}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setBrief(briefPreview); setBriefPreview(null); }}>应用到表单</Button>
            <Button size="sm" variant="ghost" onClick={() => setBriefPreview(null)}>放弃</Button>
          </div>
        </div>
      )}

      {draftPreview && (
        <div className="ai-result-reveal space-y-2 rounded-(--radius-control) border border-(--color-primary) bg-(--color-primary-soft) p-2">
          <div className="text-xs font-semibold text-(--color-primary)">新初稿预览（尚未写入）</div>
          <div className="prose-muse max-h-72 overflow-auto rounded bg-(--color-surface) p-3 text-xs" dangerouslySetInnerHTML={{ __html: draftPreview.contentHtml }} />
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={confirmDraft}>确认并{hasArticle ? "保存新版本" : "创建文章"}</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDraftPreview(null)}>放弃</Button>
          </div>
        </div>
      )}
    </div>
  );
}
