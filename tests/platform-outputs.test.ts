import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { BOOTSTRAP_SQL, compatibilityMigrationSql } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import {
  assets,
  creations,
  outputAssets,
  platformOutputRevisions,
  platformOutputs,
  publications,
} from "@/db/schema";
import { createCreationCore, saveSourceRevisionCore } from "@/lib/creations";
import type { MuseDb } from "@/lib/drafts";
import {
  addPerformanceSnapshotCore,
  createPlatformOutputCore,
  createPublicationCore,
  getOutputDetailCore,
  saveOutputRevisionCore,
  updatePublicationMetaCore,
} from "@/lib/platform-outputs";
import { getRuleSet } from "@/lib/platform-rules";
import { seedCore } from "@/lib/seed";
import { resetDatabase } from "../scripts/reset-db";
import { nowUnix } from "@/lib/utils";

// 独立内存库：与运行时 better-sqlite3 完全隔离
const sqlite = new Database(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON;");
sqlite.exec(BOOTSTRAP_SQL);
const db = drizzle(sqlite, { schema }) as unknown as MuseDb;

async function newCreation(platforms: schema.Platform[] = ["x", "xiaohongshu", "wechat"]) {
  const result = await createCreationCore(db, {
    workingTitle: "作品测试项目",
    targetPlatforms: platforms,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value.creationId;
}

async function newPoolAsset(creationId: number, name = "图片.png") {
  const [asset] = await db
    .insert(assets)
    .values({
      creationId,
      kind: "other",
      fileName: name,
      filePath: `data/assets/test-${name}`,
    })
    .returning();
  return asset.id;
}

function xhsPayload(imageIds: number[], title = "标题") {
  return {
    type: "xiaohongshu_image_note",
    schemaVersion: 1,
    title,
    body: "正文内容",
    topics: ["测试"],
    images: imageIds.map((assetId) => ({ assetId })),
  };
}

describe("createPlatformOutputCore（payload 校验落库 + rules_version）", () => {
  test("非法 payload 拒绝且零写入", async () => {
    const creationId = await newCreation();
    const beforeOutputs = (await db.select().from(platformOutputs)).length;
    const beforeRevisions = (await db.select().from(platformOutputRevisions)).length;
    const bad = await createPlatformOutputCore(db, {
      creationId,
      payload: { type: "x_single_post", schemaVersion: 2, text: "错误版本" },
    });
    expect(bad.ok).toBe(false);
    expect((await db.select().from(platformOutputs)).length).toBe(beforeOutputs);
    expect((await db.select().from(platformOutputRevisions)).length).toBe(beforeRevisions);
  });

  test("平台由格式推导；输出与修订都记录生成时 rulesVersion", async () => {
    const creationId = await newCreation();
    const result = await createPlatformOutputCore(db, {
      creationId,
      payload: { type: "x_thread", schemaVersion: 1, posts: [{ text: "1/2" }, { text: "2/2" }] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = await db.query.platformOutputs.findFirst({
      where: eq(platformOutputs.id, result.value.outputId),
    });
    expect(output?.platform).toBe("x");
    expect(output?.format).toBe("x_thread");
    expect(output?.rulesVersion).toBe(getRuleSet("x_thread").rulesVersion);
    expect(output?.activeRevisionId).toBe(result.value.revisionId);
    const revision = await db.query.platformOutputRevisions.findFirst({
      where: eq(platformOutputRevisions.id, result.value.revisionId),
    });
    expect(revision?.revisionNo).toBe(1);
    expect(revision?.schemaVersion).toBe(1);
    expect(revision?.rulesVersion).toBe(getRuleSet("x_thread").rulesVersion);
  });

  test("资产池边界：引用不存在或他人项目的资产被拒绝", async () => {
    const creationId = await newCreation();
    const otherCreation = await newCreation();
    const otherAsset = await newPoolAsset(otherCreation);

    const ghost = await createPlatformOutputCore(db, {
      creationId,
      payload: xhsPayload([99999]),
    });
    expect(ghost.ok).toBe(false);
    if (!ghost.ok) expect(ghost.error).toContain("不存在");

    const stolen = await createPlatformOutputCore(db, {
      creationId,
      payload: xhsPayload([otherAsset]),
    });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error).toContain("不属于该创作项目");
  });

  test("output_assets 由 payload 派生：首图/正文图角色、顺序与 alt", async () => {
    const creationId = await newCreation();
    const img1 = await newPoolAsset(creationId, "a.png");
    const img2 = await newPoolAsset(creationId, "b.png");
    const result = await createPlatformOutputCore(db, {
      creationId,
      payload: xhsPayload([img1, img2]),
      assetMeta: { [img1]: { altText: "首图说明" } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = await db
      .select()
      .from(outputAssets)
      .where(eq(outputAssets.outputRevisionId, result.value.revisionId));
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.assetId === img1)).toMatchObject({
      role: "first_image",
      orderIndex: 0,
      altText: "首图说明",
    });
    expect(rows.find((r) => r.assetId === img2)).toMatchObject({
      role: "body_image",
      orderIndex: 1,
      altText: "",
    });
  });

  test("Thread 附件带 postIndex；来源通用稿修订必须属于本项目", async () => {
    const creationId = await newCreation();
    const media = await newPoolAsset(creationId, "thread.png");
    const revision = await saveSourceRevisionCore(db, creationId, "<p>母版</p>");
    const result = await createPlatformOutputCore(db, {
      creationId,
      sourceRevisionId: revision!.revisionId,
      payload: {
        type: "x_thread",
        schemaVersion: 1,
        posts: [{ text: "第一条" }, { text: "第二条", media: [{ assetId: media, kind: "image" }] }],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rows = await db
      .select()
      .from(outputAssets)
      .where(eq(outputAssets.outputRevisionId, result.value.revisionId));
    expect(rows[0]).toMatchObject({ role: "post_media", postIndex: 1, orderIndex: 0 });

    const foreign = await newCreation();
    const foreignRevision = await saveSourceRevisionCore(db, foreign, "<p>别家</p>");
    const crossRef = await createPlatformOutputCore(db, {
      creationId,
      sourceRevisionId: foreignRevision!.revisionId,
      payload: { type: "x_single_post", schemaVersion: 1, text: "越权引用" },
    });
    expect(crossRef.ok).toBe(false);
  });
});

describe("saveOutputRevisionCore（不可变修订链）", () => {
  test("内容未变复用；变化产生新修订并推进活动指针，旧修订保留", async () => {
    const creationId = await newCreation();
    const created = await createPlatformOutputCore(db, {
      creationId,
      payload: { type: "x_single_post", schemaVersion: 1, text: "第一版" },
    });
    if (!created.ok) throw new Error("setup 失败");
    const outputId = created.value.outputId;

    const same = await saveOutputRevisionCore(db, outputId, {
      type: "x_single_post",
      schemaVersion: 1,
      text: "第一版",
    });
    expect(same.ok && same.value.reused).toBe(true);

    const changed = await saveOutputRevisionCore(db, outputId, {
      type: "x_single_post",
      schemaVersion: 1,
      text: "第二版",
    });
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.revisionNo).toBe(2);
    const output = await db.query.platformOutputs.findFirst({
      where: eq(platformOutputs.id, outputId),
    });
    expect(output?.activeRevisionId).toBe(changed.value.revisionId);
    const chain = await db
      .select()
      .from(platformOutputRevisions)
      .where(eq(platformOutputRevisions.outputId, outputId));
    expect(chain.length).toBe(2);
    expect(JSON.parse(chain.find((r) => r.revisionNo === 1)!.payloadJson).text).toBe("第一版");
  });

  test("仅 alt 变化也产生新修订（发布快照的资产元数据不可被事后篡改）", async () => {
    const creationId = await newCreation();
    const img = await newPoolAsset(creationId);
    const created = await createPlatformOutputCore(db, {
      creationId,
      payload: xhsPayload([img]),
      assetMeta: { [img]: { altText: "原说明" } },
    });
    if (!created.ok) throw new Error("setup 失败");
    const altOnly = await saveOutputRevisionCore(
      db,
      created.value.outputId,
      xhsPayload([img]),
      { assetMeta: { [img]: { altText: "新说明" } } },
    );
    expect(altOnly.ok).toBe(true);
    if (!altOnly.ok) return;
    expect(altOnly.value.reused).toBe(false);
    expect(altOnly.value.revisionNo).toBe(2);
    // 未指定 alt 时从上一修订继承
    const inherit = await saveOutputRevisionCore(
      db,
      created.value.outputId,
      xhsPayload([img], "换个标题"),
    );
    expect(inherit.ok).toBe(true);
    if (!inherit.ok) return;
    const rows = await db
      .select()
      .from(outputAssets)
      .where(eq(outputAssets.outputRevisionId, inherit.value.revisionId));
    expect(rows[0].altText).toBe("新说明");
  });

  test("作品类型不可更改；非法 payload 不影响修订链", async () => {
    const creationId = await newCreation();
    const created = await createPlatformOutputCore(db, {
      creationId,
      payload: { type: "x_single_post", schemaVersion: 1, text: "原文" },
    });
    if (!created.ok) throw new Error("setup 失败");
    const switched = await saveOutputRevisionCore(db, created.value.outputId, {
      type: "x_thread",
      schemaVersion: 1,
      posts: [{ text: "换类型" }],
    });
    expect(switched.ok).toBe(false);
    const invalid = await saveOutputRevisionCore(db, created.value.outputId, {
      type: "x_single_post",
      schemaVersion: 1,
      media: [{ assetId: -1 }],
    });
    expect(invalid.ok).toBe(false);
    const chain = await db
      .select()
      .from(platformOutputRevisions)
      .where(eq(platformOutputRevisions.outputId, created.value.outputId));
    expect(chain.length).toBe(1);
  });
});

describe("发布记录（冻结快照 + 可编辑元数据，FR-5.1/FR-1.4）", () => {
  test("检查未通过：默认阻断并回显阻断项；显式带风险发布则记录原因", async () => {
    const creationId = await newCreation();
    const noImages = await createPlatformOutputCore(db, {
      creationId,
      payload: xhsPayload([]),
    });
    if (!noImages.ok) throw new Error("setup 失败");

    const blocked = await createPublicationCore(db, { outputId: noImages.value.outputId });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.blockers?.some((b) => b.message.includes("缺少图片"))).toBe(true);
    }

    const risky = await createPublicationCore(db, {
      outputId: noImages.value.outputId,
      acceptRisk: "图片将在平台后台手动补",
    });
    expect(risky.ok).toBe(true);
    if (!risky.ok) return;
    const row = await db.query.publications.findFirst({
      where: eq(publications.id, risky.value.publicationId),
    });
    expect(row?.publishedWithRisk).toBe(1);
    expect(row?.riskReason).toContain("手动补");
  });

  test("发布冻结活动修订；之后的新修订不影响已有发布记录", async () => {
    const creationId = await newCreation();
    const created = await createPlatformOutputCore(db, {
      creationId,
      payload: { type: "x_single_post", schemaVersion: 1, text: "发布版本" },
    });
    if (!created.ok) throw new Error("setup 失败");
    const published = await createPublicationCore(db, {
      outputId: created.value.outputId,
      url: "https://x.com/example/status/42",
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.value.outputRevisionId).toBe(created.value.revisionId);

    await saveOutputRevisionCore(db, created.value.outputId, {
      type: "x_single_post",
      schemaVersion: 1,
      text: "发布后又改了",
    });
    const row = await db.query.publications.findFirst({
      where: eq(publications.id, published.value.publicationId),
    });
    expect(row?.outputRevisionId).toBe(created.value.revisionId);
    expect(row?.publishedWithRisk).toBe(0);
  });

  test("链接可留空后补；元数据可编辑而快照指向不变；非法链接拒绝", async () => {
    const creationId = await newCreation();
    const created = await createPlatformOutputCore(db, {
      creationId,
      payload: { type: "x_single_post", schemaVersion: 1, text: "先发布后补链接" },
    });
    if (!created.ok) throw new Error("setup 失败");
    const published = await createPublicationCore(db, { outputId: created.value.outputId });
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const badUrl = await updatePublicationMetaCore(db, published.value.publicationId, {
      url: "不是链接",
    });
    expect(badUrl.ok).toBe(false);

    const fixed = await updatePublicationMetaCore(db, published.value.publicationId, {
      url: "https://x.com/example/status/99",
      note: "补录",
      publishedAt: nowUnix() - 3600,
    });
    expect(fixed.ok).toBe(true);
    const row = await db.query.publications.findFirst({
      where: eq(publications.id, published.value.publicationId),
    });
    expect(row?.url).toBe("https://x.com/example/status/99");
    expect(row?.note).toBe("补录");
    expect(row?.outputRevisionId).toBe(created.value.revisionId);
  });

  test("表现快照：口径天数按发布时间计算，同一发布可多快照", async () => {
    const creationId = await newCreation();
    const created = await createPlatformOutputCore(db, {
      creationId,
      payload: { type: "x_single_post", schemaVersion: 1, text: "快照口径" },
    });
    if (!created.ok) throw new Error("setup 失败");
    const publishedAt = nowUnix() - 7 * 86400;
    const published = await createPublicationCore(db, {
      outputId: created.value.outputId,
      publishedAt,
    });
    if (!published.ok) throw new Error("setup 失败");

    const day1 = await addPerformanceSnapshotCore(db, {
      publicationId: published.value.publicationId,
      metrics: { 浏览: 100 },
      capturedAt: publishedAt + 86400,
    });
    expect(day1.ok && day1.value.daysSincePublish).toBe(1);
    const day7 = await addPerformanceSnapshotCore(db, {
      publicationId: published.value.publicationId,
      metrics: { 浏览: 900, 点赞: 55 },
    });
    expect(day7.ok && day7.value.daysSincePublish).toBe(7);

    const negative = await addPerformanceSnapshotCore(db, {
      publicationId: published.value.publicationId,
      metrics: { 浏览: -1 },
    });
    expect(negative.ok).toBe(false);
  });
});

describe("getOutputDetailCore（读模型：payload + 检查）", () => {
  test("返回解析后的 payload 与按规则出具的检查结果", async () => {
    const creationId = await newCreation();
    const created = await createPlatformOutputCore(db, {
      creationId,
      payload: xhsPayload([]),
    });
    if (!created.ok) throw new Error("setup 失败");
    const detail = await getOutputDetailCore(db, created.value.outputId);
    expect(detail?.payload?.type).toBe("xiaohongshu_image_note");
    expect(detail?.check?.ready).toBe(false);
    expect(detail?.check?.rulesVersion).toBe(getRuleSet("xiaohongshu_image_note").rulesVersion);
    expect(await getOutputDetailCore(db, 99999)).toBeNull();
  });
});

describe("重置与种子脚本（FR-0.1）", () => {
  test("resetDatabase：删除旧库重建空库，旧数据不迁移", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muse-reset-"));
    try {
      const first = resetDatabase(dir);
      expect(first.tables).toContain("creations");
      expect(first.tables).toContain("platform_output_revisions");
      const raw = new Database(first.dbPath);
      raw.exec("INSERT INTO creations (working_title) VALUES ('要被清掉的')");
      raw.exec("CREATE TABLE junk (id INTEGER)");
      raw.close();

      const second = resetDatabase(dir);
      expect(second.tables).not.toContain("junk");
      const reopened = new Database(second.dbPath);
      const count = reopened.query("SELECT COUNT(*) AS n FROM creations").get() as { n: number };
      expect(count.n).toBe(0);
      reopened.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("seedCore：空库种子成功且可复查；再次运行幂等跳过", async () => {
    const assetDir = fs.mkdtempSync(path.join(os.tmpdir(), "muse-seed-"));
    const memory = new Database(":memory:");
    memory.exec("PRAGMA foreign_keys = ON;");
    memory.exec(BOOTSTRAP_SQL);
    const seedDb = drizzle(memory, { schema }) as unknown as MuseDb;
    try {
      const first = await seedCore(seedDb, { assetDir });
      expect(first.seeded).toBe(true);
      expect(first.summary).toMatchObject({ creations: 2, outputs: 4, publications: 1 });
      const outputs = await seedDb.select().from(platformOutputs);
      expect(outputs.length).toBe(4);
      expect(outputs.every((o) => o.rulesVersion.length > 0)).toBe(true);
      // 公众号种子作品刻意缺封面：演示平台级 readiness 独立（FR-3.1）
      const wechat = outputs.find((o) => o.format === "wechat_article")!;
      const detail = await getOutputDetailCore(seedDb, wechat.id);
      expect(detail?.check?.ready).toBe(false);
      const files = fs.readdirSync(assetDir);
      expect(files.length).toBe(2);

      const second = await seedCore(seedDb, { assetDir });
      expect(second.seeded).toBe(false);
      expect((await seedDb.select().from(creations)).length).toBe(2);
    } finally {
      memory.close();
      fs.rmSync(assetDir, { recursive: true, force: true });
    }
  });
});

describe("旧库兼容（v1.0 多态审阅与资产池补列）", () => {
  test("旧 reviews/assets 幂等补 source_revision_id / output_revision_id / creation_id", () => {
    const old = new Database(":memory:");
    old.exec(`
      CREATE TABLE articles (id INTEGER PRIMARY KEY, summary TEXT, cover_asset_id INTEGER, aligned_brief_fingerprint TEXT);
      CREATE TABLE article_versions (id INTEGER PRIMARY KEY);
      CREATE TABLE platform_variants (id INTEGER PRIMARY KEY, source_version_id INTEGER);
      CREATE TABLE review_findings (id INTEGER PRIMARY KEY, evidence_state TEXT);
      CREATE TABLE reviews (id INTEGER PRIMARY KEY, article_id INTEGER NOT NULL, version_id INTEGER, type TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '');
      CREATE TABLE assets (id INTEGER PRIMARY KEY, article_id INTEGER, kind TEXT NOT NULL DEFAULT 'other', file_name TEXT NOT NULL, file_path TEXT NOT NULL);
      INSERT INTO reviews (id, article_id, type) VALUES (1, 1, 'ai');
      INSERT INTO assets (id, article_id, file_name, file_path) VALUES (1, 1, 'a.png', 'data/assets/a.png');
    `);
    const statements = compatibilityMigrationSql({
      articles: ["id", "summary", "cover_asset_id", "aligned_brief_fingerprint"],
      platformVariants: ["id", "source_version_id"],
      reviewFindings: ["id", "evidence_state"],
      reviews: ["id", "article_id", "version_id", "type", "summary"],
      assets: ["id", "article_id", "kind", "file_name", "file_path"],
    });
    statements.forEach((statement) => old.exec(statement));

    const reviewCols = (old.query("PRAGMA table_info(reviews)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(reviewCols).toContain("source_revision_id");
    expect(reviewCols).toContain("output_revision_id");
    const assetCols = (old.query("PRAGMA table_info(assets)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(assetCols).toContain("creation_id");
    // 旧行保留且新列为 NULL（不伪造归属）
    const review = old
      .query("SELECT article_id, source_revision_id, output_revision_id FROM reviews WHERE id = 1")
      .get() as { article_id: number; source_revision_id: number | null; output_revision_id: number | null };
    expect(review).toEqual({ article_id: 1, source_revision_id: null, output_revision_id: null });
    old.close();
  });
});
