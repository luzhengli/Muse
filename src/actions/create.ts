"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, retroNotes, topics } from "@/db";
import { aiRetroTopic, aiTopics } from "@/lib/ai";
import type { AiActionResult, TopicCardGen } from "@/lib/ai";
import { aiProvenance, completedAiAction, runExclusiveAiAction } from "@/lib/ai/action";
import {
  briefFromAnswers,
  confirmCreationCore,
  findSimilarTopics,
  normalizeIdeaTitle,
  type BriefAnswers,
  type SimilarTopic,
} from "@/lib/create";
import { saveAppSettings } from "@/lib/settings-store";
import type { OnboardingSettings } from "@/lib/settings";

/** 保存首次引导答案（全部可跳过；答案只作为后续默认值） */
export async function saveOnboarding(patch: Partial<OnboardingSettings>) {
  saveAppSettings({ onboarding: patch as OnboardingSettings });
  revalidatePath("/");
}

export interface TopicCandidate extends TopicCardGen {
  /** 与既有选题的查重提示 */
  duplicates: SimilarTopic[];
  /** 推荐项（列表中最贴合想法的一个） */
  recommended: boolean;
}

export interface IdeaPreview {
  candidates: TopicCandidate[];
  sourceLabel: string;
}

async function withDuplicates(cards: TopicCardGen[]): Promise<TopicCandidate[]> {
  const existing = await db.select({ id: topics.id, title: topics.title }).from(topics);
  return cards.map((card, index) => ({
    ...card,
    duplicates: findSimilarTopics(existing, card.title),
    recommended: index === 0,
  }));
}

/** 想法 → AI 方向候选。只返回预览，放弃不产生任何记录。 */
export async function previewIdeaTopics(idea: string): Promise<AiActionResult<IdeaPreview>> {
  const trimmed = idea.trim();
  if (!trimmed) {
    return { ok: false, message: "先写下你的想法，一句话就够。", tone: "danger" };
  }
  return runExclusiveAiAction(`idea-preview:${trimmed.slice(0, 40)}`, "generate-topics", async () => {
    const result = await aiTopics(
      [
        {
          id: 0,
          title: normalizeIdeaTitle(trimmed),
          summary: trimmed.slice(0, 200),
          content: trimmed,
          tags: [],
        },
      ],
      3,
    );
    return completedAiAction(result, "已生成几个方向，确认后才会正式创建。", {
      candidates: await withDuplicates(result.data),
      sourceLabel: aiProvenance(result.meta),
    });
  });
}

/** 历史经验 → AI 方向候选预览（不写库、不改复盘记录） */
export async function previewRetroTopic(
  retroId: number,
): Promise<AiActionResult<IdeaPreview>> {
  return runExclusiveAiAction(`retro-preview:${retroId}`, "retro-to-topic", async () => {
    const note = await db.query.retroNotes.findFirst({ where: eq(retroNotes.id, retroId) });
    if (!note) return { ok: false, message: "这条经验不存在。", tone: "danger" };
    const result = await aiRetroTopic(note.insights, note.nextTopicHint);
    return completedAiAction(result, "已根据这条经验生成方向，确认后才会正式创建。", {
      candidates: await withDuplicates([result.data]),
      sourceLabel: aiProvenance(result.meta),
    });
  });
}

export interface ConfirmCreationPayload {
  candidate: TopicCardGen;
  answers: BriefAnswers;
  origin: "manual" | "ai" | "retro";
  /** 来自历史经验时，创建后回写 convertedTopicId 保持溯源 */
  retroId?: number;
}

/** 确认创建：恰好 1 个选题 + 1 篇文章；失败不落任何记录 */
export async function confirmCreation(
  payload: ConfirmCreationPayload,
): Promise<AiActionResult<{ articleId: number }>> {
  const brief = briefFromAnswers(payload.candidate, payload.answers);
  const result = await confirmCreationCore(db, {
    title: payload.candidate.title,
    targetAudience: payload.answers.audience,
    corePoints: payload.answers.keyPointsNeedEvidence.map((k) => k.keyPoint),
    angle: payload.candidate.angle,
    recommendedPlatforms: payload.answers.platforms,
    brief,
    origin: payload.origin,
  });
  if (!result.ok) return { ok: false, message: result.message, tone: "danger" };
  if (payload.retroId) {
    await db
      .update(retroNotes)
      .set({ convertedTopicId: result.topicId })
      .where(eq(retroNotes.id, payload.retroId));
    revalidatePath("/retro");
  }
  revalidatePath("/");
  revalidatePath("/topics");
  revalidatePath("/articles");
  return {
    ok: true,
    message: "创作已建立，正在打开写作台。",
    tone: "success",
    data: { articleId: result.articleId },
    redirectTo: `/articles/${result.articleId}`,
  };
}
