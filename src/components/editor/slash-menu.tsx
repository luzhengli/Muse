"use client";

import { useEffect, useRef, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Sigma,
  SquareSigma,
  Table as TableIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SlashItem {
  title: string;
  description: string;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
  run: (editor: Editor, range: Range) => void;
}

export function buildSlashItems(onPickImage: () => void): SlashItem[] {
  return [
    {
      title: "标题 1",
      description: "大节标题",
      keywords: ["h1", "heading", "biaoti"],
      icon: Heading1,
      run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 1 }).run(),
    },
    {
      title: "标题 2",
      description: "小节标题",
      keywords: ["h2", "heading", "biaoti"],
      icon: Heading2,
      run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 2 }).run(),
    },
    {
      title: "标题 3",
      description: "子小节标题",
      keywords: ["h3", "heading", "biaoti"],
      icon: Heading3,
      run: (e, r) => e.chain().focus().deleteRange(r).setNode("heading", { level: 3 }).run(),
    },
    {
      title: "无序列表",
      description: "圆点列表",
      keywords: ["ul", "bullet", "list", "liebiao"],
      icon: List,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
    },
    {
      title: "有序列表",
      description: "数字编号列表",
      keywords: ["ol", "ordered", "list", "liebiao"],
      icon: ListOrdered,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
    },
    {
      title: "任务列表",
      description: "可勾选的待办列表",
      keywords: ["todo", "task", "checkbox", "renwu"],
      icon: ListTodo,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
    },
    {
      title: "引用",
      description: "引用块",
      keywords: ["quote", "blockquote", "yinyong"],
      icon: Quote,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
    },
    {
      title: "代码块",
      description: "带语言高亮的代码",
      keywords: ["code", "pre", "daima"],
      icon: Code,
      run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
    },
    {
      title: "行内公式",
      description: "插入 $..$ 行内 LaTeX",
      keywords: ["math", "latex", "inline", "gongshi"],
      icon: Sigma,
      run: (e, r) => e.chain().focus().deleteRange(r).insertInlineMath("").run(),
    },
    {
      title: "块级公式",
      description: "插入 $$..$$ 独立公式",
      keywords: ["math", "latex", "block", "gongshi"],
      icon: SquareSigma,
      run: (e, r) => e.chain().focus().deleteRange(r).insertBlockMath("").run(),
    },
    {
      title: "表格",
      description: "3 列表格（含表头）",
      keywords: ["table", "biaoge"],
      icon: TableIcon,
      run: (e, r) =>
        e
          .chain()
          .focus()
          .deleteRange(r)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      title: "图片",
      description: "上传本地图片",
      keywords: ["image", "img", "picture", "tupian"],
      icon: ImageIcon,
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        onPickImage();
      },
    },
    {
      title: "分隔线",
      description: "水平分割",
      keywords: ["hr", "divider", "fengexian"],
      icon: Minus,
      run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
    },
  ];
}

export interface SlashState {
  items: SlashItem[];
  clientRect: (() => DOMRect | null) | null;
  command: (item: SlashItem) => void;
}

/** 扩展与 React 浮层之间的桥：扩展写状态，组件订阅并接管键盘 */
export class SlashMenuBus {
  private listener: ((state: SlashState | null) => void) | null = null;
  keyHandler: ((event: KeyboardEvent) => boolean) | null = null;

  subscribe(fn: (state: SlashState | null) => void) {
    this.listener = fn;
    return () => {
      if (this.listener === fn) this.listener = null;
    };
  }

  emit(state: SlashState | null) {
    this.listener?.(state);
  }
}

export function createSlashExtension(bus: SlashMenuBus, items: SlashItem[]) {
  return Extension.create({
    name: "slashMenu",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          // 中文行文没有空格，允许任意前缀触发（默认仅空格前缀）
          allowedPrefixes: null,
          items: ({ query }) => {
            const q = query.toLowerCase();
            return items.filter(
              (item) =>
                item.title.toLowerCase().includes(q) ||
                item.keywords.some((k) => k.includes(q)),
            );
          },
          command: ({ editor, range, props }) => {
            props.run(editor as Editor, range);
          },
          render: () => ({
            onStart: (props) => {
              bus.emit({
                items: props.items,
                clientRect: props.clientRect ?? null,
                command: props.command,
              });
            },
            onUpdate: (props) => {
              bus.emit({
                items: props.items,
                clientRect: props.clientRect ?? null,
                command: props.command,
              });
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                bus.emit(null);
                return true;
              }
              return bus.keyHandler?.(props.event) ?? false;
            },
            onExit: () => bus.emit(null),
          }),
        }),
      ];
    },
  });
}

/** `/` 菜单浮层：紧贴触发位置，↑↓ 选择、Enter 确认、Esc 关闭 */
export function SlashMenu({ bus }: { bus: SlashMenuBus }) {
  const [state, setState] = useState<SlashState | null>(null);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      bus.subscribe((s) => {
        setState(s);
        setIndex(0);
      }),
    [bus],
  );

  useEffect(() => {
    if (!state) {
      bus.keyHandler = null;
      return;
    }
    bus.keyHandler = (event) => {
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(state.items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex(
          (i) => (i - 1 + Math.max(state.items.length, 1)) % Math.max(state.items.length, 1),
        );
        return true;
      }
      if (event.key === "Enter") {
        const item = state.items[index];
        if (item) state.command(item);
        return true;
      }
      return false;
    };
    return () => {
      bus.keyHandler = null;
    };
  }, [bus, state, index]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!state || !state.items.length) return null;
  const rect = state.clientRect?.();
  if (!rect) return null;

  const menuMaxH = 280;
  const below = rect.bottom + menuMaxH < window.innerHeight;
  const top = below ? rect.bottom + 4 : Math.max(8, rect.top - menuMaxH - 4);

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="插入块"
      className="slash-menu panel-transition fixed z-50 w-64 overflow-y-auto rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) p-1 shadow-lg"
      style={{ top, left: Math.min(rect.left, window.innerWidth - 272), maxHeight: menuMaxH }}
    >
      {state.items.map((item, i) => {
        const Icon = item.icon;
        return (
          <button
            key={item.title}
            type="button"
            role="option"
            aria-selected={i === index}
            data-index={i}
            onMouseEnter={() => setIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              state.command(item);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-(--radius-control) px-2.5 py-2 text-left text-sm",
              i === index ? "bg-(--color-primary-soft) text-(--color-primary)" : "",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block font-medium">{item.title}</span>
              <span className="block truncate text-xs text-(--color-muted)">
                {item.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
