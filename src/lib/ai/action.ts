import type { AiActionResult, AiResult, AiRunMeta } from "./types";

const globalForAiActions = globalThis as typeof globalThis & {
  __museActiveAiActions?: Map<string, Promise<AiActionResult<unknown>>>;
};
const activeActions =
  globalForAiActions.__museActiveAiActions ??
  new Map<string, Promise<AiActionResult<unknown>>>();
globalForAiActions.__museActiveAiActions = activeActions;

/**
 * 本地单用户 MVP 的轻量并发保护。同一资源的同一种 AI 操作会共用正在执行的 Promise，
 * 避免快速连点产生重复模型请求或重复写库。
 */
export async function runExclusiveAiAction<T>(
  key: string,
  action: string,
  task: () => Promise<AiActionResult<T>>,
): Promise<AiActionResult<T>> {
  const current = activeActions.get(key) as Promise<AiActionResult<T>> | undefined;
  if (current) return current;

  const promise = Promise.resolve()
    .then(task)
    .catch((error: unknown): AiActionResult<T> => {
      console.error(
        "[muse-ai-action]",
        JSON.stringify({
          action,
          status: "failed",
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        ok: false,
        message:
          error instanceof Error && error.name === "AiUnavailableError"
            ? error.message
            : "操作失败，未写入数据。请稍后重试。",
        tone: "danger",
      };
    })
    .finally(() => {
      activeActions.delete(key);
    });

  activeActions.set(key, promise as Promise<AiActionResult<unknown>>);
  return promise;
}

export function completedAiAction<T>(
  result: AiResult<unknown>,
  successMessage: string,
  data?: T,
  redirectTo?: string,
): AiActionResult<T> {
  const base = { ok: true, data, redirectTo, ai: result.meta };
  if (result.meta.source === "real") {
    return { ...base, message: successMessage, tone: "success" };
  }
  if (result.meta.reason === "not-configured") {
    return {
      ...base,
      message: `${successMessage} 当前未配置真实 AI，这是本地演示结果。`,
      tone: "warning",
    };
  }
  return {
    ...base,
    message:
      result.meta.reason === "timeout"
        ? `真实 AI 请求超时，已用本地兜底结果完成，可重试。`
        : `真实 AI 请求失败，已用本地兜底结果完成，可重试。`,
    tone: "warning",
  };
}

export function aiProvenance(meta: AiRunMeta): string {
  if (meta.source === "real") return "真实 AI";
  if (meta.reason === "not-configured") return "本地演示";
  return meta.reason === "timeout" ? "本地兜底（AI 超时）" : "本地兜底（AI 失败）";
}
