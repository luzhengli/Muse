"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmBriefAlignment } from "@/actions/topics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Readiness, ReadinessTarget } from "@/lib/readiness";
import { cn } from "@/lib/utils";

/**
 * NextAction 条（feat-023）：自然语言状态 + 唯一主行动 + 可展开的全部待办。
 * 任何时刻用户都能看到：我在哪一步、为什么不能继续、下一步只需做什么。
 */
export function ReadinessStrip({
  articleId,
  readiness,
  checkpointBadge,
  onNavigate,
}: {
  articleId: number;
  readiness: Readiness;
  /** 检查点/审阅/包装/平台稿的既有状态徽章（保留旧产物过期表达） */
  checkpointBadge: React.ReactNode;
  onNavigate: (target: ReadinessTarget) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [confirming, startConfirming] = useTransition();
  const { nextAction, gaps } = readiness;

  function go(target: ReadinessTarget) {
    if (target === "variants" || target === "publish") {
      router.push(`/articles/${articleId}/variants`);
      return;
    }
    if (target === "retro") {
      router.push("/retro");
      return;
    }
    onNavigate(target);
  }

  return (
    <div className="mb-2 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={readiness.readyToPublish ? "success" : "warning"}>
          {readiness.state}
        </Badge>
        <Button size="sm" onClick={() => go(nextAction.target)}>
          {nextAction.label}
        </Button>
        {nextAction.reason && (
          <span className="text-(--color-warning)">{nextAction.reason}</span>
        )}
        {!nextAction.reason && nextAction.skipRisk && (
          <span className="text-(--color-muted)">
            可跳过（风险：{nextAction.skipRisk}）
          </span>
        )}
        {gaps.length > 0 && (
          <button
            type="button"
            className="interactive-motion ml-auto rounded px-1 text-(--color-primary) hover:underline"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "收起待办" : `全部待办（${gaps.length}）`}
          </button>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-(--color-border) pt-1.5">
        {checkpointBadge}
      </div>

      {expanded && gaps.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-t border-(--color-border) pt-2">
          {gaps.map((gap) => (
            <li key={gap.id} className="flex flex-wrap items-start gap-1.5">
              <Badge tone={gap.blocking ? "danger" : "default"}>
                {gap.blocking ? "阻碍发布" : "建议"}
              </Badge>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{gap.title}</span>
                <span className="ml-1 text-(--color-muted)">{gap.reason}</span>
                {gap.skippable && gap.skipRisk && (
                  <span className="ml-1 text-(--color-muted)">
                    （可跳过，风险：{gap.skipRisk}）
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" onClick={() => go(gap.fix.target)}>
                  {gap.fix.label}
                </Button>
                {gap.id === "brief-unaligned" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={confirming}
                    className={cn(confirming && "opacity-70")}
                    onClick={() =>
                      startConfirming(() => confirmBriefAlignment(articleId))
                    }
                  >
                    {confirming ? "确认中…" : "确认正文已对齐"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
