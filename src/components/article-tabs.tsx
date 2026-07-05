"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ArticleTabs({ articleId }: { articleId: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/articles/${articleId}`, label: "✍️ 写作" },
    { href: `/articles/${articleId}/review`, label: "🔍 审阅" },
    { href: `/articles/${articleId}/packaging`, label: "🎁 包装" },
    { href: `/articles/${articleId}/variants`, label: "📱 平台版本" },
  ];
  return (
    <div className="flex gap-1 border-b border-(--color-border)">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-(--color-primary) text-(--color-primary)"
                : "border-transparent text-(--color-muted) hover:text-(--color-foreground)",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
