"use server";

import { revalidatePath } from "next/cache";
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
import {
  aiProvenance,
  completedAiAction,
  runExclusiveAiAction,
} from "@/lib/ai/action";
import type { AiActionResult, AiRunMeta } from "@/lib/ai";
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
export async function generateTopicsFromCollection(
  formData: FormData,
): Promise<AiActionResult<{ createdCount: number }>> {
  const collectionId = Number(formData.get("collectionId"));
  if (!collectionId) {
    return { ok: false, message: "请选择素材集合。", tone: "danger" };
  }
  return runExclusiveAiAction(
    `topics:collection:${collectionId}`,
    "generate-topics",
    async () => {
      const links = await db
        .select({ materialId: collectionMaterials.materialId })
        .from(collectionMaterials)
        .where(eq(collectionMaterials.collectionId, collectionId));
      const ids = links.map((l) => l.materialId);
      if (!ids.length) {
        return { ok: false, message: "该集合没有可用素材。", tone: "danger" };
      }
      const inputs = await loadMaterialInputs(ids);
      const result = await aiTopics(inputs, 3);
      for (const card of result.data) {
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
      return completedAiAction(
        result,
        `已生成 ${result.data.length} 个选题。`,
        { createdCount: result.data.length },
      );
    },
  );
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
export async function generateBriefAction(topicId: number): Promise<AiActionResult> {
  return runExclusiveAiAction(`brief:topic:${topicId}`, "generate-brief", async () => {
    const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
    if (!topic) return { ok: false, message: "选题不存在。", tone: "danger" };
    const inputs = await loadMaterialInputs(topic.materialIds);
    const result = await aiBrief(topic, inputs);
    const brief: TopicBrief = { ...result.data, citedMaterialIds: topic.materialIds };
    await db
      .update(topics)
      .set({ brief, status: "briefed" })
      .where(eq(topics.id, topicId));
    revalidatePath("/topics");
    revalidatePath(`/topics/${topicId}`);
    return completedAiAction(result, "创作 Brief 已生成。");
  });
}

/** 基于 brief 生成文章初稿，进入写作台 */
export async function createDraftFromTopic(topicId: number): Promise<AiActionResult> {
  return runExclusiveAiAction(`draft:topic:${topicId}`, "generate-draft", async () => {
    const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
    if (!topic) return { ok: false, message: "选题不存在。", tone: "danger" };

    const existing = await db.query.articles.findFirst({
      where: eq(articles.topicId, topicId),
    });
    if (existing) {
      return {
        ok: true,
        message: "该选题已有初稿，正在打开写作台。",
        tone: "success",
        redirectTo: `/articles/${existing.id}`,
      };
    }

    let brief = topic.brief;
    let briefMeta: AiRunMeta | undefined;
    const inputs = await loadMaterialInputs(topic.materialIds);
    if (!brief) {
      const briefResult = await aiBrief(topic, inputs);
      briefMeta = briefResult.meta;
      brief = { ...briefResult.data, citedMaterialIds: topic.materialIds };
      await db.update(topics).set({ brief }).where(eq(topics.id, topicId));
    }
    const draftResult = await aiDraft(topic.title, brief, inputs);
    const resultMeta = briefMeta?.source === "mock" ? briefMeta : draftResult.meta;

    const [article] = await db
      .insert(articles)
      .values({ topicId, title: draftResult.data.title, status: "draft" })
      .returning();
    await db.insert(articleVersions).values({
      articleId: article.id,
      versionNo: 1,
      contentHtml: draftResult.data.contentHtml,
      contentText: htmlToText(draftResult.data.contentHtml),
      note: `${aiProvenance(resultMeta)} 初稿`,
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
    return completedAiAction(
      { data: draftResult.data, meta: resultMeta },
      "初稿已生成，正在打开写作台。",
      undefined,
      `/articles/${article.id}`,
    );
  });
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
