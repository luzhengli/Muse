"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  materials,
  materialChunks,
  collectionMaterials,
  topics,
  articles,
  articleVersions,
  articleCitations,
  type TopicBrief,
} from "@/db";
import { aiTopics, aiBrief, aiDraft, type MaterialInput } from "@/lib/ai";
import { htmlToText } from "@/lib/utils";

async function loadMaterialInputs(ids: number[]): Promise<MaterialInput[]> {
  if (!ids.length) return [];
  const rows = await db.select().from(materials).where(inArray(materials.id, ids));
  const chunks = await db
    .select()
    .from(materialChunks)
    .where(inArray(materialChunks.materialId, ids));
  return rows.map((m) => ({
    id: m.id,
    title: m.title,
    summary: m.summary,
    tags: m.tags,
    content:
      chunks
        .filter((c) => c.materialId === m.id)
        .map((c) => c.content)
        .join("\n") || m.rawContent,
  }));
}

/** 基于素材集合生成选题卡片 */
export async function generateTopicsFromCollection(formData: FormData) {
  const collectionId = Number(formData.get("collectionId"));
  if (!collectionId) return;
  const links = await db
    .select({ materialId: collectionMaterials.materialId })
    .from(collectionMaterials)
    .where(eq(collectionMaterials.collectionId, collectionId));
  const ids = links.map((l) => l.materialId);
  if (!ids.length) return;
  const inputs = await loadMaterialInputs(ids);
  const cards = await aiTopics(inputs, 3);
  for (const card of cards) {
    await db.insert(topics).values({
      collectionId,
      title: card.title,
      targetAudience: card.targetAudience,
      corePoints: card.corePoints,
      angle: card.angle,
      recommendedPlatforms: card.recommendedPlatforms,
      materialIds: ids,
      origin: "ai",
    });
  }
  revalidatePath("/topics");
}

/** 手动创建选题 */
export async function createManualTopic(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await db.insert(topics).values({
    title,
    targetAudience: String(formData.get("targetAudience") ?? ""),
    angle: String(formData.get("angle") ?? ""),
    corePoints: String(formData.get("corePoints") ?? "")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean),
    recommendedPlatforms: formData.getAll("platforms").map(String),
    origin: "manual",
  });
  revalidatePath("/topics");
}

/** 把选题卡片扩展为创作 brief */
export async function generateBriefAction(topicId: number) {
  const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
  if (!topic) return;
  const inputs = await loadMaterialInputs(topic.materialIds);
  const gen = await aiBrief(topic, inputs);
  const brief: TopicBrief = { ...gen, citedMaterialIds: topic.materialIds };
  await db
    .update(topics)
    .set({ brief, status: "briefed" })
    .where(eq(topics.id, topicId));
  revalidatePath("/topics");
  revalidatePath(`/topics/${topicId}`);
}

/** 基于 brief 生成文章初稿，进入写作台 */
export async function createDraftFromTopic(topicId: number) {
  const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
  if (!topic) return;
  let brief = topic.brief;
  const inputs = await loadMaterialInputs(topic.materialIds);
  if (!brief) {
    const gen = await aiBrief(topic, inputs);
    brief = { ...gen, citedMaterialIds: topic.materialIds };
    await db.update(topics).set({ brief }).where(eq(topics.id, topicId));
  }
  const draft = await aiDraft(topic.title, brief, inputs);

  const [article] = await db
    .insert(articles)
    .values({ topicId, title: draft.title, status: "draft" })
    .returning();
  await db.insert(articleVersions).values({
    articleId: article.id,
    versionNo: 1,
    contentHtml: draft.contentHtml,
    contentText: htmlToText(draft.contentHtml),
    note: "AI 初稿",
  });
  if (topic.materialIds.length) {
    await db.insert(articleCitations).values(
      topic.materialIds.map((materialId) => ({
        articleId: article.id,
        materialId,
        note: "选题引用素材",
      })),
    );
  }
  await db.update(topics).set({ status: "drafting" }).where(eq(topics.id, topicId));
  revalidatePath("/topics");
  revalidatePath("/articles");
  redirect(`/articles/${article.id}`);
}

export async function deleteTopic(id: number) {
  await db.delete(topics).where(eq(topics.id, id));
  revalidatePath("/topics");
}

export async function updateTopicStatus(id: number, status: "idea" | "briefed" | "drafting" | "done") {
  await db.update(topics).set({ status }).where(eq(topics.id, id));
  revalidatePath("/topics");
}

export { loadMaterialInputs };
