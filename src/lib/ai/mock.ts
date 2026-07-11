import type { TopicBrief } from "@/db/schema";
import { PLATFORMS, type PlatformSpec } from "@/lib/platforms";
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

/**
 * 本地确定性 mock：未配置模型密钥时兜底，
 * 所有输出均从真实输入内容派生，保证闭环流程可完整演示。
 */

function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?.；;\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

function firstSentences(text: string, n: number): string[] {
  return sentences(text).slice(0, n);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** 从文本中抽取高频双字词作为伪关键词 */
export function keywords(text: string, count = 5): string[] {
  const freq = new Map<string, number>();
  const cjk = text.match(/[㐀-鿿]{2,8}/g) ?? [];
  for (const run of cjk) {
    for (let i = 0; i + 2 <= run.length; i++) {
      const w = run.slice(i, i + 2);
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const en = text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];
  for (const w of en) freq.set(w, (freq.get(w) ?? 0) + 1);
  // 贪心去重叠：丢弃与已选词共享汉字的候选，避免「编程/程工/工具」式碎片
  const picked: string[] = [];
  const usedChars = new Set<string>();
  for (const [w] of [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])) {
    if ([...w].some((ch) => usedChars.has(ch))) continue;
    picked.push(w);
    for (const ch of w) usedChars.add(ch);
    if (picked.length >= count) break;
  }
  return picked;
}

export function mockClean(title: string, raw: string): CleanGen {
  const paras = raw
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 10);
  const chunks = paras.length > 0 ? paras : [raw.trim() || title];
  const summary = truncate(firstSentences(raw, 2).join("") || title, 120);
  const tags = keywords(`${title} ${raw}`, 4);
  return { summary, tags, chunks: chunks.slice(0, 50) };
}

export function mockTopics(materials: MaterialInput[], count = 3): TopicCardGen[] {
  const allText = materials.map((m) => `${m.title} ${m.summary}`).join(" ");
  const kws = keywords(allText, 6);
  const lead = materials[0]?.title ?? "内容创作";
  const angles = [
    { angle: "实操指南", audience: "想快速上手的初学者", suffix: "入门实操指南" },
    { angle: "观点评论", audience: "关注行业动向的从业者", suffix: "背后的三个关键判断" },
    { angle: "经验复盘", audience: "同赛道的内容创作者", suffix: "我踩过的坑与经验" },
    { angle: "清单盘点", audience: "时间有限的碎片化读者", suffix: "值得收藏的要点清单" },
  ];
  return angles.slice(0, count).map((a, i) => ({
    title: `${kws[i] ?? lead}：${a.suffix}`,
    targetAudience: a.audience,
    corePoints: materials
      .slice(0, 3)
      .map((m) => truncate(m.summary || m.title, 40))
      .filter(Boolean),
    angle: a.angle,
    recommendedPlatforms:
      i % 2 === 0 ? ["wechat", "xiaohongshu"] : ["xiaohongshu", "x"],
  }));
}

export function mockBrief(
  topic: { title: string; targetAudience: string; corePoints: string[]; angle: string; recommendedPlatforms: string[] },
  materials: MaterialInput[],
): BriefGen {
  return {
    audience: topic.targetAudience || "泛内容消费读者",
    objective: `让读者理解「${topic.title}」并获得一条可以立即执行的建议`,
    coreClaim: topic.corePoints[0] || `围绕「${topic.title}」建立清晰、可验证的判断`,
    platforms: topic.recommendedPlatforms.length
      ? topic.recommendedPlatforms
      : ["wechat"],
    keyPoints: topic.corePoints.length
      ? topic.corePoints
      : materials.slice(0, 3).map((m) => truncate(m.summary || m.title, 40)),
    angle: topic.angle || "经验分享",
    tone: "专业但不端着，用第一人称与读者对话",
    outline: [
      `开头：用一个具体场景引出「${topic.title}」`,
      "现状与痛点：读者为什么需要关心这个问题",
      ...topic.corePoints.slice(0, 3).map((p, i) => `分论点 ${i + 1}：${truncate(p, 30)}`),
      "结尾：总结行动建议并邀请读者交流",
    ],
  };
}

