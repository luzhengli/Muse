"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, retroNotes } from "@/db";
import { recordRetroCore, type RetroAnswers } from "@/lib/retro";

export interface RetroWizardPayload {
  taskId: number | null;
  variantId: number | null;
  platform: string;
  externalUrl: string;
  answers: RetroAnswers;
  summary: string;
  title: string;
  nextTopicHint: string;
}

/** 复盘向导保存：一次写入表现数据 + Learning（resultId 溯源），失败不丢输入 */
export async function saveRetroWizard(
  payload: RetroWizardPayload,
): Promise<{ ok: false; message: string }> {
  const result = await recordRetroCore(db, payload);
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/retro");
  revalidatePath("/");
  redirect(`/retro?saved=${result.noteId}`);
}

// 旧的手动录入表单与一键转选题已移除（feat-026）：
// 记录表现走复盘向导（saveRetroWizard），经验回流走 /create 的预览-查重-确认。

export async function deleteRetroNote(id: number) {
  await db.delete(retroNotes).where(eq(retroNotes.id, id));
  revalidatePath("/retro");
}
