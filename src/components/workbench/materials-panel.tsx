"use client";

import Link from "next/link";
import type { WorkbenchData } from "./types";
import { platformName } from "@/lib/platforms";

export function MaterialsPanel({ data }: { data: WorkbenchData }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-xs font-semibold">引用素材（{data.citations.length}）</div>
        {data.citations.length === 0 && (
          <p className="text-[11px] text-(--color-muted)">
            暂无引用。从选题生成的初稿会自动关联选题素材。
          </p>
        )}
        {data.citations.map((c) => (
          <Link
            key={c.id}
            href={`/materials/${c.materialId}`}
            className="block rounded-(--radius-control) border border-(--color-border) p-2 text-xs hover:border-(--color-primary)"
          >
            <div className="line-clamp-1 font-medium">{c.title}</div>
            {c.summary && (
              <div className="mt-0.5 line-clamp-2 text-(--color-muted)">{c.summary}</div>
            )}
          </Link>
        ))}
      </div>

      {data.brief && (
        <div className="space-y-1 rounded-(--radius-control) bg-(--color-muted-bg) p-2.5 text-[11px] leading-relaxed text-(--color-muted)">
          <div className="text-xs font-semibold text-(--color-foreground)">创作 Brief</div>
          <div>读者：{data.brief.audience}</div>
          <div>语气：{data.brief.tone}</div>
          <div>平台：{data.brief.platforms.map(platformName).join("、")}</div>
          <div>要点：{data.brief.keyPoints.join("；")}</div>
          {data.brief.outline.length > 0 && (
            <div>
              大纲：
              <ol className="list-decimal pl-4">
                {data.brief.outline.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
