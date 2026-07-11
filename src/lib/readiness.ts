import { desc, eq, inArray } from "drizzle-orm";
import {
  articles,
  packagings,
  platformVariants,
  reviewFindings,
  reviews,
  topics,
} from "@/db/schema";
import { briefFingerprint, briefRequiredFields, normalizeTopicBrief } from "@/lib/briefs";
import { getCitationStatesCore } from "@/lib/citations";
import type { MuseDb } from "@/lib/drafts";
import { getActiveRevisionCore, isDerivativeStale } from "@/lib/revisions";

/**
 * 唯一领域状态计算（feat-023）。
 * 就绪与否只由可核查的事实推导，不读 articles.status，不看“执行过某动作”。
 * computeReadiness 是纯函数：服务端汇集事实，客户端在正文变化时用同一函数即时重算。
 */

export interface ReadinessFacts {
  articleId: number;
  /** 当前正文（工作稿优先）是否非空 */
  hasContent: boolean;
  /** 当前正文是否已固化为不可变检查点 */
  checkpoint: { id: number; versionNo: number } | null;
  /** null = 自由写作（无选题/Brief），不产生 Brief 类缺口 */
  brief: {
    complete: boolean;
    /** null = 从未记录对齐事实（旧数据），不产生缺口 */
    aligned: boolean | null;
  } | null;
  /** 标记需要证据的要点覆盖情况（noCitationRequired 的要点不计入 required） */
  evidence: { requiredKeyPoints: number; coveredKeyPoints: number };
  /** 证据引用的有效状态（feat-022） */
  citations: { total: number; degraded: number };
  review: { hasCurrent: boolean; openCriticalCurrent: number };
  packaging: { exists: boolean; current: boolean };
  variants: { total: number; current: number };
}

export type ReadinessTarget =
  | "editor"
  | "brief"
  | "evidence"
  | "review"
  | "packaging"
  | "variants"
  | "publish";

export interface ReadinessGap {
  id:
    | "empty-content"
    | "brief-incomplete"
    | "brief-unaligned"
    | "evidence-missing"
    | "critical-open"
    | "review-missing"
    | "citations-degraded"
    | "packaging-stale"
    | "variants-missing"
    | "variants-stale";
  /** 阻断发布：服务端发布校验强制执行 */
  blocking: boolean;
  title: string;
  reason: string;
  fix: { label: string; target: ReadinessTarget };
  skippable: boolean;
  skipRisk?: string;
}

export interface NextAction {
  label: string;
  target: ReadinessTarget;
  /** 阻塞原因；null = 不阻塞发布，只是建议 */
  reason: string | null;
  skippable: boolean;
  skipRisk?: string;
}

export interface Readiness {
  readyToPublish: boolean;
  /** 自然语言整体状态 */
  state: string;
  gaps: ReadinessGap[];
  nextAction: NextAction;
}

