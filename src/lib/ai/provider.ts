import type { LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * 通过 Vercel AI SDK 抽象模型供应商。
 * 未配置任何密钥时返回 null，上层自动降级为本地确定性 mock，
 * 保证整条创作闭环在离线环境下依然可用。
 */
export function getModel(): LanguageModel | null {
  const provider = process.env.MUSE_AI_PROVIDER ?? "anthropic";
  const modelId = process.env.MUSE_AI_MODEL;

  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return anthropic(modelId ?? "claude-sonnet-5");
  }
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    return openai(modelId ?? "gpt-4o");
  }
  if (
    provider === "openai-compatible" &&
    process.env.MUSE_AI_BASE_URL &&
    process.env.MUSE_AI_API_KEY
  ) {
    const compat = createOpenAICompatible({
      name: "muse-custom",
      baseURL: process.env.MUSE_AI_BASE_URL,
      apiKey: process.env.MUSE_AI_API_KEY,
    });
    return compat(modelId ?? "default");
  }
  return null;
}

export function aiConfigured(): boolean {
  return getModel() !== null;
}
