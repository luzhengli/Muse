"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  markOutputPublishedAction,
  saveOutputRevisionAction,
} from "@/actions/platform-outputs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  checkPlatformOutput,
  parseXText,
  X_MAX_WEIGHTED_LENGTH,
  type OutputCheckResult,
  type XSinglePostPayload,
  type XThreadPayload,
} from "@/lib/platform-rules";
import { cn } from "@/lib/utils";

/**
 * X 作品工作台（feat-031）：单条帖文与 Thread 的
 * 编辑 / 平台预览 / 发布检查 三视图 + 发布助手。
 *
 * - 字符余量实时按官方 twitter-text 加权算法计算（URL 按 t.co 23）；
 * - 检查视图为当前编辑内容的实时结果；标记发布走服务端权威校验，
 *   且有未保存修改时禁止发布（发布冻结的是已保存修订）；
 * - 媒体附件依赖项目资产池，随后续版本开放（当前保留已有引用不丢失）。
 */

type XPayload = XSinglePostPayload | XThreadPayload;
type ViewTab = "edit" | "preview" | "check";

const VIEW_LABELS: Array<{ id: ViewTab; label: string }> = [
  { id: "edit", label: "编辑" },
  { id: "preview", label: "平台预览" },
  { id: "check", label: "发布检查" },
];

function CharCounter({ text }: { text: string }) {
  const stats = parseXText(text);
  const tone =
    stats.remaining < 0
      ? "text-(--color-danger) font-semibold"
      : stats.remaining <= 20
        ? "text-(--color-warning)"
        : "text-(--color-muted)";
  return (
    <span className={cn("text-xs tabular-nums", tone)}>
      {stats.weightedLength}/{X_MAX_WEIGHTED_LENGTH}
      {stats.remaining < 0 && `　超出 ${-stats.remaining}`}
    </span>
  );
}

