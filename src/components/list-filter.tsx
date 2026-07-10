"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { startRouteProgress } from "@/lib/navigation-motion";
import { cn } from "@/lib/utils";

export interface ListFilterProps {
  basePath: string;
  keywordPlaceholder?: string;
  statusOptions?: { value: string; label: string }[];
  platformOptions?: { value: string; label: string }[];
  tagOptions?: string[];
}

/**
 * 通用列表筛选栏：关键词 / 状态 / 平台 / 标签 / 日期范围 / 列表·时间线视图。
 * 全部状态存放在 URL search params，服务端组件据此过滤。
 */
export function ListFilter({
  basePath,
  keywordPlaceholder = "关键词搜索",
  statusOptions,
  platformOptions,
  tagOptions,
}: ListFilterProps) {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const platform = params.get("platform") ?? "";
  const tag = params.get("tag") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const view = params.get("view") ?? "list";

  const hasFilter = Boolean(q || status || platform || tag || from || to);

  function setParams(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (next.toString() === params.toString()) return;
    startRouteProgress();
    router.push(`${basePath}?${next.toString()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-48 flex-1 gap-2"
          action={(fd) => setParams({ q: String(fd.get("q") ?? "") })}
        >
          <Input
            key={q}
            name="q"
            defaultValue={q}
            placeholder={keywordPlaceholder}
            className="h-8 flex-1 text-xs"
          />
          <Button type="submit" size="sm" variant="outline">
            搜索
          </Button>
        </form>

        {statusOptions && (
          <Select
            value={status}
            onChange={(e) => setParams({ status: e.target.value })}
            className="h-8 text-xs"
          >
            <option value="">全部状态</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )}

        {platformOptions && (
          <Select
            value={platform}
            onChange={(e) => setParams({ platform: e.target.value })}
            className="h-8 text-xs"
          >
            <option value="">全部平台</option>
            {platformOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        )}

        <div className="flex items-center gap-1 text-xs text-(--color-muted)">
          <Input
            type="date"
            value={from}
            onChange={(e) => setParams({ from: e.target.value })}
            className="h-8 w-34 text-xs"
          />
          <span>→</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setParams({ to: e.target.value })}
            className="h-8 w-34 text-xs"
          />
        </div>

        <div className="flex overflow-hidden rounded-(--radius-control) border border-(--color-border)">
          {(
            [
              { id: "list", label: "列表" },
              { id: "timeline", label: "时间线" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setParams({ view: v.id === "list" ? "" : v.id })}
              className={cn(
                "interactive-motion px-2.5 py-1.5 text-xs",
                view === v.id
                  ? "bg-(--color-primary-soft) font-semibold text-(--color-primary)"
                  : "text-(--color-muted) hover:bg-(--color-muted-bg)",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {hasFilter && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              startRouteProgress();
              router.push(basePath);
            }}
          >
            清除
          </Button>
        )}
      </div>

      {tagOptions && tagOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-(--color-muted)">标签：</span>
          {tagOptions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setParams({ tag: t === tag ? "" : t })}
              className="interactive-motion rounded-full"
            >
              <Badge tone={t === tag ? "primary" : "default"}>{t}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
