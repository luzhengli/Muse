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
import { ReadinessStrip } from "./readiness-strip";
import { Badge } from "@/components/ui/badge";
import { computeReadiness, type ReadinessTarget } from "@/lib/readiness";

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
  { id: "materials", label: "资料", hint: (d) => d.evidence.length + d.citations.length },
];

/**
 * 统一写作工作台：左侧主画布 + 右侧工作流面板（窄屏纵向堆叠）。
 * 编辑器为唯一结构化文档模型；自动保存写工作稿，显式保存产生版本检查点。
 */
export function Workbench({ data }: { data: WorkbenchData }) {
  // 辅助面板按 NextAction 自动打开（URL ?panel= 优先）
  const [tab, setTab] = useState<Tab>(() => {
    if (data.initialPanel) return data.initialPanel;
    const target = computeReadiness(data.readinessFacts).nextAction.target;
    if (target === "brief" || target === "evidence") return "materials";
    if (target === "packaging") return "packaging";
    return "review";
  });
  const [focused, setFocused] = useState(data.editorPrefs.defaultFocusMode);
  const [revisionDirty, setRevisionDirty] = useState(false);
  const [contentEmpty, setContentEmpty] = useState(!data.readinessFacts.hasContent);
  const [activeCitationKey, setActiveCitationKey] = useState<string | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const pickImageRef = useRef<() => void>(() => {});
  const slashBus = useMemo(() => new SlashMenuBus(), []);
  const latest = data.versions[0];
  const activeCheckpointHtml = data.activeCheckpoint
    ? data.versions.find((version) => version.id === data.activeCheckpoint?.id)?.contentHtml
    : null;

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
      ...createEditorExtensions({
        // 点击已引用文字 → 打开资料面板展示「这句话有什么依据」
        onCitationClick: (key) => {
          setActiveCitationKey(key);
          setTab("materials");
        },
      }),
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
    onUpdate: ({ editor: updatedEditor }) => {
      setRevisionDirty(updatedEditor.getHTML() !== activeCheckpointHtml);
      setContentEmpty(updatedEditor.getText().trim() === "");
    },
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

  useEffect(() => {
    if (editor) setRevisionDirty(editor.getHTML() !== activeCheckpointHtml);
  }, [editor, activeCheckpointHtml]);

  const viewData = useMemo<WorkbenchData>(() => {
    if (!revisionDirty) return data;
    return {
      ...data,
      activeCheckpoint: null,
      reviews: data.reviews.map((review) => ({ ...review, stale: true })),
      packaging: data.packaging ? { ...data.packaging, stale: true } : null,
      variants: data.variants.map((variant) => ({ ...variant, stale: true })),
    };
  }, [data, revisionDirty]);

  // 唯一领域状态：服务端事实 + 正文实时变化，同一纯函数即时重算
  const readiness = useMemo(() => {
    const facts = data.readinessFacts;
    if (!revisionDirty) {
      return computeReadiness({ ...facts, hasContent: !contentEmpty });
    }
    return computeReadiness({
      ...facts,
      hasContent: !contentEmpty,
      checkpoint: null,
      review: { hasCurrent: false, openCriticalCurrent: 0 },
      packaging: { ...facts.packaging, current: false },
      variants: { ...facts.variants, current: 0 },
    });
  }, [data.readinessFacts, revisionDirty, contentEmpty]);

  function navigateReadiness(target: ReadinessTarget) {
    if (target === "editor") {
      editorRef.current?.chain().focus().run();
      return;
    }
    if (target === "brief" || target === "evidence") setTab("materials");
    else if (target === "review") setTab("review");
    else if (target === "packaging") setTab("packaging");
  }

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
        {!focused && (
          <ReadinessStrip
            articleId={data.articleId}
            readiness={readiness}
            onNavigate={navigateReadiness}
            checkpointBadge={
              <>
                <span className="font-semibold">当前正文</span>
                {viewData.activeCheckpoint ? (
                  <Badge tone="success">已保存版本 v{viewData.activeCheckpoint.versionNo}</Badge>
                ) : (
                  <Badge tone="warning">有未保存的新修改</Badge>
                )}
                <Badge tone={viewData.reviews.some((r) => !r.stale) ? "success" : "warning"}>
                  审阅{viewData.reviews.some((r) => !r.stale) ? "最新" : "待更新"}
                </Badge>
                <Badge tone={viewData.packaging && !viewData.packaging.stale ? "success" : "warning"}>
                  包装{viewData.packaging && !viewData.packaging.stale ? "最新" : "待更新"}
                </Badge>
                <Badge tone={viewData.variants.some((v) => !v.stale) ? "success" : "warning"}>
                  平台稿{viewData.variants.some((v) => !v.stale) ? "最新" : "待更新"}
                </Badge>
              </>
            }
          />
        )}
        {data.restoredFromDraft && (
          <div className="ai-feedback mb-2 rounded-(--radius-control) border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning)">
            已恢复你最近编辑的内容（比上次保存的版本新）。如需回到某个版本，请在「版本」面板恢复。
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
              const count = t.hint?.(viewData);
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
              {tab === "review" && <ReviewPanel editor={editor} data={viewData} />}
              {tab === "packaging" && <PackagingPanel editor={editor} data={viewData} />}
              {tab === "versions" && <VersionPanel data={viewData} />}
              {tab === "materials" && (
                <MaterialsPanel
                  editor={editor}
                  data={viewData}
                  activeCitationKey={activeCitationKey}
                  onActiveCitationChange={setActiveCitationKey}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
