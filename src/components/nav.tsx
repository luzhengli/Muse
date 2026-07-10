"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  Library,
  Lightbulb,
  PenLine,
  Send,
  BarChart3,
  Menu,
  X,
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

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--color-primary) text-lg font-bold text-white transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95 motion-reduce:scale-100 motion-reduce:transition-none">
        M
      </span>
      <div>
        <div className="text-sm font-bold leading-none">Muse</div>
        <div className="mt-0.5 text-[10px] text-(--color-muted)">创作工厂</div>
      </div>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
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
  );
}

/** 桌面端固定侧边导航（md 及以上显示）。 */
export function SideNav() {
  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface) px-3 py-5 md:flex">
      <div className="mb-6 px-2">
        <BrandMark />
      </div>
      <NavLinks />
      <div className="mt-auto px-2 text-[10px] leading-relaxed text-(--color-muted)">
        采集 → 整理 → 选题 → 写作
        <br />→ 审阅 → 包装 → 分发 → 复盘
      </div>
    </aside>
  );
}

/** 窄屏顶部导航栏 + 左侧抽屉（md 以下显示）。 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 路由变化后自动收起抽屉
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-4 md:hidden">
      <BrandMark />
      <button
        type="button"
        aria-label={open ? "关闭导航" : "打开导航"}
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        onClick={() => setOpen((v) => !v)}
        className="interactive-motion flex h-9 w-9 items-center justify-center rounded-(--radius-control) text-(--color-muted) hover:bg-(--color-muted-bg) hover:text-(--color-foreground)"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="fixed inset-0 top-14 z-50">
          <button
            type="button"
            aria-label="关闭导航"
            onClick={() => setOpen(false)}
            className="mobile-nav-backdrop absolute inset-0 bg-black/25"
          />
          <div
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="站点导航"
            className="mobile-nav-drawer absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col border-r border-(--color-border) bg-(--color-surface) px-3 py-4"
          >
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto px-2 text-[10px] leading-relaxed text-(--color-muted)">
              采集 → 整理 → 选题 → 写作
              <br />→ 审阅 → 包装 → 分发 → 复盘
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