export function mockDraft(
  title: string,
  brief: TopicBrief,
  materials: MaterialInput[],
): DraftGen {
  const parts: string[] = [];
  parts.push(
    `<p>如果你也在关注「${title}」，这篇文章会把我整理到的关键信息一次讲清楚。这篇内容面向${brief.audience}，我们直接进入正题。</p>`,
  );
  brief.outline.forEach((section, i) => {
    const heading = section.replace(/^[^：:]*[：:]/, "").trim() || section;
    parts.push(`<h2>${heading}</h2>`);
    const material = materials[i % Math.max(materials.length, 1)];
    if (material) {
      const evidence = firstSentences(material.content || material.summary, 2).join("");
      parts.push(
        `<p>${brief.keyPoints[i % Math.max(brief.keyPoints.length, 1)] ?? ""}${
          evidence ? `根据素材《${material.title}》：${truncate(evidence, 160)}` : ""
        }</p>`,
      );
    } else {
      parts.push(`<p>${section}</p>`);
    }
  });
  parts.push(
    `<h2>写在最后</h2><p>${brief.keyPoints
      .map((p) => truncate(p, 40))
      .join("；")}。如果这篇内容对你有帮助，欢迎留言聊聊你的看法。</p>`,
  );
  return { title, contentHtml: parts.join("\n") };
}

export function mockRewrite(text: string, mode: RewriteMode): string {
  const sents = sentences(text);
  if (mode === "expand") {
    return sents
      .map((s) =>
        s.length < 40
          ? `${s}换句话说，这一点在实际操作中往往比想象的更重要，值得单独展开验证。`
          : s,
      )
      .join("");
  }
  if (mode === "restructure") {
    const mid = Math.ceil(sents.length / 2);
    return [...sents.slice(mid), ...sents.slice(0, mid)].join("");
  }
  // rewrite：轻度改写
  return sents
    .map((s) => s.replace(/^但是/, "不过").replace(/^所以/, "因此").replace(/非常/g, "相当"))
    .join("");
}

export function mockReview(text: string, platform?: PlatformSpec): ReviewGen {
  const sents = sentences(text);
  const findings: ReviewGen["findings"] = [];

  const absolute = text.match(/(最好|第一|绝对|100%|永远|所有人|必然)/);
  if (absolute) {
    findings.push({
      category: "compliance",
      severity: "warn",
      quote: absolute[0],
      suggestion: `「${absolute[0]}」属于绝对化表述，多数平台广告规范会限制，建议改为「大概率」「多数情况下」等留有余地的说法。`,
    });
  }
  const numeric = sents.find((s) => /\d{2,}[%万亿倍]/.test(s));
  if (numeric) {
    findings.push({
      category: "fact",
      severity: "warn",
      quote: truncate(numeric, 60),
      suggestion: "该句包含具体数据，请核对来源素材并在文中注明出处，避免事实性错误。",
    });
  }
  if (sents.length < 6) {
    findings.push({
      category: "structure",
      severity: "info",
      quote: "",
      suggestion: "全文篇幅偏短，建议补充案例或数据支撑，使论证更完整。",
    });
  }
  const longSent = sents.find((s) => s.length > 80);
  if (longSent) {
    findings.push({
      category: "style",
      severity: "info",
      quote: truncate(longSent, 60),
      suggestion: "此句过长，建议拆分为 2-3 个短句，降低阅读负担。",
    });
  }
  if (platform && platform.contentMaxLen > 0 && text.length > platform.contentMaxLen) {
    findings.push({
      category: "compliance",
      severity: "critical",
      quote: "",
      suggestion: `全文 ${text.length} 字，超出${platform.name}建议长度（${platform.contentMaxLen}），需要精简。`,
    });
  }
  findings.push({
    category: "polish",
    severity: "info",
    quote: truncate(sents[0] ?? "", 60),
    suggestion: "开头可以更直接地抛出读者利益点（他能得到什么），提高继续阅读率。",
  });
  findings.push({
    category: "safety",
    severity: "info",
    quote: "",
    suggestion: "未检测到明显违禁词与敏感表述；发布前仍建议人工复核涉及健康、金融、政策的内容。",
  });

  return {
    summary: `共 ${findings.length} 条建议：${findings.filter((f) => f.severity !== "info").length} 条需要处理，其余为润色参考。`,
    findings,
  };
}

