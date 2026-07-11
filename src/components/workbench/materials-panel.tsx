"use client";

import Link from "next/link";
import type { WorkbenchData } from "./types";
import { BriefEditor } from "@/components/brief-editor";

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

      {data.topicId && data.brief && (
        <BriefEditor
          topicId={data.topicId}
          initialBrief={data.brief}
          materials={data.citations.map((citation) => ({
            id: citation.materialId,
            title: citation.title,
          }))}
          hasArticle
          compact
        />
      )}
    </div>
  );
}
