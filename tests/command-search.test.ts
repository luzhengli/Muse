import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { BOOTSTRAP_SQL } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import {
  articles,
  materials,
  materialChunks,
  retroNotes,
  topics,
} from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import { saveDraftCore } from "@/lib/drafts";
import {
  escapeLikePattern,
  getCommandHomeCore,
  searchCommandCore,
  type CommandSearchDeps,
} from "@/lib/command-search";
import { segmentCjk } from "@/lib/utils";

function makeDeps(): CommandSearchDeps & { raw: Database } {
  const raw = new Database(":memory:");
  raw.exec("PRAGMA foreign_keys = ON;");
  raw.exec(BOOTSTRAP_SQL);
  const db = drizzle(raw, { schema }) as unknown as MuseDb;
  return { db, sqlite: raw, raw };
}

/** 与 db/fts.ts 的 indexChunk 相同的写入方式（测试内存库不走生产连接） */
function indexChunk(raw: Database, chunkId: number, materialId: number, content: string) {
  raw
    .prepare("INSERT INTO chunk_fts (content, chunk_id, material_id) VALUES (?, ?, ?)")
    .run(segmentCjk(content), chunkId, materialId);
}

async function seed(deps: ReturnType<typeof makeDeps>) {
  const { db, raw } = deps;
  // 素材 A：已清洗，语料块进 FTS（「复利思维」只出现在语料块里）
  const [matA] = await db
    .insert(materials)
    .values({
      type: "text",
      title: "长期主义读书笔记",
      summary: "关于长期主义的整理",
      cleanStatus: "cleaned",
    })
    .returning();
  const [chunkA] = await db
    .insert(materialChunks)
    .values({ materialId: matA.id, orderIndex: 0, content: "复利思维是长期主义的核心引擎。" })
    .returning();
  indexChunk(raw, chunkA.id, matA.id, chunkA.content);

  // 素材 B：未清洗，只有标题可命中（含 LIKE 特殊字符 % 和 _）
  const [matB] = await db
    .insert(materials)
    .values({ type: "note", title: "100%_特殊字符素材", cleanStatus: "raw" })
    .returning();

  // 选题：标题不含「叙事节奏」，Brief 里含（验证 Brief 文本命中）
  const [topic] = await db
    .insert(topics)
    .values({
      title: "复利思维如何改变创作",
      status: "briefed",
      brief: {
        audience: "内容创作者",
        objective: "让读者理解复利",
        coreClaim: "叙事节奏决定读者留存",
        platforms: ["x"],
        keyPoints: [],
        angle: "",
        tone: "",
        outline: [],
        citedMaterialIds: [],
        evidence: [],
      },
    })
    .returning();

  // 文章 1：属于选题，正文非空（有工作稿），updated_at 最新
  const [art1] = await db
    .insert(articles)
    .values({
      topicId: topic.id,
      title: "复利思维写作指南",
      summary: "长期主义视角的写作方法",
      updatedAt: 2000,
    })
    .returning();
  await saveDraftCore(db, art1.id, "<p>正文已经开始写了。</p>");
  raw.prepare("UPDATE articles SET updated_at = 2000 WHERE id = ?").run(art1.id);

  // 文章 2：无选题、正文为空，updated_at 更旧（验证组内排序）
  const [art2] = await db
    .insert(articles)
    .values({ title: "另一篇复利笔记", summary: "", updatedAt: 1000 })
    .returning();
  raw.prepare("UPDATE articles SET updated_at = 1000 WHERE id = ?").run(art2.id);

  // 复盘经验：insights 命中
  const [retro] = await db
    .insert(retroNotes)
    .values({
      title: "小红书封面经验",
      insights: "带数字的标题点击率更高，复利思维系列表现稳定。",
    })
    .returning();

  return { matA, matB, topic, art1, art2, retro };
}