export function computeReadiness(facts: ReadinessFacts): Readiness {
  const gaps: ReadinessGap[] = [];

  if (!facts.hasContent) {
    gaps.push({
      id: "empty-content",
      blocking: true,
      title: "正文还是空的",
      reason: "没有内容就无法检查和发布。",
      fix: { label: "开始写作", target: "editor" },
      skippable: false,
    });
  }

  if (facts.brief && !facts.brief.complete) {
    gaps.push({
      id: "brief-incomplete",
      blocking: false,
      title: "创作说明还不完整",
      reason: "写给谁、想达到什么、核心观点等还有空缺，AI 检查和平台稿会更盲目。",
      fix: { label: "完善创作说明", target: "brief" },
      skippable: true,
      skipRisk: "内容方向可能不聚焦，后续检查缺少参照。",
    });
  }

  if (facts.brief && facts.brief.aligned === false) {
    gaps.push({
      id: "brief-unaligned",
      blocking: false,
      title: "创作说明改过了，正文还没确认对齐",
      reason: "创作说明在正文成稿后被修改，正文可能已偏离新方向。",
      fix: { label: "查看创作说明并确认", target: "brief" },
      skippable: true,
      skipRisk: "发布的内容可能与你最新的创作意图不一致。",
    });
  }

  if (facts.evidence.requiredKeyPoints > facts.evidence.coveredKeyPoints) {
    const missing = facts.evidence.requiredKeyPoints - facts.evidence.coveredKeyPoints;
    gaps.push({
      id: "evidence-missing",
      blocking: false,
      title: `${missing} 个重点观点还没有依据`,
      reason: "这些观点没有关联资料，也没有标记为个人观点。",
      fix: { label: "补充资料或标记为个人观点", target: "brief" },
      skippable: true,
      skipRisk: "读者可能质疑这些观点的可信度。",
    });
  }

  if (facts.hasContent && facts.review.openCriticalCurrent > 0) {
    gaps.push({
      id: "critical-open",
      blocking: true,
      title: `有 ${facts.review.openCriticalCurrent} 个严重问题未处理`,
      reason: "检查发现的严重问题（如超出平台限制、安全风险）会直接影响发布。",
      fix: { label: "处理严重问题", target: "review" },
      skippable: false,
    });
  }

  if (facts.hasContent && !facts.review.hasCurrent) {
    gaps.push({
      id: "review-missing",
      blocking: false,
      title: "当前正文还没有检查过",
      reason: "正文是新的或改过之后还没有重新检查事实与质量。",
      fix: { label: "检查正文", target: "review" },
      skippable: true,
      skipRisk: "可能带着事实或质量问题发布。",
    });
  }

  if (facts.citations.degraded > 0) {
    gaps.push({
      id: "citations-degraded",
      blocking: false,
      title: `${facts.citations.degraded} 条引用的来源已变化或删除`,
      reason: "正文引用的资料内容与引用时不一致，需要核对。",
      fix: { label: "核对引用依据", target: "evidence" },
      skippable: true,
      skipRisk: "文中引用可能已失去可信来源。",
    });
  }

  if (facts.packaging.exists && !facts.packaging.current) {
    gaps.push({
      id: "packaging-stale",
      blocking: false,
      title: "包装内容基于旧正文",
      reason: "标题候选、摘要等是按旧正文生成的。",
      fix: { label: "更新包装", target: "packaging" },
      skippable: true,
      skipRisk: "对外展示的标题摘要可能与正文不符。",
    });
  }

  if (facts.hasContent && facts.variants.total === 0) {
    gaps.push({
      id: "variants-missing",
      blocking: true,
      title: "还没有平台稿",
      reason: "发布需要先为目标平台生成适配版本。",
      fix: { label: "生成平台稿", target: "variants" },
      skippable: false,
    });
  } else if (facts.variants.total > 0 && facts.variants.current === 0) {
    gaps.push({
      id: "variants-stale",
      blocking: true,
      title: "平台稿全部基于旧正文",
      reason: "正文更新后平台稿没有跟着更新，旧稿不能发布。",
      fix: { label: "更新平台稿", target: "variants" },
      skippable: false,
    });
  }

  const blocking = gaps.filter((gap) => gap.blocking);
  const readyToPublish = blocking.length === 0;
  const first = gaps[0];

  const state = !facts.hasContent
    ? "从写下第一段开始"
    : readyToPublish
      ? gaps.length === 0
        ? "一切就绪，可以发布了"
        : "可以发布，但还有可以改进的地方"
      : `距离可发布还差 ${blocking.length} 步`;

  const nextAction: NextAction = first
    ? {
        label: first.fix.label,
        target: first.fix.target,
        reason: first.blocking ? first.reason : null,
        skippable: first.skippable,
        skipRisk: first.skipRisk,
      }
    : {
        label: "去安排发布",
        target: "publish",
        reason: null,
        skippable: true,
      };

  return { readyToPublish, state, gaps, nextAction };
}

