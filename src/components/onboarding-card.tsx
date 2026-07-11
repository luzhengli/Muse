"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOnboarding } from "@/actions/create";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 首次引导（feat-024）：3 步单选，每步可跳过，答案只作为后续默认值。
 * 示例流程为只读预演，不写任何记录。
 */

const STEPS = [
  {
    key: "contentType" as const,
    question: "你主要想创作什么？",
    options: [
      { value: "graphic", label: "图文笔记", hint: "小红书风格的图文" },
      { value: "short", label: "短内容", hint: "推文、动态、金句" },
      { value: "long", label: "长文章", hint: "公众号、博客长文" },
    ],
  },
  {
    key: "primaryPlatform" as const,
    question: "最常发布到哪个平台？",
    options: [
      { value: "xiaohongshu", label: "小红书", hint: "" },
      { value: "x", label: "X (Twitter)", hint: "" },
      { value: "wechat", label: "微信公众号", hint: "" },
    ],
  },
  {
    key: "startFrom" as const,
    question: "这次想从什么开始？",
    options: [
      { value: "idea", label: "从一个想法开始", hint: "一句话就够" },
      { value: "material", label: "从一份资料开始", hint: "链接、文本或文件" },
    ],
  },
];

const SAMPLE_FLOW = [
  "写下想法：「露营装备怎么选」",
  "系统整理出方向，你确认一个",
  "在写作台完成正文，随时自动保存",
  "一键检查事实与质量",
  "生成适合平台的稿子，复制去发布",
  "回来记下数据，经验留给下一篇",
];

export function OnboardingCard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showSample, setShowSample] = useState(false);
  const [saving, startSaving] = useTransition();

  function finish(finalAnswers: Record<string, string>) {
    startSaving(async () => {
      await saveOnboarding({ ...finalAnswers, completed: true });
      if (finalAnswers.startFrom === "material") router.push("/materials");
      else if (finalAnswers.startFrom === "idea") router.push("/create");
      else router.refresh();
    });
  }

  function pick(value: string) {
    const next = { ...answers, [STEPS[step].key]: value };
    setAnswers(next);
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish(next);
  }

  function skipStep() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish(answers);
  }

  const current = STEPS[step];

  return (
    <Card className="border-(--color-primary)">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">
            欢迎使用 Muse，先回答 {STEPS.length} 个小问题（第 {step + 1} 步）
          </div>
          <button
            type="button"
            className="interactive-motion rounded px-1 text-xs text-(--color-muted) hover:text-(--color-primary)"
            disabled={saving}
            onClick={() => finish(answers)}
          >
            全部跳过
          </button>
        </div>
        <p className="mt-2 text-sm">{current.question}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {current.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => pick(opt.value)}
              className={cn(
                "interactive-motion rounded-(--radius-control) border border-(--color-border) p-3 text-left text-sm hover:border-(--color-primary)",
                answers[current.key] === opt.value &&
                  "border-(--color-primary) bg-(--color-primary-soft)",
              )}
            >
              <div className="font-medium">{opt.label}</div>
              {opt.hint && (
                <div className="mt-0.5 text-xs text-(--color-muted)">{opt.hint}</div>
              )}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <Button size="sm" variant="ghost" disabled={saving} onClick={skipStep}>
            这题跳过
          </Button>
          <button
            type="button"
            className="interactive-motion rounded px-1 text-(--color-primary) hover:underline"
            aria-expanded={showSample}
            onClick={() => setShowSample((v) => !v)}
          >
            {showSample ? "收起示例" : "看看整个流程长什么样"}
          </button>
        </div>
        {showSample && (
          <ol className="mt-3 space-y-1 rounded-(--radius-control) bg-(--color-muted-bg) p-3 text-xs text-(--color-muted)">
            {SAMPLE_FLOW.map((line, i) => (
              <li key={line}>
                {i + 1}. {line}
              </li>
            ))}
            <li className="pt-1 text-[10px]">（示例仅供预览，不会创建任何数据）</li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
