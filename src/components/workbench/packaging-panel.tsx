"use client";

import { useRef, useState, useTransition } from "react";
import type { Editor } from "@tiptap/react";
import {
  generatePackaging,
  adoptTitle,
  applySummary,
  setCoverAsset,
  uploadAsset,
  deleteAsset,
} from "@/actions/packaging";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { assetUrl, cn, escapeHtml, fmtTime } from "@/lib/utils";
import type { WorkbenchData } from "./types";
import type { AiActionResult } from "@/lib/ai";
import {
  AiActionFeedback,
  AiButtonContent,
  AiResultTransition,
} from "@/components/ai-action";

const kindLabel: Record<string, string> = {
  cover: "封面",
  illustration: "配图",
  other: "其他",
};

export function PackagingPanel({
  editor,
  data,
}: {
  editor: Editor | null;
  data: WorkbenchData;
}) {
  const [generating, startGenerating] = useTransition();
  const [mutating, startMutating] = useTransition();
  const generatingRef = useRef(false);
  const [feedback, setFeedback] = useState<AiActionResult<unknown> | null>(null);
  const pack = data.packaging;

  function copyText(text: string) {
    void navigator.clipboard.writeText(text);
    setFeedback({ ok: true, message: "已复制到剪贴板。", tone: "success" });
  }

  function insertCards() {
    if (!editor || !pack?.cards.length) return;
    const html = pack.cards
      .map((c) => `<h3>${escapeHtml(c.heading)}</h3><p>${escapeHtml(c.body)}</p>`)
      .join("");
    editor.chain().focus("end").insertContent(html).run();
    setFeedback({
      ok: true,
      message: "卡片已插入正文末尾，记得保存新版本。",
      tone: "success",
    });
  }

  function insertImage(filePath: string, fileName: string) {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: "image", attrs: { src: assetUrl(filePath), alt: fileName } })
      .run();
    setFeedback({
      ok: true,
      message: "图片已插入正文光标处，记得保存新版本。",
      tone: "success",
    });
  }

  function generate() {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setFeedback(null);
    startGenerating(async () => {
      try {
        const result = await generatePackaging(data.articleId, editor?.getHTML());
        setFeedback(result);
      } catch {
        setFeedback({ ok: false, message: "包装请求未完成，请重试。", tone: "danger" });
      } finally {
        generatingRef.current = false;
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-(--color-muted)">
          {pack
            ? `物料关联 v${pack.versionNo ?? "-"} · ${fmtTime(pack.createdAt)}`
            : "基于当前工作稿生成包装物料"}
          {pack && (
            <Badge tone={pack.stale ? "warning" : "success"}>
              {pack.stale ? "已过期" : "当前结果"}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          className={cn(
            "ai-action-trigger",
            generating && "ai-action-pending disabled:opacity-100",
          )}
          disabled={generating || !editor}
          aria-busy={generating}
          onClick={generate}
        >
          <AiButtonContent
            pending={generating}
            label={pack ? "重新生成" : "生成物料"}
            pendingLabel="生成中…"
          />
        </Button>
      </div>

      <AiActionFeedback result={feedback} />

      <AiResultTransition signature={pack?.id ?? "empty"}>
        {pack && (
          <div className="space-y-3">
          {/* 标题候选 */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold">标题候选 → 应用为文章标题</div>
            {pack.titleCandidates.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-(--radius-control) border border-(--color-border) p-1.5"
              >
                <span className="flex-1 text-xs leading-snug">{t}</span>
                {t === data.title ? (
                  <Badge tone="success">使用中</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mutating || generating}
                    onClick={() => startMutating(() => adoptTitle(data.articleId, t))}
                  >
                    采用
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* 摘要 */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold">摘要 → 应用为文章摘要</div>
            <p className="rounded-(--radius-control) bg-(--color-muted-bg) p-2 text-xs leading-relaxed">
              {pack.summary}
            </p>
            {data.summary === pack.summary ? (
              <Badge tone="success">已应用到文章元信息</Badge>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                disabled={mutating || generating}
                onClick={() =>
                  startMutating(async () => {
                    await applySummary(data.articleId, pack.summary);
                    setFeedback({
                      ok: true,
                      message: "摘要已应用，可在图文预览查看。",
                      tone: "success",
                    });
                  })
                }
              >
                应用摘要
              </Button>
            )}
          </div>

          {/* 提示词 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              配图提示词 <Badge tone="warning">AI 生图暂不支持</Badge>
            </div>
            <p className="text-[10px] text-(--color-muted)">
              复制提示词到外部生图工具，生成后在下方上传关联。
            </p>
            {[pack.coverPrompt, ...pack.imagePrompts].filter(Boolean).map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 rounded-(--radius-control) bg-(--color-muted-bg) p-2"
              >
                <span className="flex-1 text-[11px] leading-relaxed">
                  {i === 0 && <Badge tone="primary">封面</Badge>} {p}
                </span>
                <Button size="sm" variant="ghost" onClick={() => copyText(p)}>
                  复制
                </Button>
              </div>
            ))}
          </div>

          {/* 图文卡片 */}
          {pack.cards.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">图文卡片</span>
                <Button size="sm" variant="secondary" onClick={insertCards}>
                  插入正文
                </Button>
              </div>
              <div className="space-y-1.5">
                {pack.cards.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-(--radius-control) border border-(--color-border) p-2"
                  >
                    <div className="text-xs font-semibold text-(--color-primary)">
                      {c.heading}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-relaxed">{c.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}
      </AiResultTransition>

      {/* 图片资产 */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold">图片资产（{data.assets.length}）</div>
        <form
          action={async (fd) => {
            await uploadAsset(fd);
            setFeedback({ ok: true, message: "图片已上传。", tone: "success" });
          }}
          className="flex gap-1.5"
        >
          <input type="hidden" name="articleId" value={data.articleId} />
          <Input
            type="file"
            name="file"
            required
            accept="image/*"
            className="h-8 flex-1 pt-1 text-xs"
          />
          <Select name="kind" className="h-8 w-18 text-xs">
            <option value="cover">封面</option>
            <option value="illustration">配图</option>
            <option value="other">其他</option>
          </Select>
          <Button size="sm">上传</Button>
        </form>
        <div className="space-y-1.5">
          {data.assets.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-(--radius-control) border border-(--color-border) p-1.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(a.filePath)}
                alt={a.fileName}
                className="h-10 w-10 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-[11px]">{a.fileName}</div>
                <div className="flex items-center gap-1">
                  <Badge>{kindLabel[a.kind]}</Badge>
                  {a.id === data.coverAssetId && <Badge tone="primary">当前封面</Badge>}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className="interactive-motion rounded text-[10px] text-(--color-primary) hover:underline"
                  onClick={() => insertImage(a.filePath, a.fileName)}
                >
                  插入正文
                </button>
                <button
                  type="button"
                  className="interactive-motion rounded text-[10px] text-(--color-primary) hover:underline"
                  onClick={() =>
                    startMutating(() =>
                      setCoverAsset(
                        data.articleId,
                        a.id === data.coverAssetId ? null : a.id,
                      ),
                    )
                  }
                >
                  {a.id === data.coverAssetId ? "取消封面" : "设为封面"}
                </button>
                <button
                  type="button"
                  className="interactive-motion rounded text-[10px] text-(--color-muted) hover:underline"
                  onClick={() => startMutating(() => deleteAsset(a.id, data.articleId))}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {data.assets.length === 0 && (
            <p className="text-[11px] text-(--color-muted)">
              暂无图片。上传后可插入正文或设为封面。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
