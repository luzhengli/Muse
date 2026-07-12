/**
 * X 帖文加权字符计数（PRD v1.0 FR-0.2）。
 *
 * 直接封装 X 官方开源的 twitter-text（v3 加权配置）：
 * - CJK、emoji（含 ZWJ 组合、旗帜）计 2；
 * - 多数拉丁字符与常用标点计 1；
 * - 任意 URL 一律按 t.co 固定长度计 23；
 * - 上限 280 加权字符。
 *
 * 全站判断 X 文本可发布性必须走本模块，禁止使用 string.length。
 */
import twitter from "twitter-text";

import { X_SINGLE_POST_RULES } from "./registry";

export interface XTextStats {
  /** 官方加权字符数（与 X composer 计数一致） */
  weightedLength: number;
  /** 距上限剩余的加权字符数（负数 = 超出） */
  remaining: number;
  /** 是否在上限内且非空（与官方 parseTweet.valid 一致） */
  valid: boolean;
  /** 上限（来自规则注册表，当前 280） */
  maxWeightedLength: number;
}

export const X_MAX_WEIGHTED_LENGTH =
  X_SINGLE_POST_RULES.rules.maxWeightedLength.value;

export function parseXText(text: string): XTextStats {
  const parsed = twitter.parseTweet(text);
  return {
    weightedLength: parsed.weightedLength,
    remaining: X_MAX_WEIGHTED_LENGTH - parsed.weightedLength,
    valid: parsed.valid,
    maxWeightedLength: X_MAX_WEIGHTED_LENGTH,
  };
}
