"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Library,
  Lightbulb,
  PenLine,
  Send,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "工作台", icon: Home },
  { href: "/materials", label: "素材库", icon: Library },
  { href: "/topics", label: "选题板", icon: Lightbulb },
  { href: "/articles", label: "写作台", icon: PenLine },
  { href: "/publish", label: "发布中心", icon: Send },
  { href: "/retro", label: "复盘中心", icon: BarChart3 },
];

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface) px-3 py-5">
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--color-primary) text-lg font-bold text-white transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95 motion-reduce:scale-100 motion-reduce:transition-none">
          M
        </span>
        <div>
          <div className="text-sm font-bold leading-none">Muse</div>
          <div className="mt-0.5 text-[10px] text-(--color-muted)">创作工厂</div>
        </div>
      </Link>
      <nav className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex touch-manipulation items-center gap-2.5 rounded-(--radius-control) px-2.5 py-2 text-sm transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] motion-reduce:scale-100 motion-reduce:transition-none",
                active
                  ? "bg-(--color-primary-soft) font-medium text-(--color-primary)"
                  : "text-(--color-muted) hover:bg-(--color-muted-bg) hover:text-(--color-foreground)",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2 text-[10px] leading-relaxed text-(--color-muted)">
        采集 → 整理 → 选题 → 写作
        <br />→ 审阅 → 包装 → 分发 → 复盘
      </div>
    </aside>
  );
}
