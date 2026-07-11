import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { BOOTSTRAP_SQL } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import { articles, articleVersions, articleDrafts } from "@/db/schema";
import {
  saveDraftCore,
  getDraft,
  saveVersionCore,
  resolveInitialContent,
  type MuseDb,
} from "@/lib/drafts";

// 独立内存库：与运行时 better-sqlite3 完全隔离
const sqlite = new Database(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec(BOOTSTRAP_SQL);
const db = drizzle(sqlite, { schema }) as unknown as MuseDb;

async function createArticle(title = "测试文章") {
  const [a] = await db.insert(articles).values({ title, status: "draft" }).returning();
  return a.id;
}

describe("saveDraftCore（自动保存去重）", () => {
  test("首次保存创建工作稿", async () => {
    const id = await createArticle();
    const r = await saveDraftCore(db, id, "<p>第一稿</p>");
    expect(r.saved).toBe(true);
    const draft = await getDraft(db, id);
    expect(draft?.contentHtml).toBe("<p>第一稿</p>");
    expect(draft?.contentText).toContain("第一稿");
  });

  test("内容相同的重复保存被跳过", async () => {
    const id = await createArticle();
    await saveDraftCore(db, id, "<p>同一内容</p>");
    const r2 = await saveDraftCore(db, id, "<p>同一内容</p>");
    expect(r2.saved).toBe(false);
    const rows = await db
      .select()
      .from(articleDrafts)
      .where(eq(articleDrafts.articleId, id));
    expect(rows.length).toBe(1);
  });

  test("内容变化时覆写同一行，不新增行", async () => {
    const id = await createArticle();
    await saveDraftCore(db, id, "<p>v1</p>");
    const r = await saveDraftCore(db, id, "<p>v2</p>");
    expect(r.saved).toBe(true);
    const rows = await db
      .select()
      .from(articleDrafts)
      .where(eq(articleDrafts.articleId, id));
    expect(rows.length).toBe(1);
    expect(rows[0].contentHtml).toBe("<p>v2</p>");
  });

  test("自动保存不产生版本检查点", async () => {
    const id = await createArticle();
    for (let i = 0; i < 5; i++) {
      await saveDraftCore(db, id, `<p>草稿第 ${i} 次</p>`);
    }
    const versions = await db
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.articleId, id));
    expect(versions.length).toBe(0);
  });
});

describe("saveVersionCore（不可变版本检查点）", () => {
  test("显式保存递增版本号并同步工作稿基线", async () => {
    const id = await createArticle();
    const v1 = await saveVersionCore(db, id, "<p>正式第一版</p>", "初稿");
    expect(v1.versionNo).toBe(1);
    const v2 = await saveVersionCore(db, id, "<p>正式第二版</p>", "");
    expect(v2.versionNo).toBe(2);

    const versions = await db
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.articleId, id));
    expect(versions.length).toBe(2);
    // 历史版本内容不被覆盖
    expect(versions.find((v) => v.versionNo === 1)?.contentHtml).toBe(
      "<p>正式第一版</p>",
    );

    const draft = await getDraft(db, id);
    expect(draft?.contentHtml).toBe("<p>正式第二版</p>");
    expect(draft?.baseVersionId).toBe(v2.versionId);
  });

  test("保存版本后再自动保存，草稿领先于版本", async () => {
    const id = await createArticle();
    await saveVersionCore(db, id, "<p>检查点</p>", "");
    await saveDraftCore(db, id, "<p>检查点之后继续写</p>");
    const versions = await db
      .select()
      .from(articleVersions)
      .where(eq(articleVersions.articleId, id));
    expect(versions.length).toBe(1);
    const draft = await getDraft(db, id);
    expect(draft?.contentHtml).toBe("<p>检查点之后继续写</p>");
  });
});

describe("resolveInitialContent（刷新后的恢复规则）", () => {
  const version = { contentHtml: "<p>版本内容</p>", createdAt: 1000 };

  test("无草稿 → 用最新版本", () => {
    const r = resolveInitialContent(version, null);
    expect(r.contentHtml).toBe("<p>版本内容</p>");
    expect(r.restoredFromDraft).toBe(false);
  });

  test("草稿与版本一致 → 不标记恢复", () => {
    const r = resolveInitialContent(version, {
      contentHtml: "<p>版本内容</p>",
      updatedAt: 2000,
    });
    expect(r.restoredFromDraft).toBe(false);
  });

  test("草稿更新且不同 → 恢复草稿", () => {
    const r = resolveInitialContent(version, {
      contentHtml: "<p>没保存的新内容</p>",
      updatedAt: 2000,
    });
    expect(r.contentHtml).toBe("<p>没保存的新内容</p>");
    expect(r.restoredFromDraft).toBe(true);
  });

  test("草稿落后于版本（如从历史恢复）→ 用版本", () => {
    const r = resolveInitialContent(version, {
      contentHtml: "<p>旧草稿</p>",
      updatedAt: 500,
    });
    expect(r.contentHtml).toBe("<p>版本内容</p>");
    expect(r.restoredFromDraft).toBe(false);
  });

  test("新文章无版本但有草稿 → 恢复草稿", () => {
    const r = resolveInitialContent(null, {
      contentHtml: "<p>只有草稿</p>",
      updatedAt: 100,
    });
    expect(r.contentHtml).toBe("<p>只有草稿</p>");
    expect(r.restoredFromDraft).toBe(true);
  });
});
