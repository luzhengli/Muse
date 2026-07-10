"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { uploadEditorImage } from "@/actions/assets";
import { cn } from "@/lib/utils";
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
 * 统一写作工作台：左侧主画布 + 右侧工作流面板。
 * 审阅建议、包装物料、版本历史、引用素材、图片资产在同一页闭环，
 * 面板通过共享的 editor 实例把结果直接写回正文。
 */
export function Workbench({ data }: { data: WorkbenchData }) {
  const [tab, setTab] = useState<Tab>("review");
  const editorRef = useRef<Editor | null>(null);
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

  const editor = useEditor({
    extensions: [StarterKit, Image],
    content: latest?.contentHtml ?? "<p></p>",
    immediatelyRender: false,
    editorProps: {
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return false;
        event.preventDefault();
        void uploadAndInsert(files);
        return true;
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

  // 版本变化（恢复历史版本 / 面板保存新版本）时同步编辑器内容
  const lastVersionIdRef = useRef(latest?.id);
  useEffect(() => {
    if (!editor || !latest) return;
    if (lastVersionIdRef.current !== latest.id) {
      lastVersionIdRef.current = latest.id;
      if (editor.getHTML() !== latest.contentHtml) {
        editor.commands.setContent(latest.contentHtml);
      }
    }
  }, [editor, latest]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_22rem] gap-4">
      <EditorCanvas
        editor={editor}
        data={data}
        onUploadImages={(files) => void uploadAndInsert(files)}
      />

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
        <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded-b-(--radius-card) border border-(--color-border) bg-(--color-surface) p-3">
          <div key={tab} className="panel-transition">
            {tab === "review" && <ReviewPanel editor={editor} data={data} />}
            {tab === "packaging" && <PackagingPanel editor={editor} data={data} />}
            {tab === "versions" && <VersionPanel data={data} />}
            {tab === "materials" && <MaterialsPanel data={data} />}
          </div>
        </div>
      </div>
    </div>
  );
}
