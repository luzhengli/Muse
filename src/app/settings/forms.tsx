"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { AiActionFeedback } from "@/components/ai-action";
import {
  resetSettingsSection,
  saveAiSettings,
  saveAppearanceSettings,
  saveEditorSettings,
  testAiConnection,
  type SettingsActionResult,
} from "@/actions/settings";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";

function useSettingsAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SettingsActionResult | null>(null);
  const run = (task: () => Promise<SettingsActionResult>) => {
    setResult(null);
    start(async () => {
      try {
        setResult(await task());
      } catch {
        setResult({ ok: false, message: "保存失败，请重试。", tone: "danger" });
      }
    });
  };
  return { pending, result, run };
}

function SectionActions({
  pending,
  result,
  onReset,
}: {
  pending: boolean;
  result: SettingsActionResult | null;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button size="sm" disabled={pending}>
        {pending ? "保存中…" : "保存"}
      </Button>
      <Button size="sm" type="button" variant="ghost" disabled={pending} onClick={onReset}>
        恢复默认
      </Button>
      <AiActionFeedback result={result} className="min-w-0" />
    </div>
  );
}

export function EditorSettingsForm({ value }: { value: AppSettings["editor"] }) {
  const { pending, result, run } = useSettingsAction();
  const [form, setForm] = useState({
    autosaveIntervalMs: String(value.autosaveIntervalMs),
    fontSize: String(value.fontSize),
    lineHeight: String(value.lineHeight),
    spellcheck: value.spellcheck,
    defaultFocusMode: value.defaultFocusMode,
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveEditorSettings(form));
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="autosave-interval">自动保存间隔（毫秒）</Label>
          <Input
            id="autosave-interval"
            type="number"
            min={500}
            max={10000}
            step={100}
            value={form.autosaveIntervalMs}
            onChange={(e) => setForm({ ...form, autosaveIntervalMs: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="font-size">正文字号（px）</Label>
          <Input
            id="font-size"
            type="number"
            min={12}
            max={22}
            value={form.fontSize}
            onChange={(e) => setForm({ ...form, fontSize: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="line-height">正文行高</Label>
          <Input
            id="line-height"
            type="number"
            min={1.4}
            max={2.4}
            step={0.1}
            value={form.lineHeight}
            onChange={(e) => setForm({ ...form, lineHeight: e.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.spellcheck}
            onChange={(e) => setForm({ ...form, spellcheck: e.target.checked })}
            className="accent-(--color-primary)"
          />
          启用浏览器拼写检查
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.defaultFocusMode}
            onChange={(e) => setForm({ ...form, defaultFocusMode: e.target.checked })}
            className="accent-(--color-primary)"
          />
          打开写作台时默认进入专注模式
        </label>
      </div>
      <SectionActions
        pending={pending}
        result={result}
        onReset={() =>
          run(async () => {
            const r = await resetSettingsSection("editor");
            if (r.ok) {
              const d = DEFAULT_SETTINGS.editor;
              setForm({
                autosaveIntervalMs: String(d.autosaveIntervalMs),
                fontSize: String(d.fontSize),
                lineHeight: String(d.lineHeight),
                spellcheck: d.spellcheck,
                defaultFocusMode: d.defaultFocusMode,
              });
            }
            return r;
          })
        }
      />
    </form>
  );
}

const PROVIDER_OPTIONS = [
  { value: "", label: "跟随环境变量（默认）" },
  { value: "openai-compatible", label: "OpenAI 兼容网关（如 DeepSeek）" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "mock", label: "本地 mock（离线）" },
];

export function AiSettingsForm({ value }: { value: AppSettings["ai"] }) {
  const { pending, result, run } = useSettingsAction();
  const [testResult, setTestResult] = useState<SettingsActionResult | null>(null);
  const [testing, startTesting] = useTransition();
  const [form, setForm] = useState({
    provider: value.provider,
    baseUrl: value.baseUrl,
    model: value.model,
    timeoutMs: value.timeoutMs === null ? "" : String(value.timeoutMs),
    mockFallback: value.mockFallback,
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAiSettings(form));
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ai-provider">Provider</Label>
          <Select
            id="ai-provider"
            className="w-full"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value as typeof form.provider })}
          >
            {PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-model">模型（留空跟随环境变量/默认）</Label>
          <Input
            id="ai-model"
            placeholder="如 deepseek-v4-flash"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-base-url">Base URL（仅 OpenAI 兼容网关，留空跟随环境变量）</Label>
          <Input
            id="ai-base-url"
            placeholder="https://api.deepseek.com"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-timeout">请求超时（毫秒，留空为 30000）</Label>
          <Input
            id="ai-timeout"
            type="number"
            min={1000}
            max={120000}
            step={1000}
            placeholder="30000"
            value={form.timeoutMs}
            onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.mockFallback}
          onChange={(e) => setForm({ ...form, mockFallback: e.target.checked })}
          className="accent-(--color-primary)"
        />
        未配置密钥或真实 AI 失败时降级本地 mock（关闭后将直接报错，不产生 mock 内容）
      </label>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="secondary"
          disabled={testing}
          onClick={() => {
            setTestResult(null);
            startTesting(async () => {
              try {
                setTestResult(await testAiConnection());
              } catch {
                setTestResult({ ok: false, message: "连接测试请求失败。", tone: "danger" });
              }
            });
          }}
        >
          {testing ? "测试中…" : "测试连接"}
        </Button>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await resetSettingsSection("ai");
              if (r.ok) {
                const d = DEFAULT_SETTINGS.ai;
                setForm({
                  provider: d.provider,
                  baseUrl: d.baseUrl,
                  model: d.model,
                  timeoutMs: d.timeoutMs === null ? "" : String(d.timeoutMs),
                  mockFallback: d.mockFallback,
                });
              }
              return r;
            })
          }
        >
          恢复默认
        </Button>
        <AiActionFeedback result={result ?? testResult} className="min-w-0" />
      </div>
    </form>
  );
}

export function AppearanceSettingsForm({ value }: { value: AppSettings["appearance"] }) {
  const { pending, result, run } = useSettingsAction();
  const [form, setForm] = useState({ theme: value.theme, motion: value.motion });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAppearanceSettings(form));
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="theme">主题跟随策略</Label>
          <Select
            id="theme"
            className="w-full"
            value={form.theme}
            onChange={(e) => setForm({ ...form, theme: e.target.value as typeof form.theme })}
          >
            <option value="light">始终浅色（默认）</option>
            <option value="system">跟随系统（暗色主题尚未提供，当前仍渲染浅色）</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="motion">动效偏好</Label>
          <Select
            id="motion"
            className="w-full"
            value={form.motion}
            onChange={(e) => setForm({ ...form, motion: e.target.value as typeof form.motion })}
          >
            <option value="system">跟随系统 prefers-reduced-motion（默认）</option>
            <option value="reduced">始终减少动效</option>
          </Select>
        </div>
      </div>
      <SectionActions
        pending={pending}
        result={result}
        onReset={() =>
          run(async () => {
            const r = await resetSettingsSection("appearance");
            if (r.ok) setForm({ ...DEFAULT_SETTINGS.appearance });
            return r;
          })
        }
      />
    </form>
  );
}
