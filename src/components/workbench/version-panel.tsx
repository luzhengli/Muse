"use client";

import { useMemo, useState, useTransition } from "react";
import { restoreVersion } from "@/actions/articles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { diffLines, diffStats } from "@/lib/diff";
import { fmtTime } from "@/lib/utils";
import type { WorkbenchData } from "./types";

/** HTML 源码按标签边界断行，便于行级 diff */
function htmlLines(html: string): string {
  return html.replace(/></g, ">\n<");
}

export function VersionPanel({ data }: { data: WorkbenchData }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [diffMode, setDiffMode] = useState<"text" | "html">("text");
  const [pending, startTransition] = useTransition();
  const latest = data.versions[0];

  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev.slice(-1), id], // 最多保留两个：新选的挤掉最早选的
    );
  }

  // 对比方向固定为 旧 → 新
  const [a, b] = useMemo(() => {
    if (selected.length !== 2) return [null, null] as const;
    const pick = data.versions.filter((v) => selected.includes(v.id));
    return [...pick].sort((x, y) => x.versionNo - y.versionNo) as [
      (typeof pick)[0],
      (typeof pick)[0],
    ];
  }, [selected, data.versions]);

  const ops = useMemo(() => {
    if (!a || !b) return null;
    return diffMode === "text"
      ? diffLines(a.contentText, b.contentText)
      : diffLines(htmlLines(a.contentHtml), htmlLines(b.contentHtml));
  }, [a, b, diffMode]);
  const stats = ops ? diffStats(ops) : null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-(--color-muted)">
        勾选任意两个版本查看差异；恢复会把历史内容另存为新版本，不覆盖历史。
      </p>

      <div className="space-y-1.5">
        {data.versions.map((v) => (
          <div
            key={v.id}
            className="flex items-start gap-2 rounded-(--radius-control) border border-(--color-border) p-2"
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={selected.includes(v.id)}
              onChange={() => toggle(v.id)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Badge tone={v.id === latest?.id ? "primary" : "default"}>
                  v{v.versionNo}
                </Badge>
                <span className="text-[10px] text-(--color-muted)">
                  {fmtTime(v.createdAt)}
                </span>
              </div>
              {v.note && (
                <div className="mt-0.5 text-[11px] text-(--color-muted)">{v.note}</div>
              )}
            </div>
            {v.id !== latest?.id && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await restoreVersion(data.articleId, v.id);
                  })
                }
              >
                恢复
              </Button>
            )}
          </div>
        ))}
      </div>

      {a && b && ops && stats && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold">
              v{a.versionNo} → v{b.versionNo}
            </span>
            <Badge tone="success">+{stats.added}</Badge>
            <Badge tone="danger">-{stats.removed}</Badge>
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant={diffMode === "text" ? "secondary" : "ghost"}
                onClick={() => setDiffMode("text")}
              >
                纯文本
              </Button>
              <Button
                size="sm"
                variant={diffMode === "html" ? "secondary" : "ghost"}
                onClick={() => setDiffMode("html")}
              >
                HTML
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] text-(--color-muted)">
            <div>
              v{a.versionNo} · {fmtTime(a.createdAt)}
              {a.note && ` · ${a.note}`}
            </div>
            <div>
              v{b.versionNo} · {fmtTime(b.createdAt)}
              {b.note && ` · ${b.note}`}
            </div>
          </div>
          <div className="max-h-96 overflow-auto rounded-(--radius-control) border border-(--color-border) py-1 font-mono text-[11px] leading-relaxed">
            {ops.map((op, i) =>
              op.type === "same" ? (
                <span key={i} className="diff-line text-(--color-muted)">
                  {op.text || " "}
                </span>
              ) : (
                <span
                  key={i}
                  className={`diff-line ${op.type === "add" ? "diff-add" : "diff-del"}`}
                >
                  {op.text || " "}
                </span>
              ),
            )}
          </div>
        </div>
      )}
      {selected.length === 2 && !ops && (
        <p className="text-xs text-(--color-muted)">选中的版本无差异。</p>
      )}
    </div>
  );
}
