import { desc, eq, inArray } from "drizzle-orm";
import {
  assets,
  creations,
  outputAssets,
  performanceSnapshots,
  platformOutputRevisions,
  platformOutputs,
  publications,
  sourceDocuments,
  sourceRevisions,
  type OutputAssetRole,
} from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import { nowUnix } from "@/lib/utils";
import {
  checkPlatformOutput,
  getRuleSet,
  parsePlatformOutputPayload,
  type OutputCheckItem,
  type OutputCheckResult,
  type PlatformOutputPayload,
} from "@/lib/platform-rules";

/**
 * 平台作品核心逻辑（PRD §3.1/§3.3，feat-030）。
 *
 * - payload 落库前必须通过 Zod 判别联合校验，修订记录生成时的 rulesVersion（FR-0.2）；
 * - 修订不可变：内容相同复用，变化才新增并推进活动修订指针；
 * - output_assets 行由 payload 派生（结构以 payload 为权威），承载 alt/裁剪元数据；
 * - 发布冻结活动修订快照，元数据（链接/时间/备注）随时可补录（FR-5.1）；
 * - 发布检查不通过时必须显式「带风险发布」并记录原因（FR-1.4）。
 *
 * 代码库无 DB 事务先例，沿用惯例：写入前全量预校验（payload / 资产归属 /
 * 溯源引用），校验失败零写入；校验通过后顺序写入。
 */

export type CoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; blockers?: OutputCheckItem[] };

/** 资产级元数据（alt/裁剪），按 assetId 键控；结构信息一律来自 payload */
export type OutputAssetMeta = Record<
  number,
  { altText?: string; cropJson?: string | null }
>;

interface DerivedAssetRow {
  assetId: number;
  role: OutputAssetRole;
  orderIndex: number;
  postIndex: number | null;
}

/**
 * 从 payload 派生 output_assets 结构行（纯函数）。
 * 公众号正文内图片的追踪随 feat-033 编辑器接线（HTML 内引用无法在数据层可靠解析），
 * 当前仅派生封面行。
 */
export function deriveOutputAssetRows(
  payload: PlatformOutputPayload,
): DerivedAssetRow[] {
  switch (payload.type) {
    case "x_single_post":
      return payload.media.map((m, i) => ({
        assetId: m.assetId,
        role: "post_media" as const,
        orderIndex: i,
        postIndex: null,
      }));
    case "x_thread":
      return payload.posts.flatMap((post, p) =>
        post.media.map((m, i) => ({
          assetId: m.assetId,
          role: "post_media" as const,
          orderIndex: i,
          postIndex: p,
        })),
      );
    case "xiaohongshu_image_note":
      return payload.images.map((img, i) => ({
        assetId: img.assetId,
        role: (i === 0 ? "first_image" : "body_image") as OutputAssetRole,
        orderIndex: i,
        postIndex: null,
      }));
    case "wechat_article":
      return payload.coverAssetId === null
        ? []
        : [
            {
              assetId: payload.coverAssetId,
              role: "cover" as const,
              orderIndex: 0,
              postIndex: null,
            },
          ];
  }
}

/** 校验 payload 引用的资产全部存在且属于该创作项目的资产池（§3.1） */
async function validateAssetOwnership(
  db: MuseDb,
  creationId: number,
  rows: DerivedAssetRow[],
): Promise<string | null> {
  const ids = [...new Set(rows.map((r) => r.assetId))];
  if (ids.length === 0) return null;
  const found = await db.select().from(assets).where(inArray(assets.id, ids));
  const byId = new Map(found.map((a) => [a.id, a]));
  for (const id of ids) {
    const asset = byId.get(id);
    if (!asset) return `引用的图片资产不存在（#${id}）`;
    if (asset.creationId !== creationId) {
      return `图片资产 #${id} 不属于该创作项目的资产池`;
    }
  }
  return null;
}

/** 把派生结构行与 alt/裁剪元数据合并（未指定时从上一修订按 assetId 继承） */
function applyAssetMeta(
  rows: DerivedAssetRow[],
  meta: OutputAssetMeta,
  previous: Array<{ assetId: number; altText: string; cropJson: string | null }>,
) {
  const prevByAsset = new Map(previous.map((p) => [p.assetId, p]));
  return rows.map((row) => {
    const m = meta[row.assetId];
    const prev = prevByAsset.get(row.assetId);
    return {
      ...row,
      altText: m?.altText ?? prev?.altText ?? "",
      cropJson: m?.cropJson !== undefined ? m.cropJson : (prev?.cropJson ?? null),
    };
  });
}

