import type { TopicBrief } from "@/db/schema";
import type { ReadinessFacts } from "@/lib/readiness";

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
  /** AI 事实检查结论（supported/missing/conflict/unavailable），普通审阅为 null */
  evidenceState: string | null;
}

export interface WbReview {
  id: number;
  type: string;
  summary: string;
  createdAt: number;
  sourceVersionId: number | null;
  sourceVersionNo: number | null;
  stale: boolean;
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
  sourceVersionId: number | null;
  stale: boolean;
  createdAt: number;
}

export interface WbVariant {
  id: number;
  platform: string;
  sourceVersionId: number | null;
  sourceVersionNo: number | null;
  stale: boolean;
  updatedAt: number;
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

/** 证据引用（精确到语料块，有效状态读取时计算） */
export interface WbEvidence {
  id: number;
  key: string;
  materialId: number | null;
  excerpt: string;
  contextSnapshot: string;
  sourceTitle: string;
  sourceUrl: string | null;
  validity: "valid" | "source-changed" | "source-missing";
  /** 当前语料块内容（来源仍有效时） */
  currentChunkContent: string | null;
  createdAt: number;
}

/** 写作工作台一次性下发的全部数据（服务端组件序列化） */
export interface WorkbenchData {
  articleId: number;
  topicId: number | null;
  title: string;
  summary: string;
  coverAssetId: number | null;
  versions: WbVersion[]; // 按 versionNo 倒序
  citations: WbCitation[];
  evidence: WbEvidence[];
  reviews: WbReview[]; // 按时间倒序
  packaging: WbPackaging | null;
  variants: WbVariant[];
  assets: WbAsset[];
  brief: TopicBrief | null;
  /** readiness 事实（服务端汇集；客户端在正文变化时用同一纯函数重算） */
  readinessFacts: ReadinessFacts;
  /** URL ?panel= 指定的初始面板；null 时按 NextAction 自动打开 */
  initialPanel: "review" | "packaging" | "versions" | "materials" | null;
  activeCheckpoint: { id: number; versionNo: number } | null;
  /** 编辑器初始内容（最新版本或恢复的工作稿） */
  initialContentHtml: string;
  /** 本次加载是否从自动保存的工作稿恢复 */
  restoredFromDraft: boolean;
  /** 设置中心的编辑器偏好（页面加载时读取） */
  editorPrefs: {
    autosaveIntervalMs: number;
    fontSize: number;
    lineHeight: number;
    spellcheck: boolean;
    defaultFocusMode: boolean;
  };
}
