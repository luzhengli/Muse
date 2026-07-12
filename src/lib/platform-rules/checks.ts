/**
 * 平台作品发布检查（PRD v1.0 §3.2 硬条件 + FR-1.4 三视图之「发布检查」）。
 *
 * 纯函数：输入类型化 payload，输出按规则注册表出具的 checklist。
 * - blocker（阻断项，UI 红色）：不通过则该作品不就绪，不可标记已发布；
 * - warning（提醒项，UI 黄色）：不阻断发布，但建议处理。
 * 结果携带出具时的 rulesVersion，供作品修订记录与「按新规则重检」使用。
 */
import {
  getRuleSet,
  type OutputFormat,
} from "./registry";
import { parseXText } from "./x-text";
import type {
  PlatformOutputPayload,
  WechatArticlePayload,
  XiaohongshuImageNotePayload,
  XMediaRef,
  XSinglePostPayload,
  XThreadPayload,
} from "./payloads";

export type CheckLevel = "blocker" | "warning";

export interface OutputCheckItem {
  /** 检查项 ID，如 "x_single_post.weighted_length" */
  id: string;
  level: CheckLevel;
  passed: boolean;
  /** 中文自然语言：通过时描述现状，不通过时说明缺口 */
  message: string;
  /** 对应规则注册表的规则 ID（非注册表规则的结构性检查为空） */
  ruleId?: string;
  /** Thread 逐条检查时指向具体帖文（0 起） */
  postIndex?: number;
}

export interface OutputCheckResult {
  format: OutputFormat;
  /** 出具本次检查所依据的规则集版本 */
  rulesVersion: string;
  items: OutputCheckItem[];
  /** 全部阻断项通过 = 就绪（可标记已发布） */
  ready: boolean;
}

/** 按 Unicode 码点计数（中英文同计 1，避免代理对把 emoji 算成 2 个字） */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

function finish(
  format: OutputFormat,
  items: OutputCheckItem[],
): OutputCheckResult {
  return {
    format,
    rulesVersion: getRuleSet(format).rulesVersion,
    items,
    ready: items.every((item) => item.level !== "blocker" || item.passed),
  };
}

export function failedBlockers(result: OutputCheckResult): OutputCheckItem[] {
  return result.items.filter((i) => i.level === "blocker" && !i.passed);
}

export function failedWarnings(result: OutputCheckResult): OutputCheckItem[] {
  return result.items.filter((i) => i.level === "warning" && !i.passed);
}

/** X：图片最多 4 个；GIF/视频只能单独 1 个，不与其他媒体混用 */
function checkXMedia(
  media: XMediaRef[],
  idPrefix: string,
  postIndex?: number,
): OutputCheckItem[] {
  const maxMedia = getRuleSet("x_single_post").rules.maxMediaPerPost;
  const hasExclusive = media.some((m) => m.kind === "gif" || m.kind === "video");
  const positionLabel = postIndex === undefined ? "" : `第 ${postIndex + 1} 条`;
  const items: OutputCheckItem[] = [
    {
      id: `${idPrefix}.media_count`,
      level: "blocker",
      passed: media.length <= maxMedia.value,
      message:
        media.length <= maxMedia.value
          ? `${positionLabel}媒体 ${media.length}/${maxMedia.value} 个`
          : `${positionLabel}媒体 ${media.length} 个，超出上限 ${maxMedia.value} 个`,
      ruleId: maxMedia.id,
      postIndex,
    },
  ];
  if (hasExclusive) {
    items.push({
      id: `${idPrefix}.media_exclusive`,
      level: "blocker",
      passed: media.length === 1,
      message:
        media.length === 1
          ? `${positionLabel}GIF/视频单独作为附件`
          : `${positionLabel}GIF 或视频只能单独 1 个，不能与其他媒体混用`,
      ruleId: maxMedia.id,
      postIndex,
    });
  }
  return items;
}

