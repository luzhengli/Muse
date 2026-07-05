"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  db,
  publishResults,
  publishTasks,
  retroNotes,
  topics,
  type Platform,
} from "@/db";
import { aiRetroTopic } from "@/lib/ai";

/** 记录一次发布结果与互动数据（第一版手动录入） */
export async function recordResult(formData: FormData) {
  const platform = String(formData.get("platform") ?? "wechat") as Platform;
  const taskId = Number(formData.get("taskId")) || null;
  let variantId: number | null = null;
  let externalUrl = String(formData.get("externalUrl") ?? "");
  if (taskId) {
    const task = await db.query.publishTasks.findFirst({
      where: eq(publishTasks.id, taskId),
    });
    if (task) {
      variantId = task.variantId;
      externalUrl = externalUrl || task.externalUrl;
    }
  }
  await db.insert(publishResults).values({
    taskId,
    variantId,
    platform,
    externalUrl,
    views: Number(formData.get("views")) || 0,
    likes: Number(formData.get("likes")) || 0,
    comments: Number(formData.get("comments")) || 0,
    shares: Number(formData.get("shares")) || 0,
    commentFeedback: String(formData.get("commentFeedback") ?? ""),
  });
  revalidatePath("/retro");
}

/** 沉淀复盘结论 */
export async function createRetroNote(formData: FormData) {
  const insights = String(formData.get("insights") ?? "").trim();
  if (!insights) return;
  await db.insert(retroNotes).values({
    resultId: Number(formData.get("resultId")) || null,
    title:
      String(formData.get("title") ?? "").trim() ||
      `复盘 ${new Date().toLocaleDateString("zh-CN")}`,
    insights,
    nextTopicHint: String(formData.get("nextTopicHint") ?? ""),
  });
  revalidatePath("/retro");
}

/** 复盘结论反哺：一键转为下一轮选题 */
export async function convertRetroToTopic(retroId: number) {
  const note = await db.query.retroNotes.findFirst({
    where: eq(retroNotes.id, retroId),
  });
  if (!note || note.convertedTopicId) return;
  const card = await aiRetroTopic(note.insights, note.nextTopicHint);
  const [topic] = await db
    .insert(topics)
    .values({
      title: card.title,
      targetAudience: card.targetAudience,
      corePoints: card.corePoints,
      angle: card.angle,
      recommendedPlatforms: card.recommendedPlatforms,
      origin: "retro",
    })
    .returning();
  await db
    .update(retroNotes)
    .set({ convertedTopicId: topic.id })
    .where(eq(retroNotes.id, retroId));
  revalidatePath("/retro");
  revalidatePath("/topics");
}

export async function deleteRetroNote(id: number) {
  await db.delete(retroNotes).where(eq(retroNotes.id, id));
  revalidatePath("/retro");
}