/** 结构 + 元数据的规范序列化，用于修订去重比较 */
function serializeAssetRows(
  rows: Array<DerivedAssetRow & { altText: string; cropJson: string | null }>,
) {
  return JSON.stringify(
    rows.map((r) => [r.assetId, r.role, r.orderIndex, r.postIndex, r.altText, r.cropJson]),
  );
}

export interface CreatePlatformOutputInput {
  creationId: number;
  payload: unknown;
  /** 从通用稿哪个修订派生（必须属于该创作项目） */
  sourceRevisionId?: number | null;
  /** output→output 适配溯源（FR-2.1） */
  derivedFromOutputId?: number | null;
  note?: string;
  assetMeta?: OutputAssetMeta;
}

export async function createPlatformOutputCore(
  db: MuseDb,
  input: CreatePlatformOutputInput,
): Promise<CoreResult<{ outputId: number; revisionId: number }>> {
  const payload = parsePlatformOutputPayload(input.payload);
  if (!payload) {
    return { ok: false, error: "作品内容不符合该平台类型的结构，未保存" };
  }
  const creation = await db.query.creations.findFirst({
    where: eq(creations.id, input.creationId),
  });
  if (!creation) return { ok: false, error: "创作项目不存在" };

  if (input.sourceRevisionId != null) {
    const revision = await db.query.sourceRevisions.findFirst({
      where: eq(sourceRevisions.id, input.sourceRevisionId),
    });
    if (!revision) return { ok: false, error: "来源通用稿修订不存在" };
    const doc = await db.query.sourceDocuments.findFirst({
      where: eq(sourceDocuments.id, revision.sourceDocumentId),
    });
    if (!doc || doc.creationId !== input.creationId) {
      return { ok: false, error: "来源通用稿修订不属于该创作项目" };
    }
  }
  if (input.derivedFromOutputId != null) {
    const from = await db.query.platformOutputs.findFirst({
      where: eq(platformOutputs.id, input.derivedFromOutputId),
    });
    if (!from) return { ok: false, error: "适配来源作品不存在" };
  }

  const structureRows = deriveOutputAssetRows(payload);
  const ownershipError = await validateAssetOwnership(
    db,
    input.creationId,
    structureRows,
  );
  if (ownershipError) return { ok: false, error: ownershipError };

  const ruleSet = getRuleSet(payload.type);
  const [output] = await db
    .insert(platformOutputs)
    .values({
      creationId: input.creationId,
      platform: ruleSet.platform,
      format: payload.type,
      sourceRevisionId: input.sourceRevisionId ?? null,
      derivedFromOutputId: input.derivedFromOutputId ?? null,
      rulesVersion: ruleSet.rulesVersion,
    })
    .returning();
  const [revision] = await db
    .insert(platformOutputRevisions)
    .values({
      outputId: output.id,
      revisionNo: 1,
      payloadJson: JSON.stringify(payload),
      schemaVersion: payload.schemaVersion,
      rulesVersion: ruleSet.rulesVersion,
      note: input.note ?? "",
    })
    .returning();
  await db
    .update(platformOutputs)
    .set({ activeRevisionId: revision.id, updatedAt: nowUnix() })
    .where(eq(platformOutputs.id, output.id));

  const rows = applyAssetMeta(structureRows, input.assetMeta ?? {}, []);
  if (rows.length > 0) {
    await db
      .insert(outputAssets)
      .values(rows.map((r) => ({ ...r, outputRevisionId: revision.id })));
  }
  await db
    .update(creations)
    .set({ updatedAt: nowUnix() })
    .where(eq(creations.id, input.creationId));
  return { ok: true, value: { outputId: output.id, revisionId: revision.id } };
}

