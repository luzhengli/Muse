import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { BOOTSTRAP_SQL } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import { creations, sourceDocuments, sourceRevisions } from "@/db/schema";
import {
  createCreationCore,
  ensureSourceDocumentCore,
  getCreationCore,
  saveSourceDraftCore,
  saveSourceRevisionCore,
  updateCreationCore,
} from "@/lib/creations";
import type { MuseDb } from "@/lib/drafts";

// 独立内存库：与运行时 better-sqlite3 完全隔离
const sqlite = new Database(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec(BOOTSTRAP_SQL);
const db = drizzle(sqlite, { schema }) as unknown as MuseDb;

async function newCreation(title = "测试创作") {
  const result = await createCreationCore(db, {
    workingTitle: title,
    targetPlatforms: ["x", "wechat"],
  });
  if (!result.ok) throw new Error(result.error);
  return result.value.creationId;
}

describe("createCreationCore（创作项目容器）", () => {
  test("创建成功：工作标题 + 目标平台集合 + 假设登记", async () => {
    const result = await createCreationCore(db, {
      workingTitle: "  多平台项目  ",
      targetPlatforms: ["x", "xiaohongshu", "x"],
      hypothesis: "Thread 更能带来讨论",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = await db.query.creations.findFirst({
      where: eq(creations.id, result.value.creationId),
    });
    expect(row?.workingTitle).toBe("多平台项目");
    expect(row?.targetPlatforms).toEqual(["x", "xiaohongshu"]); // 去重
    expect(row?.hypothesis).toBe("Thread 更能带来讨论");
  });

  test("空标题 / 空平台 / 非法平台被拒绝且零写入", async () => {
    const before = (await db.select().from(creations)).length;
    const noTitle = await createCreationCore(db, {
      workingTitle: "   ",
      targetPlatforms: ["x"],
    });
    expect(noTitle.ok).toBe(false);
    const noPlatform = await createCreationCore(db, {
      workingTitle: "有标题",
      targetPlatforms: [],
    });
    expect(noPlatform.ok).toBe(false);
    const badPlatform = await createCreationCore(db, {
      workingTitle: "有标题",
      targetPlatforms: ["douyin" as never],
    });
    expect(badPlatform.ok).toBe(false);
    expect((await db.select().from(creations)).length).toBe(before);
  });

  test("updateCreationCore 局部更新并校验", async () => {
    const id = await newCreation();
    const ok = await updateCreationCore(db, id, {
      workingTitle: "改名后",
      targetPlatforms: ["xiaohongshu"],
    });
    expect(ok.ok).toBe(true);
    const row = await db.query.creations.findFirst({ where: eq(creations.id, id) });
    expect(row?.workingTitle).toBe("改名后");
    expect(row?.targetPlatforms).toEqual(["xiaohongshu"]);

    const bad = await updateCreationCore(db, id, { targetPlatforms: [] });
    expect(bad.ok).toBe(false);
    const missing = await updateCreationCore(db, 99999, { workingTitle: "x" });
    expect(missing.ok).toBe(false);
  });
});

describe("通用稿（0..1 + 不可变修订）", () => {
  test("ensureSourceDocumentCore 幂等：每项目至多一份", async () => {
    const id = await newCreation();
    const first = await ensureSourceDocumentCore(db, id);
    const second = await ensureSourceDocumentCore(db, id);
    expect(first?.id).toBe(second!.id);
    const docs = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.creationId, id));
    expect(docs.length).toBe(1);
    expect(await ensureSourceDocumentCore(db, 99999)).toBeNull();
  });

  test("工作稿去重：相同内容不重复写", async () => {
    const id = await newCreation();
    const r1 = await saveSourceDraftCore(db, id, "<p>初稿</p>");
    expect(r1.saved).toBe(true);
    const r2 = await saveSourceDraftCore(db, id, "<p>初稿</p>");
    expect(r2.saved).toBe(false);
  });

  test("修订不可变：内容相同复用，变化才产生新修订号并同步基线", async () => {
    const id = await newCreation();
    const r1 = await saveSourceRevisionCore(db, id, "<p>第一版</p>", "初稿");
    expect(r1).toMatchObject({ revisionNo: 1, reused: false });

    const again = await saveSourceRevisionCore(db, id);
    expect(again).toMatchObject({ revisionId: r1!.revisionId, reused: true });

    const r2 = await saveSourceRevisionCore(db, id, "<p>第二版</p>");
    expect(r2).toMatchObject({ revisionNo: 2, reused: false });

    const revisions = await db.select().from(sourceRevisions);
    const mine = revisions.filter((r) => [r1!.revisionId, r2!.revisionId].includes(r.id));
    expect(mine.length).toBe(2);
    expect(mine.find((r) => r.revisionNo === 1)?.contentHtml).toBe("<p>第一版</p>");

    const detail = await getCreationCore(db, id);
    expect(detail?.sourceDocument?.baseRevisionId).toBe(r2!.revisionId);
    expect(detail?.sourceDocument?.contentHtml).toBe("<p>第二版</p>");
  });
});
