import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { BOOTSTRAP_SQL, compatibilityMigrationSql } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import { articleDrafts, articleVersions, articles } from "@/db/schema";
import { saveDraftCore, saveVersionCore, type MuseDb } from "@/lib/drafts";
import {
  ensureActiveCheckpointCore,
  getActiveRevisionCore,
  isDerivativeStale,
} from "@/lib/revisions";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(BOOTSTRAP_SQL);
  return { sqlite, db: drizzle(sqlite, { schema }) as unknown as MuseDb };
}

async function createArticle(db: MuseDb) {
  const [article] = await db.insert(articles).values({ title: "版本契约测试" }).returning();
  return article.id;
}

describe("Active Revision Contract", () => {
  test("没有检查点时为当前工作稿创建不可变版本", async () => {
    const { db } = makeDb();
    const articleId = await createArticle(db);
    await saveDraftCore(db, articleId, "<p>尚未手动保存</p>");

    const checkpoint = await ensureActiveCheckpointCore(db, articleId);
    expect(checkpoint?.versionNo).toBe(1);
    expect(checkpoint?.contentHtml).toBe("<p>尚未手动保存</p>");
    const draft = await db.query.articleDrafts.findFirst({
      where: eq(articleDrafts.articleId, articleId),
    });
    expect(draft?.baseVersionId).toBe(checkpoint?.id);
  });

  test("相同内容复用既有检查点且不增加版本", async () => {
    const { db } = makeDb();
    const articleId = await createArticle(db);
    const first = await saveVersionCore(db, articleId, "<p>相同内容</p>", "v1");
    await saveDraftCore(db, articleId, "<p>临时变化</p>");
    await saveDraftCore(db, articleId, "<p>相同内容</p>");

    const checkpoint = await ensureActiveCheckpointCore(db, articleId);
    expect(checkpoint?.id).toBe(first.versionId);
    const versions = await db
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.articleId, articleId));
    expect(versions).toHaveLength(1);
  });

  test("传入编辑器新内容先同步工作稿再创建检查点", async () => {
    const { db } = makeDb();
    const articleId = await createArticle(db);
    await saveVersionCore(db, articleId, "<p>旧版本</p>", "v1");

    const checkpoint = await ensureActiveCheckpointCore(
      db,
      articleId,
      "<p>编辑器尚未自动保存的新内容</p>",
    );
    expect(checkpoint?.versionNo).toBe(2);
    const active = await getActiveRevisionCore(db, articleId);
    expect(active?.contentHtml).toBe("<p>编辑器尚未自动保存的新内容</p>");
    expect(active?.checkpoint?.id).toBe(checkpoint?.id);
  });

  test("来源缺失或不等于当前检查点时判定过期", () => {
    expect(isDerivativeStale(7, 7)).toBe(false);
    expect(isDerivativeStale(6, 7)).toBe(true);
    expect(isDerivativeStale(null, 7)).toBe(true);
    expect(isDerivativeStale(7, null)).toBe(true);
  });
});

describe("兼容迁移", () => {
  test("bootstrap 本身不在补列前访问旧库缺失的来源列", () => {
    expect(BOOTSTRAP_SQL).not.toContain(
      "CREATE INDEX IF NOT EXISTS idx_variants_source_version",
    );
  });

  test("旧 platform_variants 补 source_version_id 且历史行保留为空", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE articles (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
      CREATE TABLE article_versions (id INTEGER PRIMARY KEY);
      CREATE TABLE platform_variants (
        id INTEGER PRIMARY KEY,
        article_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL
      );
      INSERT INTO articles (id, title) VALUES (1, '旧文章');
      INSERT INTO platform_variants (id, article_id, platform, title, content)
      VALUES (1, 1, 'x', '旧平台稿', '旧内容');
    `);
    const statements = compatibilityMigrationSql({
      articles: ["id", "title"],
      platformVariants: ["id", "article_id", "platform", "title", "content"],
    });
    statements.forEach((statement) => sqlite.exec(statement));

    const columns = sqlite.query("PRAGMA table_info(platform_variants)").all() as {
      name: string;
    }[];
    expect(columns.some((column) => column.name === "source_version_id")).toBe(true);
    const row = sqlite
      .query("SELECT title, source_version_id FROM platform_variants WHERE id = 1")
      .get() as { title: string; source_version_id: number | null };
    expect(row).toEqual({ title: "旧平台稿", source_version_id: null });
  });
});