/** 发布前的服务端强制校验：旧稿或有严重问题时拒绝，不写任务、不调用适配器 */
export function assertPublishable(
  facts: ReadinessFacts,
  variantSourceVersionId: number | null,
): { ok: true } | { ok: false; reason: string } {
  if (!facts.hasContent) {
    return { ok: false, reason: "正文为空，无法发布。" };
  }
  if (!facts.checkpoint) {
    return { ok: false, reason: "正文有未固化的修改，请先在写作台完成检查或保存。" };
  }
  if (isDerivativeStale(variantSourceVersionId, facts.checkpoint.id)) {
    return {
      ok: false,
      reason: "这份平台稿基于旧正文，不能发布。请回到平台版本页更新后再试。",
    };
  }
  if (facts.review.openCriticalCurrent > 0) {
    return {
      ok: false,
      reason: `还有 ${facts.review.openCriticalCurrent} 个严重问题未处理，请先在审阅面板解决。`,
    };
  }
  return { ok: true };
}

/** 汇集 readiness 所需的全部事实；文章不存在返回 null */
export async function getReadinessFactsCore(
  db: MuseDb,
  articleId: number,
): Promise<ReadinessFacts | null> {
  const article = await db.query.articles.findFirst({ where: eq(articles.id, articleId) });
  if (!article) return null;

  const revision = await getActiveRevisionCore(db, articleId);
  const contentText = revision?.contentHtml.replace(/<[^>]+>/g, "").trim() ?? "";
  const checkpoint = revision?.checkpoint
    ? { id: revision.checkpoint.id, versionNo: revision.checkpoint.versionNo }
    : null;
  const checkpointId = checkpoint?.id ?? null;

  // Brief 完整性与对齐（无选题 → null，不产生 Brief 类缺口）
  const topic = article.topicId
    ? await db.query.topics.findFirst({ where: eq(topics.id, article.topicId) })
    : null;
  let brief: ReadinessFacts["brief"] = null;
  let evidence = { requiredKeyPoints: 0, coveredKeyPoints: 0 };
  if (topic) {
    const normalized = normalizeTopicBrief(topic.brief, topic);
    const fields = briefRequiredFields(normalized);
    const aligned =
      article.alignedBriefFingerprint === null
        ? null
        : article.alignedBriefFingerprint === briefFingerprint(normalized);
    brief = { complete: Object.values(fields).every(Boolean), aligned };
    const required = normalized.evidence.filter((item) => !item.noCitationRequired);
    evidence = {
      requiredKeyPoints: required.length,
      coveredKeyPoints: required.filter((item) => item.materialIds.length > 0).length,
    };
  }

  const citationStates = await getCitationStatesCore(db, articleId);
  const citations = {
    total: citationStates.length,
    degraded: citationStates.filter((c) => c.validity !== "valid").length,
  };

  const reviewRows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.articleId, articleId));
  const currentReviews = reviewRows.filter(
    (r) => !isDerivativeStale(r.sourceVersionId, checkpointId),
  );
  const currentFindings = currentReviews.length
    ? await db
        .select()
        .from(reviewFindings)
        .where(inArray(reviewFindings.reviewId, currentReviews.map((r) => r.id)))
    : [];
  const review = {
    hasCurrent: currentReviews.length > 0,
    openCriticalCurrent: currentFindings.filter(
      (f) => f.severity === "critical" && f.status === "open",
    ).length,
  };

  const latestPack = await db.query.packagings.findFirst({
    where: eq(packagings.articleId, articleId),
    orderBy: desc(packagings.createdAt),
  });
  const packaging = {
    exists: Boolean(latestPack),
    current: latestPack
      ? !isDerivativeStale(latestPack.sourceVersionId, checkpointId)
      : false,
  };

  const variantRows = await db
    .select()
    .from(platformVariants)
    .where(eq(platformVariants.articleId, articleId));
  const variants = {
    total: variantRows.length,
    current: variantRows.filter(
      (v) => !isDerivativeStale(v.sourceVersionId, checkpointId),
    ).length,
  };

  return {
    articleId,
    hasContent: contentText.length > 0,
    checkpoint,
    brief,
    evidence,
    citations,
    review,
    packaging,
    variants,
  };
}
