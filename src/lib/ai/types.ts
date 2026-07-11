import type { ReviewCategory } from "@/db/schema";

export type AiFallbackReason = "not-configured" | "timeout" | "provider-error";

export type AiRunMeta =
  | {
      status: "success";
      source: "real";
      action: string;
      provider: string;
      model: string;
      durationMs: number;
    }
  | {
      status: "fallback";
      source: "mock";
      reason: AiFallbackReason;
      action: string;
      provider: string;
      model: string;
      durationMs: number;
    };

export interface AiResult<T> {
  data: T;
  meta: AiRunMeta;
}

export interface AiActionResult<T = undefined> {
  ok: boolean;
  message: string;
  tone: "success" | "warning" | "danger";
  data?: T;
  redirectTo?: string;
  ai?: AiRunMeta;
}

export interface MaterialInput {
  id: number;
  title: string;
  summary: string;
  content: string;
  tags: string[];
}

export interface TopicCardGen {
  title: string;
  targetAudience: string;
  corePoints: string[];
  angle: string;
  recommendedPlatforms: string[];
}

export interface BriefGen {
  audience: string;
  objective: string;
  coreClaim: string;
  platforms: string[];
  keyPoints: string[];
  angle: string;
  tone: string;
  outline: string[];
}

export interface DraftGen {
  title: string;
  /** 简单 HTML（h2/p/ul），可直接载入 Tiptap */
  contentHtml: string;
}

export interface ReviewFindingGen {
  category: ReviewCategory;
  severity: "info" | "warn" | "critical";
  quote: string;
  suggestion: string;
}

export interface ReviewGen {
  summary: string;
  findings: ReviewFindingGen[];
}

export interface PackagingGen {
  titleCandidates: string[];
  summary: string;
  coverPrompt: string;
  imagePrompts: string[];
  cards: { heading: string; body: string }[];
}

export interface VariantGen {
  title: string;
  content: string;
  hashtags: string[];
  cta: string;
  summary: string;
  publishNote: string;
}

export interface CleanGen {
  summary: string;
  tags: string[];
  chunks: string[];
}

export type RewriteMode = "expand" | "rewrite" | "restructure";
