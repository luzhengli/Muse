"use server";

import { revalidatePath } from "next/cache";
import { and, eq, lte, inArray } from "drizzle-orm";
import { db, publishTasks, platformVariants, articles } from "@/db";
import { getAdapter } from "@/lib/publish/adapters";
import { nowUnix } from "@/lib/utils";

/** 创建定时发布任务 */
export async function createPublishTask(formData: FormData) {
  const variantId = Number(formData.get("variantId"));
  const scheduledLocal = String(formData.get("scheduledAt") ?? "");
  if (!variantId) return;
  const variant = await db.query.platformVariants.findFirst({
    where: eq(platformVariants.id, variantId),
  });
  if (!variant) return;
  const scheduledAt = scheduledLocal
    ? Math.floor(new Date(scheduledLocal).getTime() / 1000)
    : nowUnix();
  await db.insert(publishTasks).values({
    variantId,
    platform: variant.platform,
    scheduledAt,
    status: "pending",
  });
  revalidatePath("/publish");
}

async function executeTask(taskId: number) {
  const task = await db.query.publishTasks.findFirst({
    where: eq(publishTasks.id, taskId),
  });
  if (!task || task.status === "published") return;
  const variant = await db.query.platformVariants.findFirst({
    where: eq(platformVariants.id, task.variantId),
  });
  if (!variant) {
    await db
      .update(publishTasks)
      .set({ status: "failed", lastError: "平台版本已被删除" })
      .where(eq(publishTasks.id, taskId));
    return;
  }
  await db
    .update(publishTasks)
    .set({ status: "publishing", attempts: task.attempts + 1 })
    .where(eq(publishTasks.id, taskId));

  const outcome = await getAdapter(task.platform).publish({ variant });
  if (outcome.ok) {
    await db
      .update(publishTasks)
      .set({
        status: "published",
        publishedAt: nowUnix(),
        externalUrl: outcome.externalUrl ?? "",
        lastError: "",
      })
      .where(eq(publishTasks.id, taskId));
    await db
      .update(articles)
      .set({ status: "published" })
      .where(eq(articles.id, variant.articleId));
  } else {
    await db
      .update(publishTasks)
      .set({ status: "failed", lastError: outcome.error ?? "未知错误" })
      .where(eq(publishTasks.id, taskId));
  }
}

/** 调度器：执行所有到期的待发布任务（页面加载或手动触发时调用） */
export async function runDueTasks() {
  const due = await db
    .select({ id: publishTasks.id })
    .from(publishTasks)
    .where(
      and(
        inArray(publishTasks.status, ["pending"]),
        lte(publishTasks.scheduledAt, nowUnix()),
      ),
    );
  for (const t of due) {
    await executeTask(t.id);
  }
  revalidatePath("/publish");
  return due.length;
}

/** 立即发布 */
export async function publishNow(taskId: number) {
  await executeTask(taskId);
  revalidatePath("/publish");
}

/** 失败重试 */
export async function retryTask(taskId: number) {
  await db
    .update(publishTasks)
    .set({ status: "pending", scheduledAt: nowUnix() })
    .where(eq(publishTasks.id, taskId));
  await executeTask(taskId);
  revalidatePath("/publish");
}

export async function deleteTask(taskId: number) {
  await db.delete(publishTasks).where(eq(publishTasks.id, taskId));
  revalidatePath("/publish");
}
