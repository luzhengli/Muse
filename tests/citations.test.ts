import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq } from "drizzle-orm";
import { BOOTSTRAP_SQL, compatibilityMigrationSql } from "@/db/bootstrap";
import * as schema from "@/db/schema";
import {
  articles,
  evidenceCitations,
  materialChunks,
  materials,
} from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import {
  computeCitationValidity,
  defaultExcerpt,
  findChunkForExcerpt,
  generateCitationKey,
  getCitationStatesCore,
  relinkCitationsForMaterialCore,
} from "@/lib/citations";
import { docToMarkdown, markdownToDoc } from "@/lib/markdown";
import { mockFactCheck } from "@/lib/ai/mock";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(BOOTSTRAP_SQL);
  return { sqlite, db: drizzle(sqlite, { schema }) as unknown as MuseDb };
}

async function seed(db: MuseDb) {
  const [article] = await db.insert(articles).values({ title: "引用契约测试" }).returning();
  const [material] = await db
    .insert(materials)
    .values({ type: "text", title: "来源素材", rawContent: "原文", cleanStatus: "cleaned" })
    .returning();
  const [chunk] = await db
    .insert(materialChunks)
    .values({ materialId: material.id, orderIndex: 0, content: "全球市场规模在 2025 年达到 120 亿。这是一个重要事实。" })
    .returning();
  const [citation] = await db
    .insert(evidenceCitations)
    .values({
      key: generateCitationKey(),
      articleId: article.id,
      materialId: material.id,
      chunkId: chunk.id,
      excerpt: "全球市场规模在 2025 年达到 120 亿。",
      contextSnapshot: chunk.content,
      sourceTitle: material.title,
      sourceUrl: null,
    })
    .returning();
  return { articleId: article.id, materialId: material.id, chunkId: chunk.id, citation };
}

describe("引用有效状态（纯函数）", () => {
  test("语料块包含摘录 → 依据有效（空白差异不影响）", () => {
    expect(
      computeCitationValidity({
        materialExists: true,
        chunkContent: "前文……全球市场规模在 2025 年\n达到 120 亿。后文",
        excerpt: "全球市场规模在 2025 年达到 120 亿。",
      }),
    ).toBe("valid");
  });

  test("语料块不再包含摘录或块缺失 → 来源已变化", () => {
    expect(
      computeCitationValidity({
        materialExists: true,
        chunkContent: "内容被改写了",
        excerpt: "全球市场规模在 2025 年达到 120 亿。",
      }),
    ).toBe("source-changed");
    expect(
      computeCitationValidity({
        materialExists: true,
        chunkContent: null,
        excerpt: "任意摘录",
      }),
    ).toBe("source-changed");
  });

  test("素材不存在 → 来源已删除", () => {
    expect(
      computeCitationValidity({
        materialExists: false,
        chunkContent: null,
        excerpt: "任意摘录",
      }),
    ).toBe("source-missing");
  });

  test("按摘录在语料块中重定位", () => {
    const chunks = [
      { id: 1, content: "别的内容" },
      { id: 2, content: "包含 全球市场规模在 2025 年达到 120 亿。 的新块" },
    ];
    expect(findChunkForExcerpt(chunks, "全球市场规模在 2025 年达到 120 亿。")).toBe(2);
    expect(findChunkForExcerpt(chunks, "不存在的摘录")).toBeNull();
    expect(findChunkForExcerpt(chunks, "  ")).toBeNull();
  });

  test("默认摘录在句号处截断且不超长", () => {
    const short = defaultExcerpt("短内容。");
    expect(short).toBe("短内容。");
    const long = defaultExcerpt(`${"甲".repeat(100)}。${"乙".repeat(300)}`);
    expect(long).toBe(`${"甲".repeat(100)}。`);
    expect(defaultExcerpt("无标点".repeat(200)).length).toBeLessThanOrEqual(240);
  });
});

