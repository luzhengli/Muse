import type { TopicBrief } from "@/db/schema";

export interface WbVersion {
  id: number;
  versionNo: number;
  contentHtml: string;
  contentText: string;
  note: string;
  createdAt: number;
}

export interface WbFinding {
  id: number;
  category: string;
  severity: string;
  quote: string;
  suggestion: string;
  status: string;
}

export interface WbReview {
  id: number;
  type: string;
  summary: string;
  createdAt: number;
  findings: WbFinding[];
}

export interface WbPackaging {
  id: number;
  titleCandidates: string[];
  summary: string;
  coverPrompt: string;
  imagePrompts: string[];
  cards: { heading: string; body: string }[];
  versionNo: number | null;
  createdAt: number;
}

export interface WbAsset {
  id: number;
  kind: string;
  fileName: string;
  filePath: string;
  createdAt: number;
}

export interface WbCitation {
  id: number;
  materialId: number;
  title: string;
  summary: string;
}

/** 写作工作台一次性下发的全部数据（服务端组件序列化） */
export interface WorkbenchData {
  articleId: number;
  title: string;
  summary: string;
  coverAssetId: number | null;
  versions: WbVersion[]; // 按 versionNo 倒序
  citations: WbCitation[];
  reviews: WbReview[]; // 按时间倒序
  packaging: WbPackaging | null;
  assets: WbAsset[];
  brief: TopicBrief | null;
}
