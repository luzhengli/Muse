import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { BOOTSTRAP_SQL } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import { articles, articleVersions, topics } from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import {
  briefFromAnswers,
  confirmCreationCore,
  defaultBriefAnswers,
  findSimilarTopics,
  normalizeIdeaTitle,
  titleSimilarity,
} from "@/lib/create";
import { parseSettings } from "@/lib/settings";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(BOOTSTRAP_SQL);
  return { sqlite, db: drizzle(sqlite, { schema }) as unknown as MuseDb };
}

describe("首次引导设置兼容", () => {
  test("旧设置 JSON 无 onboarding → 默认未完成", () => {
    const parsed = parseSettings(JSON.stringify({ editor: { fontSize: 16 } }));
    expect(parsed.onboarding).toEqual({
      completed: false,
      contentType: "",
      primaryPlatform: "",
      startFrom: "",
    });
    expect(parsed.editor.fontSize).toBe(16);
  });

  test("非法 onboarding 字段单独回退，不影响其他答案", () => {
    const parsed = parseSettings(
      JSON.stringify({
        onboarding: {
          completed: true,
          contentType: "video",
          primaryPlatform: "x",
          startFrom: "idea",
          unknownField: 1,
        },
      }),
    );
    expect(parsed.onboarding.completed).toBe(true);
    expect(parsed.onboarding.contentType).toBe(""); // 非法值回退
    expect(parsed.onboarding.primaryPlatform).toBe("x");
    expect(parsed.onboarding.startFrom).toBe("idea");
  });
});

describe("想法归一与查重（纯函数）", () => {
  test("想法取首句且限长", () => {
    expect(normalizeIdeaTitle("  新手怎么选第一顶帐篷？顺便聊聊睡袋。 ")).toBe(
      "新手怎么选第一顶帐篷",
    );
    expect(normalizeIdeaTitle("甲".repeat(60)).length).toBe(40);
    expect(normalizeIdeaTitle("   ")).toBe("");
  });

  test("bigram 相似度：相同高、无关低", () => {
    expect(titleSimilarity("新手选帐篷指南", "新手选帐篷指南")).toBe(1);
    expect(titleSimilarity("新手选帐篷指南", "露营帐篷怎么选：新手指南")).toBeGreaterThan(0.4);
    expect(titleSimilarity("新手选帐篷指南", "上海咖啡馆探店")).toBeLessThan(0.2);
  });

  test("查重：包含关系视为重复，阈值过滤并排序", () => {
    const existing = [
      { id: 1, title: "新手怎么选第一顶帐篷" },
      { id: 2, title: "上海咖啡馆探店合集" },
      { id: 3, title: "帐篷选购" },
    ];
    const hits = findSimilarTopics(existing, "新手怎么选第一顶帐篷（2026 版）");
    expect(hits[0]?.id).toBe(1);
    expect(hits.some((h) => h.id === 2)).toBe(false);
    expect(findSimilarTopics(existing, "")).toEqual([]);
  });
});

describe("创作说明默认值", () => {
  const candidate = {
    title: "新手怎么选第一顶帐篷",
    targetAudience: "刚入坑的露营新手",
    corePoints: ["预算 500 以内够用", "先租后买"],
    angle: "实操指南",
    recommendedPlatforms: [] as string[],
  };

  test("平台默认取首次引导偏好，其次 wechat", () => {
    expect(defaultBriefAnswers(candidate, "xiaohongshu").platforms).toEqual(["xiaohongshu"]);
    expect(defaultBriefAnswers(candidate, "").platforms).toEqual(["wechat"]);
    expect(
      defaultBriefAnswers({ ...candidate, recommendedPlatforms: ["x"] }, "wechat").platforms,
    ).toEqual(["x"]);
  });

  test("要点默认为个人观点（无需引用），答案可组装为合法 Brief", () => {
    const answers = defaultBriefAnswers(candidate, "");
    expect(answers.keyPointsNeedEvidence).toHaveLength(2);
    expect(answers.keyPointsNeedEvidence.every((k) => !k.needsEvidence)).toBe(true);

    answers.keyPointsNeedEvidence[0].needsEvidence = true;
    const brief = briefFromAnswers(candidate, answers);
    expect(brief.keyPoints).toEqual(["预算 500 以内够用", "先租后买"]);
    expect(brief.evidence[0]).toEqual({
      keyPoint: "预算 500 以内够用",
      materialIds: [],
      noCitationRequired: false,
    });
    expect(brief.evidence[1].noCitationRequired).toBe(true);
    expect(brief.coreClaim).toBe("预算 500 以内够用");
  });
});

describe("确认创建（唯一写库入口）", () => {
  const candidate = {
    title: "新手怎么选第一顶帐篷",
    targetAudience: "露营新手",
    corePoints: ["预算优先"],
    angle: "指南",
    recommendedPlatforms: ["xiaohongshu"],
  };

  test("一次确认恰好创建 1 选题 + 1 文章 + v1 空白稿 + 对齐指纹", async () => {
    const { db } = makeDb();
    const answers = defaultBriefAnswers(candidate, "xiaohongshu");
    const result = await confirmCreationCore(db, {
      title: candidate.title,
      targetAudience: answers.audience,
      corePoints: ["预算优先"],
      angle: candidate.angle,
      recommendedPlatforms: answers.platforms,
      brief: briefFromAnswers(candidate, answers),
      origin: "ai",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const topicRows = await db.select().from(topics);
    const articleRows = await db.select().from(articles);
    const versionRows = await db.select().from(articleVersions);
    expect(topicRows).toHaveLength(1);
    expect(articleRows).toHaveLength(1);
    expect(versionRows).toHaveLength(1);
    expect(versionRows[0].versionNo).toBe(1);
    expect(versionRows[0].contentHtml).toBe("<p></p>");
    expect(articleRows[0].topicId).toBe(topicRows[0].id);
    expect(articleRows[0].alignedBriefFingerprint).toBeTruthy();
    expect(topicRows[0].status).toBe("drafting");
    expect(topicRows[0].origin).toBe("ai");
  });

  test("空标题拒绝且不写任何记录（预览/放弃不落库）", async () => {
    const { db } = makeDb();
    const answers = defaultBriefAnswers(candidate, "");
    const result = await confirmCreationCore(db, {
      title: "   ",
      targetAudience: "",
      corePoints: [],
      angle: "",
      recommendedPlatforms: [],
      brief: briefFromAnswers(candidate, answers),
      origin: "manual",
    });
    expect(result.ok).toBe(false);
    expect(await db.select().from(topics)).toHaveLength(0);
    expect(await db.select().from(articles)).toHaveLength(0);
  });
});