describe("素材变化后的可信降级", () => {
  test("重清洗后按摘录重定位到新语料块（引用身份延续）", async () => {
    const { db } = makeDb();
    const { materialId, citation } = await seed(db);

    // 模拟重清洗：删除旧块（FK 置空 chunk_id）并写入新块
    await db.delete(materialChunks).where(eq(materialChunks.materialId, materialId));
    const [next] = await db
      .insert(materialChunks)
      .values({
        materialId,
        orderIndex: 0,
        content: "重新清洗后的语料：全球市场规模在 2025 年达到 120 亿。补充了更多上下文。",
      })
      .returning();

    const result = await relinkCitationsForMaterialCore(db, materialId);
    expect(result).toEqual({ relinked: 1, degraded: 0 });

    const row = await db.query.evidenceCitations.findFirst({
      where: eq(evidenceCitations.id, citation.id),
    });
    expect(row?.chunkId).toBe(next.id);
    expect(row?.key).toBe(citation.key); // 引用身份不变
    expect(row?.contextSnapshot).toContain("重新清洗后的语料");

    const [state] = await getCitationStatesCore(db, citation.articleId);
    expect(state.validity).toBe("valid");
  });

  test("重清洗后摘录不再存在 → 降级为来源已变化，保留原始快照", async () => {
    const { db } = makeDb();
    const { materialId, citation } = await seed(db);

    await db.delete(materialChunks).where(eq(materialChunks.materialId, materialId));
    await db
      .insert(materialChunks)
      .values({ materialId, orderIndex: 0, content: "完全无关的新内容" });

    const result = await relinkCitationsForMaterialCore(db, materialId);
    expect(result).toEqual({ relinked: 0, degraded: 1 });

    const [state] = await getCitationStatesCore(db, citation.articleId);
    expect(state.validity).toBe("source-changed");
    expect(state.chunkId).toBeNull();
    expect(state.contextSnapshot).toContain("全球市场规模在 2025 年达到 120 亿。");
    expect(state.excerpt).toBe("全球市场规模在 2025 年达到 120 亿。");
  });

  test("素材删除 → 引用行保留、外键置空、降级为来源已删除", async () => {
    const { db } = makeDb();
    const { materialId, citation } = await seed(db);

    await db.delete(materials).where(eq(materials.id, materialId));

    const [state] = await getCitationStatesCore(db, citation.articleId);
    expect(state.validity).toBe("source-missing");
    expect(state.materialId).toBeNull();
    expect(state.chunkId).toBeNull();
    expect(state.sourceTitle).toBe("来源素材"); // 快照保留
    expect(state.excerpt).toBe("全球市场规模在 2025 年达到 120 亿。");
  });
});

describe("引用的 Markdown 往返", () => {
  test("citation mark → muse://cite 链接 → 解析还原", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "这个结论" },
            {
              type: "text",
              text: "有资料支持",
              marks: [{ type: "citation", attrs: { key: "cabc123" } }],
            },
            { type: "text", text: "。" },
          ],
        },
      ],
    };
    const md = docToMarkdown(doc);
    expect(md).toContain("[有资料支持](muse://cite/cabc123)");
    const parsed = markdownToDoc(md);
    const para = parsed.content?.[0];
    const cited = para?.content?.find((n) =>
      n.marks?.some((m) => m.type === "citation"),
    );
    expect(cited?.text).toBe("有资料支持");
    expect(cited?.marks?.[0]).toEqual({ type: "citation", attrs: { key: "cabc123" } });
  });

  test("citation 与加粗共存可往返", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "重点依据",
              marks: [
                { type: "bold" },
                { type: "citation", attrs: { key: "ck1" } },
              ],
            },
          ],
        },
      ],
    };
    const md = docToMarkdown(doc);
    expect(md).toContain("[**重点依据**](muse://cite/ck1)");
    const parsed = markdownToDoc(md);
    const node = parsed.content?.[0]?.content?.[0];
    const types = (node?.marks ?? []).map((m) => m.type).sort();
    expect(types).toEqual(["bold", "citation"]);
  });

  test("同一文本同时有 link 与 citation 时引用身份优先", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "双标记",
              marks: [
                { type: "link", attrs: { href: "https://example.com" } },
                { type: "citation", attrs: { key: "ck2" } },
              ],
            },
          ],
        },
      ],
    };
    const md = docToMarkdown(doc);
    expect(md).toContain("(muse://cite/ck2)");
    expect(md).not.toContain("example.com");
  });

  test("普通链接不受影响", () => {
    const md = "一段[普通链接](https://example.com)文字\n";
    const parsed = markdownToDoc(md);
    const node = parsed.content?.[0]?.content?.find((n) =>
      n.marks?.some((m) => m.type === "link"),
    );
    expect(node?.marks?.[0]?.attrs?.href).toBe("https://example.com");
    expect(docToMarkdown(parsed)).toContain("(https://example.com)");
  });
});

