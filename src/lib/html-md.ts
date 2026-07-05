/**
 * 把 Tiptap（StarterKit + Image）产出的受限 HTML 转为 Markdown。
 * 覆盖：h1-h6 / p / strong / em / s / code / pre / a / img /
 * ul / ol / li / blockquote / hr / br。用于编辑器预览与 .md 导出。
 */

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 处理行内标记（加粗/斜体/删除线/行内代码/链接/图片） */
function inline(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "  \n")
      .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)")
      .replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)")
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
      .replace(/<(s|del|strike)>([\s\S]*?)<\/\1>/gi, "~~$2~~")
      .replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

export function htmlToMarkdown(html: string): string {
  let src = html;
  const out: string[] = [];

  // 代码块先行提取，避免内部标签被行内规则破坏
  const codeBlocks: string[] = [];
  src = src.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => {
    codeBlocks.push(decodeEntities(code));
    return `<pre data-idx="${codeBlocks.length - 1}"></pre>`;
  });

  // Tiptap 的图片是顶层 block 节点，包成段落让 blockRe 能捕获
  src = src.replace(/(<img[^>]*>)/gi, "<p>$1</p>");

  const blockRe =
    /<(h[1-6]|p|ul|ol|blockquote|pre|hr)([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(src))) {
    const [, tag, attrs, body = ""] = match;
    if (tag === "hr") {
      out.push("---");
    } else if (tag === "pre") {
      const idx = Number(/data-idx="(\d+)"/.exec(attrs)?.[1] ?? -1);
      out.push("```\n" + (codeBlocks[idx] ?? "").trimEnd() + "\n```");
    } else if (tag[0] === "h") {
      const text = inline(body);
      if (text) out.push("#".repeat(Number(tag[1])) + " " + text);
    } else if (tag === "p") {
      const text = inline(body);
      if (text) out.push(text);
    } else if (tag === "ul" || tag === "ol") {
      const items = [...body.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m, i) => {
        // 列表项内 Tiptap 会包一层 <p>
        const text = inline(m[1]);
        return tag === "ul" ? `- ${text}` : `${i + 1}. ${text}`;
      });
      out.push(items.join("\n"));
    } else if (tag === "blockquote") {
      const innerMd = htmlToMarkdown(body);
      out.push(
        innerMd
          .split("\n")
          .map((l) => (l ? `> ${l}` : ">"))
          .join("\n"),
      );
    }
  }
  return out.join("\n\n").trim() + "\n";
}

/** 导出用：包一层最小 HTML 文档 */
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
</style>
</head>
<body>
<h1>${title}</h1>
${bodyHtml}
</body>
</html>
`;
}
