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
