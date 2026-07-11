"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import "katex/dist/katex.min.css";
import { uploadEditorImage } from "@/actions/assets";
import { cn } from "@/lib/utils";
import { looksLikeMarkdown, markdownToDoc } from "@/lib/markdown";
import { createEditorExtensions } from "@/components/editor/extensions";
import {
  buildSlashItems,
  createSlashExtension,
  SlashMenuBus,
} from "@/components/editor/slash-menu";
import { useAutosave } from "@/components/editor/use-autosave";
import type { WorkbenchData } from "./types";
import { EditorCanvas } from "./editor-canvas";
import { ReviewPanel } from "./review-panel";
import { PackagingPanel } from "./packaging-panel";
import { VersionPanel } from "./version-panel";
import { MaterialsPanel } from "./materials-panel";

type Tab = "review" | "packaging" | "versions" | "materials";

const TABS: { id: Tab; label: string; hint?: (d: WorkbenchData) => number }[] = [
  {
    id: "review",
    label: "审阅",
    hint: (d) =>
      d.reviews.flatMap((r) => r.findings).filter((f) => f.status === "open").length,
  },
  { id: "packaging", label: "包装" },
  { id: "versions", label: "版本", hint: (d) => d.versions.length },
  { id: "materials", label: "素材", hint: (d) => d.citations.length },
];

/**
 * 统一写作工作台：左侧主画布 + 右侧工作流面板（窄屏纵向堆叠）。
 * 编辑器为唯一结构化文档模型；自动保存写工作稿，显式保存产生版本检查点。
 */
export function Workbench({ data }: { data: WorkbenchData }) {
  const [tab, setTab] = useState<Tab>("review");
  const [focused, setFocused] = useState(data.editorPrefs.defaultFocusMode);
  const editorRef = useRef<Editor | null>(null);
  const pickImageRef = useRef<() => void>(() => {});
  const slashBus = useMemo(() => new SlashMenuBus(), []);
  const latest = data.versions[0];

  async function uploadAndInsert(files: File[], pos?: number) {
    const editor = editorRef.current;
    if (!editor) return;
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadEditorImage(data.articleId, fd);
      if (!res) continue;
      const image = { type: "image", attrs: { src: res.url, alt: file.name } };
      if (pos !== undefined) {
        editor.chain().focus().insertContentAt(pos, image).run();
        pos = undefined; // 多张图时后续追加在光标处
      } else {
        editor.chain().focus().insertContent(image).run();
      }
    }
  }

  const extensions = useMemo(
    () => [
      ...createEditorExtensions(),
      createSlashExtension(
        slashBus,
        buildSlashItems(() => pickImageRef.current()),
      ),
    ],
    [slashBus],
  );

  const editor = useEditor({
    extensions,
    content: data.initialContentHtml,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: data.editorPrefs.spellcheck ? "true" : "false",
      },
      handlePaste: (_view, event) => {
        const editor = editorRef.current;
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length) {
          event.preventDefault();
          void uploadAndInsert(files);
          return true;
        }
        // 纯文本且形似 Markdown → 解析为结构化内容（代码块内保持默认粘贴）
        if (editor && !editor.isActive("codeBlock")) {
          const text = event.clipboardData?.getData("text/plain") ?? "";
          const html = event.clipboardData?.getData("text/html") ?? "";
          if (text && !html && looksLikeMarkdown(text)) {
            event.preventDefault();
            const doc = markdownToDoc(text);
            editor
              .chain()
              .focus()
              .insertContent(doc.content ?? [])
              .run();
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        void uploadAndInsert(files, pos);
        return true;
      },
    },
  });
  editorRef.current = editor;

  const { state: saveState, setBaseline, flush } = useAutosave(
    editor,
    data.articleId,
    data.initialContentHtml,
    data.editorPrefs.autosaveIntervalMs,
  );

  // 版本变化（恢复历史版本 / 面板保存新版本）时同步编辑器内容
  const lastVersionIdRef = useRef(latest?.id);
  useEffect(() => {
    if (!editor || !latest) return;
    if (lastVersionIdRef.current !== latest.id) {
      lastVersionIdRef.current = latest.id;
      if (editor.getHTML() !== latest.contentHtml) {
        editor.commands.setContent(latest.contentHtml);
        setBaseline(editor.getHTML());
      }
    }
  }, [editor, latest, setBaseline]);

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        focused
          ? "workbench-focus"
          : "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]",
      )}
    >
      <div className={cn(focused && "mx-auto w-full max-w-3xl")}>
        {data.restoredFromDraft && (
          <div className="ai-feedback mb-2 rounded-(--radius-control) border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning)">
            已恢复最近一次自动保存的工作稿（比最新版本新）。如需回到某个版本，请在「版本」面板恢复。
          </div>
        )}
        <EditorCanvas
          editor={editor}
          data={data}
          onUploadImages={(files) => void uploadAndInsert(files)}
          saveState={saveState}
          onSavedVersion={(html) => setBaseline(html)}
          focused={focused}
          onToggleFocus={() => setFocused((v) => !v)}
          slashBus={slashBus}
          pickImageRef={pickImageRef}
          onRetrySave={() => void flush()}
        />
      </div>

      {!focused && (
        <div className="min-w-0">
          <div className="flex gap-1 rounded-t-(--radius-card) border border-b-0 border-(--color-border) bg-(--color-surface) p-1.5">
            {TABS.map((t) => {
              const count = t.hint?.(data);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 rounded-(--radius-control) px-2 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97] motion-reduce:scale-100 motion-reduce:transition-none",
                    tab === t.id
                      ? "bg-(--color-primary-soft) text-(--color-primary)"
                      : "text-(--color-muted) hover:bg-(--color-muted-bg)",
                  )}
                >
                  {t.label}
                  {count ? `（${count}）` : ""}
                </button>
              );
            })}
          </div>
          <div className="overflow-auto rounded-b-(--radius-card) border border-(--color-border) bg-(--color-surface) p-3 lg:max-h-[calc(100vh-14rem)]">
            <div key={tab} className="panel-transition">
              {tab === "review" && <ReviewPanel editor={editor} data={data} />}
              {tab === "packaging" && <PackagingPanel editor={editor} data={data} />}
              {tab === "versions" && <VersionPanel data={data} />}
              {tab === "materials" && <MaterialsPanel data={data} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
