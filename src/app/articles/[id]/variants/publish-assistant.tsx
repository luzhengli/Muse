"use client";

import { useState } from "react";
import { markManualPublished } from "@/actions/publish";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { assetUrl, cn } from "@/lib/utils";

/**
 * 手动发布助手（feat-026）：复制平台稿 → 去真实平台发布 → 粘贴链接标记已发布。
 * 不做自动发布；标记时服务端再次校验就绪，旧稿一样被拦截。
 */

interface AssistantVariant {
  id: number;
  title: string;
  content: string;
  hashtags: string[];
  cta: string;
  publishNote: string;
  stale: boolean;
}

interface AssistantAsset {
  id: number;
  fileName: string;
  filePath: string;
}

export function PublishAssistant({
  articleId,
  variant,
  assets,
}: {
  articleId: number;
  variant: AssistantVariant;
  assets: AssistantAsset[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(kind: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied((cur) => (cur === kind ? null : cur)), 2000);
    } catch {
      setCopied(null);
      window.prompt("复制失败，请手动复制：", text);
    }
  }

  const fullDraft = [
    variant.title,
    "",
    variant.content,
    variant.hashtags.length ? `\n${variant.hashtags.join(" ")}` : "",
    variant.cta ? `\n${variant.cta}` : "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return (
    <div className="mt-3 rounded-(--radius-control) border border-(--color-border) bg-(--color-muted-bg) p-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="interactive-motion flex w-full items-center justify-between rounded px-1 text-sm font-semibold"
      >
        <span>发布助手（复制 → 手动发布 → 粘贴链接）</span>
        <span className="text-xs text-(--color-muted)">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          {variant.stale && (
            <p className="rounded bg-(--color-warning-soft) px-2 py-1.5 text-xs text-(--color-warning)">
              这份稿子基于旧正文，标记发布会被拦截。请先重新生成平台稿。
            </p>
          )}

          {/* 第 1 步：复制内容 */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-(--color-muted)">
              第 1 步 · 复制内容去平台发布
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => copy("full", fullDraft)}>
                {copied === "full" ? "已复制 ✓" : "一键复制整稿"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => copy("title", variant.title)}>
                {copied === "title" ? "已复制 ✓" : "复制标题"}
              </Button>
              {variant.hashtags.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy("tags", variant.hashtags.join(" "))}
                >
                  {copied === "tags" ? "已复制 ✓" : "复制标签"}
                </Button>
              )}
              {variant.cta && (
                <Button size="sm" variant="ghost" onClick={() => copy("cta", variant.cta)}>
                  {copied === "cta" ? "已复制 ✓" : "复制 CTA"}
                </Button>
              )}
            </div>
            {variant.publishNote && (
              <p className="text-xs text-(--color-muted)">发布说明：{variant.publishNote}</p>
            )}
          </div>

          {/* 第 2 步：素材下载 */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-(--color-muted)">
              第 2 步 · 需要时下载正文与图片
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <a
                href={`/api/articles/${articleId}/export`}
                className="text-(--color-primary) underline"
              >
                下载正文 (.html)
              </a>
              {assets.map((asset) => (
                <a
                  key={asset.id}
                  href={assetUrl(asset.filePath)}
                  download={asset.fileName}
                  className="text-(--color-primary) underline"
                >
                  图片：{asset.fileName.length > 18 ? `${asset.fileName.slice(0, 18)}…` : asset.fileName}
                </a>
              ))}
              {assets.length === 0 && (
                <span className="text-(--color-muted)">（本文暂无本地图片）</span>
              )}
            </div>
          </div>

          {/* 第 3 步：标记已发布 */}
          <form action={markManualPublished} className="space-y-1.5">
            <div className="text-xs font-semibold text-(--color-muted)">
              第 3 步 · 发布完成后回来标记
            </div>
            <input type="hidden" name="variantId" value={variant.id} />
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`url-${variant.id}`}>发布链接（可留空稍后补充）</Label>
                <Input
                  id={`url-${variant.id}`}
                  name="externalUrl"
                  placeholder="https://…"
                  className="h-8"
                />
              </div>
              <Button size="sm" type="submit" className={cn(variant.stale && "opacity-60")}>
                标记已发布
              </Button>
            </div>
            <p className="text-[10px] text-(--color-muted)">
              标记后发布记录会出现在「发布记录」页，首页下一步会变成「记录这次表现」。
            </p>
          </form>
          {variant.stale && <Badge tone="warning">旧稿标记会被服务端拦截</Badge>}
        </div>
      )}
    </div>
  );
}
