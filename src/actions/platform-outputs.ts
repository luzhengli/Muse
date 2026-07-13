"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  createPlatformOutputCore,
  createPublicationCore,
  getOutputDetailCore,
  saveOutputRevisionCore,
} from "@/lib/platform-outputs";
import type { OutputCheckResult } from "@/lib/platform-rules";

/**
 * 平台作品 server actions（feat-031 起）：只做参数整形与缓存刷新，
 * 校验与拒绝语义全部在 lib/platform-outputs 核心（服务端强制，不信任客户端）。
 */

function revalidateOutput(creationId: number, outputId: number) {
  revalidatePath("/creations");
  revalidatePath(`/creations/${creationId}`);
  revalidatePath(`/creations/${creationId}/outputs/${outputId}`);
}

/** 从项目页新建一份空白 X 作品并进入其编辑器（其余格式随 feat-032/033 开放） */
export async function createXOutput(formData: FormData) {
  const creationId = Number(formData.get("creationId"));
  const format = String(formData.get("format"));
  if (!creationId || (format !== "x_single_post" && format !== "x_thread")) return;
  const payload =
    format === "x_single_post"
      ? { type: "x_single_post", schemaVersion: 1, text: "" }
      : { type: "x_thread", schemaVersion: 1, posts: [{ text: "" }, { text: "" }] };
  const result = await createPlatformOutputCore(db, {
    creationId,
    payload,
    note: "新建空白作品",
  });
  if (!result.ok) {
    redirect(`/creations/${creationId}?error=${encodeURIComponent(result.error)}`);
  }
  revalidateOutput(creationId, result.value.outputId);
  redirect(`/creations/${creationId}/outputs/${result.value.outputId}`);
}

export interface SaveOutputResult {
  ok: boolean;
  error?: string;
  revisionNo?: number;
  reused?: boolean;
  check?: OutputCheckResult | null;
}

/** 保存作品修订；返回服务端权威的最新发布检查结果 */
export async function saveOutputRevisionAction(
  outputId: number,
  payload: unknown,
): Promise<SaveOutputResult> {
  const result = await saveOutputRevisionCore(db, outputId, payload);
  if (!result.ok) return { ok: false, error: result.error };
  const detail = await getOutputDetailCore(db, outputId);
  if (detail) revalidateOutput(detail.output.creationId, outputId);
  return {
    ok: true,
    revisionNo: result.value.revisionNo,
    reused: result.value.reused,
    check: detail?.check ?? null,
  };
}

export interface MarkPublishedResult {
  ok: boolean;
  error?: string;
  blockers?: string[];
  publicationId?: number;
}

/**
 * 标记已发布：冻结当前活动修订快照。
 * 检查未通过时默认拒绝并回显阻断项；显式带风险发布需附原因（服务端记录）。
 */
export async function markOutputPublishedAction(
  outputId: number,
  input: { url?: string; acceptRisk?: string },
): Promise<MarkPublishedResult> {
  const result = await createPublicationCore(db, {
    outputId,
    url: input.url,
    acceptRisk: input.acceptRisk,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      blockers: result.blockers?.map((b) => b.message),
    };
  }
  const detail = await getOutputDetailCore(db, outputId);
  if (detail) revalidateOutput(detail.output.creationId, outputId);
  return { ok: true, publicationId: result.value.publicationId };
}