export async function saveOutputRevisionCore(
  db: MuseDb,
  outputId: number,
  rawPayload: unknown,
  options: { note?: string; assetMeta?: OutputAssetMeta } = {},
): Promise<CoreResult<{ revisionId: number; revisionNo: number; reused: boolean }>> {
  const output = await db.query.platformOutputs.findFirst({
    where: eq(platformOutputs.id, outputId),
  });
  if (!output) return { ok: false, error: "平台作品不存在" };

  const payload = parsePlatformOutputPayload(rawPayload);
  if (!payload) {
    return { ok: false, error: "作品内容不符合该平台类型的结构，未保存" };
  }
  if (payload.type !== output.format) {
    return { ok: false, error: "作品类型不可更改（如需其他格式请新建或适配派生）" };
  }

  const structureRows = deriveOutputAssetRows(payload);
  const ownershipError = await validateAssetOwnership(
    db,
    output.creationId,
    structureRows,
  );
  if (ownershipError) return { ok: false, error: ownershipError };

  const active = output.activeRevisionId
    ? await db.query.platformOutputRevisions.findFirst({
        where: eq(platformOutputRevisions.id, output.activeRevisionId),
      })
    : null;
  const previousRows = active
    ? await db
        .select()
        .from(outputAssets)
        .where(eq(outputAssets.outputRevisionId, active.id))
    : [];

  const payloadJson = JSON.stringify(payload);
  const rows = applyAssetMeta(structureRows, options.assetMeta ?? {}, previousRows);
  if (active && active.payloadJson === payloadJson) {
    const prevSerialized = serializeAssetRows(
      [...previousRows]
        .sort((a, b) => a.id - b.id)
        .map((r) => ({
          assetId: r.assetId,
          role: r.role,
          orderIndex: r.orderIndex,
          postIndex: r.postIndex,
          altText: r.altText,
          cropJson: r.cropJson,
        })),
    );
    if (prevSerialized === serializeAssetRows(rows)) {
      return {
        ok: true,
        value: { revisionId: active.id, revisionNo: active.revisionNo, reused: true },
      };
    }
  }

  const latest = await db.query.platformOutputRevisions.findFirst({
    where: eq(platformOutputRevisions.outputId, outputId),
    orderBy: desc(platformOutputRevisions.revisionNo),
  });
  const revisionNo = (latest?.revisionNo ?? 0) + 1;
  const ruleSet = getRuleSet(payload.type);
  const [revision] = await db
    .insert(platformOutputRevisions)
    .values({
      outputId,
      revisionNo,
      payloadJson,
      schemaVersion: payload.schemaVersion,
      rulesVersion: ruleSet.rulesVersion,
      note: options.note ?? "",
    })
    .returning();
  if (rows.length > 0) {
    await db
      .insert(outputAssets)
      .values(rows.map((r) => ({ ...r, outputRevisionId: revision.id })));
  }
  await db
    .update(platformOutputs)
    .set({
      activeRevisionId: revision.id,
      rulesVersion: ruleSet.rulesVersion,
      updatedAt: nowUnix(),
    })
    .where(eq(platformOutputs.id, outputId));
  await db
    .update(creations)
    .set({ updatedAt: nowUnix() })
    .where(eq(creations.id, output.creationId));
  return { ok: true, value: { revisionId: revision.id, revisionNo, reused: false } };
}

export interface OutputDetail {
  output: typeof platformOutputs.$inferSelect;
  activeRevision: typeof platformOutputRevisions.$inferSelect | null;
  /** 解析失败（数据损坏）时为 null，check 同为 null，不伪造就绪状态 */
  payload: PlatformOutputPayload | null;
  check: OutputCheckResult | null;
  assets: Array<typeof outputAssets.$inferSelect>;
}

export async function getOutputDetailCore(
  db: MuseDb,
  outputId: number,
): Promise<OutputDetail | null> {
  const output = await db.query.platformOutputs.findFirst({
    where: eq(platformOutputs.id, outputId),
  });
  if (!output) return null;
  const activeRevision = output.activeRevisionId
    ? ((await db.query.platformOutputRevisions.findFirst({
        where: eq(platformOutputRevisions.id, output.activeRevisionId),
      })) ?? null)
    : null;
  let payload: PlatformOutputPayload | null = null;
  if (activeRevision) {
    try {
      payload = parsePlatformOutputPayload(JSON.parse(activeRevision.payloadJson));
    } catch {
      payload = null;
    }
  }
  const rows = activeRevision
    ? await db
        .select()
        .from(outputAssets)
        .where(eq(outputAssets.outputRevisionId, activeRevision.id))
    : [];
  return {
    output,
    activeRevision,
    payload,
    check: payload ? checkPlatformOutput(payload) : null,
    assets: rows,
  };
}