describe("command search（跨域只读查询）", () => {
  test("中文关键词跨四域命中，文章附 readiness 状态与面板直达 href", async () => {
    const deps = makeDeps();
    const { matA, topic, art1, art2 } = await seed(deps);

    const groups = await searchCommandCore(deps, "复利");
    expect(groups.map((g) => g.type)).toEqual(["article", "material", "topic", "retro"]);

    const articleGroup = groups[0];
    expect(articleGroup.label).toBe("文章");
    expect(articleGroup.items.map((i) => i.id)).toEqual([art1.id, art2.id]);
    // 文章 1 正文非空但未保存版本 → 下一步是检查类动作；状态是自然语言
    expect(articleGroup.items[0].status).toContain("下一步：");
    expect(articleGroup.items[0].status).not.toContain("undefined");
    // 文章 2 正文为空 → 直达写作台编辑器面板
    expect(articleGroup.items[1].href).toBe(`/articles/${art2.id}?panel=writing`);
    expect(articleGroup.items[1].status).toContain("从写下第一段开始");

    const materialGroup = groups[1];
    expect(materialGroup.items[0].id).toBe(matA.id);
    expect(materialGroup.items[0].href).toBe(`/materials/${matA.id}`);
    expect(materialGroup.items[0].status).toBe("已整理");
    expect(materialGroup.items[0].subtitle).toContain("复利");

    const topicGroup = groups[2];
    expect(topicGroup.items[0].id).toBe(topic.id);
    // 选题已有文章 → 直达写作台资料面板（Brief 所在处）
    expect(topicGroup.items[0].href).toBe(`/articles/${art1.id}?panel=materials`);
    expect(topicGroup.items[0].status).toBe("已有创作说明");

    const retroGroup = groups[3];
    expect(retroGroup.items[0].title).toBe("小红书封面经验");
    expect(retroGroup.items[0].href).toBe("/retro");
    expect(retroGroup.items[0].status).toBe("可在新创作中复用");
  });

  test("Brief 文本与复盘 Learning 文本可作为独立命中入口", async () => {
    const deps = makeDeps();
    const { topic } = await seed(deps);

    // 「叙事节奏」只在 Brief JSON 里
    const briefHit = await searchCommandCore(deps, "叙事节奏");
    expect(briefHit.some((g) => g.type === "topic")).toBe(true);
    expect(briefHit.find((g) => g.type === "topic")!.items[0].id).toBe(topic.id);
    expect(briefHit.find((g) => g.type === "topic")!.items[0].subtitle).toContain(
      "叙事节奏",
    );

    // 「点击率」只在复盘 insights 里
    const retroHit = await searchCommandCore(deps, "点击率");
    expect(retroHit.map((g) => g.type)).toEqual(["retro"]);
  });

  test("空查询与纯空白查询返回空分组，不触碰数据库", async () => {
    const deps = makeDeps();
    await seed(deps);
    expect(await searchCommandCore(deps, "")).toEqual([]);
    expect(await searchCommandCore(deps, "   ")).toEqual([]);
  });

  test("无结果时返回空数组而不是报错", async () => {
    const deps = makeDeps();
    await seed(deps);
    expect(await searchCommandCore(deps, "不存在的关键词啊")).toEqual([]);
  });

  test("LIKE 特殊字符按字面匹配：% 与 _ 不当作通配符", async () => {
    const deps = makeDeps();
    const { matB } = await seed(deps);

    expect(escapeLikePattern("100%_a\\b")).toBe("100\\%\\_a\\\\b");

    // 「100%」只命中含字面 % 的素材 B
    const hits = await searchCommandCore(deps, "100%");
    expect(hits.map((g) => g.type)).toEqual(["material"]);
    expect(hits[0].items.map((i) => i.id)).toEqual([matB.id]);

    // 「100法」若 % 被当通配符会误命中「100%_特殊字符素材」；正确行为是无结果
    expect(await searchCommandCore(deps, "100符")).toEqual([]);
    // 「_特殊」按字面命中下划线
    const underscore = await searchCommandCore(deps, "_特殊");
    expect(underscore[0].items[0].id).toBe(matB.id);
  });

  test("引号、单引号与反斜杠不炸查询（FTS 与 LIKE 双通道）", async () => {
    const deps = makeDeps();
    await seed(deps);
    for (const q of ['他说"复利"', "it's", "a\\b", '"""', "%%%", "___"]) {
      const groups = await searchCommandCore(deps, q);
      expect(Array.isArray(groups)).toBe(true);
    }
  });

  test("分组固定顺序，文章组内按最近更新倒序", async () => {
    const deps = makeDeps();
    const { art1, art2 } = await seed(deps);
    const groups = await searchCommandCore(deps, "复利");
    expect(groups.map((g) => g.label)).toEqual(["文章", "素材", "选题", "复盘经验"]);
    const ids = groups[0].items.map((i) => i.id);
    expect(ids).toEqual([art1.id, art2.id]);
  });

  test("空查询首屏：继续上次创作 = 最近更新文章，最近列表按更新倒序", async () => {
    const deps = makeDeps();
    const { art1, art2 } = await seed(deps);
    const home = await getCommandHomeCore(deps);
    expect(home.continueArticle?.id).toBe(art1.id);
    expect(home.recent.map((i) => i.id)).toEqual([art1.id, art2.id]);
    expect(home.continueArticle?.status).toContain("下一步：");
  });
});