/** 把 URL 高亮为主色（预览用，不产生真实链接跳转） */
function PostText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <span key={i} className="text-(--color-primary)">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
      {text.trim() === "" && <span className="text-(--color-muted)">（空帖文）</span>}
    </p>
  );
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function excerpt(text: string, max = 24): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "（空帖文）";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function XOutputWorkbench({
  outputId,
  initialPayload,
  hasPublication,
}: {
  outputId: number;
  initialPayload: XPayload;
  hasPublication: boolean;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<XPayload>(initialPayload);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialPayload));
  const [view, setView] = useState<ViewTab>("edit");
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);

  const dirty = JSON.stringify(payload) !== baseline;
  const check = useMemo(() => checkPlatformOutput(payload), [payload]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function save() {
    setSaving(true);
    setSaveFeedback(null);
    try {
      const result = await saveOutputRevisionAction(outputId, payload);
      if (!result.ok) {
        setSaveFeedback({ tone: "danger", text: result.error ?? "保存失败，请重试" });
        return;
      }
      setBaseline(JSON.stringify(payload));
      setSaveFeedback({
        tone: "success",
        text: result.reused ? "内容没有变化" : `已保存修订 r${result.revisionNo}`,
      });
      router.refresh();
    } catch {
      setSaveFeedback({ tone: "danger", text: "保存失败，请检查网络后重试" });
    } finally {
      setSaving(false);
    }
  }

  const failedBlockerCount = check.items.filter(
    (i) => i.level === "blocker" && !i.passed,
  ).length;

  return (
    <div className="space-y-3">
      {/* 视图切换 + 保存 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="作品视图" className="flex gap-1">
          {VIEW_LABELS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setView(tab.id)}
              className={cn(
                "interactive-motion rounded-(--radius-control) px-3 py-1.5 text-sm",
                view === tab.id
                  ? "bg-(--color-primary) font-medium text-white"
                  : "text-(--color-muted) hover:bg-(--color-muted-bg)",
              )}
            >
              {tab.label}
              {tab.id === "check" && failedBlockerCount > 0 && (
                <span className="ml-1 rounded-full bg-(--color-danger) px-1.5 text-[10px] text-white">
                  {failedBlockerCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {saveFeedback && (
            <span
              role="status"
              className={cn(
                "text-xs",
                saveFeedback.tone === "success"
                  ? "text-(--color-success)"
                  : "text-(--color-danger)",
              )}
            >
              {saveFeedback.text}
            </span>
          )}
          {dirty && !saveFeedback && (
            <span className="text-xs text-(--color-warning)">有未保存的修改</span>
          )}
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? "保存中…" : "保存修订"}
          </Button>
        </div>
      </div>

      {view === "edit" && (
        <EditView payload={payload} onChange={setPayload} />
      )}
      {view === "preview" && <PreviewView payload={payload} />}
      {view === "check" && (
        <CheckView
          outputId={outputId}
          payload={payload}
          check={check}
          dirty={dirty}
          hasPublication={hasPublication}
          onPublished={() => router.refresh()}
        />
      )}
    </div>
  );
}

/* ------------------------------ 编辑视图 ------------------------------ */

function EditView({
  payload,
  onChange,
}: {
  payload: XPayload;
  onChange: (payload: XPayload) => void;
}) {
  if (payload.type === "x_single_post") {
    return (
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="x-post-text">帖文内容</Label>
              <CharCounter text={payload.text} />
            </div>
            <Textarea
              id="x-post-text"
              rows={6}
              value={payload.text}
              onChange={(e) => onChange({ ...payload, text: e.target.value })}
              placeholder="写点什么…（链接无论多长都按 23 个字符计）"
            />
          </div>
          <MediaPlaceholder count={payload.media.length} />
          <InternalNoteField
            value={payload.internalNote}
            onChange={(internalNote) => onChange({ ...payload, internalNote })}
          />
        </CardContent>
      </Card>
    );
  }

  const posts = payload.posts;
  return (
    <div className="space-y-2">
      {posts.map((post, index) => (
        <Card key={index}>
          <CardContent className="space-y-2 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="primary">
                  {index + 1}/{posts.length}
                </Badge>
                <CharCounter text={post.text} />
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`第 ${index + 1} 条上移`}
                  disabled={index === 0}
                  onClick={() =>
                    onChange({ ...payload, posts: moveItem(posts, index, index - 1) })
                  }
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`第 ${index + 1} 条下移`}
                  disabled={index === posts.length - 1}
                  onClick={() =>
                    onChange({ ...payload, posts: moveItem(posts, index, index + 1) })
                  }
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`删除第 ${index + 1} 条`}
                  disabled={posts.length === 1}
                  className="text-(--color-danger)"
                  onClick={() =>
                    onChange({ ...payload, posts: posts.filter((_, i) => i !== index) })
                  }
                >
                  删除
                </Button>
              </div>
            </div>
            <Textarea
              rows={3}
              aria-label={`第 ${index + 1} 条帖文内容`}
              value={post.text}
              onChange={(e) =>
                onChange({
                  ...payload,
                  posts: posts.map((p, i) =>
                    i === index ? { ...p, text: e.target.value } : p,
                  ),
                })
              }
              placeholder={index === 0 ? "Thread 的第一条（钩子）…" : "继续展开…"}
            />
            {post.media.length > 0 && <MediaPlaceholder count={post.media.length} />}
          </CardContent>
        </Card>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange({ ...payload, posts: [...posts, { text: "", media: [] }] })
          }
        >
          + 添加一条
        </Button>
        <span className="text-xs text-(--color-muted)">
          每条独立计数，发布时逐条复制
        </span>
      </div>
      <Card>
        <CardContent className="pt-4">
          <InternalNoteField
            value={payload.internalNote}
            onChange={(internalNote) => onChange({ ...payload, internalNote })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InternalNoteField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="x-internal-note">
        内部备注 <span className="text-(--color-muted)">（仅 Muse 内可见，不会发布到 X）</span>
      </Label>
      <Input
        id="x-internal-note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例如：配合活动周发布"
      />
    </div>
  );
}

function MediaPlaceholder({ count }: { count: number }) {
  return (
    <p className="text-xs text-(--color-muted)">
      {count > 0 ? `已关联 ${count} 个媒体附件（保留不变）。` : ""}
      媒体附件从项目资产池选择，随后续版本开放。
    </p>
  );
}

/* ------------------------------ 预览视图 ------------------------------ */

function PreviewView({ payload }: { payload: XPayload }) {
  const posts =
    payload.type === "x_single_post"
      ? [{ text: payload.text, media: payload.media }]
      : payload.posts;
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="mb-3 text-xs text-(--color-muted)">
          按 X 时间线样式预览（帐号信息为占位显示）
        </p>
        <div className="space-y-0">
          {posts.map((post, index) => (
            <div key={index} className="relative flex gap-3 pb-5">
              {payload.type === "x_thread" && index < posts.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[19px] top-10 h-[calc(100%-2.25rem)] w-0.5 bg-(--color-border)"
                />
              )}
              <div
                aria-hidden
                className="h-10 w-10 shrink-0 rounded-full bg-(--color-primary-soft) text-center text-lg leading-10 text-(--color-primary)"
              >
                M
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1 text-sm">
                  <span className="font-semibold">你的账号</span>
                  <span className="text-xs text-(--color-muted)">@your_handle</span>
                  {payload.type === "x_thread" && (
                    <span className="text-xs text-(--color-muted)">
                      · {index + 1}/{posts.length}
                    </span>
                  )}
                </div>
                <PostText text={post.text} />
                {post.media.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {post.media.map((_, i) => (
                      <div
                        key={i}
                        className="h-14 w-14 rounded-(--radius-control) border border-(--color-border) bg-(--color-muted-bg) text-center text-[10px] leading-[3.5rem] text-(--color-muted)"
                      >
                        媒体
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------- 发布检查 + 助手 --------------------------- */

function CheckView({
  outputId,
  payload,
  check,
  dirty,
  hasPublication,
  onPublished,
}: {
  outputId: number;
  payload: XPayload;
  check: OutputCheckResult;
  dirty: boolean;
  hasPublication: boolean;
  onPublished: () => void;
}) {
  const [copiedCount, setCopiedCount] = useState(0);
  const [url, setUrl] = useState("");
  const [riskMode, setRiskMode] = useState(false);
  const [riskReason, setRiskReason] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);

  const posts =
    payload.type === "x_single_post"
      ? [{ text: payload.text }]
      : payload.posts.map((p) => ({ text: p.text }));

  async function copyText(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("复制失败，请手动复制：", text);
    }
    setCopiedCount((current) => Math.max(current, index + 1));
  }

  async function publish(acceptRisk?: string) {
    setPublishing(true);
    setPublishFeedback(null);
    try {
      const result = await markOutputPublishedAction(outputId, {
        url,
        acceptRisk,
      });
      if (!result.ok) {
        const blockers = result.blockers?.length
          ? `：${result.blockers.join("；")}`
          : "";
        setPublishFeedback({
          tone: "danger",
          text: `${result.error ?? "发布失败"}${blockers}`,
        });
        return;
      }
      setPublishFeedback({
        tone: "success",
        text: "已记录发布。发布快照已冻结为当前修订，链接与时间之后可修改。",
      });
      setUrl("");
      setRiskMode(false);
      setRiskReason("");
      onPublished();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* 检查清单 */}
      <Card>
        <CardContent className="space-y-1.5 pt-4">
          {dirty && (
            <p className="rounded bg-(--color-warning-soft) px-2 py-1.5 text-xs text-(--color-warning)">
              检查结果基于当前编辑内容；标记发布前请先保存修订。
            </p>
          )}
          <ul className="space-y-1">
            {check.items.map((item) => (
              <li
                key={`${item.id}-${item.postIndex ?? ""}`}
                className={cn(
                  "flex items-start gap-2 rounded px-2 py-1.5 text-sm",
                  !item.passed && item.level === "blocker" && "bg-(--color-danger-soft)",
                  !item.passed && item.level === "warning" && "bg-(--color-warning-soft)",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 text-xs font-bold",
                    item.passed
                      ? "text-(--color-success)"
                      : item.level === "blocker"
                        ? "text-(--color-danger)"
                        : "text-(--color-warning)",
                  )}
                >
                  {item.passed ? "✓" : item.level === "blocker" ? "✕" : "!"}
                </span>
                <span
                  className={cn(
                    item.passed
                      ? "text-(--color-muted)"
                      : item.level === "blocker"
                        ? "text-(--color-danger)"
                        : "text-(--color-warning)",
                  )}
                >
                  {item.message}
                  {!item.passed && item.level === "blocker" && (
                    <span className="ml-1 text-xs">（阻碍发布）</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="pt-1 text-[10px] text-(--color-muted)">
            检查依据规则版本 {check.rulesVersion}（每条规则的来源与核对日期见规则注册表）
          </p>
        </CardContent>
      </Card>

      {/* 发布助手 */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="text-sm font-semibold">发布助手（复制 → 去 X 发布 → 回来标记）</div>

          {payload.type === "x_single_post" ? (
            <Button size="sm" onClick={() => copyText(posts[0].text, 0)}>
              {copiedCount > 0 ? "已复制 ✓" : "一键复制帖文"}
            </Button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-(--color-muted)">
                逐条复制，按顺序粘贴到 X（第一条为主帖，其余逐条回复）
                {copiedCount > 0 && copiedCount < posts.length && (
                  <span className="ml-1 text-(--color-primary)">
                    已复制 {copiedCount}/{posts.length}，下一条 ↓
                  </span>
                )}
                {copiedCount >= posts.length && (
                  <span className="ml-1 text-(--color-success)">
                    全部 {posts.length} 条已复制 ✓
                  </span>
                )}
              </p>
              {posts.map((post, index) => (
                <div
                  key={index}
                  className={cn(
                    "flex items-center gap-2 rounded-(--radius-control) border px-2 py-1.5",
                    index === copiedCount
                      ? "border-(--color-primary) bg-(--color-primary-soft)"
                      : "border-(--color-border)",
                    index < copiedCount && "opacity-60",
                  )}
                >
                  <Badge tone={index < copiedCount ? "success" : "default"}>
                    {index + 1}/{posts.length}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {excerpt(post.text)}
                  </span>
                  <Button
                    size="sm"
                    variant={index === copiedCount ? "default" : "ghost"}
                    onClick={() => copyText(post.text, index)}
                  >
                    {index < copiedCount ? "已复制 ✓" : "复制"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 border-t border-(--color-border) pt-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="publish-url">发布链接（可留空稍后补充）</Label>
                <Input
                  id="publish-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://x.com/…"
                  className="h-8"
                />
              </div>
              {check.ready ? (
                <Button size="sm" disabled={publishing || dirty} onClick={() => publish()}>
                  {publishing ? "记录中…" : "标记已发布"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={publishing || dirty}
                  className="text-(--color-danger)"
                  onClick={() => setRiskMode((v) => !v)}
                >
                  带风险发布…
                </Button>
              )}
            </div>
            {dirty && (
              <p className="text-xs text-(--color-warning)">
                有未保存的修改，先保存修订再标记发布。
              </p>
            )}
            {!check.ready && riskMode && (
              <div className="space-y-1.5 rounded-(--radius-control) bg-(--color-danger-soft) p-2">
                <Label htmlFor="risk-reason" className="text-(--color-danger)">
                  发布检查未通过。确认仍要发布时，请说明原因（会记录在发布记录中）：
                </Label>
                <Textarea
                  id="risk-reason"
                  rows={2}
                  value={riskReason}
                  onChange={(e) => setRiskReason(e.target.value)}
                  placeholder="例如：字符超限已在 X 端手动截断"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={publishing || riskReason.trim() === ""}
                    onClick={() => publish(riskReason)}
                  >
                    确认带风险发布
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRiskMode(false)}>
                    取消
                  </Button>
                </div>
              </div>
            )}
            {publishFeedback && (
              <p
                role="status"
                className={cn(
                  "text-xs",
                  publishFeedback.tone === "success"
                    ? "text-(--color-success)"
                    : "text-(--color-danger)",
                )}
              >
                {publishFeedback.text}
              </p>
            )}
            {hasPublication && (
              <p className="text-[10px] text-(--color-muted)">
                该作品已有发布记录（见页面底部）；再次标记会生成新的发布记录。
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
