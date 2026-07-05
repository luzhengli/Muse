import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, articles, packagings, assets, articleVersions, topics } from "@/db";
import {
  generatePackaging,
  adoptTitle,
  uploadAsset,
  deleteAsset,
} from "@/actions/packaging";
import { ArticleHeader } from "@/components/article-header";
import { ArticleTabs } from "@/components/article-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = {
  cover: "封面",
  illustration: "配图",
  other: "其他",
};

export default async function PackagingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const articleId = Number(id);
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });
  if (!article) notFound();

  const packs = await db
    .select()
    .from(packagings)
    .where(eq(packagings.articleId, articleId))
    .orderBy(desc(packagings.createdAt));
  const latestPack = packs[0];
  const assetRows = await db
    .select()
    .from(assets)
    .where(eq(assets.articleId, articleId))
    .orderBy(desc(assets.createdAt));
  const versionRows = await db
    .select({ id: articleVersions.id, versionNo: articleVersions.versionNo })
    .from(articleVersions)
    .where(eq(articleVersions.articleId, articleId));
  const versionNo = new Map(versionRows.map((v) => [v.id, v.versionNo]));
  const topic = article.topicId
    ? await db.query.topics.findFirst({ where: eq(topics.id, article.topicId) })
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <ArticleHeader
        articleId={articleId}
        title={article.title}
        status={article.status}
        topicTitle={topic?.title}
      />
      <ArticleTabs articleId={articleId} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-(--color-muted)">
          基于最新版本生成标题候选、摘要、封面与配图提示词、图文卡片结构，并管理本地图片。
        </p>
        <form
          action={async () => {
            "use server";
            await generatePackaging(articleId);
          }}
        >
          <Button>{latestPack ? "重新生成包装物料" : "生成包装物料"}</Button>
        </form>
      </div>

      {latestPack ? (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>标题候选</CardTitle>
              <CardDescription>
                关联版本 v{latestPack.versionId ? versionNo.get(latestPack.versionId) ?? "-" : "-"} ·{" "}
                {fmtTime(latestPack.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {latestPack.titleCandidates.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-(--radius-control) border border-(--color-border) p-2"
                >
                  <span className="flex-1 text-sm">{t}</span>
                  {t === article.title ? (
                    <Badge tone="success">使用中</Badge>
                  ) : (
                    <form
                      action={async () => {
                        "use server";
                        await adoptTitle(articleId, t);
                      }}
                    >
                      <Button size="sm" variant="ghost">
                        采用
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>摘要</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{latestPack.summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>封面图提示词</CardTitle>
              <CardDescription>可粘贴到任意图像生成工具。</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="rounded-(--radius-control) bg-(--color-muted-bg) p-3 text-xs leading-relaxed">
                {latestPack.coverPrompt}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>配图提示词</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {latestPack.imagePrompts.map((p, i) => (
                <p
                  key={i}
                  className="rounded-(--radius-control) bg-(--color-muted-bg) p-3 text-xs leading-relaxed"
                >
                  {p}
                </p>
              ))}
            </CardContent>
          </Card>

          {latestPack.cardStructure && (
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>图文卡片结构</CardTitle>
                <CardDescription>适用于小红书等图文平台的卡片拆分。</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-4 gap-2">
                {latestPack.cardStructure.cards.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-(--radius-control) border border-(--color-border) p-3"
                  >
                    <div className="text-xs font-semibold text-(--color-primary)">
                      {c.heading}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed">{c.body}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            还没有包装物料，点击右上角生成。
          </CardContent>
        </Card>
      )}

      {/* 本地图片资源 */}
      <Card>
        <CardHeader>
          <CardTitle>本地图片资源（{assetRows.length}）</CardTitle>
          <CardDescription>
            用提示词在外部工具生成图片后，上传到这里与文章关联，保存在 data/assets。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={uploadAsset} className="flex gap-2">
            <input type="hidden" name="articleId" value={articleId} />
            <Input type="file" name="file" required accept="image/*" className="flex-1 pt-1.5" />
            <Select name="kind" className="w-28">
              <option value="cover">封面</option>
              <option value="illustration">配图</option>
              <option value="other">其他</option>
            </Select>
            <Button>上传</Button>
          </form>
          <div className="grid grid-cols-3 gap-2">
            {assetRows.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-(--radius-control) border border-(--color-border) p-2 text-xs"
              >
                <Badge tone="primary">{kindLabel[a.kind]}</Badge>
                <span className="line-clamp-1 flex-1">{a.fileName}</span>
                <form
                  action={async () => {
                    "use server";
                    await deleteAsset(a.id, articleId);
                  }}
                >
                  <Button size="sm" variant="ghost">
                    删除
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
