/**
 * 平台规则注册表（PRD v1.0 FR-0.2）。
 *
 * 全站唯一的平台校验规则来源：每条规则携带来源 URL、核对日期；
 * 每个「平台 × 作品格式」的规则集携带 rules_version。
 * 平台规则会随平台策略变化，rules_version 变更后可提示既有作品「按新规则重检」。
 *
 * 禁止在注册表之外散落平台常量；禁止用 string.length 判断 X 可发布性
 * （X 计数走官方 twitter-text 加权算法，见 ./x-text.ts）。
 */

export type OutputPlatform = "x" | "xiaohongshu" | "wechat";

export type OutputFormat =
  | "x_single_post"
  | "x_thread"
  | "xiaohongshu_image_note"
  | "wechat_article";

export interface RuleSource {
  /** 规则依据的官方资料地址 */
  url: string;
  /** 资料名称（人可读） */
  title: string;
  /** 最近一次人工核对该规则的日期（YYYY-MM-DD） */
  checkedAt: string;
}

export interface PlatformRule {
  /** 全局唯一规则 ID，如 "x.weighted_length.max" */
  id: string;
  /** 规则数值（布尔规则用 1 表示「要求存在」） */
  value: number;
  /** 规则的中文描述 */
  description: string;
  source: RuleSource;
}

export interface FormatRuleSet {
  platform: OutputPlatform;
  format: OutputFormat;
  /** 规则集版本：规则数值或语义变化时必须递增（作品修订会记录生成时的版本） */
  rulesVersion: string;
  rules: Record<string, PlatformRule>;
}

function rule(
  id: string,
  value: number,
  description: string,
  source: RuleSource,
): PlatformRule {
  return { id, value, description, source };
}

const X_COUNTING_SOURCE: RuleSource = {
  url: "https://docs.x.com/fundamentals/counting-characters",
  title: "X 官方字符计数规范（twitter-text v3 加权配置）",
  checkedAt: "2026-07-13",
};

const X_MEDIA_SOURCE: RuleSource = {
  url: "https://help.x.com/en/using-x/how-to-post",
  title: "X 官方发帖帮助（媒体附件数量）",
  checkedAt: "2026-07-13",
};

const XHS_PUBLISH_SOURCE: RuleSource = {
  url: "https://creator.xiaohongshu.com/publish/publish",
  title: "小红书创作服务平台·发布图文笔记页（标题/正文/图片数上限以发布器实测为准）",
  checkedAt: "2026-07-13",
};

const WECHAT_DRAFT_SOURCE: RuleSource = {
  url: "https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html",
  title: "微信公众平台·新建草稿接口（title/author/digest 字段限制）",
  checkedAt: "2026-07-13",
};

export const X_SINGLE_POST_RULES: FormatRuleSet = {
  platform: "x",
  format: "x_single_post",
  rulesVersion: "x_single_post/1@2026-07-13",
  rules: {
    maxWeightedLength: rule(
      "x.weighted_length.max",
      280,
      "单条帖文加权字符数上限 280：CJK/emoji 计 2、多数拉丁与常用标点计 1、URL 一律按 t.co 固定长度",
      X_COUNTING_SOURCE,
    ),
    transformedUrlLength: rule(
      "x.url.transformed_length",
      23,
      "帖文内任意 URL 统一按 t.co 短链固定计 23 个加权字符",
      X_COUNTING_SOURCE,
    ),
    maxMediaPerPost: rule(
      "x.media.max_per_post",
      4,
      "每条帖文最多 4 个图片附件；GIF 或视频只能单独 1 个且不与其他媒体混用",
      X_MEDIA_SOURCE,
    ),
  },
};

