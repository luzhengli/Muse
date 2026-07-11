/**
 * 导出 .html 时的最小文档包装。
 * Markdown 转换请使用 src/lib/markdown/（基于 Tiptap JSON 的可测试序列化器，
 * 旧的正则 HTML→Markdown 实现已在 feat-018 移除）。
 */
export function wrapHtmlDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body { max-width: 720px; margin: 2rem auto; padding: 0 1rem; font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; line-height: 1.8; color: #1f1d1a; }
  img { max-width: 100%; border-radius: 8px; }
  blockquote { border-left: 3px solid #d8d3ca; margin-left: 0; padding-left: 1rem; color: #6f6a61; }
  pre { background: #f4f1ec; padding: 1rem; border-radius: 8px; overflow-x: auto; }
  code { background: #f4f1ec; padding: 0.1em 0.35em; border-radius: 4px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #d8d3ca; padding: 0.4rem 0.6rem; }
</style>
</head>
<body>
<h1>${title}</h1>
${bodyHtml}
</body>
</html>
`;
}
