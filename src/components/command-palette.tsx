"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3,
  CornerDownLeft,
  Library,
  Lightbulb,
  PenLine,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CommandGroup, CommandHit } from "@/lib/command-search";
import { cn } from "@/lib/utils";

export const OPEN_COMMAND_PALETTE_EVENT = "muse:open-command-palette";

/** 从任意可点击入口（侧栏/移动端顶栏）唤起全局命令面板 */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

interface SearchResponse {
  ok: boolean;
  message?: string;
  groups: CommandGroup[];
  continueArticle: CommandHit | null;
  recent: CommandHit[];
}

interface PaletteOption {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  status?: string;
  perform: () => void;
}

interface PaletteSection {
  label: string | null;
  options: PaletteOption[];
}

const hitIcons: Record<CommandHit["type"], PaletteOption["icon"]> = {
  article: PenLine,
  material: Library,
  topic: Lightbulb,
  retro: BarChart3,
};

function optionDomId(key: string) {
  return `muse-cmd-opt-${key}`;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CommandGroup[]>([]);
  const [home, setHome] = useState<{
    continueArticle: CommandHit | null;
    recent: CommandHit[];
  }>({ continueArticle: null, recent: [] });
  const [activeIndex, setActiveIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const openRef = useRef(false);
  /** 唤起前的焦点元素：关闭后精确还原（例如回到正在编辑的正文） */
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const q = query.trim();

  // ⌘K / Ctrl+K 全站唤起（编辑器内非空选区的链接编辑会先行拦截，见 bubble-menu）
  useEffect(() => {
    const openPalette = () => {
      const el = document.activeElement;
      previousFocusRef.current = el instanceof HTMLElement ? el : null;
      setOpen(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        if (openRef.current) setOpen(false);
        else openPalette();
      }
    };
    const onOpenEvent = () => openPalette();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    };
  }, []);

  const fetchResults = useCallback(async (term: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/command-search?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as SearchResponse | null;
      if (!res.ok || !data?.ok) {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(data?.message ?? "搜索暂时不可用，请重试。");
        return;
      }
      if (term) {
        setGroups(data.groups);
      } else {
        setGroups([]);
        setHome({ continueArticle: data.continueArticle, recent: data.recent });
      }
      setLoading(false);
    } catch {
      if (controller.signal.aborted) return;
      setLoading(false);
      setError("搜索暂时不可用，请重试。");
    }
  }, []);

  // 打开时重置查询（面板是覆盖层，不卸载页面，编辑器未保存输入不受影响）
  useEffect(() => {
    if (open) {
      setQuery("");
      setGroups([]);
      setError(null);
    } else {
      abortRef.current?.abort();
    }
  }, [open]);

  // 输入防抖：空查询立即取动作与最近更新，关键词 200ms 防抖
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const timer = setTimeout(() => void fetchResults(term), term ? 200 : 0);
    return () => clearTimeout(timer);
  }, [open, query, fetchResults]);

  const sections = useMemo<PaletteSection[]>(() => {
    const go = (href: string) => {
      setOpen(false);
      router.push(href);
    };
    const hitOption = (hit: CommandHit): PaletteOption => ({
      key: `${hit.type}-${hit.id}`,
      icon: hitIcons[hit.type],
      title: hit.title,
      subtitle: hit.subtitle || undefined,
      status: hit.status,
      perform: () => go(hit.href),
    });

    if (error) {
      return [
        {
          label: error,
          options: [
            {
              key: "retry",
              icon: RotateCcw,
              title: "重试",
              subtitle: q ? `重新搜索「${q}」` : "重新加载",
              perform: () => void fetchResults(q),
            },
          ],
        },
      ];
    }

    const actions: PaletteOption[] = [
      {
        key: "action-create",
        icon: Sparkles,
        title: "开始一次新创作",
        perform: () => go("/create"),
      },
    ];
    if (home.continueArticle) {
      const target = home.continueArticle;
      actions.push({
        key: "action-continue",
        icon: PenLine,
        title: `继续上次创作：${target.title}`,
        status: target.status,
        perform: () => go(target.href),
      });
    }
    actions.push({
      key: "action-settings",
      icon: Settings,
      title: "打开设置",
      perform: () => go("/settings"),
    });

    const visibleActions = q
      ? actions.filter((action) => action.title.includes(q))
      : actions;

    const result: PaletteSection[] = [];
    if (visibleActions.length) {
      result.push({ label: "动作", options: visibleActions });
    }
    if (!q) {
      if (home.recent.length) {
        result.push({ label: "最近更新", options: home.recent.map(hitOption) });
      }
      return result;
    }
    for (const group of groups) {
      result.push({ label: group.label, options: group.items.map(hitOption) });
    }
    if (!loading && groups.length === 0) {
      const options: PaletteOption[] = [];
      if (!visibleActions.some((action) => action.key === "action-create")) {
        options.push({
          key: "empty-create",
          icon: Sparkles,
          title: "去新建一次创作",
          subtitle: "把这个想法变成一篇新内容",
          perform: () => go("/create"),
        });
      }
      result.push({
        label: `没有找到与「${q}」相关的内容，试试换个关键词`,
        options,
      });
    }
    return result;
  }, [error, q, home, groups, loading, router, fetchResults]);

  const flat = useMemo(() => sections.flatMap((section) => section.options), [sections]);
  const active = flat.length ? Math.min(activeIndex, flat.length - 1) : -1;

  useEffect(() => {
    setActiveIndex(0);
  }, [query, groups, error, home]);

  useEffect(() => {
    if (active < 0) return;
    document
      .getElementById(optionDomId(flat[active].key))
      ?.scrollIntoView({ block: "nearest" });
  }, [active, flat]);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "Down") {
      event.preventDefault();
      if (flat.length) setActiveIndex((active + 1) % flat.length);
    } else if (event.key === "ArrowUp" || event.key === "Up") {
      event.preventDefault();
      if (flat.length) setActiveIndex((active - 1 + flat.length) % flat.length);
    } else if (event.key === "Home" && flat.length) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && flat.length) {
      event.preventDefault();
      setActiveIndex(flat.length - 1);
    } else if (event.key === "Enter") {
      // 中文输入法组字确认的 Enter 不触发跳转
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (active >= 0) flat[active].perform();
    }
  };

  let optionIndex = -1;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/25" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            const target = previousFocusRef.current;
            if (target?.isConnected) {
              event.preventDefault();
              target.focus();
            }
          }}
          className="fixed left-1/2 top-[10vh] z-[70] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) shadow-md outline-none"
        >
          <Dialog.Title className="sr-only">全局搜索与命令面板</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-(--color-border) px-3">
            <Search className="h-4 w-4 shrink-0 text-(--color-muted)" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls="muse-cmd-list"
              aria-activedescendant={active >= 0 ? optionDomId(flat[active].key) : undefined}
              aria-autocomplete="list"
              aria-label="搜索文章、素材、选题、复盘经验"
              autoComplete="off"
              spellCheck={false}
              placeholder="搜索文章、素材、选题、复盘经验…"
              className="h-12 w-full min-w-0 flex-1 bg-transparent text-sm text-(--color-foreground) outline-none placeholder:text-(--color-muted)"
            />
            {loading && <span className="shrink-0 text-[10px] text-(--color-muted)">搜索中…</span>}
          </div>
          <div
            id="muse-cmd-list"
            role="listbox"
            aria-label="搜索结果"
            className="max-h-[min(24rem,55vh)] overflow-y-auto p-2"
          >
            {sections.length === 0 && (
              <p className="px-2.5 py-4 text-center text-xs text-(--color-muted)">
                {loading ? "正在加载…" : "输入关键词开始搜索"}
              </p>
            )}
            {sections.map((section, sectionIdx) => (
              <div key={`${section.label ?? "section"}-${sectionIdx}`} className="mb-1 last:mb-0">
                {section.label && (
                  <p className="px-2.5 pb-1 pt-2 text-[10px] text-(--color-muted)">
                    {section.label}
                  </p>
                )}
                {section.options.map((option) => {
                  optionIndex += 1;
                  const index = optionIndex;
                  const IconComp = option.icon;
                  const isActive = index === active;
                  return (
                    <div
                      key={option.key}
                      id={optionDomId(option.key)}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => option.perform()}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-(--radius-control) px-2.5 py-2",
                        isActive && "bg-(--color-primary-soft)",
                      )}
                    >
                      <IconComp
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          isActive ? "text-(--color-primary)" : "text-(--color-muted)",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-(--color-foreground)">
                          {option.title}
                        </div>
                        {option.status && (
                          <div className="truncate text-[11px] text-(--color-primary)">
                            {option.status}
                          </div>
                        )}
                        {option.subtitle && (
                          <div className="truncate text-xs text-(--color-muted)">
                            {option.subtitle}
                          </div>
                        )}
                      </div>
                      {isActive && (
                        <CornerDownLeft className="mt-1 h-3.5 w-3.5 shrink-0 text-(--color-muted)" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-(--color-border) px-3 py-1.5 text-[10px] text-(--color-muted)">
            <span>↑↓ 选择</span>
            <span>Enter 直达</span>
            <span>Esc 关闭</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