export const X_THREAD_RULES: FormatRuleSet = {
  platform: "x",
  format: "x_thread",
  rulesVersion: "x_thread/1@2026-07-13",
  rules: {
    maxWeightedLength: X_SINGLE_POST_RULES.rules.maxWeightedLength,
    transformedUrlLength: X_SINGLE_POST_RULES.rules.transformedUrlLength,
    maxMediaPerPost: X_SINGLE_POST_RULES.rules.maxMediaPerPost,
    minPosts: rule(
      "x.thread.min_posts",
      2,
      "Thread 至少 2 条帖文（单条内容应使用 x_single_post 类型）",
      {
        url: "https://help.x.com/en/using-x/create-a-thread",
        title: "X 官方 Thread 帮助（Thread 为多条连发）",
        checkedAt: "2026-07-13",
      },
    ),
  },
};

export const XIAOHONGSHU_IMAGE_NOTE_RULES: FormatRuleSet = {
  platform: "xiaohongshu",
  format: "xiaohongshu_image_note",
  rulesVersion: "xiaohongshu_image_note/1@2026-07-13",
  rules: {
    minImages: rule(
      "xiaohongshu.images.min",
      1,
      "图文笔记至少 1 张图片；无图片不可发布（发布器不允许零图提交）",
      XHS_PUBLISH_SOURCE,
    ),
    maxImages: rule(
      "xiaohongshu.images.max",
      18,
      "图文笔记最多 18 张图片，顺序即发布顺序，第 1 张为首图/封面",
      XHS_PUBLISH_SOURCE,
    ),
    maxTitleLength: rule(
      "xiaohongshu.title.max_length",
      20,
      "笔记标题最多 20 字（发布器按字截断，中英文同计）",
      XHS_PUBLISH_SOURCE,
    ),
    maxBodyLength: rule(
      "xiaohongshu.body.max_length",
      1000,
      "笔记正文最多 1000 字（含话题文本）",
      XHS_PUBLISH_SOURCE,
    ),
  },
};

export const WECHAT_ARTICLE_RULES: FormatRuleSet = {
  platform: "wechat",
  format: "wechat_article",
  rulesVersion: "wechat_article/1@2026-07-13",
  rules: {
    requireCover: rule(
      "wechat.cover.required",
      1,
      "图文消息必须设置封面图（接口 thumb_media_id 必填），缺封面不可发布",
      WECHAT_DRAFT_SOURCE,
    ),
    maxTitleLength: rule(
      "wechat.title.max_length",
      64,
      "文章标题最多 64 字",
      WECHAT_DRAFT_SOURCE,
    ),
    maxAuthorLength: rule(
      "wechat.author.max_length",
      8,
      "作者名最多 8 字",
      WECHAT_DRAFT_SOURCE,
    ),
    maxDigestLength: rule(
      "wechat.digest.max_length",
      120,
      "摘要最多 120 字（不填时平台默认取正文开头，建议自行撰写）",
      WECHAT_DRAFT_SOURCE,
    ),
  },
};

const RULE_SETS: Record<OutputFormat, FormatRuleSet> = {
  x_single_post: X_SINGLE_POST_RULES,
  x_thread: X_THREAD_RULES,
  xiaohongshu_image_note: XIAOHONGSHU_IMAGE_NOTE_RULES,
  wechat_article: WECHAT_ARTICLE_RULES,
};

export function getRuleSet(format: OutputFormat): FormatRuleSet {
  return RULE_SETS[format];
}

export const OUTPUT_FORMATS = Object.keys(RULE_SETS) as OutputFormat[];

/** 展平全部规则（供设置页/文档展示「每条规则的来源与核对日期」） */
export function listAllRules(): Array<
  PlatformRule & { platform: OutputPlatform; format: OutputFormat; rulesVersion: string }
> {
  const seen = new Set<string>();
  const out: Array<
    PlatformRule & { platform: OutputPlatform; format: OutputFormat; rulesVersion: string }
  > = [];
  for (const set of Object.values(RULE_SETS)) {
    for (const r of Object.values(set.rules)) {
      const key = `${set.format}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...r,
        platform: set.platform,
        format: set.format,
        rulesVersion: set.rulesVersion,
      });
    }
  }
  return out;
}
