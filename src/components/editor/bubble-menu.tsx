"use client";

import { useEffect, useRef, useState } from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Italic,
  Link2,
  Link2Off,
  Sparkles,
  Strikethrough,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RewriteMode } from "@/lib/ai";

function isMathSelected(editor: Editor): "inlineMath" | "blockMath" | null {
  const sel = editor.state.selection;
  if ("node" in sel) {
    const name = (sel as unknown as { node: { type: { name: string } } }).node.type
      .name;
    if (name === "inlineMath" || name === "blockMath") return name;
  }
  return null;
}

function MenuButton({
  label,
  shortcut,
  active,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label}（${shortcut}）` : label}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "interactive-motion flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs",
        active
          ? "bg-(--color-primary-soft) font-semibold text-(--color-primary)"
          : "text-(--color-foreground) hover:bg-(--color-muted-bg)",
      )}
    >
      {children}
    </button>
  );
}

export function EditorBubbleMenu({
  editor,
  aiPending,
  onAiRewrite,
}: {
  editor: Editor;
  aiPending: boolean;
  onAiRewrite: (mode: RewriteMode) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [mathLatex, setMathLatex] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const mathInputRef = useRef<HTMLInputElement>(null);
  const mathType = isMathSelected(editor);

  // Cmd/Ctrl+K：选区非空时链接编辑优先并拦截；否则放行给全局命令面板
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (editor.state.selection.empty) return;
        e.preventDefault();
        e.stopPropagation();
        setHref(String(editor.getAttributes("link").href ?? ""));
        setLinkOpen(true);
      }
    };
    dom.addEventListener("keydown", onKey);
    return () => dom.removeEventListener("keydown", onKey);
  }, [editor]);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  // 选中公式节点时同步 latex 到输入框；仅在首次选中空公式时抢焦点，
  // 更新后焦点保持在编辑器，避免后续输入误进输入框
  const mathPosRef = useRef<number | null>(null);
  useEffect(() => {
    if (!mathType) {
      mathPosRef.current = null;
      return;
    }
    const sel = editor.state.selection as unknown as {
      from: number;
      node: { attrs: { latex?: string } };
    };
    const latex = String(sel.node.attrs.latex ?? "");
    setMathLatex(latex);
    if (mathPosRef.current !== sel.from) {
      mathPosRef.current = sel.from;
      if (!latex) queueMicrotask(() => mathInputRef.current?.focus());
    }
  }, [editor, mathType, editor.state.selection]);

  function applyLink() {
    const url = href.trim();
    if (url) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkOpen(false);
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 120,
        placement: "top",
        maxWidth: "none",
      }}
      shouldShow={({ editor: e, state }) => {
        if (!e.isEditable) return false;
        if (isMathSelected(e)) return true;
        if (state.selection.empty) return false;
        if (e.isActive("codeBlock")) return false;
        return true;
      }}
    >
      <div
        role="toolbar"
        aria-label="选中内容工具"
        className="flex items-center gap-0.5 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) p-1 shadow-md"
      >
        {mathType ? (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-xs text-(--color-muted)">LaTeX</span>
            <input
              ref={mathInputRef}
              value={mathLatex}
              onChange={(e) => setMathLatex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  editor.chain().focus().updateMathLatex(mathLatex).run();
                }
                if (e.key === "Escape") editor.commands.focus();
              }}
              placeholder="如 E = mc^2"
              aria-label="公式 LaTeX 源码"
              className="h-7 w-56 rounded border border-(--color-border) px-2 font-mono text-xs focus:outline-2 focus:outline-(--color-primary)"
            />
            <MenuButton
              label="更新公式"
              onClick={() => editor.chain().focus().updateMathLatex(mathLatex).run()}
            >
              更新
            </MenuButton>
            <MenuButton
              label="删除公式"
              onClick={() => editor.chain().focus().deleteSelection().run()}
            >
              删除
            </MenuButton>
          </div>
        ) : linkOpen ? (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-xs text-(--color-muted)">链接</span>
            <input
              ref={linkInputRef}
              value={href}
              onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
                if (e.key === "Escape") setLinkOpen(false);
              }}
              placeholder="https://…"
              aria-label="链接地址"
              className="h-7 w-56 rounded border border-(--color-border) px-2 text-xs focus:outline-2 focus:outline-(--color-primary)"
            />
            <MenuButton label="应用链接" onClick={applyLink}>
              确定
            </MenuButton>
            {editor.isActive("link") && (
              <MenuButton
                label="移除链接"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                <Link2Off className="h-3.5 w-3.5" />
              </MenuButton>
            )}
          </div>
        ) : (
          <>
            <MenuButton
              label="加粗"
              shortcut="⌘B"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="h-3.5 w-3.5" />
            </MenuButton>
            <MenuButton
              label="斜体"
              shortcut="⌘I"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-3.5 w-3.5" />
            </MenuButton>
            <MenuButton
              label="删除线"
              shortcut="⌘⇧S"
              active={editor.isActive("strike")}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </MenuButton>
            <MenuButton
              label="行内代码"
              shortcut="⌘E"
              active={editor.isActive("code")}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <Code className="h-3.5 w-3.5" />
            </MenuButton>
            <MenuButton
              label="链接"
              shortcut="⌘K"
              active={editor.isActive("link")}
              onClick={() => {
                setHref(String(editor.getAttributes("link").href ?? ""));
                setLinkOpen(true);
              }}
            >
              <Link2 className="h-3.5 w-3.5" />
            </MenuButton>
            <span className="mx-0.5 h-4 w-px bg-(--color-border)" />
            <MenuButton
              label="H2"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              H2
            </MenuButton>
            <MenuButton
              label="H3"
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              H3
            </MenuButton>
            <span className="mx-0.5 h-4 w-px bg-(--color-border)" />
            {(
              [
                ["expand", "扩写"],
                ["rewrite", "改写"],
                ["restructure", "重组"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                disabled={aiPending}
                aria-label={`AI ${label}选中内容`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onAiRewrite(mode);
                }}
                className="interactive-motion flex h-7 items-center gap-1 rounded px-1.5 text-xs text-(--color-primary) hover:bg-(--color-primary-soft) disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {label}
              </button>
            ))}
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