/** X：单条帖文的内容与加权字符检查（text 为空但有媒体仍可发布，与 X 一致） */
function checkXPostText(
  text: string,
  media: XMediaRef[],
  idPrefix: string,
  postIndex?: number,
): OutputCheckItem[] {
  const maxLen = getRuleSet("x_single_post").rules.maxWeightedLength;
  const stats = parseXText(text);
  const positionLabel = postIndex === undefined ? "" : `第 ${postIndex + 1} 条`;
  const hasContent = text.trim().length > 0 || media.length > 0;
  return [
    {
      id: `${idPrefix}.has_content`,
      level: "blocker",
      passed: hasContent,
      message: hasContent
        ? `${positionLabel}已有内容`
        : `${positionLabel}没有文字也没有媒体，无法发布`,
      postIndex,
    },
    {
      id: `${idPrefix}.weighted_length`,
      level: "blocker",
      passed: stats.weightedLength <= maxLen.value,
      message:
        stats.weightedLength <= maxLen.value
          ? `${positionLabel}加权字符 ${stats.weightedLength}/${maxLen.value}`
          : `${positionLabel}加权字符 ${stats.weightedLength}/${maxLen.value}，超出 ${
              stats.weightedLength - maxLen.value
            }，需要删减`,
      ruleId: maxLen.id,
      postIndex,
    },
  ];
}

function checkXSinglePost(payload: XSinglePostPayload): OutputCheckResult {
  return finish("x_single_post", [
    ...checkXPostText(payload.text, payload.media, "x_single_post"),
    ...checkXMedia(payload.media, "x_single_post"),
  ]);
}

function checkXThread(payload: XThreadPayload): OutputCheckResult {
  const minPosts = getRuleSet("x_thread").rules.minPosts;
  const items: OutputCheckItem[] = [
    {
      id: "x_thread.min_posts",
      level: "blocker",
      passed: payload.posts.length >= minPosts.value,
      message:
        payload.posts.length >= minPosts.value
          ? `Thread 共 ${payload.posts.length} 条`
          : `Thread 目前 ${payload.posts.length} 条，至少需要 ${minPosts.value} 条（单条内容请使用单条帖文类型）`,
      ruleId: minPosts.id,
    },
  ];
  payload.posts.forEach((post, index) => {
    items.push(
      ...checkXPostText(post.text, post.media, "x_thread.post", index),
      ...checkXMedia(post.media, "x_thread.post", index),
    );
  });
  return finish("x_thread", items);
}

function checkXiaohongshuImageNote(
  payload: XiaohongshuImageNotePayload,
): OutputCheckResult {
  const rules = getRuleSet("xiaohongshu_image_note").rules;
  const titleLen = codePointLength(payload.title);
  const bodyLen = codePointLength(payload.body);
  const imageCount = payload.images.length;
  const items: OutputCheckItem[] = [
    {
      id: "xiaohongshu_image_note.min_images",
      level: "blocker",
      passed: imageCount >= rules.minImages.value,
      message:
        imageCount >= rules.minImages.value
          ? `已选 ${imageCount} 张图片，第 1 张为首图`
          : "缺少图片，不可发布（图文笔记至少需要 1 张图片）",
      ruleId: rules.minImages.id,
    },
    {
      id: "xiaohongshu_image_note.max_images",
      level: "blocker",
      passed: imageCount <= rules.maxImages.value,
      message:
        imageCount <= rules.maxImages.value
          ? `图片数量 ${imageCount}/${rules.maxImages.value}`
          : `图片 ${imageCount} 张，超出上限 ${rules.maxImages.value} 张`,
      ruleId: rules.maxImages.id,
    },
    {
      id: "xiaohongshu_image_note.title_length",
      level: "blocker",
      passed: titleLen <= rules.maxTitleLength.value,
      message:
        titleLen <= rules.maxTitleLength.value
          ? `标题 ${titleLen}/${rules.maxTitleLength.value} 字`
          : `标题 ${titleLen} 字，超出上限 ${rules.maxTitleLength.value} 字`,
      ruleId: rules.maxTitleLength.id,
    },
    {
      id: "xiaohongshu_image_note.title_present",
      level: "warning",
      passed: payload.title.trim().length > 0,
      message:
        payload.title.trim().length > 0
          ? "已填写标题"
          : "还没有标题（可以发布，但建议补一个更容易被点开的标题）",
    },
    {
      id: "xiaohongshu_image_note.body_length",
      level: "blocker",
      passed: bodyLen <= rules.maxBodyLength.value,
      message:
        bodyLen <= rules.maxBodyLength.value
          ? `正文 ${bodyLen}/${rules.maxBodyLength.value} 字`
          : `正文 ${bodyLen} 字，超出上限 ${rules.maxBodyLength.value} 字`,
      ruleId: rules.maxBodyLength.id,
    },
    {
      id: "xiaohongshu_image_note.body_present",
      level: "warning",
      passed: bodyLen > 0,
      message: bodyLen > 0 ? "已有正文" : "正文为空（建议补充内容）",
    },
  ];
  return finish("xiaohongshu_image_note", items);
}

