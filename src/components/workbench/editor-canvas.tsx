"use client";

import { useRef, useState, useTransition } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { saveVersion, rewriteText } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { htmlToMarkdown, wrapHtmlDocument } from "@/lib/html-md";
import { assetUrl, cn } from "@/lib/utils";
import type { WorkbenchData } from "./types";
import type { AiActionResult } from "@/lib/ai";
import { AiActionFeedback } from "@/components/ai-action";

type PreviewMode = null | "render" | "markdown";

function download(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function EditorCanvas({
  editor,
  data,
  onUploadImages,
}: {
  editor: Editor | null;
  data: WorkbenchData;
  onUploadImages: (files: File[]) => void;
}) {
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  const [rewriting, startRewriting] = useTransition();
  const [rewriteMode, setRewriteMode] = useState<"expand" | "rewrite" | "restructure" | null>(null);
  const rewriteLockRef = useRef(false);
  const [feedback, setFeedback] = useState<AiActionResult<unknown> | null>(null);
  const [preview, setPreview] = useState<PreviewMode>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const coverAsset = data.assets.find((a) => a.id === data.coverAssetId);
  const safeFileName = data.title.replace(/[\\/:*?"<>|]/g, "_") || "muse-article";

  function toolbarButton(label: string, isActive: boolean, onClick: () => void) {
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
          editor.chain().focus().deleteRange({ from, to }).insertContent(result.data).run();
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
      const { versionNo } = await saveVersion(data.articleId, html, note);
      setNote("");
      setFeedback({ ok: true, message: `已保存为 v${versionNo}。`, tone: "success" });
    });
  }

  function handleExport(kind: "md" | "html") {
    if (!editor) return;
    const html = editor.getHTML();
    if (kind === "md") {
      const md = `# ${data.title}\n\n${data.summary ? `> ${data.summary}\n\n` : ""}${htmlToMarkdown(html)}`;
      download(`${safeFileName}.md`, md, "text/markdown;charset=utf-8");
    } else {
      const body = `${data.summary ? `<blockquote>${data.summary}</blockquote>\n` : ""}${html}`;
      download(
        `${safeFileName}.html`,
        wrapHtmlDocument(data.title, body),
        "text/html;charset=utf-8",
      );
    }
    setFeedback({ ok: true, message: `已导出 .${kind}。`, tone: "success" });
  }

  if (!editor) {
    return (
      <div className="py-12 text-center text-sm text-(--color-muted)">
        编辑器加载中…
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-2">
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
        {toolbarButton("插图", false, () => fileInputRef.current?.click())}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onUploadImages(files);
            e.target.value = "";
          }}
        />
        <span className="mx-1 h-4 w-px bg-(--color-border)" />
        <Button
          size="sm"
          variant="secondary"
          disabled={rewriting}
          onClick={() => handleRewrite("expand")}
        >
          {rewriting && rewriteMode === "expand" ? "扩写中…" : "扩写选中"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={rewriting}
          onClick={() => handleRewrite("rewrite")}
        >
          {rewriting && rewriteMode === "rewrite" ? "改写中…" : "改写选中"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={rewriting}
          onClick={() => handleRewrite("restructure")}
        >
          {rewriting && rewriteMode === "restructure" ? "重组中…" : "重组选中"}
        </Button>
        <span className="mx-1 h-4 w-px bg-(--color-border)" />
        {toolbarButton("图文预览", preview === "render", () =>
          setPreview(preview === "render" ? null : "render"),
        )}
        {toolbarButton("Markdown", preview === "markdown", () =>
          setPreview(preview === "markdown" ? null : "markdown"),
        )}
        {toolbarButton("导出 .md", false, () => handleExport("md"))}
        {toolbarButton("导出 .html", false, () => handleExport("html"))}
        <AiActionFeedback result={feedback} className="ml-auto" />
      </div>

      {preview === "render" && (
        <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-6 py-4">
          <div className="mb-3 text-xs text-(--color-muted)">
            图文预览（含包装应用后的封面与摘要）
          </div>
          {coverAsset && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={assetUrl(coverAsset.filePath)}
              alt="封面"
              className="mb-4 max-h-64 w-full rounded-(--radius-control) object-cover"
            />
          )}
          <h1 className="text-2xl font-bold">{data.title}</h1>
          {data.summary && (
            <p className="mt-2 rounded-(--radius-control) bg-(--color-muted-bg) p-3 text-sm text-(--color-muted)">
              {data.summary}
            </p>
          )}
          <div
            className="prose-muse mt-4 text-sm"
            dangerouslySetInnerHTML={{ __html: editor.getHTML() }}
          />
        </div>
      )}

      {preview === "markdown" && (
        <pre className="max-h-[32rem] overflow-auto rounded-(--radius-card) border border-(--color-border) bg-(--color-muted-bg) p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {htmlToMarkdown(editor.getHTML())}
        </pre>
      )}

      <div className={cn(preview && "hidden")}>
        <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-6 py-4">
          <EditorContent editor={editor} className="tiptap" />
        </div>
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
