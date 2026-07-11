import { articles, articleVersions, topics, type TopicBrief } from "@/db/schema";
import { briefFingerprint, normalizeTopicBrief } from "@/lib/briefs";
import type { MuseDb } from "@/lib/drafts";
import type { TopicCardGen } from "@/lib/ai/types";

/**
 * 创建向导核心逻辑（feat-024）。
 * AI 候选只作预览；只有 confirmCreationCore 会写库，
 * 一次确认恰好创建 1 个选题 + 1 篇文章（v1 空白稿）+ 对齐指纹。
 */

/** 从一句话想法归一出选题标题（取首句，最长 40 字） */
export function normalizeIdeaTitle(idea: string): string {
  const compact = idea.replace(/\s+/g, " ").trim();
  const firstSentence = compact.split(/[。！？!?\n]/)[0]?.trim() || compact;
  return firstSentence.slice(0, 40);
}

/** 查重前归一：去掉标点、空白与常见虚词，避免噪声稀释相似度 */
function cleanForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/[的了吗呢吧地得与和或]/g, "");
}

/** 字符 bigram 相似度（0~1），用于选题查重提示 */
export function titleSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const t = cleanForMatch(s);
    if (t.length < 2) return new Set(t ? [t] : []);
    const set = new Set<string>();
    for (let i = 0; i + 2 <= t.length; i++) set.add(t.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit++;
  return hit / Math.min(ga.size, gb.size);
}

export interface SimilarTopic {
  id: number;
  title: string;
  similarity: number;
}

/**
 * 与既有选题查重：包含关系或 bigram 相似度达到阈值视为疑似重复。
 * 这只是提示不是拦截，阈值放宽（0.35）以覆盖真实 AI 的同义改写。
 */
export function findSimilarTopics(
  existing: { id: number; title: string }[],
  title: string,
  threshold = 0.35,
): SimilarTopic[] {
  const target = cleanForMatch(title);
  if (!target) return [];
  return existing
    .map((t) => {
      const other = cleanForMatch(t.title);
      const contains =
        target.length >= 4 && (other.includes(target) || target.includes(other));
      const similarity = contains ? 1 : titleSimilarity(t.title, title);
      return { id: t.id, title: t.title, similarity };
    })
    .filter((t) => t.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

/** 创作说明问题的答案（全部可跳过，缺省用默认值） */
export interface BriefAnswers {
  audience: string;
  objective: string;
  coreClaim: string;
  platforms: string[];
  tone: string;
  /** 勾选 = 该要点需要证据；未勾选 = 个人观点无需引用 */
  keyPointsNeedEvidence: { keyPoint: string; needsEvidence: boolean }[];
}

/** 为创作说明问题生成默认答案：候选卡片字段优先，其次首次引导的平台偏好 */
export function defaultBriefAnswers(
  candidate: Pick<TopicCardGen, "title" | "targetAudience" | "corePoints" | "recommendedPlatforms">,
  primaryPlatform: string,
): BriefAnswers {
  const platforms = candidate.recommendedPlatforms.length
    ? candidate.recommendedPlatforms
    : primaryPlatform
      ? [primaryPlatform]
      : ["wechat"];
  return {
    audience: candidate.targetAudience || "对这个话题感兴趣的普通读者",
    objective: `读完能对「${candidate.title.slice(0, 20)}」有清晰判断，并知道下一步怎么做`,
    coreClaim: candidate.corePoints[0] || candidate.title,
    platforms,
    tone: "真诚直接，用第一人称与读者对话",
    keyPointsNeedEvidence: (candidate.corePoints.length
      ? candidate.corePoints
      : [candidate.title]
    ).map((keyPoint) => ({ keyPoint, needsEvidence: false })),
  };
}

/** 由答案组装 TopicBrief（normalizeTopicBrief 是唯一兼容边界） */
export function briefFromAnswers(
  candidate: Pick<TopicCardGen, "title" | "angle" | "corePoints">,
  answers: BriefAnswers,
): TopicBrief {
  return normalizeTopicBrief({
    audience: answers.audience,
    objective: answers.objective,
    coreClaim: answers.coreClaim,
    platforms: answers.platforms,
    keyPoints: answers.keyPointsNeedEvidence.map((k) => k.keyPoint),
    angle: candidate.angle,
    tone: answers.tone,
    outline: [
      `开头：用一个具体场景引出「${candidate.title.slice(0, 20)}」`,
      ...answers.keyPointsNeedEvidence.slice(0, 3).map((k, i) => `分论点 ${i + 1}：${k.keyPoint.slice(0, 30)}`),
      "结尾：总结行动建议",
    ],
    citedMaterialIds: [],
    evidence: answers.keyPointsNeedEvidence.map((k) => ({
      keyPoint: k.keyPoint,
      materialIds: [],
      noCitationRequired: !k.needsEvidence,
    })),
  });
}

export interface CreationInput {
  title: string;
  targetAudience: string;
  corePoints: string[];
  angle: string;
  recommendedPlatforms: string[];
  brief: TopicBrief;
  origin: "manual" | "ai" | "retro";
}

/**
 * 确认创建：恰好写入 1 个选题 + 1 篇文章（v1 空白稿）+ 对齐指纹。
 * 标题为空时拒绝，不写任何记录。
 */
export async function confirmCreationCore(
  db: MuseDb,
  input: CreationInput,
): Promise<{ ok: true; articleId: number; topicId: number } | { ok: false; message: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "请先写下你的想法或标题。" };
  const brief = normalizeTopicBrief(input.brief);
  const [topic] = await db
    .insert(topics)
    .values({
      title,
      targetAudience: input.targetAudience,
      corePoints: input.corePoints,
      angle: input.angle,
      recommendedPlatforms: input.recommendedPlatforms,
      brief,
      status: "drafting",
      origin: input.origin,
    })
    .returning();
  const [article] = await db
    .insert(articles)
    .values({
      topicId: topic.id,
      title,
      status: "draft",
      alignedBriefFingerprint: briefFingerprint(brief),
    })
    .returning();
  await db.insert(articleVersions).values({
    articleId: article.id,
    versionNo: 1,
    contentHtml: "<p></p>",
    contentText: "",
    note: "新创作空白稿",
  });
  return { ok: true, articleId: article.id, topicId: topic.id };
}
