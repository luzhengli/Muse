/**
 * 保守判断一段纯文本是否是 Markdown（用于粘贴导入）。
 * 只在出现明确的块级语法信号时判 true，避免把普通文本误转。
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.includes("\n") && !/^#{1,6}\s/.test(text)) return false;
  const signals = [
    /^#{1,6}\s+\S/m, // 标题
    /^```/m, // 代码围栏
    /^>\s+\S/m, // 引用
    /^[-*+]\s+\S/m, // 无序列表
    /^\d+\.\s+\S/m, // 有序列表
    /^\|.+\|\s*$/m, // 表格行
    /^\$\$/m, // 块级公式
    /^---\s*$/m, // 分隔线
    /!\[[^\]]*\]\([^)]+\)/, // 图片
    /\[[^\]]+\]\([^)]+\)/, // 链接
  ];
  let hits = 0;
  for (const re of signals) {
    if (re.test(text)) hits++;
    if (hits >= 1 && /^(#{1,6}\s|```|\||\$\$|>\s|[-*+]\s|\d+\.\s)/m.test(text)) {
      return true;
    }
  }
  return hits >= 2;
}
