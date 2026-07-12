import { describe, expect, test } from "bun:test";
import {
  checkPlatformOutput,
  codePointLength,
  failedBlockers,
  failedWarnings,
  getRuleSet,
  listAllRules,
  OUTPUT_FORMATS,
  parsePlatformOutputPayload,
  parseXText,
  platformOutputPayloadSchema,
  X_MAX_WEIGHTED_LENGTH,
  type PlatformOutputPayload,
} from "@/lib/platform-rules";

function payload(raw: unknown): PlatformOutputPayload {
  const parsed = parsePlatformOutputPayload(raw);
  if (!parsed) throw new Error("payload 应当可解析");
  return parsed;
}

describe("X 加权字符计数（官方 twitter-text 算法抽样对照）", () => {
  // 期望值按 X 官方 v3 加权配置人工推导：
  // 拉丁/常用标点计 1、CJK 计 2、emoji（含 ZWJ 组合/旗帜）计 2、URL 固定 23。
  const samples: Array<{ text: string; expected: number; note: string }> = [
    { text: "Hello world", expected: 11, note: "纯拉丁逐字计 1" },
    { text: "你好世界", expected: 8, note: "纯中文计 2" },
    { text: "こんにちは", expected: 10, note: "日文假名计 2" },
    { text: "写作 workflow", expected: 13, note: "中英混排 2+2+1+8×1" },
    { text: "🚀", expected: 2, note: "单 emoji 计 2" },
    { text: "👨‍👩‍👧‍👦", expected: 2, note: "ZWJ 组合家庭 emoji 整体计 2" },
    { text: "🇨🇳", expected: 2, note: "旗帜 emoji 整体计 2" },
    { text: "https://example.com/very/long/path?query=1234567890", expected: 23, note: "URL 无论多长按 t.co 计 23" },
    { text: "http://a.io", expected: 23, note: "短 URL 也按 23 计" },
    { text: "看这篇 https://example.com/post 🚀", expected: 33, note: "中文 6 + 空格 2 + URL 23 + emoji 2" },
    { text: "AI 正在改变创作 🚀 https://example.com/post 了解更多", expected: 51, note: "中文+emoji+URL 混合" },
    { text: "—", expected: 1, note: "破折号 U+2014 在官方 1 权重区间" },
  ];

  for (const s of samples) {
    test(`「${s.text}」 = ${s.expected}（${s.note}）`, () => {
      expect(parseXText(s.text).weightedLength).toBe(s.expected);
    });
  }

  test("上限边界：280 个拉丁字符有效，281 个无效；140 个汉字有效，141 个无效", () => {
    expect(parseXText("a".repeat(280))).toMatchObject({
      weightedLength: 280,
      remaining: 0,
      valid: true,
    });
    expect(parseXText("a".repeat(281))).toMatchObject({
      weightedLength: 281,
      remaining: -1,
      valid: false,
    });
    expect(parseXText("汉".repeat(140)).valid).toBe(true);
    expect(parseXText("汉".repeat(141))).toMatchObject({
      weightedLength: 282,
      valid: false,
    });
    expect(X_MAX_WEIGHTED_LENGTH).toBe(280);
  });

  test("naive string.length 会误判的文本，加权计数给出正确结论", () => {
    // 300 个 JS 字符的 URL：string.length 判超限，官方加权只算 23
    const longUrl = `https://example.com/${"a".repeat(280)}`;
    expect(longUrl.length).toBeGreaterThan(280);
    expect(parseXText(longUrl).valid).toBe(true);
    // 150 个汉字：string.length=150 看似未超，官方加权 300 已超限
    const cjk = "汉".repeat(150);
    expect(cjk.length).toBeLessThan(280);
    expect(parseXText(cjk).valid).toBe(false);
  });
});

