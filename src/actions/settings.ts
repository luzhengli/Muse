"use server";

import { revalidatePath } from "next/cache";
import { generateText } from "ai";
import { z } from "zod";
import {
  getAppSettings,
  resetAppSettingsSection,
  saveAppSettings,
} from "@/lib/settings-store";
import { getAiRuntime } from "@/lib/ai/provider";
import type { AppSettings } from "@/lib/settings";

export interface SettingsActionResult {
  ok: boolean;
  message: string;
  tone: "success" | "warning" | "danger";
}

/** 表单值 → 分区 patch 的严格校验（zod safeParse，失败返回具体错误不写库） */
const editorFormSchema = z.object({
  autosaveIntervalMs: z.coerce
    .number({ message: "自动保存间隔必须是数字" })
    .int("自动保存间隔必须是整数毫秒")
    .min(500, "自动保存间隔最短 500ms")
    .max(10_000, "自动保存间隔最长 10000ms"),
  fontSize: z.coerce
    .number({ message: "字号必须是数字" })
    .int()
    .min(12, "字号范围 12-22")
    .max(22, "字号范围 12-22"),
  lineHeight: z.coerce
    .number({ message: "行高必须是数字" })
    .min(1.4, "行高范围 1.4-2.4")
    .max(2.4, "行高范围 1.4-2.4"),
  spellcheck: z.coerce.boolean(),
  defaultFocusMode: z.coerce.boolean(),
});

const aiFormSchema = z.object({
  provider: z.enum(["", "anthropic", "openai", "openai-compatible", "mock"], {
    message: "provider 取值不合法",
  }),
  baseUrl: z
    .string()
    .trim()
    .max(500, "Base URL 过长")
    .refine((v) => v === "" || /^https?:\/\//.test(v), {
      message: "Base URL 需以 http(s):// 开头，或留空跟随环境变量",
    }),
  model: z.string().trim().max(200, "模型名过长"),
  timeoutMs: z
    .union([z.literal(""), z.coerce.number().int().min(1_000, "超时至少 1000ms").max(120_000, "超时最多 120000ms")])
    .transform((v) => (v === "" ? null : v)),
  mockFallback: z.coerce.boolean(),
});

const appearanceFormSchema = z.object({
  theme: z.enum(["light", "system"], { message: "主题取值不合法" }),
  motion: z.enum(["system", "reduced"], { message: "动效偏好取值不合法" }),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "输入不合法";
}

export async function saveEditorSettings(
  form: Record<string, unknown>,
): Promise<SettingsActionResult> {
  const parsed = editorFormSchema.safeParse(form);
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error), tone: "danger" };
  }
  saveAppSettings({ editor: parsed.data });
  revalidatePath("/settings");
  return { ok: true, message: "编辑器设置已保存，写作台下次打开时生效。", tone: "success" };
}

export async function saveAiSettings(
  form: Record<string, unknown>,
): Promise<SettingsActionResult> {
  const parsed = aiFormSchema.safeParse(form);
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error), tone: "danger" };
  }
  saveAppSettings({ ai: parsed.data });
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, message: "AI 设置已保存，下一次 AI 调用即生效。", tone: "success" };
}

export async function saveAppearanceSettings(
  form: Record<string, unknown>,
): Promise<SettingsActionResult> {
  const parsed = appearanceFormSchema.safeParse(form);
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error), tone: "danger" };
  }
  saveAppSettings({ appearance: parsed.data });
  revalidatePath("/", "layout");
  return { ok: true, message: "外观与交互设置已保存并即时生效。", tone: "success" };
}

export async function resetSettingsSection(
  section: keyof AppSettings,
): Promise<SettingsActionResult> {
  resetAppSettingsSection(section);
  revalidatePath("/settings");
  if (section === "appearance") revalidatePath("/", "layout");
  return { ok: true, message: "已恢复该区块的默认设置。", tone: "success" };
}

export interface AiConnectionTestResult extends SettingsActionResult {
  provider: string;
  model: string;
  durationMs: number;
}

/** 用当前生效配置发起一次最小真实调用（不写库、不发送用户内容） */
export async function testAiConnection(): Promise<AiConnectionTestResult> {
  const runtime = getAiRuntime();
  const startedAt = Date.now();
  if (!runtime.model) {
    return {
      ok: false,
      tone: "warning",
      message:
        runtime.provider === "mock"
          ? "当前 provider 为 mock，不需要连接测试；所有 AI 结果都来自本地确定性 mock。"
          : "未检测到对应密钥环境变量，无法连接真实 AI。当前会按设置降级 mock 或报错。",
      provider: runtime.provider,
      model: runtime.modelId,
      durationMs: 0,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(runtime.timeoutMs, 15_000));
  try {
    await generateText({
      model: runtime.model,
      abortSignal: controller.signal,
      prompt: "连接测试：请只回复「OK」两个字符。",
    });
    const durationMs = Date.now() - startedAt;
    return {
      ok: true,
      tone: "success",
      message: `连接成功（${durationMs}ms）。`,
      provider: runtime.provider,
      model: runtime.modelId,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const timedOut = controller.signal.aborted;
    // 不在返回信息中透出原始错误详情，避免带出 URL 中的敏感串；仅记录类别
    console.error(
      "[muse-ai]",
      JSON.stringify({
        action: "connection-test",
        provider: runtime.provider,
        model: runtime.modelId,
        status: "error",
        reason: timedOut ? "timeout" : "provider-error",
        durationMs,
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    return {
      ok: false,
      tone: "danger",
      message: timedOut
        ? `连接超时（${durationMs}ms）。请检查 Base URL、网络或调大超时。`
        : `连接失败（${durationMs}ms）。请检查 provider、Base URL、模型名与密钥环境变量。`,
      provider: runtime.provider,
      model: runtime.modelId,
      durationMs,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getSettingsSnapshot() {
  return getAppSettings();
}
