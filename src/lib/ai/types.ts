import type { ReviewCategory } from "@/db/schema";

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
