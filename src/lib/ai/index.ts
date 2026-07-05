import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { TopicBrief } from "@/db/schema";
import { PLATFORMS, type PlatformSpec } from "@/lib/platforms";
import { getModel } from "./provider";
import * as mock from "./mock";
import type {
  BriefGen,
  CleanGen,
  DraftGen,
  MaterialInput,
  PackagingGen,
  ReviewGen,
  RewriteMode,
  TopicCardGen,
  VariantGen,
} from "./types";

export { aiConfigured } from "./provider";
export type * from "./types";

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
export async function aiClean(title: string, raw: string): Promise<CleanGen> {
  const model = getModel();
  if (!model) return mock.mockClean(title, raw);
  try {
    const { object } = await generateObject({
      model,
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
  } catch {
    return mock.mockClean(title, raw);
  }
}

/** 基于素材集合生成选题卡片 */
export async function aiTopics(
  materials: MaterialInput[],
  count = 3,
): Promise<TopicCardGen[]> {
  const model = getModel();
  if (!model) return mock.mockTopics(materials, count);
  try {
    const { object } = await generateObject({
      model,
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
  } catch {
    return mock.mockTopics(materials, count);
  }
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
): Promise<BriefGen> {
  const model = getModel();
  if (!model) return mock.mockBrief(topic, materials);
  try {
    const { object } = await generateObject({
      model,
      schema: z.object({
        audience: z.string(),
        platforms: z.array(z.string()),
        keyPoints: z.array(z.string()),
        angle: z.string(),
        tone: z.string().describe("写作语气与人称"),
        outline: z.array(z.string()).describe("文章大纲，含开头与结尾"),
      }),
      prompt: `为选题「${topic.title}」生成创作 brief。目标读者：${topic.targetAudience}；角度：${topic.angle}；核心观点：${topic.corePoints.join("；")}。\n\n可引用素材：\n${materialContext(materials, 400)}`,
    });
    return object;
  } catch {
    return mock.mockBrief(topic, materials);
  }
}

/** 基于 brief 与素材生成文章初稿（HTML） */
export async function aiDraft(
  title: string,
  brief: TopicBrief,
  materials: MaterialInput[],
): Promise<DraftGen> {
  const model = getModel();
  if (!model) return mock.mockDraft(title, brief, materials);
  try {
    const { text } = await generateText({
      model,
      prompt: `写一篇中文文章初稿。
标题：${title}
目标读者：${brief.audience}
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
  } catch {
    return mock.mockDraft(title, brief, materials);
  }
}

/** 扩写 / 改写 / 重组段落 */
export async function aiRewrite(text: string, mode: RewriteMode): Promise<string> {
  const model = getModel();
  if (!model) return mock.mockRewrite(text, mode);
  const instruction =
    mode === "expand"
      ? "扩写以下内容，补充细节、例子与过渡，长度约为原文两倍"
      : mode === "restructure"
        ? "重组以下内容的结构，使逻辑更清晰（先结论后论据），不丢失信息"
        : "改写以下内容，使表达更流畅自然，保持原意";
  try {
    const { text: out } = await generateText({
      model,
      prompt: `${instruction}。只输出改后的正文，不要解释：\n\n${text}`,
    });
    return out.trim();
  } catch {
    return mock.mockRewrite(text, mode);
  }
}

/** AI 审阅：事实/结构/风格/安全/平台合规/润色 */
export async function aiReview(
  text: string,
  platformId?: string,
): Promise<ReviewGen> {
  const spec: PlatformSpec | undefined = platformId
    ? PLATFORMS[platformId as keyof typeof PLATFORMS]
    : undefined;
  const model = getModel();
  if (!model) return mock.mockReview(text, spec);
  try {
    const { object } = await generateObject({
      model,
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
  } catch {
    return mock.mockReview(text, spec);
  }
}

/** 包装物料：标题候选、摘要、封面/配图提示词、图文卡片 */
export async function aiPackaging(title: string, text: string): Promise<PackagingGen> {
  const model = getModel();
  if (!model) return mock.mockPackaging(title, text);
  try {
    const { object } = await generateObject({
      model,
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
  } catch {
    return mock.mockPackaging(title, text);
  }
}

/** 从内容母版派生平台版本 */
export async function aiVariant(
  title: string,
  text: string,
  platformId: string,
): Promise<VariantGen> {
  const spec = PLATFORMS[platformId as keyof typeof PLATFORMS];
  const model = getModel();
  if (!model || !spec) return mock.mockVariant(title, text, spec ?? PLATFORMS.wechat);
  try {
    const { object } = await generateObject({
      model,
      schema: z.object({
        title: z.string().describe(spec.titleMaxLen ? `标题，不超过 ${spec.titleMaxLen} 字` : "标题"),
        content: z.string().describe(`正文，符合${spec.name}风格：${spec.style}；长度不超过 ${spec.contentMaxLen} 字`),
        hashtags: z.array(z.string()).max(Math.max(spec.hashtagCount, 1)),
        cta: z.string().describe(spec.ctaHint),
        summary: z.string().describe("发布摘要"),
        publishNote: z.string().describe("给运营者的发布说明（配图、时间、注意事项）"),
      }),
      prompt: `把以下文章改写为${spec.name}版本。\n\n标题：${title}\n\n正文：\n${text.slice(0, 8000)}`,
    });
    return object;
  } catch {
    return mock.mockVariant(title, text, spec);
  }
}

/** 复盘结论反哺：生成下一轮选题卡片 */
export async function aiRetroTopic(insights: string, hint: string): Promise<TopicCardGen> {
  const model = getModel();
  if (!model) return mock.mockRetroTopic(insights, hint);
  try {
    const { object } = await generateObject({
      model,
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
  } catch {
    return mock.mockRetroTopic(insights, hint);
  }
}
