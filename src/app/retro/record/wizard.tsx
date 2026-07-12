"use client";

import { useState, useTransition } from "react";
import { saveRetroWizard } from "@/actions/retro";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { buildRetroSummary, type RetroAnswers, type RetroContext } from "@/lib/retro";
import { platformName } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/**
 * 复盘向导（feat-026）：表现数据 → 读者关注 → 假设验证 → 下一次怎么做
 * → 可编辑摘要确认。所有输入保留在客户端 state，保存失败不丢。
 */

const STEPS = ["表现数据", "读者关注", "假设验证", "下一次", "确认摘要"] as const;

const EMPTY_ANSWERS: RetroAnswers = {
  metrics: { views: 0, likes: 0, comments: 0, shares: 0 },
  audienceFocus: "",
  supportedHypothesis: "",
  unsupportedHypothesis: "",
  keep: "",
  adjust: "",
  stop: "",
};

export function RetroWizard({ context }: { context: RetroContext }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<RetroAnswers>(EMPTY_ANSWERS);
  const [summary, setSummary] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function next() {
    if (step === STEPS.length - 2) {
      // 进入确认步时生成可编辑摘要（用户已有编辑则不覆盖）
      setSummary((cur) =>
        cur.trim()
          ? cur
          : buildRetroSummary(
              { articleTitle: context.articleTitle, platform: context.platform },
              answers,
            ),
      );
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function save() {
    setError(null);
    startSaving(async () => {
      try {
        const res = await saveRetroWizard({
          taskId: context.taskId,
          variantId: context.variantId,
          platform: context.platform,
          externalUrl: context.externalUrl,
          answers,
          summary,
          title,
          nextTopicHint: answers.adjust,
        });
        if (res && !res.ok) setError(res.message);
      } catch (e) {
        // redirect() 抛出的跳转异常直接放行
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError("保存失败，你的输入都还在，请重试。");
      }
    });
  }

  const metricField = (key: keyof RetroAnswers["metrics"], label: string) => (
    <div>
      <Label htmlFor={`m-${key}`}>{label}</Label>
      <Input
        id={`m-${key}`}
        type="number"
        min={0}
        value={answers.metrics[key]}
        onChange={(e) =>
          setAnswers({
            ...answers,
            metrics: { ...answers.metrics, [key]: Math.max(0, Number(e.target.value) || 0) },
          })
        }
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {/* 自动带入的上下文，用户不需要选任何内部 ID */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs">
        <Badge tone="primary">{platformName(context.platform)}</Badge>
        <span className="font-medium">{context.articleTitle}</span>
        <span className="text-(--color-muted)">稿：{context.variantTitle}</span>
        {context.externalUrl && (
          <a
            href={context.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-(--color-primary) underline"
          >
            查看发布链接
          </a>
        )}
      </div>

      {/* 步骤指示 */}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {STEPS.map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded px-2 py-1",
                i === step
                  ? "bg-(--color-primary) font-semibold text-white"
                  : i < step
                    ? "text-(--color-foreground)"
                    : "text-(--color-muted)",
              )}
            >
              {i < step ? "✓ " : ""}
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="text-(--color-border)">→</span>}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          {step === 0 && (
            <>
              <p className="text-sm">这次发布的表现数据（没有的填 0，之后可再补）：</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {metricField("views", "浏览")}
                {metricField("likes", "点赞")}
                {metricField("comments", "评论")}
                {metricField("shares", "转发")}
              </div>
            </>
          )}
          {step === 1 && (
            <div>
              <Label htmlFor="q-audience">读者在评论或私信里最关注什么？</Label>
              <Textarea
                id="q-audience"
                value={answers.audienceFocus}
                onChange={(e) => setAnswers({ ...answers, audienceFocus: e.target.value })}
                placeholder="例如：反复有人问具体工具清单"
                className="min-h-20"
              />
            </div>
          )}
          {step === 2 && (
            <>
              <div>
                <Label htmlFor="q-supported">这次表现暂时支持了哪个假设？</Label>
                <Textarea
                  id="q-supported"
                  value={answers.supportedHypothesis}
                  onChange={(e) =>
                    setAnswers({ ...answers, supportedHypothesis: e.target.value })
                  }
                  placeholder="例如：工具向内容比观点向内容收藏率高"
                  className="min-h-16"
                />
              </div>
              <div>
                <Label htmlFor="q-unsupported">哪个假设没有得到支持？</Label>
                <Textarea
                  id="q-unsupported"
                  value={answers.unsupportedHypothesis}
                  onChange={(e) =>
                    setAnswers({ ...answers, unsupportedHypothesis: e.target.value })
                  }
                  placeholder="例如：以为长标题会降低点开率，实际没有明显差异"
                  className="min-h-16"
                />
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div>
                <Label htmlFor="q-keep">下一次继续保持什么？</Label>
                <Textarea
                  id="q-keep"
                  value={answers.keep}
                  onChange={(e) => setAnswers({ ...answers, keep: e.target.value })}
                  className="min-h-14"
                />
              </div>
              <div>
                <Label htmlFor="q-adjust">下一次调整什么？（会作为新创作的方向提示）</Label>
                <Textarea
                  id="q-adjust"
                  value={answers.adjust}
                  onChange={(e) => setAnswers({ ...answers, adjust: e.target.value })}
                  className="min-h-14"
                />
              </div>
              <div>
                <Label htmlFor="q-stop">下一次停止做什么？</Label>
                <Textarea
                  id="q-stop"
                  value={answers.stop}
                  onChange={(e) => setAnswers({ ...answers, stop: e.target.value })}
                  className="min-h-14"
                />
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <div>
                <Label htmlFor="q-title">经验标题（可选）</Label>
                <Input
                  id="q-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="留空自动生成"
                />
              </div>
              <div>
                <Label htmlFor="q-summary">复盘摘要（可直接编辑，保存后成为可复用的经验）</Label>
                <Textarea
                  id="q-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="min-h-44 font-mono text-xs leading-relaxed"
                />
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="rounded bg-(--color-danger-soft) px-2 py-1.5 text-xs text-(--color-danger)">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {step > 0 && (
              <Button variant="ghost" disabled={saving} onClick={() => setStep(step - 1)}>
                ← 上一步
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>下一步 →</Button>
            ) : (
              <Button disabled={saving || !summary.trim()} onClick={save}>
                {saving ? "保存中…" : "保存经验"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
