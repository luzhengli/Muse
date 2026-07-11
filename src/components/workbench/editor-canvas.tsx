"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Maximize2,
  Minimize2,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { saveVersion, rewriteText } from "@/actions/articles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { wrapHtmlDocument } from "@/lib/html-md";
import { docToMarkdown, markdownToDoc, type DocNode } from "@/lib/markdown";
import { assetUrl, cn } from "@/lib/utils";
import type { WorkbenchData } from "./types";
import type { AiActionResult, RewriteMode } from "@/lib/ai";
import { AiActionFeedback, AiButtonContent } from "@/components/ai-action";
import { EditorBubbleMenu } from "@/components/editor/bubble-menu";
import { SlashMenu, type SlashMenuBus } from "@/components/editor/slash-menu";
import { renderMathInElement } from "@/components/editor/math";
import { trackRange } from "@/components/editor/track-range";
import type { SaveState } from "@/components/editor/use-autosave";

type PreviewMode = null | "render" | "markdown";

const REWRITE_LABEL: Record<RewriteMode, string> = {
  expand: "扩写",
  rewrite: "改写",
  restructure: "重组",
};

type AiPhase =
  | { phase: "idle" }
  | { phase: "pending"; mode: RewriteMode; original: string }
  | {
      phase: "preview";
      mode: RewriteMode;
      original: string;
      result: string;
      feedback: AiActionResult<string>;
    };

