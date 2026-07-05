import type { Platform } from "@/db/schema";

export interface PlatformSpec {
  id: Platform;
  name: string;
  titleMaxLen: number;
  contentMaxLen: number;
  hashtagCount: number;
  style: string;
  ctaHint: string;
}

export const PLATFORMS: Record<Platform, PlatformSpec> = {
  xiaohongshu: {
    id: "xiaohongshu",
    name: "小红书",
    titleMaxLen: 20,
    contentMaxLen: 1000,
    hashtagCount: 6,
    style:
      "口语化、emoji 点缀、短段落、每段 1-2 句、结尾互动提问，重体验与个人视角",
    ctaHint: "引导收藏、评论区交流",
  },
  x: {
    id: "x",
    name: "X (Twitter)",
    titleMaxLen: 0,
    contentMaxLen: 280,
    hashtagCount: 2,
    style: "凝练观点、单条或短 thread、每条不超过 280 字符、首句抓眼球",
    ctaHint: "引导转发与关注",
  },
  wechat: {
    id: "wechat",
    name: "微信公众号",
    titleMaxLen: 64,
    contentMaxLen: 20000,
    hashtagCount: 0,
    style: "结构化长文、小标题分节、逻辑完整、观点有深度、适合深读",
    ctaHint: "引导在看、星标公众号",
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as Platform[];

export function platformName(id: string): string {
  return PLATFORMS[id as Platform]?.name ?? id;
}
