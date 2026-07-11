import type { LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getEffectiveAiConfig } from "@/lib/settings-store";

export interface AiRuntime {
  model: LanguageModel | null;
  provider: string;
  modelId: string;
  /** mock 兜底是否开启（关闭时未配置/失败直接报错，不静默降级） */
  mockFallback: boolean;
  timeoutMs: number;
}

/**
 * 通过 Vercel AI SDK 抽象模型供应商。
 * 非敏感配置走 设置中心 > 环境变量 > 默认（见 src/lib/settings.ts）；
 * 密钥永远只读环境变量。未配置密钥时返回 null，
 * 上层按 mockFallback 决定降级 mock 或直接报错。
 */
export function getAiRuntime(): AiRuntime {
  const cfg = getEffectiveAiConfig();
  const provider = cfg.provider.value;
  const modelId = cfg.model.value;
  const base = {
    provider,
    modelId,
    mockFallback: cfg.mockFallback.value,
    timeoutMs: cfg.timeoutMs.value,
  };

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return { ...base, model: anthropic(modelId) };
  }
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return { ...base, model: openai(modelId) };
  }
  if (provider === "openai-compatible" && process.env.MUSE_AI_API_KEY) {
    const compat = createOpenAICompatible({
      name: "muse-custom",
      baseURL: cfg.baseUrl.value,
      apiKey: process.env.MUSE_AI_API_KEY,
    });
    return { ...base, model: compat(modelId) };
  }
  // provider === "mock" 或密钥未配置
  return { ...base, model: null };
}

export function getModel(): LanguageModel | null {
  return getAiRuntime().model;
}

export function aiConfigured(): boolean {
  return getModel() !== null;
}

/**
 * AI 生图暂不支持：当前模型只承担文本生成/结构化输出。
 * 包装台产出配图提示词，图片需在外部工具生成后上传关联。
 */
export const IMAGE_GEN_SUPPORTED = false;
