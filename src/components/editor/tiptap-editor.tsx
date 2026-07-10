"use client";

import { useRef, useState, useTransition } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { saveVersion, rewriteText } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AiActionResult } from "@/lib/ai";
import { AiActionFeedback } from "@/components/ai-action";

interface Props {
  articleId: number;
  initialHtml: string;
}

export function TiptapEditor({ articleId, initialHtml }: Props) {
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  const [rewriting, startRewriting] = useTransition();
  const [rewriteMode, setRewriteMode] = useState<"expand" | "rewrite" | "restructure" | null>(null);
  const rewriteLockRef = useRef(false);
  const [feedback, setFeedback] = useState<AiActionResult<unknown> | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialHtml,
    immediatelyRender: false,
  });

  function toolbarButton(
    label: string,
    isActive: boolean,
    onClick: () => void,
  ) {
    return (
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onClick();
        }}
        className={cn(
          "rounded px-2 py-1 text-xs",
          isActive
            ? "bg-(--color-primary-soft) font-semibold text-(--color-primary)"
            : "text-(--color-muted) hover:bg-(--color-muted-bg)",
        )}
      >
        {label}
      </button>
    );
  }

  async function handleRewrite(mode: "expand" | "rewrite" | "restructure") {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setFeedback({ ok: false, message: "请先选中要处理的文字。", tone: "danger" });
      return;
    }
    if (rewriteLockRef.current) return;
    rewriteLockRef.current = true;
    setRewriteMode(mode);
    setFeedback(null);
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    startRewriting(async () => {
      try {
        const result = await rewriteText(selectedText, mode);
        if (result.ok && result.data) {
          editor
            .chain()
            .focus()
            .deleteRange({ from, to })
            .insertContent(result.data)
            .run();
        }
        setFeedback(result);
      } catch {
        setFeedback({ ok: false, message: "AI 请求未完成，请重试。", tone: "danger" });
      } finally {
        rewriteLockRef.current = false;
        setRewriteMode(null);
      }
    });
  }

  function handleSave() {
    if (!editor) return;
    const html = editor.getHTML();
    startSaving(async () => {
      const { versionNo } = await saveVersion(articleId, html, note);
      setNote("");
      setFeedback({ ok: true, message: `已保存为 v${versionNo}。`, tone: "success" });
    });
  }

  if (!editor) {
    return <div className="py-12 text-center text-sm text-(--color-muted)">编辑器加载中…</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) p-1.5">
        {toolbarButton("H2", editor.isActive("heading", { level: 2 }), () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {toolbarButton("H3", editor.isActive("heading", { level: 3 }), () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        )}
        {toolbarButton("加粗", editor.isActive("bold"), () =>
          editor.chain().focus().toggleBold().run(),
        )}
        {toolbarButton("斜体", editor.isActive("italic"), () =>
          editor.chain().focus().toggleItalic().run(),
        )}
        {toolbarButton("列表", editor.isActive("bulletList"), () =>
          editor.chain().focus().toggleBulletList().run(),
        )}
        {toolbarButton("引用块", editor.isActive("blockquote"), () =>
          editor.chain().focus().toggleBlockquote().run(),
        )}
        <span className="mx-1 h-4 w-px bg-(--color-border)" />
        <Button size="sm" variant="secondary" disabled={rewriting} onClick={() => handleRewrite("expand")}>
          {rewriting && rewriteMode === "expand" ? "扩写中…" : "扩写选中"}
        </Button>
        <Button size="sm" variant="secondary" disabled={rewriting} onClick={() => handleRewrite("rewrite")}>
          {rewriting && rewriteMode === "rewrite" ? "改写中…" : "改写选中"}
        </Button>
        <Button size="sm" variant="secondary" disabled={rewriting} onClick={() => handleRewrite("restructure")}>
          {rewriting && rewriteMode === "restructure" ? "重组中…" : "重组选中"}
        </Button>
        <AiActionFeedback result={feedback} className="ml-auto" />
      </div>

      <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-6 py-4">
        <EditorContent editor={editor} className="tiptap" />
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="版本备注（可选），如：润色开头 / 接受审阅建议"
          className="flex-1"
        />
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存为新版本"}
        </Button>
      </div>
    </div>
  );
}