/** 去掉 HTML 标签后的可见文本（判断正文是否为空） */
function htmlVisibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function checkWechatArticle(payload: WechatArticlePayload): OutputCheckResult {
  const rules = getRuleSet("wechat_article").rules;
  const titleLen = codePointLength(payload.title);
  const authorLen = codePointLength(payload.author);
  const digestLen = codePointLength(payload.digest);
  const hasBody = htmlVisibleText(payload.contentHtml).length > 0;
  const hasCover = payload.coverAssetId !== null;
  const sourceUrl = payload.sourceUrl.trim();
  const items: OutputCheckItem[] = [
    {
      id: "wechat_article.cover",
      level: "blocker",
      passed: hasCover,
      message: hasCover ? "已设置封面" : "缺少封面，不可发布（公众号图文必须有封面图）",
      ruleId: rules.requireCover.id,
    },
    {
      id: "wechat_article.title_present",
      level: "blocker",
      passed: titleLen > 0,
      message: titleLen > 0 ? `已填写标题` : "缺少标题，不可发布",
      ruleId: rules.maxTitleLength.id,
    },
    {
      id: "wechat_article.title_length",
      level: "blocker",
      passed: titleLen <= rules.maxTitleLength.value,
      message:
        titleLen <= rules.maxTitleLength.value
          ? `标题 ${titleLen}/${rules.maxTitleLength.value} 字`
          : `标题 ${titleLen} 字，超出上限 ${rules.maxTitleLength.value} 字`,
      ruleId: rules.maxTitleLength.id,
    },
    {
      id: "wechat_article.body_present",
      level: "blocker",
      passed: hasBody,
      message: hasBody ? "已有正文" : "正文为空，不可发布",
    },
    {
      id: "wechat_article.author_length",
      level: "blocker",
      passed: authorLen <= rules.maxAuthorLength.value,
      message:
        authorLen <= rules.maxAuthorLength.value
          ? authorLen > 0
            ? `作者 ${authorLen}/${rules.maxAuthorLength.value} 字`
            : "作者未填写（可不填）"
          : `作者名 ${authorLen} 字，超出上限 ${rules.maxAuthorLength.value} 字`,
      ruleId: rules.maxAuthorLength.id,
    },
    {
      id: "wechat_article.digest_present",
      level: "warning",
      passed: digestLen > 0,
      message:
        digestLen > 0
          ? "已填写摘要"
          : "还没有摘要（不填时平台默认取正文开头，建议自行撰写）",
      ruleId: rules.maxDigestLength.id,
    },
    {
      id: "wechat_article.digest_length",
      level: "blocker",
      passed: digestLen <= rules.maxDigestLength.value,
      message:
        digestLen <= rules.maxDigestLength.value
          ? `摘要 ${digestLen}/${rules.maxDigestLength.value} 字`
          : `摘要 ${digestLen} 字，超出上限 ${rules.maxDigestLength.value} 字`,
      ruleId: rules.maxDigestLength.id,
    },
  ];
  if (sourceUrl.length > 0) {
    const looksLikeUrl = /^https?:\/\/\S+$/i.test(sourceUrl);
    items.push({
      id: "wechat_article.source_url",
      level: "warning",
      passed: looksLikeUrl,
      message: looksLikeUrl
        ? "原文链接格式正常"
        : "原文链接看起来不是有效网址（需要以 http:// 或 https:// 开头）",
    });
  }
  return finish("wechat_article", items);
}

/** 统一入口：按 payload 类型出具发布检查 checklist */
export function checkPlatformOutput(
  payload: PlatformOutputPayload,
): OutputCheckResult {
  switch (payload.type) {
    case "x_single_post":
      return checkXSinglePost(payload);
    case "x_thread":
      return checkXThread(payload);
    case "xiaohongshu_image_note":
      return checkXiaohongshuImageNote(payload);
    case "wechat_article":
      return checkWechatArticle(payload);
  }
}