function download(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const SAVE_STATE_LABEL: Record<SaveState, string> = {
  idle: "无更改",
  dirty: "有未保存更改…",
  saving: "自动保存中…",
  saved: "已自动保存",
  error: "自动保存失败，稍后重试",
};

export function EditorCanvas({
  editor,
  data,
  onUploadImages,
  saveState,
  onSavedVersion,
  focused,
  onToggleFocus,
  slashBus,
  pickImageRef,
  onRetrySave,
}: {
  editor: Editor | null;
  data: WorkbenchData;
  onUploadImages: (files: File[]) => void;
  saveState: SaveState;
  onSavedVersion: (html: string) => void;
  focused: boolean;
  onToggleFocus: () => void;
  slashBus: SlashMenuBus;
  pickImageRef: React.MutableRefObject<() => void>;
  onRetrySave: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  const [feedback, setFeedback] = useState<AiActionResult<unknown> | null>(null);
  const [preview, setPreview] = useState<PreviewMode>(null);
  const [ai, setAi] = useState<AiPhase>({ phase: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdInputRef = useRef<HTMLInputElement>(null);
  const renderPreviewRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<ReturnType<typeof trackRange> | null>(null);
  const aiRequestIdRef = useRef(0);

  pickImageRef.current = () => fileInputRef.current?.click();

  const coverAsset = data.assets.find((a) => a.id === data.coverAssetId);
  const safeFileName = data.title.replace(/[\\/:*?"<>|]/g, "_") || "muse-article";

  // 图文预览中的公式用 KaTeX 渲染
  useEffect(() => {
    if (preview === "render" && renderPreviewRef.current) {
      renderMathInElement(renderPreviewRef.current);
    }
  }, [preview]);

  useEffect(() => {
    return () => trackerRef.current?.dispose();
  }, []);

  function disposeTracker() {
    trackerRef.current?.dispose();
    trackerRef.current = null;
  }

  function handleAiRewrite(mode: RewriteMode) {
    if (!editor || ai.phase === "pending") return;
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setFeedback({ ok: false, message: "请先选中要处理的文字。", tone: "danger" });
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    disposeTracker();
    trackerRef.current = trackRange(editor, from, to);
    const requestId = ++aiRequestIdRef.current;
    setFeedback(null);
    setAi({ phase: "pending", mode, original: selectedText });
    void (async () => {
      let result: AiActionResult<string>;
      try {
        result = await rewriteText(selectedText, mode);
      } catch {
        result = { ok: false, message: "AI 请求未完成，请重试。", tone: "danger" };
      }
      if (aiRequestIdRef.current !== requestId) return; // 已取消或有新请求
      if (result.ok && result.data) {
        setAi({
          phase: "preview",
          mode,
          original: selectedText,
          result: result.data,
          feedback: result,
        });
      } else {
        disposeTracker();
        setAi({ phase: "idle" });
        setFeedback(result);
      }
    })();
  }

  function acceptAiResult() {
    if (!editor || ai.phase !== "preview") return;
    const tracker = trackerRef.current;
    if (!tracker || !tracker.range.valid) {
      disposeTracker();
      setAi({ phase: "idle" });
      setFeedback({
        ok: false,
        message: "原选区已被后续编辑删除，AI 结果未写回，正文保持不变。",
        tone: "danger",
      });
      return;
    }
    const { from, to } = tracker.range;
    const text = ai.result;
    const content: string | DocNode[] = text.includes("\n")
      ? text
          .split(/\n{2,}/)
          .map((p) => ({
            type: "paragraph",
            content: [{ type: "text", text: p.replace(/\n/g, " ") }],
          }))
      : text;
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, content)
      .run();
    disposeTracker();
    setFeedback(ai.feedback);
    setAi({ phase: "idle" });
  }

  function cancelAiResult() {
    aiRequestIdRef.current++; // 使 pending 中的结果失效
    disposeTracker();
    setAi({ phase: "idle" });
  }

  function handleSave() {
    if (!editor) return;
    const html = editor.getHTML();
    startSaving(async () => {
      const { versionNo } = await saveVersion(data.articleId, html, note);
      setNote("");
      onSavedVersion(html);
      setFeedback({ ok: true, message: `已保存为 v${versionNo}。`, tone: "success" });
    });
  }

  function handleExport(kind: "md" | "html") {
    if (!editor) return;
    if (kind === "md") {
      const body = docToMarkdown(editor.getJSON() as DocNode);
      const md = `# ${data.title}\n\n${data.summary ? `> ${data.summary}\n\n` : ""}${body}`;
      download(`${safeFileName}.md`, md, "text/markdown;charset=utf-8");
    } else {
      const body = `${data.summary ? `<blockquote>${data.summary}</blockquote>\n` : ""}${editor.getHTML()}`;
      download(
        `${safeFileName}.html`,
        wrapHtmlDocument(data.title, body),
        "text/html;charset=utf-8",
      );
    }
    setFeedback({ ok: true, message: `已导出 .${kind}。`, tone: "success" });
  }

  function handleImportMd(file: File) {
    if (!editor) return;
    void file.text().then((text) => {
      if (
        !window.confirm(
          `导入「${file.name}」将替换当前正文（当前内容仍可通过自动保存与版本找回）。继续？`,
        )
      ) {
        return;
      }
      const doc = markdownToDoc(text);
      editor.commands.setContent(doc as never, true);
      setFeedback({ ok: true, message: "Markdown 已导入。", tone: "success" });
    });
  }

  function iconButton(
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    opts?: { active?: boolean; disabled?: boolean; shortcut?: string },
  ) {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={opts?.active}
        title={opts?.shortcut ? `${label}（${opts.shortcut}）` : label}
        disabled={opts?.disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          onClick();
        }}
        className={cn(
          "interactive-motion flex h-7 min-w-7 items-center justify-center rounded px-1 text-xs disabled:opacity-40",
          opts?.active
            ? "bg-(--color-primary-soft) font-semibold text-(--color-primary)"
            : "text-(--color-muted) hover:bg-(--color-muted-bg) hover:text-(--color-foreground)",
        )}
      >
        {icon}
      </button>
    );
  }

  function textButton(label: string, isActive: boolean, onClick: () => void) {
    return (
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onClick();
        }}
        className={cn(
          "interactive-motion rounded px-2 py-1 text-xs",
          isActive
            ? "bg-(--color-primary-soft) font-semibold text-(--color-primary)"
            : "text-(--color-muted) hover:bg-(--color-muted-bg)",
        )}
      >
        {label}
      </button>
    );
  }

  if (!editor) {
    return (
      <div className="py-12 text-center text-sm text-(--color-muted)">
        编辑器加载中…
      </div>
    );
  }

  const characters = editor.storage.characterCount?.characters() ?? 0;
  const words = editor.storage.characterCount?.words() ?? 0;
  const aiPending = ai.phase === "pending";

  return (
    <div className="min-w-0 space-y-2">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) p-1.5">
        {iconButton("撤销", <Undo2 className="h-3.5 w-3.5" />, () => editor.chain().focus().undo().run(), {
          disabled: !editor.can().undo(),
          shortcut: "⌘Z",
        })}
        {iconButton("重做", <Redo2 className="h-3.5 w-3.5" />, () => editor.chain().focus().redo().run(), {
          disabled: !editor.can().redo(),
          shortcut: "⌘⇧Z",
        })}
        <span className="mx-1 h-4 w-px bg-(--color-border)" />
        {textButton("H1", editor.isActive("heading", { level: 1 }), () =>
          editor.chain().focus().toggleHeading({ level: 1 }).run(),
        )}
        {textButton("H2", editor.isActive("heading", { level: 2 }), () =>
          editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
        {textButton("H3", editor.isActive("heading", { level: 3 }), () =>
          editor.chain().focus().toggleHeading({ level: 3 }).run(),
        )}
        <span className="mx-1 h-4 w-px bg-(--color-border)" />
        {iconButton("加粗", <Bold className="h-3.5 w-3.5" />, () => editor.chain().focus().toggleBold().run(), {
          active: editor.isActive("bold"),
          shortcut: "⌘B",
        })}
        {iconButton("斜体", <Italic className="h-3.5 w-3.5" />, () => editor.chain().focus().toggleItalic().run(), {
          active: editor.isActive("italic"),
          shortcut: "⌘I",
        })}
        {iconButton(
          "删除线",
          <Strikethrough className="h-3.5 w-3.5" />,
          () => editor.chain().focus().toggleStrike().run(),
          { active: editor.isActive("strike"), shortcut: "⌘⇧S" },
        )}
        {iconButton("行内代码", <Code className="h-3.5 w-3.5" />, () => editor.chain().focus().toggleCode().run(), {
          active: editor.isActive("code"),
          shortcut: "⌘E",
        })}
        <span className="mx-1 h-4 w-px bg-(--color-border)" />
        {iconButton("无序列表", <List className="h-3.5 w-3.5" />, () =>
          editor.chain().focus().toggleBulletList().run(),
        {
          active: editor.isActive("bulletList"),
        })}
        {iconButton("有序列表", <ListOrdered className="h-3.5 w-3.5" />, () =>
          editor.chain().focus().toggleOrderedList().run(),
        {
          active: editor.isActive("orderedList"),
        })}
        {iconButton("任务列表", <ListTodo className="h-3.5 w-3.5" />, () =>
          editor.chain().focus().toggleTaskList().run(),
        {
          active: editor.isActive("taskList"),
        })}
        {iconButton("引用块", <Quote className="h-3.5 w-3.5" />, () =>
          editor.chain().focus().toggleBlockquote().run(),
        {
          active: editor.isActive("blockquote"),
        })}
        {iconButton("代码块", <SquareCode className="h-3.5 w-3.5" />, () =>
          editor.chain().focus().toggleCodeBlock().run(),
        {
          active: editor.isActive("codeBlock"),
        })}
        {textButton("插图", false, () => fileInputRef.current?.click())}
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
        {textButton("图文预览", preview === "render", () =>
          setPreview(preview === "render" ? null : "render"),
        )}
        {textButton("Markdown", preview === "markdown", () =>
          setPreview(preview === "markdown" ? null : "markdown"),
        )}
        {textButton("导入 .md", false, () => mdInputRef.current?.click())}
        <input
          ref={mdInputRef}
          type="file"
          accept=".md,.markdown,text/markdown"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportMd(file);
            e.target.value = "";
          }}
        />
        {textButton("导出 .md", false, () => handleExport("md"))}
        {textButton("导出 .html", false, () => handleExport("html"))}
        <span className="mx-1 h-4 w-px bg-(--color-border)" />
        {iconButton(
          focused ? "退出专注模式" : "专注模式",
          focused ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />,
          onToggleFocus,
          { active: focused },
        )}
        <AiActionFeedback result={feedback} className="ml-auto" />
      </div>

      {/* AI 处理 / 结果预览卡（位置固定，不随选区浮动） */}
      {ai.phase !== "idle" && (
        <div className="ai-result-reveal rounded-(--radius-card) border border-(--color-primary) bg-(--color-primary-soft) p-3 text-sm">
          {ai.phase === "pending" ? (
            <div className="flex items-center justify-between gap-3">
              <span className="ai-pending-label text-(--color-primary)">
                <AiButtonContent
                  pending
                  label=""
                  pendingLabel={`AI ${REWRITE_LABEL[ai.mode]}中…（期间可继续编辑，选区会自动跟随）`}
                />
              </span>
              <Button size="sm" variant="ghost" onClick={cancelAiResult}>
                取消
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-(--color-primary)">
                  AI {REWRITE_LABEL[ai.mode]}结果预览
                  {trackerRef.current && !trackerRef.current.range.valid && (
                    <span className="ml-2 text-(--color-danger)">
                      ⚠ 原选区已被删除，无法写回
                    </span>
                  )}
                </span>
                <span className="flex gap-1.5">
                  <Button
                    size="sm"
                    onClick={acceptAiResult}
                    disabled={!!trackerRef.current && !trackerRef.current.range.valid}
                  >
                    接受并替换
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelAiResult}>
                    取消
                  </Button>
                </span>
              </div>
              <div className="rounded-(--radius-control) bg-(--color-surface) p-2 text-xs text-(--color-muted)">
                原文：{ai.original.length > 120 ? ai.original.slice(0, 120) + "…" : ai.original}
              </div>
              <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-(--radius-control) bg-(--color-surface) p-2 text-sm">
                {ai.result}
              </div>
              {ai.feedback.tone !== "success" && (
                <div className="text-xs text-(--color-warning)">{ai.feedback.message}</div>
              )}
            </div>
          )}
        </div>
      )}

      {preview === "render" && (
        <div
          ref={renderPreviewRef}
          className="panel-transition rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-6 py-4"
        >
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
        <pre className="panel-transition max-h-[32rem] overflow-auto rounded-(--radius-card) border border-(--color-border) bg-(--color-muted-bg) p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {docToMarkdown(editor.getJSON() as DocNode)}
        </pre>
      )}

      <div className={cn(preview && "hidden")}>
        <div
          className={cn(
            "rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-6 py-4",
            focused && "min-h-[70vh]",
          )}
          style={{
            fontSize: `${data.editorPrefs.fontSize}px`,
            lineHeight: data.editorPrefs.lineHeight,
          }}
        >
          <EditorContent editor={editor} className="tiptap" />
        </div>
      </div>

      <EditorBubbleMenu editor={editor} aiPending={aiPending} onAiRewrite={handleAiRewrite} />
      <SlashMenu bus={slashBus} />

      {/* 状态栏：字数 + 保存状态 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-(--color-muted)">
        <span>{characters} 字符</span>
        <span>{words} 词</span>
        <span
          role="status"
          className={cn(
            saveState === "error" && "text-(--color-danger)",
            saveState === "saved" && "text-(--color-success)",
          )}
        >
          {SAVE_STATE_LABEL[saveState]}
          {saveState === "error" && (
            <button type="button" onClick={onRetrySave} className="ml-1 underline">
              重试
            </button>
          )}
        </span>
        <span className="ml-auto hidden sm:inline">
          输入 / 插入块 · 选中文字弹出格式与 AI 工具 · ⌘K 链接
        </span>
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
