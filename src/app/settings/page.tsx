import fs from "node:fs/promises";
import path from "node:path";
import { count } from "drizzle-orm";
import {
  db,
  DATA_DIR,
  ASSET_DIR,
  articles,
  articleVersions,
  assets,
  materials,
} from "@/db";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAppSettings } from "@/lib/settings-store";
import { credentialStatus, resolveAiConfig } from "@/lib/settings";
import {
  AiSettingsForm,
  AppearanceSettingsForm,
  EditorSettingsForm,
} from "./forms";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  settings: "设置中心",
  env: "环境变量",
  default: "内置默认",
};

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function safeFileSize(p: string): Promise<number> {
  try {
    return (await fs.stat(p)).size;
  } catch {
    return 0;
  }
}

export default async function SettingsPage() {
  const settings = getAppSettings();
  const effective = resolveAiConfig(settings.ai);
  const creds = credentialStatus();

  const [[ac], [vc], [mc], [asc]] = await Promise.all([
    db.select({ n: count() }).from(articles),
    db.select({ n: count() }).from(articleVersions),
    db.select({ n: count() }).from(materials),
    db.select({ n: count() }).from(assets),
  ]);
  const dbSize = await safeFileSize(path.join(DATA_DIR, "muse.db"));
  let assetFiles = 0;
  let assetBytes = 0;
  try {
    const names = await fs.readdir(ASSET_DIR);
    assetFiles = names.length;
    for (const name of names) {
      assetBytes += await safeFileSize(path.join(ASSET_DIR, name));
    }
  } catch {
    // 资产目录尚未创建
  }

  const effectiveRows = [
    { label: "Provider", ...effective.provider },
    { label: "Base URL", ...effective.baseUrl },
    { label: "模型", ...effective.model },
    { label: "超时", value: `${effective.timeoutMs.value} ms`, source: effective.timeoutMs.source },
  ];

  const credRows = [
    { label: "ANTHROPIC_API_KEY", configured: creds.anthropic },
    { label: "OPENAI_API_KEY", configured: creds.openai },
    { label: "MUSE_AI_API_KEY（OpenAI 兼容）", configured: creds.openaiCompatible },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">设置</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          编辑器、AI 与外观偏好保存在本地 SQLite；密钥只从环境变量读取，不会写入数据库或日志。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>编辑器</CardTitle>
          <CardDescription>
            写作台的自动保存节奏与排版偏好；修改后在写作台下次打开时生效，不影响正在编辑的文章。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EditorSettingsForm value={settings.editor} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription>
            非敏感项的优先级为「设置中心 &gt; 环境变量 &gt; 内置默认」；密钥仅从环境变量读取。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AiSettingsForm value={settings.ai} />

          <div className="space-y-2 rounded-(--radius-control) bg-(--color-muted-bg) p-3">
            <div className="text-xs font-semibold">当前生效配置</div>
            <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
              {effectiveRows.map((row) => (
                <div key={row.label} className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-(--color-muted)">{row.label}：</span>
                  <span className="truncate font-mono">{row.value}</span>
                  <Badge tone={row.source === "settings" ? "primary" : undefined}>
                    {SOURCE_LABEL[row.source]}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-1.5 pt-1 text-xs sm:grid-cols-2">
              {credRows.map((row) => (
                <div key={row.label} className="flex items-center gap-1.5">
                  <span className="text-(--color-muted)">{row.label}</span>
                  <Badge tone={row.configured ? "success" : "warning"}>
                    {row.configured ? "已配置（来自环境变量，已脱敏）" : "未配置"}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-(--color-muted)">
              如需配置或更换密钥，请编辑项目根目录的 .env / .env.local 后重启应用；设置页不提供密钥输入，避免明文落库。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>外观与交互</CardTitle>
          <CardDescription>主题跟随策略与动效偏好，保存后即时生效。</CardDescription>
        </CardHeader>
        <CardContent>
          <AppearanceSettingsForm value={settings.appearance} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>数据</CardTitle>
          <CardDescription>本地优先：全部数据保存在下方目录，可随时整体导出。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-(--radius-control) bg-(--color-muted-bg) p-3">
              <div className="text-xs text-(--color-muted)">数据目录</div>
              <div className="mt-1 break-all font-mono text-xs">{DATA_DIR}</div>
            </div>
            <div className="rounded-(--radius-control) bg-(--color-muted-bg) p-3">
              <div className="text-xs text-(--color-muted)">数据库 muse.db</div>
              <div className="mt-1 text-xs">
                {fmtBytes(dbSize)} · 文章 {ac.n} / 版本 {vc.n} / 素材 {mc.n}
              </div>
            </div>
            <div className="rounded-(--radius-control) bg-(--color-muted-bg) p-3">
              <div className="text-xs text-(--color-muted)">图片资产</div>
              <div className="mt-1 text-xs">
                {assetFiles} 个文件 · {fmtBytes(assetBytes)} · 资产记录 {asc.n} 条
              </div>
            </div>
            <div className="rounded-(--radius-control) bg-(--color-muted-bg) p-3">
              <div className="text-xs text-(--color-muted)">导出</div>
              <a
                href="/api/export"
                className="mt-1 inline-block text-xs text-(--color-primary) underline underline-offset-2"
              >
                下载全部数据（JSON，不含密钥）
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
