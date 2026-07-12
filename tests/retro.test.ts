import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { BOOTSTRAP_SQL } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import {
  articles,
  platformVariants,
  publishResults,
  publishTasks,
  retroNotes,
  topics,
} from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import { saveDraftCore, saveVersionCore } from "@/lib/drafts";
import { markManualPublishedCore } from "@/lib/publish-assist";
import { computeReadiness, getReadinessFactsCore } from "@/lib/readiness";
import {
  buildRetroSummary,
  getRetroContextCore,
  getRetroTraceCore,
  recordRetroCore,
  type RetroAnswers,
} from "@/lib/retro";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(BOOTSTRAP_SQL);
  return { sqlite, db: drizzle(sqlite, { schema }) as unknown as MuseDb };
}

const ANSWERS: RetroAnswers = {
  metrics: { views: 1200, likes: 45, comments: 12, shares: 8 },
  audienceFocus: "反复有人问工具清单",
  supportedHypothesis: "工具向内容收藏率更高",
  unsupportedHypothesis: "长标题会降低点开率",
  keep: "结尾放行动清单",
  adjust: "下次做工具向清单文",
  stop: "停止空泛观点段落",
};

/** 建一条完整链：选题 → 文章(v1) → 平台稿(当前) */
async function seedChain(db: MuseDb) {
  const [topic] = await db
    .insert(topics)
    .values({ title: "本地优先创作", status: "drafting" })
    .returning();
  const [article] = await db
    .insert(articles)
    .values({ title: "本地优先入门", topicId: topic.id })
    .returning();
  const { versionId } = await saveVersionCore(db, article.id, "<p>正文内容</p>", "v1");
  const [variant] = await db
    .insert(platformVariants)
    .values({
      articleId: article.id,
      sourceVersionId: versionId,
      platform: "x",
      title: "X 版",
      content: "内容",
    })
    .returning();
  return { topicId: topic.id, articleId: article.id, versionId, variantId: variant.id };
}

describe("复盘摘要（措辞约束）", () => {
  test("固定为观察/暂时支持措辞，绝不写因果结论", () => {
    const summary = buildRetroSummary(
      { articleTitle: "本地优先入门", platform: "x" },
      ANSWERS,
    );
    expect(summary).toContain("【表现观察】");
    expect(summary).toContain("单次表现只作观察，不代表因果");
    expect(summary).toContain("【暂时支持的假设】工具向内容收藏率更高（待更多数据验证）");
    expect(summary).toContain("【未获支持的假设】长标题会降低点开率");
    expect(summary).toContain("保持：结尾放行动清单");
    expect(summary).not.toContain("因为");
    expect(summary).not.toContain("证明了");
  });

  test("空答案的段落不输出", () => {
    const summary = buildRetroSummary(
      { articleTitle: "t", platform: "wechat" },
      { ...ANSWERS, audienceFocus: "", unsupportedHypothesis: "", keep: "", adjust: "", stop: "" },
    );
    expect(summary).not.toContain("【读者关注】");
    expect(summary).not.toContain("【未获支持的假设】");
    expect(summary).not.toContain("【下一次】");
  });
});

