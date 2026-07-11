export const articleStatusLabel: Record<
  string,
  { text: string; tone: "default" | "primary" | "success" | "warning" | "danger" }
> = {
  draft: { text: "草稿", tone: "default" },
  reviewing: { text: "审阅中", tone: "warning" },
  packaged: { text: "已包装", tone: "primary" },
  ready: { text: "待发布", tone: "primary" },
  published: { text: "已发布", tone: "success" },
};

export const taskStatusLabel: Record<
  string,
  { text: string; tone: "default" | "primary" | "success" | "warning" | "danger" }
> = {
  pending: { text: "待发布", tone: "warning" },
  publishing: { text: "发布中", tone: "primary" },
  published: { text: "已发布", tone: "success" },
  failed: { text: "失败", tone: "danger" },
};

export const reviewCategoryLabel: Record<string, string> = {
  fact: "事实一致性",
  structure: "结构完整性",
  style: "表达风格",
  safety: "安全风险",
  compliance: "平台合规",
  polish: "润色建议",
};

export const severityLabel: Record<
  string,
  { text: string; tone: "default" | "warning" | "danger" }
> = {
  info: { text: "建议", tone: "default" },
  warn: { text: "注意", tone: "warning" },
  critical: { text: "严重", tone: "danger" },
};

/** 事实检查结论：缺少资料是中性提示，不是错误 */
export const evidenceStateLabel: Record<
  string,
  { text: string; tone: "default" | "primary" | "success" | "warning" | "danger" }
> = {
  supported: { text: "资料支持", tone: "success" },
  missing: { text: "缺少资料", tone: "default" },
  conflict: { text: "资料冲突", tone: "danger" },
  unavailable: { text: "来源不可用", tone: "warning" },
};

/** 证据引用的有效状态（读取时计算） */
export const citationValidityLabel: Record<
  string,
  { text: string; tone: "default" | "primary" | "success" | "warning" | "danger" }
> = {
  valid: { text: "依据有效", tone: "success" },
  "source-changed": { text: "来源已变化", tone: "warning" },
  "source-missing": { text: "来源已删除", tone: "danger" },
};
