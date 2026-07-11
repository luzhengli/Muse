"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmCreation,
  previewIdeaTopics,
  previewRetroTopic,
  type TopicCandidate,
} from "@/actions/create";
import { AiActionFeedback } from "@/components/ai-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { AiActionResult } from "@/lib/ai";
import { defaultBriefAnswers, normalizeIdeaTitle, type BriefAnswers } from "@/lib/create";
import { PLATFORM_IDS, platformName } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/**
 * 创建向导（feat-024）：想法 / 资料 / 历史经验三个起点。
 * AI 候选只是预览，放弃不落库；「确认开始」才创建创作。
 * 创作说明是可跳过的普通问题，全部带默认值。
 */

type Entry = "idea" | "material" | "retro";
type Step = "entry" | "candidates" | "questions";

interface RetroNoteItem {
  id: number;
  title: string;
  insights: string;
  convertedTopicId: number | null;
  createdAt: number;
}

export function CreateWizard({
  primaryPlatform,
  startFrom,
  retroNotes,
}: {
  primaryPlatform: string;
  startFrom: string;
  retroNotes: RetroNoteItem[];
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<Entry>(startFrom === "material" ? "material" : "idea");
  const [step, setStep] = useState<Step>("entry");
  const [idea, setIdea] = useState("");
  const [retroId, setRetroId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<TopicCandidate[]>([]);
  const [picked, setPicked] = useState<TopicCandidate | null>(null);
  const [answers, setAnswers] = useState<BriefAnswers | null>(null);
  const [feedback, setFeedback] = useState<AiActionResult<unknown> | null>(null);
  const [previewing, startPreviewing] = useTransition();
  const [confirming, startConfirming] = useTransition();

  function handlePreviewIdea() {
    setFeedback(null);
    startPreviewing(async () => {
      const res = await previewIdeaTopics(idea);
      setFeedback(res);
      if (res.ok && res.data) {
        setCandidates(res.data.candidates);
        setRetroId(null);
        setStep("candidates");
      }
    });
  }

  function handlePreviewRetro(noteId: number) {
    setFeedback(null);
    startPreviewing(async () => {
      const res = await previewRetroTopic(noteId);
      setFeedback(res);
      if (res.ok && res.data) {
        setCandidates(res.data.candidates);
        setRetroId(noteId);
        setStep("candidates");
      }
    });
  }

  function pickCandidate(candidate: TopicCandidate) {
    setPicked(candidate);
    setAnswers(defaultBriefAnswers(candidate, primaryPlatform));
    setStep("questions");
  }

  /** 「直接开始写」：想法直接成为创作，创作说明全部用默认值 */
  function handleStartDirect() {
    const title = normalizeIdeaTitle(idea);
    if (!title) {
      setFeedback({ ok: false, message: "先写下你的想法，一句话就够。", tone: "danger" });
      return;
    }
    const candidate: TopicCandidate = {
      title,
      targetAudience: "",
      corePoints: [],
      angle: "",
      recommendedPlatforms: primaryPlatform ? [primaryPlatform] : [],
      duplicates: [],
      recommended: false,
    };
    doConfirm(candidate, defaultBriefAnswers(candidate, primaryPlatform), "manual", null);
  }

  function doConfirm(
    candidate: TopicCandidate,
    finalAnswers: BriefAnswers,
    origin: "manual" | "ai" | "retro",
    fromRetroId: number | null,
  ) {
    setFeedback(null);
    startConfirming(async () => {
      const res = await confirmCreation({
        candidate,
        answers: finalAnswers,
        origin,
        retroId: fromRetroId ?? undefined,
      });
      setFeedback(res);
      if (res.ok && res.redirectTo) router.push(res.redirectTo);
    });
  }

  const busy = previewing || confirming;

  return (
    <div className="space-y-3">
      {/* 起点选择 */}
      {step === "entry" && (
        <>
          <div className="flex gap-1.5">
            {(
              [
                ["idea", "从想法开始"],
                ["material", "从资料开始"],
                ["retro", "从过往经验开始"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setEntry(key)}
                className={cn(
                  "interactive-motion flex-1 rounded-(--radius-control) border px-3 py-2 text-sm",
                  entry === key
                    ? "border-(--color-primary) bg-(--color-primary-soft) font-medium text-(--color-primary)"
                    : "border-(--color-border) text-(--color-muted) hover:border-(--color-primary)",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {entry === "idea" && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <Label htmlFor="idea-input">你的想法（一句话就够）</Label>
                <Textarea
                  id="idea-input"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="例如：新手怎么选第一顶帐篷"
                  className="min-h-20"
                />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy || !idea.trim()} onClick={handlePreviewIdea}>
                    {previewing ? "整理方向中…" : "让系统帮我整理几个方向"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy || !idea.trim()}
                    onClick={handleStartDirect}
                  >
                    {confirming ? "创建中…" : "直接开始写"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {entry === "material" && (
            <Card>
              <CardContent className="space-y-3 p-5">
                <p className="text-sm">
                  先把链接、文本或文件导入资料库，系统会自动整理成可引用的内容；
                  之后从资料生成创作方向，写作时随时能查「这句话有什么依据」。
                </p>
                <Link href="/materials">
                  <Button>去导入资料 →</Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {entry === "retro" && (
            <Card>
              <CardContent className="space-y-2 p-5">
                {retroNotes.length === 0 && (
                  <p className="text-sm text-(--color-muted)">
                    还没有沉淀的经验。完成一次发布并复盘后，这里会出现可复用的结论。
                  </p>
                )}
                {retroNotes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-(--radius-control) border border-(--color-border) p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm font-medium">{note.title}</span>
                      {note.convertedTopicId && <Badge>已用过一次</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-(--color-muted)">
                      {note.insights}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      disabled={busy}
                      onClick={() => handlePreviewRetro(note.id)}
                    >
                      {previewing ? "生成方向中…" : "基于这条经验生成方向"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* 方向候选：只是预览，放弃不会创建任何数据 */}
      {step === "candidates" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">选一个方向（都不满意可以返回重来）</div>
            <Button size="sm" variant="ghost" onClick={() => setStep("entry")}>
              ← 返回
            </Button>
          </div>
          {candidates.map((candidate, i) => (
            <Card key={`${candidate.title}-${i}`}>
              <CardContent className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 text-sm font-bold">{candidate.title}</span>
                  {candidate.recommended && <Badge tone="primary">推荐</Badge>}
                </div>
                <p className="text-xs text-(--color-muted)">
                  写给：{candidate.targetAudience || "未指定"} · 角度:{candidate.angle || "未指定"}
                </p>
                {candidate.corePoints.length > 0 && (
                  <ul className="list-inside list-disc text-xs text-(--color-muted)">
                    {candidate.corePoints.slice(0, 3).map((point) => (
                      <li key={point} className="line-clamp-1">
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
                {candidate.duplicates.length > 0 && (
                  <p className="rounded bg-(--color-warning-soft) px-2 py-1 text-xs text-(--color-warning)">
                    与已有创作相似：
                    {candidate.duplicates.map((d) => `「${d.title}」`).join("、")}
                    ，确认前可先去选题板看看。
                  </p>
                )}
                <Button size="sm" disabled={busy} onClick={() => pickCandidate(candidate)}>
                  就用这个方向
                </Button>
              </CardContent>
            </Card>
          ))}
          <p className="text-[11px] text-(--color-muted)">
            这些只是预览；返回或离开页面不会创建任何数据。
          </p>
        </div>
      )}

      {/* 创作说明：可跳过的普通问题，全部带默认值 */}
      {step === "questions" && picked && answers && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                几个小问题（都可以跳过，默认值已填好）
              </div>
              <Button size="sm" variant="ghost" onClick={() => setStep("candidates")}>
                ← 返回
              </Button>
            </div>
            <div>
              <Label htmlFor="q-audience">写给谁看？</Label>
              <Input
                id="q-audience"
                value={answers.audience}
                onChange={(e) => setAnswers({ ...answers, audience: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="q-objective">希望读者读完做什么？</Label>
              <Input
                id="q-objective"
                value={answers.objective}
                onChange={(e) => setAnswers({ ...answers, objective: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="q-claim">最想表达的一个观点？</Label>
              <Input
                id="q-claim"
                value={answers.coreClaim}
                onChange={(e) => setAnswers({ ...answers, coreClaim: e.target.value })}
              />
            </div>
            <div>
              <Label>准备发布到哪些平台？</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {PLATFORM_IDS.map((p) => (
                  <label key={p} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={answers.platforms.includes(p)}
                      onChange={(e) =>
                        setAnswers({
                          ...answers,
                          platforms: e.target.checked
                            ? [...answers.platforms, p]
                            : answers.platforms.filter((x) => x !== p),
                        })
                      }
                    />
                    {platformName(p)}
                  </label>
                ))}
              </div>
            </div>
            {answers.keyPointsNeedEvidence.length > 0 && (
              <div>
                <Label>哪些观点需要资料支撑？（不勾 = 个人观点，无需外部引用）</Label>
                <div className="mt-1 space-y-1">
                  {answers.keyPointsNeedEvidence.map((item, i) => (
                    <label key={item.keyPoint} className="flex items-start gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={item.needsEvidence}
                        onChange={(e) => {
                          const next = [...answers.keyPointsNeedEvidence];
                          next[i] = { ...item, needsEvidence: e.target.checked };
                          setAnswers({ ...answers, keyPointsNeedEvidence: next });
                        }}
                      />
                      <span className="min-w-0">{item.keyPoint}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="q-tone">语气</Label>
              <Input
                id="q-tone"
                value={answers.tone}
                onChange={(e) => setAnswers({ ...answers, tone: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                disabled={busy}
                onClick={() =>
                  doConfirm(picked, answers, retroId ? "retro" : "ai", retroId)
                }
              >
                {confirming ? "创建中…" : "开始创作 →"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  doConfirm(
                    picked,
                    defaultBriefAnswers(picked, primaryPlatform),
                    retroId ? "retro" : "ai",
                    retroId,
                  )
                }
              >
                全部用默认值开始
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AiActionFeedback result={feedback} />
    </div>
  );
}
