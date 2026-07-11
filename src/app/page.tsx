import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, articles } from "@/db";
import { OnboardingCard } from "@/components/onboarding-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAppSettings } from "@/lib/settings-store";
import { computeReadiness, getReadinessFactsCore, type Readiness } from "@/lib/readiness";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PendingItem {
  articleId: number;
  title: string;
  updatedAt: number;
  readiness: Readiness;
}

export default async function Home() {
  const settings = getAppSettings();
  const recent = await db
    .select()
    .from(articles)
    .orderBy(desc(articles.updatedAt))
    .limit(4);

  const items: PendingItem[] = [];
  for (const article of recent) {
    const facts = await getReadinessFactsCore(db, article.id);
    if (!facts) continue;
    items.push({
      articleId: article.id,
      title: article.title,
      updatedAt: article.updatedAt,
      readiness: computeReadiness(facts),
    });
  }
  const latest = items[0] ?? null;
  const pending = items.slice(1, 4);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">首页</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          接着上次继续，或者开始一次新创作。系统会替你记住每一步。
        </p>
      </div>

      {!settings.onboarding.completed && <OnboardingCard />}

      {/* 首屏两个主行动 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {latest ? (
          <Link href={`/articles/${latest.articleId}`} className="block">
            <Card className="h-full transition-colors hover:border-(--color-primary)">
              <CardContent className="flex h-full flex-col gap-2 p-5">
                <div className="text-xs font-semibold text-(--color-muted)">
                  继续上次创作
                </div>
                <div className="line-clamp-1 text-base font-bold">{latest.title}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge tone={latest.readiness.readyToPublish ? "success" : "warning"}>
                    {latest.readiness.state}
                  </Badge>
                  <span className="text-(--color-muted)">
                    下一步：{latest.readiness.nextAction.label}
                  </span>
                </div>
                <div className="mt-auto text-[10px] text-(--color-muted)">
                  上次编辑 {fmtTime(latest.updatedAt)}
                </div>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Card>
            <CardContent className="flex h-full flex-col justify-center gap-2 p-5 text-sm text-(--color-muted)">
              还没有进行中的创作。从右边开始你的第一篇吧。
            </CardContent>
          </Card>
        )}

        <Link href="/create" className="block">
          <Card className="h-full border-(--color-primary) transition-colors hover:bg-(--color-primary-soft)">
            <CardContent className="flex h-full flex-col justify-center gap-2 p-5">
              <div className="text-base font-bold text-(--color-primary)">
                开始一次新创作
              </div>
              <p className="text-xs text-(--color-muted)">
                从一个想法、一份资料或过往经验开始，系统会一步步引导你。
              </p>
              <Button className="mt-1 w-fit" size="sm">
                开始 →
              </Button>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 待处理创作（最多 3 个） */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-(--color-muted)">
            其他进行中的创作
          </div>
          {pending.map((item) => (
            <Link
              key={item.articleId}
              href={`/articles/${item.articleId}`}
              className="block rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) p-3 transition-colors hover:border-(--color-primary)"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="line-clamp-1 min-w-0 flex-1 text-sm font-medium">
                  {item.title}
                </span>
                <Badge tone={item.readiness.readyToPublish ? "success" : "warning"}>
                  {item.readiness.state}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-(--color-muted)">
                下一步：{item.readiness.nextAction.label} · {fmtTime(item.updatedAt)}
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-(--color-muted)">
        素材、选题、发布与复盘都在左侧导航，随时可以回来。
      </p>
    </div>
  );
}
