"use client";

import { useRef, useState, useTransition } from "react";
import type { Editor } from "@tiptap/react";
import {
  runAiReview,
  addHumanFinding,
  setFindingStatus,
  polishFinding,
} from "@/actions/review";
import { saveVersion } from "@/actions/articles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { reviewCategoryLabel, severityLabel } from "@/lib/labels";
import { PLATFORM_IDS, platformName } from "@/lib/platforms";
import { fmtTime } from "@/lib/utils";
import type { WorkbenchData, WbFinding } from "./types";
import type { AiActionResult } from "@/lib/ai";
import { AiActionFeedback } from "@/components/ai-action";

interface Polish {
  findingId: number;
  mode: "fragment" | "document";
  original: string;
  revised: string;
}

export function ReviewPanel({
  editor,
  data,
}: {
  editor: Editor | null;
  data: WorkbenchData;
}) {
  const [platform, setPlatform] = useState("");
  const [running, startRunning] = useTransition();
  const [polishing, startPolishing] = useTransition();
  const [applying, startApplying] = useTransition();
  const [polishingId, setPolishingId] = useState<number | null>(null);
  const runningRef = useRef(false);
  const polishingRef = useRef(false);
  const [polish, setPolish] = useState<Polish | null>(null);
  const [feedback, setFeedback] = useState<AiActionResult<unknown> | null>(null);
  const [showHumanForm, setShowHumanForm] = useState(false);

  function handlePolish(finding: WbFinding) {
    if (polishingRef.current) return;
    polishingRef.current = true;
    setPolishingId(finding.id);
    setFeedback(null);
    startPolishing(async () => {
      try {
        const res = await polishFinding(data.articleId, finding.id);
        setFeedback(res);
        if (res.ok && res.data) {
          setPolish({ findingId: finding.id, ...res.data });
        }
      } catch {
        setFeedback({ ok: false, message: "润色请求未完成，请重试。", tone: "danger" });
      } finally {
        polishingRef.current = false;
        setPolishingId(null);
      }
    });
  }

  function handleReview() {
    if (runningRef.current) return;
    runningRef.current = true;
    setFeedback(null);
    startRunning(async () => {
      try {
        const result = await runAiReview(data.articleId, platform || undefined);
        setFeedback(result);
      } catch {
        setFeedback({ ok: false, message: "审阅请求未完成，请重试。", tone: "danger" });
      } finally {
        runningRef.current = false;
      }
    });
  }

  function acceptPolish(finding: WbFinding) {
    if (!editor || !polish) return;
    startApplying(async () => {
      let next: string;
      if (polish.mode === "fragment") {
        const html = editor.getHTML();
        if (!html.includes(polish.original)) {
          setFeedback({
            ok: false,
            message: "原文片段已变化，请手动处理或重新润色。",
            tone: "danger",
          });
          return;
        }
        next = html.replace(polish.original, polish.revised);
      } else {
        next = polish.revised;
      }
      editor.commands.setContent(next);
      await saveVersion(
        data.articleId,
        next,
        `AI 润色：${reviewCategoryLabel[finding.category] ?? finding.category}`,
      );
      await setFindingStatus(finding.id, data.articleId, "accepted");
      setPolish(null);
      setFeedback({
        ok: true,
        message: "已写入编辑器并保存新版本。",
        tone: "success",
      });
    });
  }

  const busy = running || polishing || applying;

  return (
    <div className="space-y-3">
      {/* 执行 AI 审阅 */}
      <div className="space-y-2 rounded-(--radius-control) border border-(--color-border) p-2.5">
        <div className="text-xs font-semibold">
          AI 审阅（最新版本 v{data.versions[0]?.versionNo ?? "-"}）
        </div>
        <div className="flex gap-1.5">
          <Select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="h-8 flex-1 text-xs"
          >
            <option value="">通用审阅</option>
            {PLATFORM_IDS.map((p) => (
              <option key={p} value={p}>
                面向{platformName(p)}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={busy || !data.versions.length}
            onClick={handleReview}
          >
            {running ? "审阅中…" : "执行"}
          </Button>
        </div>
        <button
          type="button"
          className="text-xs text-(--color-primary) hover:underline"
          onClick={() => setShowHumanForm((v) => !v)}
        >
          {showHumanForm ? "收起人工意见表单" : "+ 添加人工审阅意见"}
        </button>
        {showHumanForm && (
          <form
            action={async (fd) => {
              await addHumanFinding(fd);
              setShowHumanForm(false);
            }}
            className="space-y-1.5"
          >
            <input type="hidden" name="articleId" value={data.articleId} />
            <div className="flex gap-1.5">
              <Select name="category" className="h-8 flex-1 text-xs">
                {Object.entries(reviewCategoryLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Select name="severity" className="h-8 w-20 text-xs">
                <option value="info">建议</option>
                <option value="warn">注意</option>
                <option value="critical">严重</option>
              </Select>
            </div>
            <Input name="quote" placeholder="相关原文片段（可选）" className="h-8 text-xs" />
            <div className="flex gap-1.5">
              <Textarea
                name="suggestion"
                required
                placeholder="意见与修改建议"
                className="min-h-8 flex-1 text-xs"
              />
              <Button size="sm">添加</Button>
            </div>
          </form>
        )}
      </div>

      <AiActionFeedback result={feedback} />

      {/* 审阅记录 */}
      {data.reviews.length === 0 && (
        <p className="py-6 text-center text-xs text-(--color-muted)">
          还没有审阅记录。执行 AI 审阅，或添加人工意见。
        </p>
      )}
      {data.reviews.map((r) => (
        <div key={r.id} className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-(--color-muted)">
            <span className="font-semibold text-(--color-foreground)">
              {r.type === "ai" ? "🤖 AI 审阅" : "👤 人工审阅"}
            </span>
            {fmtTime(r.createdAt)}
          </div>
          {r.summary && (
            <p className="text-xs leading-relaxed text-(--color-muted)">{r.summary}</p>
          )}
          {r.findings.map((f) => {
            const sev = severityLabel[f.severity];
            const isPolished = polish?.findingId === f.id;
            return (
              <div
                key={f.id}
                className={`rounded-(--radius-control) border p-2 ${
                  f.status === "ignored"
                    ? "border-(--color-border) opacity-50"
                    : f.status === "accepted"
                      ? "border-(--color-success)"
                      : "border-(--color-border)"
                }`}
              >
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone="primary">{reviewCategoryLabel[f.category]}</Badge>
                  <Badge tone={sev?.tone ?? "default"}>{sev?.text ?? f.severity}</Badge>
                  {f.status === "accepted" && <Badge tone="success">已处理</Badge>}
                  {f.status === "ignored" && <Badge>已忽略</Badge>}
                </div>
                {f.quote && (
                  <blockquote className="mt-1.5 border-l-2 border-(--color-border) pl-2 text-xs text-(--color-muted)">
                    {f.quote}
                  </blockquote>
                )}
                <p className="mt-1 text-xs leading-relaxed">{f.suggestion}</p>

                {f.status === "open" && !isPolished && (
                  <div className="mt-1.5 flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => handlePolish(f)}
                    >
                      {polishing && polishingId === f.id ? "润色中…" : "AI 润色"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        startApplying(() =>
                          setFindingStatus(f.id, data.articleId, "accepted"),
                        )
                      }
                    >
                      人工已处理
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        startApplying(() =>
                          setFindingStatus(f.id, data.articleId, "ignored"),
                        )
                      }
                    >
                      忽略
                    </Button>
                  </div>
                )}

                {/* AI 润色预览 */}
                {isPolished && polish && (
                  <div className="mt-2 space-y-1.5 rounded-(--radius-control) bg-(--color-muted-bg) p-2">
                    <div className="text-[10px] font-semibold text-(--color-muted)">
                      润色预览（{polish.mode === "fragment" ? "片段替换" : "全文改写"}）
                    </div>
                    {polish.mode === "fragment" && (
                      <p className="text-xs text-(--color-danger) line-through">
                        {polish.original}
                      </p>
                    )}
                    <p className="max-h-40 overflow-auto text-xs leading-relaxed text-(--color-success)">
                      {polish.mode === "document"
                        ? polish.revised.replace(/<[^>]+>/g, " ").slice(0, 600) + "…"
                        : polish.revised}
                    </p>
                    <div className="flex gap-1">
                      <Button size="sm" disabled={applying} onClick={() => acceptPolish(f)}>
                        {applying ? "写入中…" : "接受并保存新版本"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={applying}
                        onClick={() => setPolish(null)}
                      >
                        放弃
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
