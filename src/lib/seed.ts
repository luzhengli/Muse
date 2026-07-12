import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import {
  assets,
  creations,
  materialChunks,
  materials,
  topics,
} from "@/db/schema";
import {
  createCreationCore,
  saveSourceRevisionCore,
} from "@/lib/creations";
import type { MuseDb } from "@/lib/drafts";
import {
  addPerformanceSnapshotCore,
  createPlatformOutputCore,
  createPublicationCore,
} from "@/lib/platform-outputs";
import { nowUnix, segmentCjk } from "@/lib/utils";

/**
 * v1.0 新模型种子数据（FR-0.1：重置脚本 + 种子脚本，替代历史数据迁移）。
 *
 * 幂等：已存在创作项目时整体跳过（先 db:reset 再 db:seed）。
 * 内容为明确的演示数据；公众号作品刻意缺封面，用于演示
 * 「X/小红书就绪、公众号被阻断」的平台级独立 readiness（FR-3.1）。
 */

/** 1x1 透明 PNG（占位演示图片，写入资产池目录后可经 /api/assets 渲染） */
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export interface SeedResult {
  seeded: boolean;
  reason?: string;
  summary?: {
    materials: number;
    topics: number;
    creations: number;
    outputs: number;
    publications: number;
    snapshots: number;
    assets: number;
  };
}

async function seedAsset(
  db: MuseDb,
  assetDir: string,
  creationId: number,
  baseName: string,
) {
  fs.mkdirSync(assetDir, { recursive: true });
  const safeName = `seed-${baseName}.png`;
  fs.writeFileSync(path.join(assetDir, safeName), PLACEHOLDER_PNG);
  const [asset] = await db
    .insert(assets)
    .values({
      creationId,
      kind: "other",
      fileName: `${baseName}.png`,
      filePath: `data/assets/${safeName}`,
    })
    .returning();
  return asset.id;
}

