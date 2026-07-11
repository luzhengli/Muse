"use client";

import Link from "next/link";
import { JOURNEY_STEPS, type JourneyStep } from "@/lib/readiness";
import { cn } from "@/lib/utils";

/**
 * 创作旅程步骤条（feat-025）：方向 → 写作 → 检查 → 发布准备 → 已发布 → 复盘。
 * 当前步由事实推导；点击任一步直达对应位置，回到早前步骤修改时
 * 写作台的 NextAction 条会即时标明哪些后续产物需要更新。
 */
export function JourneySteps({
  articleId,
  current,
}: {
  articleId: number;
  current: JourneyStep;
}) {
  const currentIndex = JOURNEY_STEPS.findIndex((s) => s.id === current);
  const hrefFor = (id: JourneyStep) => {
    switch (id) {
      case "direction":
        return `/articles/${articleId}?panel=materials`;
      case "writing":
        return `/articles/${articleId}`;
      case "checking":
        return `/articles/${articleId}?panel=review`;
      case "preparing":
        return `/articles/${articleId}/variants`;
      case "published":
        return "/publish";
      case "retro":
        return "/retro";
    }
  };

  return (
    <nav
      aria-label="创作步骤"
      className="flex flex-wrap items-center gap-1 overflow-x-auto rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) px-2 py-1.5 text-xs"
    >
      {JOURNEY_STEPS.map((step, i) => (
        <span key={step.id} className="flex items-center gap-1">
          <Link
            href={hrefFor(step.id)}
            aria-current={step.id === current ? "step" : undefined}
            className={cn(
              "interactive-motion rounded px-2 py-1",
              step.id === current
                ? "bg-(--color-primary) font-semibold text-white"
                : i < currentIndex
                  ? "text-(--color-foreground) hover:bg-(--color-muted-bg)"
                  : "text-(--color-muted) hover:bg-(--color-muted-bg)",
            )}
          >
            {i < currentIndex ? "✓ " : ""}
            {step.label}
          </Link>
          {i < JOURNEY_STEPS.length - 1 && (
            <span aria-hidden className="text-(--color-border)">
              →
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
