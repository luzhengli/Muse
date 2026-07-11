import type { TopicBrief } from "@/db/schema";

type BriefFallback = {
  audience?: string;
  targetAudience?: string;
  objective?: string;
  coreClaim?: string;
  keyPoints?: string[];
  corePoints?: string[];
  angle?: string;
  platforms?: string[];
  recommendedPlatforms?: string[];
  materialIds?: number[];
};

const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const numbers = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    : [];
const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

/** 读取任意版本 TopicBrief JSON，并为旧字段自动补齐稳定默认值。 */
export function normalizeTopicBrief(value: unknown, fallback: BriefFallback = {}): TopicBrief {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const keyPoints = strings(raw.keyPoints);
  const fallbackKeyPoints = fallback.keyPoints ?? fallback.corePoints ?? [];
  const normalizedKeyPoints = keyPoints.length ? keyPoints : fallbackKeyPoints;
  const rawEvidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  const evidence = normalizedKeyPoints.map((keyPoint) => {
    const match = rawEvidence.find(
      (item) =>
        item &&
        typeof item === "object" &&
        text((item as Record<string, unknown>).keyPoint) === keyPoint,
    ) as Record<string, unknown> | undefined;
    return {
      keyPoint,
      materialIds: numbers(match?.materialIds),
      noCitationRequired: match?.noCitationRequired === true,
    };
  });
  const citedMaterialIds = numbers(raw.citedMaterialIds);
  return {
    audience: text(raw.audience, fallback.audience ?? fallback.targetAudience),
    objective: text(raw.objective, fallback.objective),
    coreClaim: text(raw.coreClaim, fallback.coreClaim ?? normalizedKeyPoints[0] ?? ""),
    platforms: strings(raw.platforms).length
      ? strings(raw.platforms)
      : (fallback.platforms ?? fallback.recommendedPlatforms ?? []),
    keyPoints: normalizedKeyPoints,
    angle: text(raw.angle, fallback.angle),
    tone: text(raw.tone),
    outline: strings(raw.outline),
    citedMaterialIds: citedMaterialIds.length ? citedMaterialIds : (fallback.materialIds ?? []),
    evidence,
  };
}

export function briefRequiredFields(brief: TopicBrief) {
  return {
    audience: brief.audience.trim().length > 0,
    objective: brief.objective.trim().length > 0,
    coreClaim: brief.coreClaim.trim().length > 0,
    keyPoints: brief.keyPoints.length > 0 && brief.keyPoints.every((point) => point.trim()),
    angle: brief.angle.trim().length > 0,
    tone: brief.tone.trim().length > 0,
    platforms: brief.platforms.length > 0,
    outline: brief.outline.length > 0 && brief.outline.every((item) => item.trim()),
  };
}

/** 绑定 AI 预览与产生它的 Brief，阻止修改 Brief 后确认旧预览。 */
export function briefFingerprint(brief: TopicBrief) {
  return JSON.stringify(normalizeTopicBrief(brief));
}
