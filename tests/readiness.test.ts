import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { BOOTSTRAP_SQL } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import {
  articles,
  evidenceCitations,
  materials,
  packagings,
  platformVariants,
  reviewFindings,
  reviews,
  topics,
  type TopicBrief,
} from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import { saveDraftCore, saveVersionCore } from "@/lib/drafts";
import { briefFingerprint, normalizeTopicBrief } from "@/lib/briefs";
import {
  assertPublishable,
  computeReadiness,
  getReadinessFactsCore,
  type ReadinessFacts,
} from "@/lib/readiness";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(BOOTSTRAP_SQL);
  return { sqlite, db: drizzle(sqlite, { schema }) as unknown as MuseDb };
}

function facts(overrides: Partial<ReadinessFacts> = {}): ReadinessFacts {
  return {
    articleId: 1,
    hasContent: true,
    checkpoint: { id: 10, versionNo: 2 },
    brief: null,
    evidence: { requiredKeyPoints: 0, coveredKeyPoints: 0 },
    citations: { total: 0, degraded: 0 },
    review: { hasCurrent: true, openCriticalCurrent: 0 },
    packaging: { exists: false, current: false },
    variants: { total: 1, current: 1 },
    ...overrides,
  };
}

describe("computeReadiness（纯函数）", () => {
  test("正文为空 → 唯一下一步是开始写作，阻断发布", () => {
    const r = computeReadiness(facts({ hasContent: false, variants: { total: 0, current: 0 } }));
    expect(r.readyToPublish).toBe(false);
    expect(r.nextAction.target).toBe("editor");
    expect(r.nextAction.skippable).toBe(false);
    expect(r.gaps[0].id).toBe("empty-content");
  });

  test("全部就绪 → 可发布且下一步是安排发布", () => {
    const r = computeReadiness(facts());
    expect(r.readyToPublish).toBe(true);
    expect(r.gaps).toHaveLength(0);
    expect(r.nextAction.target).toBe("publish");
    expect(r.state).toContain("一切就绪");
  });

  test("未处理 critical 阻断发布且优先于未检查", () => {
    const r = computeReadiness(
      facts({ review: { hasCurrent: true, openCriticalCurrent: 2 } }),
    );
    expect(r.readyToPublish).toBe(false);
    expect(r.nextAction.target).toBe("review");
    expect(r.nextAction.reason).toBeTruthy();
    expect(r.gaps[0].id).toBe("critical-open");
  });

  test("当前正文未检查是可跳过的建议，不阻断发布", () => {
    const r = computeReadiness(
      facts({ review: { hasCurrent: false, openCriticalCurrent: 0 } }),
    );
    expect(r.readyToPublish).toBe(true);
    expect(r.nextAction.target).toBe("review");
    expect(r.nextAction.reason).toBeNull();
    expect(r.nextAction.skippable).toBe(true);
    expect(r.nextAction.skipRisk).toBeTruthy();
  });

  test("Brief 缺口顺序：不完整 → 未确认对齐 → 要点证据", () => {
    const r = computeReadiness(
      facts({
        brief: { complete: false, aligned: false },
        evidence: { requiredKeyPoints: 3, coveredKeyPoints: 1 },
      }),
    );
    expect(r.gaps.map((g) => g.id)).toEqual([
      "brief-incomplete",
      "brief-unaligned",
      "evidence-missing",
    ]);
    expect(r.readyToPublish).toBe(true); // 全部可跳过，不阻断
  });

  test("对齐事实未记录（null）不产生缺口", () => {
    const r = computeReadiness(facts({ brief: { complete: true, aligned: null } }));
    expect(r.gaps.find((g) => g.id === "brief-unaligned")).toBeUndefined();
  });

  test("平台稿缺失或全部过期均阻断发布", () => {
    const missing = computeReadiness(facts({ variants: { total: 0, current: 0 } }));
    expect(missing.readyToPublish).toBe(false);
    expect(missing.gaps.some((g) => g.id === "variants-missing" && g.blocking)).toBe(true);

    const stale = computeReadiness(facts({ variants: { total: 2, current: 0 } }));
    expect(stale.readyToPublish).toBe(false);
    expect(stale.gaps.some((g) => g.id === "variants-stale" && g.blocking)).toBe(true);
    expect(stale.state).toContain("步");
  });

  test("引用降级与旧包装是建议缺口", () => {
    const r = computeReadiness(
      facts({
        citations: { total: 3, degraded: 2 },
        packaging: { exists: true, current: false },
      }),
    );
    const ids = r.gaps.map((g) => g.id);
    expect(ids).toContain("citations-degraded");
    expect(ids).toContain("packaging-stale");
    expect(r.readyToPublish).toBe(true);
  });
});

describe("assertPublishable（服务端发布校验）", () => {
  test("正文为空 / 无检查点 / 旧稿 / critical 全部拒绝", () => {
    expect(assertPublishable(facts({ hasContent: false }), 10).ok).toBe(false);
    expect(assertPublishable(facts({ checkpoint: null }), 10).ok).toBe(false);
    const stale = assertPublishable(facts(), 9);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toContain("旧正文");
    expect(assertPublishable(facts(), null).ok).toBe(false);
    expect(
      assertPublishable(facts({ review: { hasCurrent: true, openCriticalCurrent: 1 } }), 10).ok,
    ).toBe(false);
  });

  test("来源等于当前检查点且无 critical → 放行", () => {
    expect(assertPublishable(facts(), 10)).toEqual({ ok: true });
  });
});