function validateUrl(url: string): string | null {
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return "链接需要以 http:// 或 https:// 开头";
  }
  return null;
}

export interface CreatePublicationInput {
  outputId: number;
  url?: string;
  publishedAt?: number;
  note?: string;
  /** 发布检查未通过时的显式带风险发布原因；不提供则阻断 */
  acceptRisk?: string;
}

export async function createPublicationCore(
  db: MuseDb,
  input: CreatePublicationInput,
): Promise<CoreResult<{ publicationId: number; outputRevisionId: number }>> {
  const detail = await getOutputDetailCore(db, input.outputId);
  if (!detail) return { ok: false, error: "平台作品不存在" };
  if (!detail.activeRevision || !detail.payload || !detail.check) {
    return { ok: false, error: "作品还没有可发布的内容" };
  }
  const url = input.url?.trim() ?? "";
  const urlError = validateUrl(url);
  if (urlError) return { ok: false, error: urlError };

  const acceptRisk = input.acceptRisk?.trim() ?? "";
  if (!detail.check.ready && !acceptRisk) {
    return {
      ok: false,
      error: "发布检查未通过，该作品还不能标记为已发布",
      blockers: detail.check.items.filter((i) => i.level === "blocker" && !i.passed),
    };
  }
  const withRisk = !detail.check.ready;
  const [publication] = await db
    .insert(publications)
    .values({
      outputId: detail.output.id,
      outputRevisionId: detail.activeRevision.id,
      platform: detail.output.platform,
      url,
      note: input.note?.trim() ?? "",
      publishedAt: input.publishedAt ?? nowUnix(),
      publishedWithRisk: withRisk ? 1 : 0,
      riskReason: withRisk ? acceptRisk : "",
    })
    .returning();
  return {
    ok: true,
    value: {
      publicationId: publication.id,
      outputRevisionId: detail.activeRevision.id,
    },
  };
}

/** 只允许编辑元数据（FR-5.1）；发布指向的修订快照不可变 */
export async function updatePublicationMetaCore(
  db: MuseDb,
  publicationId: number,
  input: { url?: string; publishedAt?: number; note?: string },
): Promise<CoreResult<{ publicationId: number }>> {
  const existing = await db.query.publications.findFirst({
    where: eq(publications.id, publicationId),
  });
  if (!existing) return { ok: false, error: "发布记录不存在" };
  const values: Partial<typeof publications.$inferInsert> = {};
  if (input.url !== undefined) {
    const url = input.url.trim();
    const urlError = validateUrl(url);
    if (urlError) return { ok: false, error: urlError };
    values.url = url;
  }
  if (input.publishedAt !== undefined) values.publishedAt = input.publishedAt;
  if (input.note !== undefined) values.note = input.note.trim();
  if (Object.keys(values).length === 0) {
    return { ok: true, value: { publicationId } };
  }
  await db
    .update(publications)
    .set(values)
    .where(eq(publications.id, publicationId));
  return { ok: true, value: { publicationId } };
}

export interface AddSnapshotInput {
  publicationId: number;
  metrics: Record<string, number>;
  capturedAt?: number;
  note?: string;
}

/** 录入表现快照；口径「数据截至发布后 N 天」由发布时间自动计算（FR-5.2） */
export async function addPerformanceSnapshotCore(
  db: MuseDb,
  input: AddSnapshotInput,
): Promise<CoreResult<{ snapshotId: number; daysSincePublish: number }>> {
  const publication = await db.query.publications.findFirst({
    where: eq(publications.id, input.publicationId),
  });
  if (!publication) return { ok: false, error: "发布记录不存在" };
  for (const [key, value] of Object.entries(input.metrics)) {
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: `指标「${key}」需要是不小于 0 的数字` };
    }
  }
  const capturedAt = input.capturedAt ?? nowUnix();
  const daysSincePublish = Math.max(
    0,
    Math.floor((capturedAt - publication.publishedAt) / 86400),
  );
  const [snapshot] = await db
    .insert(performanceSnapshots)
    .values({
      publicationId: input.publicationId,
      metrics: input.metrics,
      capturedAt,
      daysSincePublish,
      note: input.note?.trim() ?? "",
    })
    .returning();
  return { ok: true, value: { snapshotId: snapshot.id, daysSincePublish } };
}
