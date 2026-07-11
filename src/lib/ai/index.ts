import { generateObject, generateText, type LanguageModel } from "ai";
import { z } from "zod";
import type { TopicBrief } from "@/db/schema";
import { PLATFORMS, type PlatformSpec } from "@/lib/platforms";
import { getAiRuntime } from "./provider";
import * as mock from "./mock";
import type {
  BriefGen,
  AiResult,
  CleanGen,
  DraftGen,
  MaterialInput,
  PackagingGen,
  ReviewGen,
  RewriteMode,
  TopicCardGen,
  VariantGen,
} from "./types";

export { aiConfigured, IMAGE_GEN_SUPPORTED } from "./provider";
export type * from "./types";

/** mock 兜底被设置关闭时抛出：调用层原样透出信息，不写库 */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

function mockDelayMs(): number {
  const configured = Number(process.env.MUSE_AI_MOCK_DELAY_MS);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 10_000)
    : 0;
}

async function executeAi<T>(
  action: string,
  generate: (model: LanguageModel, signal: AbortSignal) => Promise<T>,
  fallback: () => T,
): Promise<AiResult<T>> {
  const runtime = getAiRuntime();
  const startedAt = Date.now();

  if (!runtime.model) {
    // 用户显式选择 mock provider 时视为主动使用 mock，不受兜底开关限制
    if (!runtime.mockFallback && runtime.provider !== "mock") {
      throw new AiUnavailableError(
        "未配置真实 AI 密钥，且设置中已关闭 mock 兜底。请配置密钥或重新开启兜底。",
      );
    }
    const delayMs = mockDelayMs();
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const durationMs = Date.now() - startedAt;
    console.info(
      "[muse-ai]",
      JSON.stringify({
        action,
        provider: runtime.provider,
        model: runtime.modelId,
        status: "fallback",
        reason: "not-configured",
        durationMs,
      }),
    );
    return {
      data: fallback(),
      meta: {
        status: "fallback",
        source: "mock",
        reason: "not-configured",
        action,
        provider: runtime.provider,
        model: runtime.modelId,
        durationMs,
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), runtime.timeoutMs);
  try {
    const data = await generate(runtime.model, controller.signal);
    const durationMs = Date.now() - startedAt;
    console.info(
      "[muse-ai]",
      JSON.stringify({
        action,
        provider: runtime.provider,
        model: runtime.modelId,
        status: "success",
        durationMs,
      }),
    );
    return {
      data,
      meta: {
        status: "success",
        source: "real",
        action,
        provider: runtime.provider,
        model: runtime.modelId,
        durationMs,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const reason = controller.signal.aborted ? "timeout" : "provider-error";
    if (!runtime.mockFallback) {
      console.error(
        "[muse-ai]",
        JSON.stringify({
          action,
          provider: runtime.provider,
          model: runtime.modelId,
          status: "error",
          reason,
          durationMs,
          errorName: error instanceof Error ? error.name : "UnknownError",
        }),
      );
      throw new AiUnavailableError(
        reason === "timeout"
          ? "真实 AI 请求超时，且设置中已关闭 mock 兜底，本次操作未完成。"
          : "真实 AI 请求失败，且设置中已关闭 mock 兜底，本次操作未完成。",
      );
    }
    console.error(
      "[muse-ai]",
      JSON.stringify({
        action,
        provider: runtime.provider,
        model: runtime.modelId,
        status: "fallback",
        reason,
        durationMs,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
    return {
      data: fallback(),
      meta: {
        status: "fallback",
        source: "mock",
        reason,
        action,
        provider: runtime.provider,
        model: runtime.modelId,
        durationMs,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function materialContext(materials: MaterialInput[], maxEach = 800): string {
  return materials
    .map(
      (m) =>
        `<素材 id=${m.id} 标题="${m.title}" 标签="${m.tags.join(",")}">\n${(
          m.content || m.summary
        ).slice(0, maxEach)}\n</素材>`,
    )
    .join("\n\n");
}

/** 清洗素材：生成摘要、标签，并切分为语料块 */
export async function aiClean(title: string, raw: string): Promise<AiResult<CleanGen>> {
  return executeAi(
    "clean-material",
    async (model, abortSignal) => {
    const { object } = await generateObject({
      model,
      abortSignal,
      mode: "json",
      schema: z.object({
        summary: z.string().describe("120 字以内的中文摘要"),
        tags: z.array(z.string()).max(6).describe("3-6 个主题标签"),
        chunks: z
          .array(z.string())
          .describe("把原文清洗为若干自洽的语料块，去除噪音，保留事实与观点"),
      }),
      prompt: `请清洗以下素材，输出摘要、标签和语料块。\n\n标题：${title}\n\n原文：\n${raw.slice(0, 12000)}`,
    });
    return object;
    },
    () => mock.mockClean(title, raw),
  );
}

/** 基于素材集合生成选题卡片 */
export async function aiTopics(
  materials: MaterialInput[],
  count = 3,
): Promise<AiResult<TopicCardGen[]>> {
  return executeAi(
    "generate-topics",
    async (model, abortSignal) => {
    const { object } = await generateObject({
      model,
      abortSignal,
      mode: "json",
      schema: z.object({
        topics: z.array(
          z.object({
            title: z.string(),
            targetAudience: z.string(),
            corePoints: z.array(z.string()),
            angle: z.string(),
            recommendedPlatforms: z.array(z.enum(["xiaohongshu", "x", "wechat"])),
          }),
        ),
      }),
      prompt: `你是内容策划。基于以下素材生成 ${count} 个差异化的选题卡片（标题方向、目标读者、核心观点、内容角度、推荐平台）。\n\n${materialContext(materials)}`,
    });
    return object.topics;
    },
    () => mock.mockTopics(materials, count),
  );
}

/** 把选题卡片扩展为创作 brief */
export async function aiBrief(
  topic: {
    title: string;
    targetAudience: string;
    corePoints: string[];
    angle: string;
    recommendedPlatforms: string[];
  },
  materials: MaterialInput[],
): Promise<AiResult<BriefGen>> {
  return executeAi(
    "generate-brief",
    async (model, abortSignal) => {
    const { object } = await generateObject({
      model,
      abortSignal,
      mode: "json",
      schema: z.object({
        audience: z.string(),
        objective: z.string().describe("希望读者获得的结果或采取的行动"),
        coreClaim: z.string().describe("全文唯一核心主张"),
        platforms: z.array(z.string()),
        keyPoints: z.array(z.string()),
        angle: z.string(),
        tone: z.string().describe("写作语气与人称"),
        outline: z.array(z.string()).describe("文章大纲，含开头与结尾"),
      }),
      prompt: `为选题「${topic.title}」生成创作 brief。目标读者：${topic.targetAudience}；角度：${topic.angle}；核心观点：${topic.corePoints.join("；")}。\n\n可引用素材：\n${materialContext(materials, 400)}`,
    });
    return object;
    },
    () => mock.mockBrief(topic, materials),
  );
}

/** 基于 brief 与素材生成文章初稿（HTML） */
export async function aiDraft(
  title: string,
  brief: TopicBrief,
  materials: MaterialInput[],
): Promise<AiResult<DraftGen>> {
  return executeAi(
    "generate-draft",
    async (model, abortSignal) => {
    const { text } = await generateText({
      model,
      abortSignal,
      prompt: `写一篇中文文章初稿。
标题：${title}
目标读者：${brief.audience}
创作目标：${brief.objective}
核心主张：${brief.coreClaim}
语气：${brief.tone}
主要观点：${brief.keyPoints.join("；")}
大纲：${brief.outline.join(" / ")}
目标平台：${brief.platforms.join(",")}

引用素材（写作时融入其中的事实与观点，并在引用处自然提及来源标题）：
${materialContext(materials)}

只输出正文 HTML，使用 <h2>、<p>、<ul><li> 标签组织内容，不要 <html> 外层结构，不要 markdown。`,
    });
    const html = text.replace(/```html?|```/g, "").trim();
    return { title, contentHtml: html };
    },
    () => mock.mockDraft(title, brief, materials),
  );
}

/** 扩写 / 改写 / 重组段落 */
export async function aiRewrite(text: string, mode: RewriteMode): Promise<AiResult<string>> {
  const instruction =
    mode === "expand"
      ? "扩写以下内容，补充细节、例子与过渡，长度约为原文两倍"
      : mode === "restructure"
        ? "重组以下内容的结构，使逻辑更清晰（先结论后论据），不丢失信息"
        : "改写以下内容，使表达更流畅自然，保持原意";
  return executeAi(
    `rewrite-${mode}`,
    async (model, abortSignal) => {
    const { text: out } = await generateText({
      model,
      abortSignal,
      prompt: `${instruction}。只输出改后的正文，不要解释：\n\n${text}`,
    });
    return out.trim();
    },
    () => mock.mockRewrite(text, mode),
  );
}

/** 按审阅建议润色一段文本（保留输入格式：纯文本进纯文本出，HTML 进 HTML 出） */
export async function aiPolishWithSuggestion(
  content: string,
  suggestion: string,
  isHtml: boolean,
): Promise<AiResult<string>> {
  return executeAi(
    "polish-review-finding",
    async (model, abortSignal) => {
    const { text: out } = await generateText({
      model,
      abortSignal,
      prompt: `请按照下面的审阅建议修改内容。只输出修改后的${isHtml ? "正文 HTML（保持原有标签结构，不要 markdown，不要 <html> 外层）" : "文字，不要解释"}。

审阅建议：${suggestion}

待修改内容：
${content}`,
    });
    return out.replace(/```html?|```/g, "").trim();
    },
    () => mock.mockRewrite(content, "rewrite"),
  );
}

/** AI 审阅：事实/结构/风格/安全/平台合规/润色 */
export async function aiReview(
  text: string,
  platformId?: string,
): Promise<AiResult<ReviewGen>> {
  const spec: PlatformSpec | undefined = platformId
    ? PLATFORMS[platformId as keyof typeof PLATFORMS]
    : undefined;
  return executeAi(
    "review-article",
    async (model, abortSignal) => {
    const { object } = await generateObject({
      model,
      abortSignal,
      mode: "json",
      schema: z.object({
        summary: z.string(),
        findings: z.array(
          z.object({
            category: z.enum(["fact", "structure", "style", "safety", "compliance", "polish"]),
            severity: z.enum(["info", "warn", "critical"]),
            quote: z.string().describe("有问题的原文片段，可为空"),
            suggestion: z.string(),
          }),
        ),
      }),
      prompt: `你是严格的内容审阅编辑。从事实一致性(fact)、结构完整性(structure)、表达风格(style)、违禁与安全风险(safety)、平台合规(compliance)、润色建议(polish) 六个维度审阅下文${spec ? `，目标平台为${spec.name}（${spec.style}）` : ""}。每个维度至少给出一条具体、可执行的建议。\n\n${text.slice(0, 12000)}`,
    });
    return object;
    },
    () => mock.mockReview(text, spec),
  );
}

/** 包装物料：标题候选、摘要、封面/配图提示词、图文卡片 */
export async function aiPackaging(title: string, text: string): Promise<AiResult<PackagingGen>> {
  return executeAi(
    "generate-packaging",
    async (model, abortSignal) => {
    const { object } = await generateObject({
      model,
      abortSignal,
      mode: "json",
      schema: z.object({
        titleCandidates: z.array(z.string()).min(3).max(6),
        summary: z.string().describe("120 字以内摘要"),
        coverPrompt: z.string().describe("封面图的图像生成提示词（中文，含风格与构图）"),
        imagePrompts: z.array(z.string()).describe("2-3 条配图提示词"),
        cards: z.array(z.object({ heading: z.string(), body: z.string() })).describe("图文卡片结构，用于小红书等平台"),
      }),
      prompt: `为以下文章生成发布包装物料。\n\n标题：${title}\n\n正文：\n${text.slice(0, 8000)}`,
    });
    return object;
    },
    () => mock.mockPackaging(title, text),
  );
}

/** 从内容母版派生平台版本 */
export async function aiVariant(
  title: string,
  text: string,
  platformId: string,
): Promise<AiResult<VariantGen>> {
  const spec = PLATFORMS[platformId as keyof typeof PLATFORMS];
  return executeAi(
    `generate-variant-${platformId}`,
    async (model, abortSignal) => {
      const target = spec ?? PLATFORMS.wechat;
    const { object } = await generateObject({
      model,
      abortSignal,
      mode: "json",
      schema: z.object({
        title: z.string().describe(target.titleMaxLen ? `标题，不超过 ${target.titleMaxLen} 字` : "标题"),
        content: z.string().describe(`正文，符合${target.name}风格：${target.style}；长度不超过 ${target.contentMaxLen} 字`),
        hashtags: z.array(z.string()).max(Math.max(target.hashtagCount, 1)),
        cta: z.string().describe(target.ctaHint),
        summary: z.string().describe("发布摘要"),
        publishNote: z.string().describe("给运营者的发布说明（配图、时间、注意事项）"),
      }),
      prompt: `把以下文章改写为${target.name}版本。\n\n标题：${title}\n\n正文：\n${text.slice(0, 8000)}`,
    });
    return object;
    },
    () => mock.mockVariant(title, text, spec ?? PLATFORMS.wechat),
  );
}

/** 复盘结论反哺：生成下一轮选题卡片 */
export async function aiRetroTopic(insights: string, hint: string): Promise<AiResult<TopicCardGen>> {
  return executeAi(
    "retro-to-topic",
    async (model, abortSignal) => {
    const { object } = await generateObject({
      model,
      abortSignal,
      mode: "json",
      schema: z.object({
        title: z.string(),
        targetAudience: z.string(),
        corePoints: z.array(z.string()),
        angle: z.string(),
        recommendedPlatforms: z.array(z.enum(["xiaohongshu", "x", "wechat"])),
      }),
      prompt: `基于以下复盘结论，生成一个新的内容选题卡片。\n\n复盘结论：${insights}\n\n下一步方向提示：${hint || "无"}`,
    });
    return object;
    },
    () => mock.mockRetroTopic(insights, hint),
  );
}