describe("规则注册表（FR-0.2）", () => {
  test("四种格式各有规则集，且携带 rulesVersion", () => {
    expect(OUTPUT_FORMATS).toEqual([
      "x_single_post",
      "x_thread",
      "xiaohongshu_image_note",
      "wechat_article",
    ]);
    for (const format of OUTPUT_FORMATS) {
      expect(getRuleSet(format).rulesVersion).toMatch(/^.+\/\d+@\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("每条规则可见来源 URL 与核对日期", () => {
    const rules = listAllRules();
    expect(rules.length).toBeGreaterThanOrEqual(10);
    for (const r of rules) {
      expect(r.source.url).toMatch(/^https:\/\//);
      expect(r.source.title.length).toBeGreaterThan(0);
      expect(r.source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.id).toMatch(/^(x|xiaohongshu|wechat)\./);
    }
  });

  test("§3.2 硬条件的规则数值正确", () => {
    expect(getRuleSet("x_single_post").rules.maxWeightedLength.value).toBe(280);
    expect(getRuleSet("x_single_post").rules.transformedUrlLength.value).toBe(23);
    expect(getRuleSet("x_thread").rules.minPosts.value).toBe(2);
    expect(getRuleSet("xiaohongshu_image_note").rules.minImages.value).toBe(1);
    expect(getRuleSet("xiaohongshu_image_note").rules.maxImages.value).toBe(18);
    expect(getRuleSet("xiaohongshu_image_note").rules.maxTitleLength.value).toBe(20);
    expect(getRuleSet("wechat_article").rules.requireCover.value).toBe(1);
  });
});

describe("类型化 payload（§3.2 Zod 判别联合）", () => {
  test("四种类型均可解析并补默认值", () => {
    const single = payload({ type: "x_single_post", schemaVersion: 1 });
    expect(single).toMatchObject({ text: "", media: [], internalNote: "" });

    const thread = payload({
      type: "x_thread",
      schemaVersion: 1,
      posts: [{ text: "第一条" }],
    });
    if (thread.type !== "x_thread") throw new Error("类型判别失败");
    expect(thread.posts[0].media).toEqual([]);

    const note = payload({ type: "xiaohongshu_image_note", schemaVersion: 1 });
    expect(note).toMatchObject({ title: "", body: "", topics: [], images: [] });

    const article = payload({ type: "wechat_article", schemaVersion: 1 });
    expect(article).toMatchObject({ coverAssetId: null, digest: "", sourceUrl: "" });
  });

  test("未知类型、错误 schemaVersion、越界结构被拒绝", () => {
    expect(parsePlatformOutputPayload({ type: "douyin_video", schemaVersion: 1 })).toBeNull();
    expect(parsePlatformOutputPayload({ type: "x_single_post", schemaVersion: 2 })).toBeNull();
    // X 媒体 >4、媒体 kind 非法
    expect(
      parsePlatformOutputPayload({
        type: "x_single_post",
        schemaVersion: 1,
        media: [1, 2, 3, 4, 5].map((assetId) => ({ assetId })),
      }),
    ).toBeNull();
    expect(
      parsePlatformOutputPayload({
        type: "x_single_post",
        schemaVersion: 1,
        media: [{ assetId: 1, kind: "audio" }],
      }),
    ).toBeNull();
    // 小红书图片 >18（平台硬上限，编辑器同样拦截）
    expect(
      parsePlatformOutputPayload({
        type: "xiaohongshu_image_note",
        schemaVersion: 1,
        images: Array.from({ length: 19 }, (_, i) => ({ assetId: i + 1 })),
      }),
    ).toBeNull();
    // Thread 至少 1 条才是合法结构（≥2 条属于发布检查）
    expect(
      parsePlatformOutputPayload({ type: "x_thread", schemaVersion: 1, posts: [] }),
    ).toBeNull();
  });

  test("判别联合按 type 精确分派", () => {
    const parsed = platformOutputPayloadSchema.parse({
      type: "wechat_article",
      schemaVersion: 1,
      title: "标题",
      coverAssetId: 7,
    });
    expect(parsed.type).toBe("wechat_article");
    if (parsed.type === "wechat_article") {
      expect(parsed.coverAssetId).toBe(7);
    }
  });
});

describe("发布检查：X 单条（FR-1.1）", () => {
  test("超 280 加权字符 → 阻断；恰好 280 → 就绪", () => {
    const over = checkPlatformOutput(
      payload({ type: "x_single_post", schemaVersion: 1, text: "汉".repeat(141) }),
    );
    expect(over.ready).toBe(false);
    const blocker = failedBlockers(over).find((i) => i.id === "x_single_post.weighted_length");
    expect(blocker?.message).toContain("超出 2");

    const exact = checkPlatformOutput(
      payload({ type: "x_single_post", schemaVersion: 1, text: "汉".repeat(140) }),
    );
    expect(exact.ready).toBe(true);
  });

  test("含 URL 文本按 t.co 长度计数（naive 超长文本可就绪）", () => {
    const text = `深度长文分享 https://example.com/${"a".repeat(300)}`;
    expect(text.length).toBeGreaterThan(280);
    const result = checkPlatformOutput(
      payload({ type: "x_single_post", schemaVersion: 1, text }),
    );
    expect(result.ready).toBe(true);
  });

  test("空内容阻断；仅媒体无文字可发布；GIF 不可与其他媒体混用", () => {
    const empty = checkPlatformOutput(
      payload({ type: "x_single_post", schemaVersion: 1, text: "  " }),
    );
    expect(failedBlockers(empty).map((i) => i.id)).toContain("x_single_post.has_content");

    const mediaOnly = checkPlatformOutput(
      payload({
        type: "x_single_post",
        schemaVersion: 1,
        text: "",
        media: [{ assetId: 1, kind: "image" }],
      }),
    );
    expect(mediaOnly.ready).toBe(true);

    const gifMixed = checkPlatformOutput(
      payload({
        type: "x_single_post",
        schemaVersion: 1,
        text: "配图",
        media: [
          { assetId: 1, kind: "gif" },
          { assetId: 2, kind: "image" },
        ],
      }),
    );
    expect(failedBlockers(gifMixed).map((i) => i.id)).toContain("x_single_post.media_exclusive");
  });

  test("检查结果携带规则集版本与规则 ID", () => {
    const result = checkPlatformOutput(
      payload({ type: "x_single_post", schemaVersion: 1, text: "hi" }),
    );
    expect(result.rulesVersion).toBe(getRuleSet("x_single_post").rulesVersion);
    const lengthItem = result.items.find((i) => i.id === "x_single_post.weighted_length");
    expect(lengthItem?.ruleId).toBe("x.weighted_length.max");
  });
});

describe("发布检查：X Thread（FR-1.1）", () => {
  test("仅 1 条 → 阻断「至少 2 条」", () => {
    const result = checkPlatformOutput(
      payload({ type: "x_thread", schemaVersion: 1, posts: [{ text: "唯一一条" }] }),
    );
    expect(result.ready).toBe(false);
    expect(failedBlockers(result).map((i) => i.id)).toContain("x_thread.min_posts");
  });

  test("逐条独立校验：定位到超限/空白的具体帖文", () => {
    const result = checkPlatformOutput(
      payload({
        type: "x_thread",
        schemaVersion: 1,
        posts: [{ text: "第一条正常" }, { text: "汉".repeat(141) }, { text: "" }],
      }),
    );
    expect(result.ready).toBe(false);
    const blockers = failedBlockers(result);
    const overLimit = blockers.find((i) => i.id === "x_thread.post.weighted_length");
    expect(overLimit?.postIndex).toBe(1);
    expect(overLimit?.message).toContain("第 2 条");
    const emptyPost = blockers.find((i) => i.id === "x_thread.post.has_content");
    expect(emptyPost?.postIndex).toBe(2);
  });

  test("三条各自合规 → 就绪", () => {
    const result = checkPlatformOutput(
      payload({
        type: "x_thread",
        schemaVersion: 1,
        posts: [
          { text: "1/3 观点" },
          { text: "2/3 论据 https://example.com/data" },
          { text: "3/3 结论 🚀" },
        ],
      }),
    );
    expect(result.ready).toBe(true);
  });
});

describe("发布检查：小红书图文笔记（FR-1.2）", () => {
  test("0 图 → 硬阻断「缺少图片，不可发布」", () => {
    const result = checkPlatformOutput(
      payload({
        type: "xiaohongshu_image_note",
        schemaVersion: 1,
        title: "标题",
        body: "正文",
      }),
    );
    expect(result.ready).toBe(false);
    const blocker = failedBlockers(result).find(
      (i) => i.id === "xiaohongshu_image_note.min_images",
    );
    expect(blocker?.message).toContain("缺少图片，不可发布");
  });

  test("标题 21 字阻断，恰 20 字通过；正文超 1000 字阻断", () => {
    const base = {
      type: "xiaohongshu_image_note",
      schemaVersion: 1,
      body: "正文",
      images: [{ assetId: 1 }],
    };
    const over = checkPlatformOutput(payload({ ...base, title: "题".repeat(21) }));
    expect(failedBlockers(over).map((i) => i.id)).toContain(
      "xiaohongshu_image_note.title_length",
    );
    const exact = checkPlatformOutput(payload({ ...base, title: "题".repeat(20) }));
    expect(exact.ready).toBe(true);

    const longBody = checkPlatformOutput(
      payload({ ...base, title: "标题", body: "字".repeat(1001) }),
    );
    expect(failedBlockers(longBody).map((i) => i.id)).toContain(
      "xiaohongshu_image_note.body_length",
    );
  });

  test("标题按码点计数：emoji 不会被代理对算成 2 个字", () => {
    expect(codePointLength("🚀🚀🚀")).toBe(3);
    expect("🚀🚀🚀".length).toBe(6);
    const result = checkPlatformOutput(
      payload({
        type: "xiaohongshu_image_note",
        schemaVersion: 1,
        title: "🚀".repeat(20),
        body: "正文",
        images: [{ assetId: 1 }],
      }),
    );
    const titleItem = result.items.find(
      (i) => i.id === "xiaohongshu_image_note.title_length",
    );
    expect(titleItem?.passed).toBe(true);
  });

  test("无标题仅提醒不阻断；有图有文即可就绪", () => {
    const result = checkPlatformOutput(
      payload({
        type: "xiaohongshu_image_note",
        schemaVersion: 1,
        body: "只有正文",
        images: [{ assetId: 1 }, { assetId: 2 }],
      }),
    );
    expect(result.ready).toBe(true);
    expect(failedWarnings(result).map((i) => i.id)).toContain(
      "xiaohongshu_image_note.title_present",
    );
  });
});

describe("发布检查：公众号图文文章（FR-1.3）", () => {
  const readyArticle = {
    type: "wechat_article",
    schemaVersion: 1,
    title: "一篇正经文章",
    author: "作者",
    digest: "这是摘要",
    contentHtml: "<h2>小标题</h2><p>正文内容。</p>",
    coverAssetId: 3,
  };

  test("缺封面 → 硬阻断「缺少封面，不可发布」", () => {
    const result = checkPlatformOutput(
      payload({ ...readyArticle, coverAssetId: null }),
    );
    expect(result.ready).toBe(false);
    const blocker = failedBlockers(result).find((i) => i.id === "wechat_article.cover");
    expect(blocker?.message).toContain("缺少封面，不可发布");
  });

  test("摘要缺失只是提醒，不阻断就绪", () => {
    const result = checkPlatformOutput(payload({ ...readyArticle, digest: "" }));
    expect(result.ready).toBe(true);
    expect(failedWarnings(result).map((i) => i.id)).toContain(
      "wechat_article.digest_present",
    );
  });

  test("标题 65 字 / 摘要 121 字 / 作者 9 字 → 阻断;空正文（仅空标签）→ 阻断", () => {
    const longTitle = checkPlatformOutput(
      payload({ ...readyArticle, title: "题".repeat(65) }),
    );
    expect(failedBlockers(longTitle).map((i) => i.id)).toContain(
      "wechat_article.title_length",
    );
    const longDigest = checkPlatformOutput(
      payload({ ...readyArticle, digest: "摘".repeat(121) }),
    );
    expect(failedBlockers(longDigest).map((i) => i.id)).toContain(
      "wechat_article.digest_length",
    );
    const longAuthor = checkPlatformOutput(
      payload({ ...readyArticle, author: "笔名很长的作者九字" }),
    );
    expect(failedBlockers(longAuthor).map((i) => i.id)).toContain(
      "wechat_article.author_length",
    );
    const emptyBody = checkPlatformOutput(
      payload({ ...readyArticle, contentHtml: "<p></p><p>&nbsp;</p>" }),
    );
    expect(failedBlockers(emptyBody).map((i) => i.id)).toContain(
      "wechat_article.body_present",
    );
  });

  test("完整文章就绪;非法原文链接仅提醒", () => {
    const ok = checkPlatformOutput(payload(readyArticle));
    expect(ok.ready).toBe(true);
    expect(failedBlockers(ok)).toEqual([]);

    const badUrl = checkPlatformOutput(
      payload({ ...readyArticle, sourceUrl: "www.example.com 不带协议" }),
    );
    expect(badUrl.ready).toBe(true);
    expect(failedWarnings(badUrl).map((i) => i.id)).toContain("wechat_article.source_url");
  });
});