export async function seedCore(
  db: MuseDb,
  options: { assetDir: string },
): Promise<SeedResult> {
  const existing = await db.select().from(creations).limit(1);
  if (existing.length > 0) {
    return {
      seeded: false,
      reason: "已存在创作项目，跳过种子数据（如需重来请先运行 db:reset）",
    };
  }

  // 素材：1 条已整理（含语料块 + FTS 索引），1 条原始 URL
  const [cleaned] = await db
    .insert(materials)
    .values({
      type: "text",
      title: "AI 辅助创作工具对比笔记（演示数据）",
      rawContent:
        "对比了三类 AI 辅助创作工具：大纲生成、改写润色、平台适配。个人体验是大纲生成节省的时间最明显。",
      summary: "三类 AI 辅助创作工具的个人使用体验对比。",
      tags: ["AI 写作", "工具"],
      cleanStatus: "cleaned",
    })
    .returning();
  const chunkContents = [
    "大纲生成类工具把动笔前的犹豫时间从半小时压缩到五分钟，是个人体验里节省最明显的一类。",
    "平台适配类工具的常见问题是产物不符合平台真实结构，仍需要手工重新排版。",
  ];
  for (const [index, content] of chunkContents.entries()) {
    const [chunk] = await db
      .insert(materialChunks)
      .values({ materialId: cleaned.id, orderIndex: index, content })
      .returning();
    await db.run(
      sql`INSERT INTO chunk_fts (content, chunk_id, material_id) VALUES (${segmentCjk(
        content,
      )}, ${chunk.id}, ${cleaned.id})`,
    );
  }
  await db.insert(materials).values({
    type: "url",
    title: "创作者经济观察长文（演示数据，未整理）",
    sourceUrl: "https://example.com/creator-economy",
    rawContent: "",
  });

  const [topic] = await db
    .insert(topics)
    .values({
      title: "AI 工作流如何提升个人创作产量",
      origin: "manual",
      status: "idea",
    })
    .returning();

  // 创作项目 A：多平台（通用稿 → 三平台作品；公众号刻意缺封面演示阻断）
  const creationA = await createCreationCore(db, {
    workingTitle: "AI 写作工作流实测（演示）",
    targetPlatforms: ["x", "xiaohongshu", "wechat"],
    topicId: topic.id,
    hypothesis: "Thread 形式比单条帖文更能带来讨论",
  });
  if (!creationA.ok) return { seeded: false, reason: creationA.error };
  const creationAId = creationA.value.creationId;

  const revision = await saveSourceRevisionCore(
    db,
    creationAId,
    "<h2>AI 写作工作流实测</h2><p>把 AI 放进创作流程一个月后的三个观察：大纲先行、平台作品各自成稿、复盘回流选题。</p>",
    "种子数据初稿",
  );
  if (!revision) return { seeded: false, reason: "通用稿修订创建失败" };

  const noteImage1 = await seedAsset(db, options.assetDir, creationAId, "note-1");
  const noteImage2 = await seedAsset(db, options.assetDir, creationAId, "note-2");

  const outputs = [
    await createPlatformOutputCore(db, {
      creationId: creationAId,
      sourceRevisionId: revision.revisionId,
      payload: {
        type: "x_thread",
        schemaVersion: 1,
        posts: [
          { text: "把 AI 放进创作流程一个月，3 个观察 🧵" },
          { text: "观察一：大纲先行。动笔前的犹豫时间从半小时压到五分钟。" },
          {
            text: "观察二：平台作品各自成稿，不再一稿多贴。完整记录 https://example.com/ai-workflow",
          },
        ],
      },
      note: "种子数据",
    }),
    await createPlatformOutputCore(db, {
      creationId: creationAId,
      sourceRevisionId: revision.revisionId,
      payload: {
        type: "xiaohongshu_image_note",
        schemaVersion: 1,
        title: "AI 写作一个月实测",
        body: "把 AI 放进创作流程一个月，最大的变化是动笔前不再犹豫。三个观察都在图里，评论区聊聊你的用法？",
        topics: ["AI写作", "效率工具"],
        images: [{ assetId: noteImage1 }, { assetId: noteImage2 }],
      },
      note: "种子数据",
      assetMeta: {
        [noteImage1]: { altText: "工作流总览图" },
        [noteImage2]: { altText: "三个观察要点图" },
      },
    }),
    await createPlatformOutputCore(db, {
      creationId: creationAId,
      sourceRevisionId: revision.revisionId,
      payload: {
        type: "wechat_article",
        schemaVersion: 1,
        title: "把 AI 放进创作流程一个月，我留下了这三个习惯",
        author: "Muse",
        digest: "大纲先行、平台作品各自成稿、复盘回流选题。",
        contentHtml:
          "<h2>大纲先行</h2><p>动笔前的犹豫时间从半小时压缩到五分钟。</p><h2>平台作品各自成稿</h2><p>不再一稿多贴。</p>",
        coverAssetId: null,
      },
      note: "种子数据（刻意缺封面，演示发布检查阻断）",
    }),
  ];
  for (const output of outputs) {
    if (!output.ok) return { seeded: false, reason: output.error };
  }

  // 创作项目 B：单平台直写（无通用稿）→ 已发布 + 一次表现快照
  const creationB = await createCreationCore(db, {
    workingTitle: "单平台：一条 X 洞察（演示）",
    targetPlatforms: ["x"],
  });
  if (!creationB.ok) return { seeded: false, reason: creationB.error };
  const singlePost = await createPlatformOutputCore(db, {
    creationId: creationB.value.creationId,
    payload: {
      type: "x_single_post",
      schemaVersion: 1,
      text: "写作最大的成本不是打字，是动笔前的犹豫。AI 没有替我写，但把犹豫的时间还给了我。",
    },
    note: "种子数据",
  });
  if (!singlePost.ok) return { seeded: false, reason: singlePost.error };

  const threeDaysAgo = nowUnix() - 3 * 86400;
  const publication = await createPublicationCore(db, {
    outputId: singlePost.value.outputId,
    url: "https://x.com/example/status/1234567890",
    publishedAt: threeDaysAgo,
    note: "种子数据：发布后第 3 天录入首个表现快照",
  });
  if (!publication.ok) return { seeded: false, reason: publication.error };
  const snapshot = await addPerformanceSnapshotCore(db, {
    publicationId: publication.value.publicationId,
    metrics: { 浏览: 1200, 点赞: 45, 回复: 6, 转发: 12, 书签: 9 },
  });
  if (!snapshot.ok) return { seeded: false, reason: snapshot.error };

  return {
    seeded: true,
    summary: {
      materials: 2,
      topics: 1,
      creations: 2,
      outputs: 4,
      publications: 1,
      snapshots: 1,
      assets: 2,
    },
  };
}
