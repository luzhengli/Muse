import type { LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** 默认走 DeepSeek 的 OpenAI 兼容网关 */
const DEFAULT_PROVIDER = "openai-compatible";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

export interface AiRuntime {
  model: LanguageModel | null;
  provider: string;
  modelId: string;
}

/**
 * 通过 Vercel AI SDK 抽象模型供应商。
 * 未配置任何密钥时返回 null，上层自动降级为本地确定性 mock，
 * 保证整条创作闭环在离线环境下依然可用。
 */
export function getAiRuntime(): AiRuntime {
  const provider = process.env.MUSE_AI_PROVIDER ?? DEFAULT_PROVIDER;
  const modelId = process.env.MUSE_AI_MODEL;

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    const resolvedModel = modelId ?? "claude-sonnet-5";
    return { model: anthropic(resolvedModel), provider, modelId: resolvedModel };
  }
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    const resolvedModel = modelId ?? "gpt-4o";
    return { model: openai(resolvedModel), provider, modelId: resolvedModel };
  }
  if (provider === "openai-compatible" && process.env.MUSE_AI_API_KEY) {
    const resolvedModel = modelId ?? DEFAULT_MODEL;
    const compat = createOpenAICompatible({
      name: "muse-custom",
      baseURL: process.env.MUSE_AI_BASE_URL ?? DEFAULT_BASE_URL,
      apiKey: process.env.MUSE_AI_API_KEY,
    });
    return { model: compat(resolvedModel), provider, modelId: resolvedModel };
  }
  return {
    model: null,
    provider,
    modelId:
      modelId ??
      (provider === "anthropic"
        ? "claude-sonnet-5"
        : provider === "openai"
          ? "gpt-4o"
          : DEFAULT_MODEL),
  };
}

export function getModel(): LanguageModel | null {
  return getAiRuntime().model;
}

export function aiConfigured(): boolean {
  return getModel() !== null;
}

/**
 * AI 生图暂不支持：DeepSeek 只承担文本生成/结构化输出。
 * 包装台产出配图提示词，图片需在外部工具生成后上传关联。
 */
export const IMAGE_GEN_SUPPORTED = false;