describe("手动发布（标记已发布的服务端校验）", () => {
  test("当前稿放行并写入已发布记录", async () => {
    const { db } = makeDb();
    const { variantId } = await seedChain(db);
    const result = await markManualPublishedCore(db, variantId, "https://example.com/p/1");
    expect(result.ok).toBe(true);
    const tasks = await db.select().from(publishTasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("published");
    expect(tasks[0].externalUrl).toBe("https://example.com/p/1");
    expect(tasks[0].publishedAt).toBeTruthy();
  });

  test("正文变化后的旧稿拒绝标记且不写记录", async () => {
    const { db } = makeDb();
    const { articleId, variantId } = await seedChain(db);
    await saveDraftCore(db, articleId, "<p>改动后的正文</p>");
    const result = await markManualPublishedCore(db, variantId, "");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("保存");
    expect(await db.select().from(publishTasks)).toHaveLength(0);
  });

  test("非法链接拒绝；留空允许", async () => {
    const { db } = makeDb();
    const { variantId } = await seedChain(db);
    const bad = await markManualPublishedCore(db, variantId, "not-a-url");
    expect(bad.ok).toBe(false);
    const empty = await markManualPublishedCore(db, variantId, "  ");
    expect(empty.ok).toBe(true);
  });
});

describe("复盘向导（上下文带入与溯源落库）", () => {
  test("上下文自动带入文章/平台/平台稿/链接", async () => {
    const { db } = makeDb();
    const { variantId } = await seedChain(db);
    const marked = await markManualPublishedCore(db, variantId, "https://example.com/p/2");
    if (!marked.ok) throw new Error("seed failed");
    const context = await getRetroContextCore(db, marked.taskId);
    expect(context).toMatchObject({
      taskId: marked.taskId,
      variantId,
      articleTitle: "本地优先入门",
      variantTitle: "X 版",
      platform: "x",
      externalUrl: "https://example.com/p/2",
    });
  });

  test("保存一次写入表现数据 + Learning，溯源链完整", async () => {
    const { db } = makeDb();
    const { variantId } = await seedChain(db);
    const marked = await markManualPublishedCore(db, variantId, "https://example.com/p/3");
    if (!marked.ok) throw new Error("seed failed");

    const summary = buildRetroSummary({ articleTitle: "本地优先入门", platform: "x" }, ANSWERS);
    const saved = await recordRetroCore(db, {
      taskId: marked.taskId,
      variantId,
      platform: "x",
      externalUrl: "https://example.com/p/3",
      answers: ANSWERS,
      summary,
      title: "",
      nextTopicHint: ANSWERS.adjust,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const [result] = await db.select().from(publishResults);
    expect(result.views).toBe(1200);
    expect(result.taskId).toBe(marked.taskId);
    const [note] = await db.select().from(retroNotes);
    expect(note.resultId).toBe(result.id);
    expect(note.title).toContain("工具向内容收藏率更高");
    expect(note.nextTopicHint).toBe("下次做工具向清单文");

    // 溯源：发布结果 → 平台稿 → 正文版本 → 创作说明
    const trace = await getRetroTraceCore(db, note.id);
    expect(trace).toMatchObject({
      platform: "x",
      externalUrl: "https://example.com/p/3",
      variantTitle: "X 版",
      articleTitle: "本地优先入门",
      sourceVersionNo: 1,
      topicTitle: "本地优先创作",
      convertedTopicTitle: null,
    });

    // 复用为新方向后溯源延伸到新选题
    const [next] = await db
      .insert(topics)
      .values({ title: "工具清单文", origin: "retro" })
      .returning();
    await db.update(retroNotes).set({ convertedTopicId: next.id }).where(eq(retroNotes.id, note.id));
    const trace2 = await getRetroTraceCore(db, note.id);
    expect(trace2?.convertedTopicTitle).toBe("工具清单文");
  });

  test("空摘要拒绝且不写任何记录", async () => {
    const { db } = makeDb();
    const { variantId } = await seedChain(db);
    const saved = await recordRetroCore(db, {
      taskId: null,
      variantId,
      platform: "x",
      externalUrl: "",
      answers: ANSWERS,
      summary: "   ",
      title: "",
      nextTopicHint: "",
    });
    expect(saved.ok).toBe(false);
    expect(await db.select().from(publishResults)).toHaveLength(0);
    expect(await db.select().from(retroNotes)).toHaveLength(0);
  });
});

describe("发布后的 NextAction 推进", () => {
  test("已发布未记录 → 记录这次表现；已记录 → 复盘完成", async () => {
    const { db } = makeDb();
    const { articleId, variantId } = await seedChain(db);
    const marked = await markManualPublishedCore(db, variantId, "");
    if (!marked.ok) throw new Error("seed failed");

    const facts1 = await getReadinessFactsCore(db, articleId);
    const r1 = computeReadiness(facts1!);
    expect(r1.nextAction.label).toBe("记录这次表现");
    expect(r1.nextAction.target).toBe("retro");
    expect(r1.state).toContain("已发布");

    await recordRetroCore(db, {
      taskId: marked.taskId,
      variantId,
      platform: "x",
      externalUrl: "",
      answers: ANSWERS,
      summary: "摘要",
      title: "经验",
      nextTopicHint: "",
    });
    const facts2 = await getReadinessFactsCore(db, articleId);
    const r2 = computeReadiness(facts2!);
    expect(r2.state).toContain("已完成复盘");
    expect(r2.nextAction.target).toBe("retro");
  });
});
