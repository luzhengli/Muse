"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Editor } from "@tiptap/react";
import type { WorkbenchData, WbEvidence } from "./types";
import { BriefEditor } from "@/components/brief-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchEvidence, citeChunk, removeEvidence, type EvidenceSearchHit } from "@/actions/citations";
import {
  collectCitationKeys,
  removeCitationMarks,
  selectCitation,
} from "@/components/editor/citation-mark";
import { citationValidityLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface Feedback {
  tone: "success" | "warning" | "danger";
  message: string;
}

/**
 * 资料面板：查找相关资料 → 预览 → 引用插入/关联选中文字；
 * 本文依据列表展示引用有效状态（依据有效 / 来源已变化 / 来源已删除）。
 */
export function MaterialsPanel({
  editor,
  data,
  activeCitationKey,
  onActiveCitationChange,
}: {
  editor: Editor | null;
  data: WorkbenchData;
  activeCitationKey: string | null;
  onActiveCitationChange: (key: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<EvidenceSearchHit[] | null>(null);
  const [expandedChunk, setExpandedChunk] = useState<number | null>(null);
  const [searching, startSearching] = useTransition();
  const [citing, startCiting] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [docTick, setDocTick] = useState(0);
  const activeItemRef = useRef<HTMLDivElement | null>(null);

  // 选区与正文变化的轻量订阅：驱动「为选中文字关联」可用性与「未出现在正文中」提示
  useEffect(() => {
    if (!editor) return;
    const onSelection = () => {
      const { from, to } = editor.state.selection;
      setHasSelection(from !== to);
    };
    const onUpdate = () => setDocTick((t) => t + 1);
    onSelection();
    editor.on("selectionUpdate", onSelection);
    editor.on("update", onUpdate);
    return () => {
      editor.off("selectionUpdate", onSelection);
      editor.off("update", onUpdate);
    };
  }, [editor]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeCitationKey]);

  void docTick; // 仅用于触发重算 keysInDoc
  const keysInDoc = editor ? collectCitationKeys(editor.state.doc) : new Set<string>();

  function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setFeedback(null);
    startSearching(async () => {
      try {
        const results = await searchEvidence(q);
        setHits(results);
        setExpandedChunk(results.length === 1 ? results[0].chunkId : null);
      } catch {
        setFeedback({ tone: "danger", message: "搜索失败，请重试。" });
      }
    });
  }

  function handleCite(hit: EvidenceSearchHit, mode: "insert" | "associate") {
    if (!editor) return;
    // 先记录选区：await 期间用户点击面板不会改变它，但以记录值为准更稳妥
    const { from, to } = editor.state.selection;
    if (mode === "associate" && from === to) {
      setFeedback({ tone: "warning", message: "请先在正文中选中要关联依据的文字。" });
      return;
    }
    setFeedback(null);
    startCiting(async () => {
      try {
        const res = await citeChunk(data.articleId, hit.chunkId);
        if (!res.ok) {
          setFeedback({ tone: "danger", message: res.message });
          return;
        }
        const { key, excerpt, sourceTitle } = res.citation;
        if (mode === "insert") {
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: `「${excerpt}」`,
              marks: [{ type: "citation", attrs: { key } }],
            })
            .run();
        } else {
          editor
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .setCitation(key)
            .run();
        }
        onActiveCitationChange(key);
        setFeedback({
          tone: "success",
          message:
            mode === "insert"
              ? `已插入摘录并关联来源《${sourceTitle}》。`
              : `已为选中文字关联来源《${sourceTitle}》。`,
        });
      } catch {
        setFeedback({ tone: "danger", message: "引用未完成，正文未改动，请重试。" });
      }
    });
  }

  function handleRemove(item: WbEvidence) {
    startCiting(async () => {
      try {
        await removeEvidence(item.id, data.articleId);
        if (editor) removeCitationMarks(editor, item.key);
        if (activeCitationKey === item.key) onActiveCitationChange(null);
        setFeedback({ tone: "success", message: "已移除该依据（正文文字保留）。" });
      } catch {
        setFeedback({ tone: "danger", message: "移除失败，请重试。" });
      }
    });
  }

  async function handleCopy(item: WbEvidence) {
    try {
      await navigator.clipboard.writeText(
        `「${item.excerpt}」——${item.sourceTitle}${item.sourceUrl ? `（${item.sourceUrl}）` : ""}`,
      );
      setFeedback({ tone: "success", message: "已复制摘录与来源。" });
    } catch {
      setFeedback({ tone: "danger", message: "复制失败，请手动选择文本复制。" });
    }
  }

  return (
    <div className="space-y-4">
      {/* 查找相关资料 */}
      <div className="space-y-2 rounded-(--radius-control) border border-(--color-border) p-2.5">
        <div className="text-xs font-semibold">查找相关资料</div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索资料库中的内容…"
            aria-label="搜索资料"
            className="h-8 flex-1 text-xs"
          />
          <Button size="sm" type="submit" disabled={searching || !query.trim()}>
            {searching ? "搜索中…" : "搜索"}
          </Button>
        </form>
        {hits !== null && hits.length === 0 && (
          <p className="text-[11px] text-(--color-muted)">
            没有找到相关内容。资料需要先在素材库完成整理（清洗）才能被搜索到。
          </p>
        )}
        {hits?.map((hit) => (
          <div
            key={hit.chunkId}
            className="rounded-(--radius-control) border border-(--color-border) p-2 text-xs"
          >
            <button
              type="button"
              className="block w-full text-left"
              onClick={() =>
                setExpandedChunk((cur) => (cur === hit.chunkId ? null : hit.chunkId))
              }
              aria-expanded={expandedChunk === hit.chunkId}
            >
              <div className="line-clamp-1 font-medium">{hit.materialTitle}</div>
              <div className="mt-0.5 line-clamp-2 text-(--color-muted)">
                {hit.snippet.replace(/[[\]]/g, "")}
              </div>
            </button>
            {expandedChunk === hit.chunkId && (
              <div className="mt-1.5 space-y-1.5">
                <p className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-(--color-muted-bg) p-1.5 leading-relaxed">
                  {hit.content}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={citing || !editor}
                    onClick={() => handleCite(hit, "insert")}
                  >
                    插入摘录并引用
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={citing || !editor || !hasSelection}
                    title={hasSelection ? undefined : "先在正文中选中文字"}
                    onClick={() => handleCite(hit, "associate")}
                  >
                    为选中文字关联
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "ai-feedback rounded-(--radius-control) px-2 py-1.5 text-xs",
            feedback.tone === "success" &&
              "bg-(--color-success-soft) text-(--color-success)",
            feedback.tone === "warning" &&
              "bg-(--color-warning-soft) text-(--color-warning)",
            feedback.tone === "danger" &&
              "bg-(--color-danger-soft) text-(--color-danger)",
          )}
        >
          {feedback.message}
        </p>
      )}

      {/* 本文依据 */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold">本文依据（{data.evidence.length}）</div>
        {data.evidence.length === 0 && (
          <p className="text-[11px] text-(--color-muted)">
            还没有引用依据。搜索资料后「插入摘录并引用」，或选中正文文字后关联资料。
          </p>
        )}
        {data.evidence.map((item) => {
          const validity = citationValidityLabel[item.validity];
          const isActive = activeCitationKey === item.key;
          const inDoc = keysInDoc.has(item.key);
          return (
            <div
              key={item.key}
              ref={isActive ? activeItemRef : undefined}
              className={cn(
                "rounded-(--radius-control) border p-2 text-xs",
                isActive
                  ? "border-(--color-primary) bg-(--color-primary-soft)"
                  : "border-(--color-border)",
              )}
            >
              <div className="flex flex-wrap items-center gap-1">
                <Badge tone={validity?.tone ?? "default"}>
                  {validity?.text ?? item.validity}
                </Badge>
                {!inDoc && <Badge tone="default">未出现在正文中</Badge>}
                <span className="line-clamp-1 font-medium">
                  {item.sourceTitle || "（来源标题缺失）"}
                </span>
              </div>
              <blockquote className="mt-1 line-clamp-3 border-l-2 border-(--color-border) pl-2 leading-relaxed text-(--color-muted)">
                {item.excerpt}
              </blockquote>
              {isActive && (
                <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed">
                  {item.validity === "valid" && (
                    <p className="text-(--color-success)">
                      这句话的依据来自《{item.sourceTitle}》，资料内容仍与引用时一致。
                    </p>
                  )}
                  {item.validity === "source-changed" && (
                    <div className="space-y-1 text-(--color-warning)">
                      <p>来源资料内容发生了变化，下面是引用时的原始快照，请核对后决定是否更新引用：</p>
                      <p className="max-h-24 overflow-auto whitespace-pre-wrap rounded bg-(--color-muted-bg) p-1.5 text-(--color-muted)">
                        {item.contextSnapshot}
                      </p>
                    </div>
                  )}
                  {item.validity === "source-missing" && (
                    <div className="space-y-1 text-(--color-danger)">
                      <p>来源资料已被删除，仅保留引用时的摘录快照；发布前请为这句话补充新的依据。</p>
                      <p className="max-h-24 overflow-auto whitespace-pre-wrap rounded bg-(--color-muted-bg) p-1.5 text-(--color-muted)">
                        {item.contextSnapshot}
                      </p>
                    </div>
                  )}
                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-(--color-primary) hover:underline"
                    >
                      查看原始来源链接
                    </a>
                  )}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!editor || !inDoc}
                  title={inDoc ? undefined : "正文中已没有这条引用的文字"}
                  onClick={() => {
                    if (!editor) return;
                    onActiveCitationChange(item.key);
                    if (!selectCitation(editor, item.key)) {
                      setFeedback({
                        tone: "warning",
                        message: "正文中没有找到这条引用的文字。",
                      });
                    }
                  }}
                >
                  在正文中定位
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleCopy(item)}>
                  复制摘录
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={citing}
                  onClick={() => handleRemove(item)}
                >
                  移除
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 相关素材（素材级关联） */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold">相关素材（{data.citations.length}）</div>
        {data.citations.length === 0 && (
          <p className="text-[11px] text-(--color-muted)">
            暂无关联素材。从选题生成的初稿会自动关联选题素材。
          </p>
        )}
        {data.citations.map((c) => (
          <Link
            key={c.id}
            href={`/materials/${c.materialId}`}
            className="block rounded-(--radius-control) border border-(--color-border) p-2 text-xs hover:border-(--color-primary)"
          >
            <div className="line-clamp-1 font-medium">{c.title}</div>
            {c.summary && (
              <div className="mt-0.5 line-clamp-2 text-(--color-muted)">{c.summary}</div>
            )}
          </Link>
        ))}
      </div>

      {data.topicId && data.brief && (
        <BriefEditor
          topicId={data.topicId}
          initialBrief={data.brief}
          materials={data.citations.map((citation) => ({
            id: citation.materialId,
            title: citation.title,
          }))}
          hasArticle
          compact
        />
      )}
    </div>
  );
}