export function mockPackaging(title: string, text: string): PackagingGen {
  const kws = keywords(`${title} ${text}`, 4);
  const kw = kws[0] ?? title;
  const summary = truncate(firstSentences(text, 3).join(""), 120);
  const heads = sentences(text)
    .filter((s) => s.length <= 30)
    .slice(0, 4);
  return {
    titleCandidates: [
      title,
      `关于${kw}，我想说点实话`,
      `${kw}完全指南：看这一篇就够了`,
      `为什么你应该现在开始关注${kw}`,
      `${kw}的 3 个关键认知`,
    ],
    summary,
    coverPrompt: `极简编辑风封面插画，主题「${title}」，米白底色，紫罗兰点缀，中央一个象征「${kw}」的几何图形符号，大量留白，扁平矢量风格，无文字`,
    imagePrompts: [
      `信息图：用三段式版式呈现「${kw}」的核心要点，米白背景，紫色强调色，简洁图标`,
      `场景插画：创作者在书桌前整理灵感卡片，温暖光线，扁平插画风，主题呼应「${title}」`,
    ],
    cards: (heads.length ? heads : [title]).map((h, i) => ({
      heading: `要点 ${i + 1}`,
      body: truncate(h, 60),
    })),
  };
}

export function mockVariant(
  title: string,
  text: string,
  spec: PlatformSpec,
): VariantGen {
  const kws = keywords(`${title} ${text}`, spec.hashtagCount || 3);
  const sents = sentences(text);
  const summary = truncate(sents.slice(0, 2).join(""), 100);

  if (spec.id === "xiaohongshu") {
    const body = sents
      .slice(0, 8)
      .map((s, i) => (i === 0 ? `✨ ${s}` : truncate(s, 80)))
      .join("\n\n");
    return {
      title: truncate(`${title} 🔥`, spec.titleMaxLen),
      content: truncate(`${body}\n\n👇 你怎么看？评论区聊聊`, spec.contentMaxLen),
      hashtags: kws.slice(0, spec.hashtagCount).map((k) => `#${k}`),
      cta: "觉得有用记得点赞收藏，评论区说说你的经历～",
      summary,
      publishNote: "建议配 3-4 张图文卡片，首图用封面提示词生成；发布时间建议晚 8-10 点。",
    };
  }
  if (spec.id === "x") {
    const hook = truncate(sents[0] ?? title, 100);
    const point = truncate(sents[1] ?? "", 120);
    return {
      title,
      content: truncate(`${hook}\n\n${point}`, spec.contentMaxLen - 20),
      hashtags: kws.slice(0, spec.hashtagCount).map((k) => `#${k}`),
      cta: "Repost if useful.",
      summary,
      publishNote: "若内容较长可拆为 thread，每条 ≤280 字符；首条必须独立成立。",
    };
  }
  // wechat：保留完整结构
  return {
    title: truncate(title, spec.titleMaxLen),
    content: text,
    hashtags: [],
    cta: "如果觉得有启发，点个「在看」，把公众号设为星标不迷路。",
    summary,
    publishNote: "公众号版保留完整长文结构；摘要用于订阅消息展示，建议手动配头图。",
  };
}

export function mockRetroTopic(insights: string, hint: string): TopicCardGen {
  const kw = keywords(`${insights} ${hint}`, 2)[0] ?? "内容复盘";
  return {
    title: hint || `从上一篇数据复盘看：${kw}还能怎么做`,
    targetAudience: "关注该话题的既有读者",
    corePoints: firstSentences(insights, 3).map((s) => truncate(s, 40)),
    angle: "复盘迭代",
    recommendedPlatforms: ["wechat", "xiaohongshu"],
  };
}

export { PLATFORMS };
