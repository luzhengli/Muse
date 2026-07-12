import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, articles } from "@/db";
import { getActiveRevisionCore } from "@/lib/revisions";
import { wrapHtmlDocument } from "@/lib/html-md";

/** 发布助手「下载正文」：导出当前正文（工作稿优先）的完整 HTML 文档 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const articleId = Number(id);
  const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId) });
  if (!article) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }
  const revision = await getActiveRevisionCore(db, articleId);
  const body = revision?.contentHtml ?? "<p></p>";
  const safeName = article.title.replace(/[\\/:*?"<>|]/g, "_") || "muse-article";
  return new NextResponse(wrapHtmlDocument(article.title, body), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.html`,
    },
  });
}