describe("mock 事实检查（确定性）", () => {
  test("四种结论分类且缺少资料不表述为事实错误", () => {
    const text =
      "全球市场规模在 2025 年达到 120 亿。据统计用户数增长了 300%。这是我的个人看法。";
    const result = mockFactCheck(text, [
      {
        key: "k1",
        sourceTitle: "来源素材",
        excerpt: "全球市场规模在 2025 年达到 120 亿。",
        state: "available",
      },
      { key: "k2", sourceTitle: "被删素材", excerpt: "另一个论据", state: "missing" },
    ]);
    const verdicts = result.claims.map((c) => c.verdict);
    expect(verdicts).toContain("supported");
    expect(verdicts).toContain("unavailable");
    expect(verdicts).toContain("missing");

    const missing = result.claims.find((c) => c.verdict === "missing");
    expect(missing?.explanation).toContain("不代表它是错的");
    expect(missing?.explanation).toContain("个人观点");
    expect(missing?.explanation).not.toContain("事实错误");
  });

  test("无资料且无数据句时给出中性总结", () => {
    const result = mockFactCheck("这是一段纯观点内容。", []);
    expect(result.claims).toHaveLength(0);
    expect(result.summary).toContain("未发现");
  });
});

describe("旧库兼容", () => {
  test("旧 review_findings 补 evidence_state 且历史行保留 NULL", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE review_findings (
        id INTEGER PRIMARY KEY,
        review_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info',
        quote TEXT NOT NULL DEFAULT '',
        suggestion TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open'
      );
      CREATE TABLE articles (id INTEGER PRIMARY KEY);
      CREATE TABLE article_versions (id INTEGER PRIMARY KEY);
      CREATE TABLE platform_variants (id INTEGER PRIMARY KEY, source_version_id INTEGER);
      INSERT INTO review_findings (id, review_id, category, suggestion)
      VALUES (1, 1, 'fact', '旧建议');
    `);
    const statements = compatibilityMigrationSql({
      articles: ["id", "summary", "cover_asset_id"],
      platformVariants: ["id", "source_version_id"],
      reviewFindings: ["id", "review_id", "category", "severity", "quote", "suggestion", "status"],
      // 本用例只关注 findings 补列；reviews/assets 视为已是新结构
      reviews: ["id", "source_revision_id", "output_revision_id"],
      assets: ["id", "creation_id"],
    });
    statements.forEach((statement) => sqlite.exec(statement));

    const columns = sqlite.query("PRAGMA table_info(review_findings)").all() as {
      name: string;
    }[];
    expect(columns.some((c) => c.name === "evidence_state")).toBe(true);
    const row = sqlite
      .query("SELECT suggestion, evidence_state FROM review_findings WHERE id = 1")
      .get() as { suggestion: string; evidence_state: string | null };
    expect(row).toEqual({ suggestion: "旧建议", evidence_state: null });
  });
});
