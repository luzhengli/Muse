import type { ReactNode } from "react";

/** 时间线容器：左侧竖线 + 日期节点，组内放卡片 */
export function Timeline({
  groups,
}: {
  groups: { label: string; children: ReactNode }[];
}) {
  return (
    <div className="relative space-y-6 pl-5 before:absolute before:top-1 before:bottom-1 before:left-1.25 before:w-px before:bg-(--color-border)">
      {groups.map((g) => (
        <div key={g.label} className="relative">
          <span className="absolute top-1 -left-5 h-2.5 w-2.5 rounded-full border-2 border-(--color-primary) bg-(--color-surface)" />
          <div className="mb-2 text-xs font-semibold text-(--color-muted)">{g.label}</div>
          <div className="space-y-2">{g.children}</div>
        </div>
      ))}
      {groups.length === 0 && (
        <p className="py-8 text-center text-sm text-(--color-muted)">没有匹配的记录。</p>
      )}
    </div>
  );
}
