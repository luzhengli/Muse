import { z } from "zod";

/**
 * 应用设置：schema 校验 + 默认值 + 向后兼容。
 *
 * 配置优先级（高 → 低）：
 * 1. 密钥永远只来自环境变量，绝不写入 SQLite / 日志 / 客户端 bundle；
 * 2. AI 非敏感项：设置中心非空值 > 环境变量 > 内置默认；
 * 3. 编辑器与外观偏好：设置中心 > 内置默认。
 *
 * 兼容策略：缺失字段由 zod 默认值补齐，未知字段被 strip 忽略，
 * 整体解析失败时回退默认并告警——旧库/新库互相兼容，无需迁移脚本。
 */

const editorSchema = z
  .object({
    autosaveIntervalMs: z.number().int().min(500).max(10_000).catch(1500),
    fontSize: z.number().int().min(12).max(22).catch(14),
    lineHeight: z.number().min(1.4).max(2.4).catch(1.8),
    spellcheck: z.boolean().catch(false),
    defaultFocusMode: z.boolean().catch(false),
  })
  .catch({
    autosaveIntervalMs: 1500,
    fontSize: 14,
    lineHeight: 1.8,
    spellcheck: false,
    defaultFocusMode: false,
  });

const aiSchema = z
  .object({
    /** 空字符串 = 跟随环境变量 / 默认 */
    provider: z
      .enum(["", "anthropic", "openai", "openai-compatible", "mock"])
      .catch(""),
    baseUrl: z.string().max(500).catch(""),
    model: z.string().max(200).catch(""),
    /** null = 跟随环境变量 / 默认 30s */
    timeoutMs: z.number().int().min(1_000).max(120_000).nullable().catch(null),
    /** mock 兜底行为：true=未配置/失败时降级 mock；false=直接报错 */
    mockFallback: z.boolean().catch(true),
  })
  .catch({ provider: "", baseUrl: "", model: "", timeoutMs: null, mockFallback: true });

const appearanceSchema = z
  .object({
    /** light=始终浅色；system=跟随系统（暗色主题未实现，当前仍渲染浅色） */
    theme: z.enum(["light", "system"]).catch("light"),
    /** system=跟随系统 prefers-reduced-motion；reduced=始终减少动效 */
    motion: z.enum(["system", "reduced"]).catch("system"),
  })
  .catch({ theme: "light", motion: "system" });

/** 首次引导答案：只作为后续默认值，全部可跳过（空字符串 = 未回答） */
const onboardingSchema = z
  .object({
    completed: z.boolean().catch(false),
    contentType: z.enum(["", "graphic", "short", "long"]).catch(""),
    primaryPlatform: z.enum(["", "xiaohongshu", "x", "wechat"]).catch(""),
    startFrom: z.enum(["", "idea", "material"]).catch(""),
  })
  .catch({ completed: false, contentType: "", primaryPlatform: "", startFrom: "" });

const ONBOARDING_DEFAULTS = {
  completed: false,
  contentType: "" as const,
  primaryPlatform: "" as const,
  startFrom: "" as const,
};

export const settingsSchema = z.object({
  editor: editorSchema.default({
    autosaveIntervalMs: 1500,
    fontSize: 14,
    lineHeight: 1.8,
    spellcheck: false,
    defaultFocusMode: false,
  }),
  ai: aiSchema.default({
    provider: "",
    baseUrl: "",
    model: "",
    timeoutMs: null,
    mockFallback: true,
  }),
  appearance: appearanceSchema.default({ theme: "light", motion: "system" }),
  onboarding: onboardingSchema.default(ONBOARDING_DEFAULTS),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export type EditorSettings = AppSettings["editor"];
export type AiSettings = AppSettings["ai"];
export type AppearanceSettings = AppSettings["appearance"];
export type OnboardingSettings = AppSettings["onboarding"];

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});

/** 从存储的 JSON 字符串解析设置；损坏/缺失时回退默认 */
export function parseSettings(raw: string | null | undefined): AppSettings {
  if (!raw) return settingsSchema.parse({});
  try {
    return settingsSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.warn("[muse-settings] 设置解析失败，回退默认值", error);
    return settingsSchema.parse({});
  }
}

export type ConfigSource = "settings" | "env" | "default";

export interface EffectiveAiConfig {
  provider: { value: string; source: ConfigSource };
  baseUrl: { value: string; source: ConfigSource };
  model: { value: string; source: ConfigSource };
  timeoutMs: { value: number; source: ConfigSource };
  mockFallback: { value: boolean; source: ConfigSource };
}

export const AI_DEFAULTS = {
  provider: "openai-compatible",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  timeoutMs: 30_000,
} as const;

function pick(
  settingValue: string,
  envValue: string | undefined,
  defaultValue: string,
): { value: string; source: ConfigSource } {
  if (settingValue) return { value: settingValue, source: "settings" };
  if (envValue) return { value: envValue, source: "env" };
  return { value: defaultValue, source: "default" };
}

/** 合并 设置 > 环境变量 > 默认，得到 AI 生效配置（纯函数，可测试） */
export function resolveAiConfig(
  ai: AiSettings,
  env: Record<string, string | undefined> = process.env,
): EffectiveAiConfig {
  const provider = pick(ai.provider, env.MUSE_AI_PROVIDER, AI_DEFAULTS.provider);
  const baseUrl = pick(ai.baseUrl, env.MUSE_AI_BASE_URL, AI_DEFAULTS.baseUrl);

  const envModel = env.MUSE_AI_MODEL;
  const defaultModel =
    provider.value === "anthropic"
      ? "claude-sonnet-5"
      : provider.value === "openai"
        ? "gpt-4o"
        : AI_DEFAULTS.model;
  const model = pick(ai.model, envModel, defaultModel);

  let timeoutMs: { value: number; source: ConfigSource };
  const envTimeout = Number(env.MUSE_AI_TIMEOUT_MS);
  if (ai.timeoutMs !== null) {
    timeoutMs = { value: ai.timeoutMs, source: "settings" };
  } else if (Number.isFinite(envTimeout) && envTimeout >= 1_000) {
    timeoutMs = { value: Math.min(envTimeout, 120_000), source: "env" };
  } else {
    timeoutMs = { value: AI_DEFAULTS.timeoutMs, source: "default" };
  }

  return {
    provider,
    baseUrl,
    model,
    timeoutMs,
    mockFallback: {
      value: ai.mockFallback,
      source: ai.mockFallback === true ? "default" : "settings",
    },
  };
}

/** 密钥状态（只暴露是否配置与来源说明，绝不返回密钥内容） */
export function credentialStatus(env: Record<string, string | undefined> = process.env) {
  return {
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    openai: Boolean(env.OPENAI_API_KEY),
    openaiCompatible: Boolean(env.MUSE_AI_API_KEY),
  };
}