describe("getReadinessFactsCore（事实汇集）", () => {
  const brief: TopicBrief = normalizeTopicBrief({
    audience: "读者",
    objective: "目标",
    coreClaim: "主张",
    platforms: ["wechat"],
    keyPoints: ["要点A", "要点B"],
    angle: "角度",
    tone: "语气",
    outline: ["开头", "结尾"],
    citedMaterialIds: [],
    evidence: [
      { keyPoint: "要点A", materialIds: [1], noCitationRequired: false },
      { keyPoint: "要点B", materialIds: [], noCitationRequired: false },
    ],
  });

  async function seed(db: MuseDb, alignedFingerprint: string | null) {
    const [topic] = await db
      .insert(topics)
      .values({ title: "选题", brief, status: "drafting" })
      .returning();
    const [article] = await db
      .insert(articles)
      .values({ title: "文章", topicId: topic.id, alignedBriefFingerprint: alignedFingerprint })
      .returning();
    const { versionId } = await saveVersionCore(db, article.id, "<p>正文内容</p>", "v1");
    return { topicId: topic.id, articleId: article.id, versionId };
  }

  test("完整状态组合：检查点、Brief 对齐、证据覆盖、critical、平台稿", async () => {
    const { db } = makeDb();
    const normalized = normalizeTopicBrief(brief);
    const { articleId, versionId } = await seed(db, briefFingerprint(normalized));

    await db.insert(materials).values({ id: 1, type: "note", title: "素材", rawContent: "内容" });

    // 当前检查点上的审阅：1 条 open critical + 1 条 accepted critical
    const [rev] = await db
      .insert(reviews)
      .values({ articleId, sourceVersionId: versionId, type: "ai", summary: "s" })
      .returning();
    await db.insert(reviewFindings).values([
      { reviewId: rev.id, category: "compliance", severity: "critical", suggestion: "x" },
      { reviewId: rev.id, category: "fact", severity: "critical", suggestion: "y", status: "accepted" },
    ]);
    // 旧审阅（无来源）不计入
    await db.insert(reviews).values({ articleId, sourceVersionId: null, type: "ai", summary: "旧" });

    await db.insert(platformVariants).values([
      { articleId, sourceVersionId: versionId, platform: "x", title: "新", content: "c" },
      { articleId, sourceVersionId: null, platform: "wechat", title: "旧", content: "c" },
    ]);
    await db.insert(packagings).values({ articleId, sourceVersionId: null });
    // 引用：素材存在但语料块缺失 → 降级
    await db.insert(evidenceCitations).values({
      key: "k1",
      articleId,
      materialId: 1,
      chunkId: null,
      excerpt: "摘录",
      contextSnapshot: "快照",
      sourceTitle: "素材",
    });

    const facts = await getReadinessFactsCore(db, articleId);
    expect(facts).not.toBeNull();
    expect(facts!.hasContent).toBe(true);
    expect(facts!.checkpoint?.id).toBe(versionId);
    expect(facts!.brief).toEqual({ complete: true, aligned: true });
    expect(facts!.evidence).toEqual({ requiredKeyPoints: 2, coveredKeyPoints: 1 });
    expect(facts!.citations).toEqual({ total: 1, degraded: 1 });
    expect(facts!.review).toEqual({ hasCurrent: true, openCriticalCurrent: 1 });
    expect(facts!.packaging).toEqual({ exists: true, current: false });
    expect(facts!.variants).toEqual({ total: 2, current: 1 });
  });

  test("对齐指纹：NULL → aligned=null；不匹配 → aligned=false", async () => {
    const { db } = makeDb();
    const a = await seed(db, null);
    const factsNull = await getReadinessFactsCore(db, a.articleId);
    expect(factsNull!.brief?.aligned).toBeNull();
  });

  test("Brief 修改后指纹不匹配 → aligned=false", async () => {
    const { db } = makeDb();
    const normalized = normalizeTopicBrief(brief);
    const a = await seed(db, briefFingerprint(normalized));
    // 模拟 Brief 被修改
    await db
      .update(topics)
      .set({ brief: { ...normalized, coreClaim: "新的主张" } })
      .where(eq(topics.id, a.topicId));
    const changed = await getReadinessFactsCore(db, a.articleId);
    expect(changed!.brief?.aligned).toBe(false);
  });

  test("工作稿领先版本时检查点为空、正文以工作稿为准", async () => {
    const { db } = makeDb();
    const a = await seed(db, null);
    await saveDraftCore(db, a.articleId, "<p>改动后的新内容</p>");
    const facts = await getReadinessFactsCore(db, a.articleId);
    expect(facts!.checkpoint).toBeNull();
    expect(facts!.hasContent).toBe(true);
    // 检查点为空 → 所有下游产物一律视为过期
    expect(facts!.variants.current).toBe(0);
  });

  test("文章不存在返回 null；空文章 hasContent=false", async () => {
    const { db } = makeDb();
    expect(await getReadinessFactsCore(db, 999)).toBeNull();
    const [article] = await db.insert(articles).values({ title: "空" }).returning();
    await saveVersionCore(db, article.id, "<p></p>", "空白稿");
    const facts = await getReadinessFactsCore(db, article.id);
    expect(facts!.hasContent).toBe(false);
  });
});
