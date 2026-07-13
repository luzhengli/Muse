import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, creations, platformOutputs, publications } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { outputFormatLabel } from "@/lib/labels";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * v1.0 创作项目列表（feat-031 过渡期入口）。
 * 尚未进入全局导航：创建向导与导航切换随 feat-034 收口，
 * 现阶段由种子数据（bun run db:seed）与直接访问 /creations 承载验证。
 */
export default async function CreationsPage() {
  const rows = await db.select().from(creations).orderBy(desc(creations.updatedAt));
  const outputs = await db.select().from(platformOutputs);
  const published = await db.select().from(publications);
  const outputsByCreation = new Map<number, typeof outputs>();
  for (const output of outputs) {
    const list = outputsByCreation.get(output.creationId) ?? [];
    list.push(output);
    outputsByCreation.set(output.creationId, list);
  }
  const publishedOutputIds = new Set(published.map((p) => p.outputId));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">创作项目</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          每个项目产出可直接发布的平台作品；作品按平台独立编辑、独立检查。
        </p>
      </div>

      {rows.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-(--color-muted)">
            还没有创作项目。可运行 <code className="rounded bg-(--color-muted-bg) px-1">bun run db:seed</code>{" "}
            写入演示数据（创建向导随后续版本提供）。
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((creation) => {
          const creationOutputs = outputsByCreation.get(creation.id) ?? [];
          return (
            <Link
              key={creation.id}
              href={`/creations/${creation.id}`}
              className="interactive-motion block"
            >
              <Card className="h-full hover:border-(--color-primary)">
                <CardHeader>
                  <CardTitle>{creation.workingTitle}</CardTitle>
                  <CardDescription>
                    目标平台：
                    {creation.targetPlatforms
                      .map((p) =>
                        p === "x" ? "X" : p === "xiaohongshu" ? "小红书" : "公众号",
                      )
                      .join(" · ") || "未选择"}
                    　·　更新于 {fmtTime(creation.updatedAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {creationOutputs.length === 0 && (
                    <span className="text-xs text-(--color-muted)">还没有平台作品</span>
                  )}
                  {creationOutputs.map((output) => {
                    const label = outputFormatLabel[output.format];
                    return (
                      <Badge
                        key={output.id}
                        tone={publishedOutputIds.has(output.id) ? "success" : "default"}
                      >
                        {label ? `${label.platform} ${label.format}` : output.format}
                        {publishedOutputIds.has(output.id) ? " · 已发布" : ""}
                      </Badge>
                    );
                  })}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
