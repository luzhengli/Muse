import { eq } from "drizzle-orm";
import { platformVariants, publishTasks } from "@/db/schema";
import type { MuseDb } from "@/lib/drafts";
import { assertPublishable, getReadinessFactsCore } from "@/lib/readiness";
import { nowUnix } from "@/lib/utils";

/**
 * 手动发布助手核心（feat-026）：用户在真实平台手动发布后，
 * 粘贴链接「标记已发布」。写入前仍执行服务端就绪校验——旧稿一样不可标记。
 * mock 适配器不再进入普通流程，仅保留给开发测试。
 */
export async function markManualPublishedCore(
  db: MuseDb,
  variantId: number,
  externalUrl: string,
): Promise<{ ok: true; taskId: number } | { ok: false; reason: string }> {
  const variant = await db.query.platformVariants.findFirst({
    where: eq(platformVariants.id, variantId),
  });
  if (!variant) return { ok: false, reason: "平台稿不存在。" };
  const facts = await getReadinessFactsCore(db, variant.articleId);
  if (!facts) return { ok: false, reason: "文章不存在，无法标记发布。" };
  const gate = assertPublishable(facts, variant.sourceVersionId);
  if (!gate.ok) return gate;

  const url = externalUrl.trim();
  if (url && !/^https?:\/\//.test(url)) {
    return { ok: false, reason: "链接需要以 http(s):// 开头；也可以留空稍后补充。" };
  }
  const [task] = await db
    .insert(publishTasks)
    .values({
      variantId,
      platform: variant.platform,
      scheduledAt: nowUnix(),
      status: "published",
      publishedAt: nowUnix(),
      externalUrl: url,
    })
    .returning();
  return { ok: true, taskId: task.id };
}
