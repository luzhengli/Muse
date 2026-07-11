import type { DocMark, DocNode } from "./types";

/**
 * Tiptap JSON → Markdown 序列化器。
 *
 * 每种受支持节点都有显式处理函数；未知节点不会被静默丢弃——
 * 会降级输出其可见文本并通过 onUnknown 上报（默认 console.warn），
 * 保证用户内容在导出边界不丢失。
 */

export interface SerializeOptions {
  /** 遇到未知节点/标记时的回调（默认 console.warn） */
  onUnknown?: (kind: "node" | "mark", type: string) => void;
}

interface Ctx {
  onUnknown: (kind: "node" | "mark", type: string) => void;
}

/** 普通文本中需要转义的 Markdown 触发字符 */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([*_[\]`~$<>])/g, "\\$1")
    .replace(/^(\s*)([#>+-])(\s)/gm, "$1\\$2$3")
    .replace(/^(\s*)(\d+)\.(\s)/gm, "$1$2\\.$3");
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

const MARK_WRAPPERS: Record<string, [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  strike: ["~~", "~~"],
};

/** 行内代码定界：内容含反引号时加长围栏 */
function wrapInlineCode(text: string): string {
  const runs = text.match(/`+/g);
  const fence = "`".repeat(runs ? Math.max(...runs.map((r) => r.length)) + 1 : 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

function serializeTextNode(node: DocNode, ctx: Ctx): string {
  const marks = node.marks ?? [];
  const isCode = marks.some((m) => m.type === "code");
  let out = isCode ? wrapInlineCode(node.text ?? "") : escapeText(node.text ?? "");

  // code 与其他 mark 共存时，code 已在最内层；其余按固定顺序包裹
  const order = ["strike", "italic", "bold"];
  const rest = marks.filter(
    (m) => m.type !== "code" && m.type !== "link" && m.type !== "citation",
  );
  for (const type of order) {
    if (rest.some((m) => m.type === type)) {
      const [open, close] = MARK_WRAPPERS[type];
      out = `${open}${out}${close}`;
    }
  }
  for (const m of rest) {
    if (!order.includes(m.type)) ctx.onUnknown("mark", m.type);
  }
  // 证据引用以 muse://cite 链接形式往返；与普通链接共存时引用身份优先
  const citation = marks.find((m): m is DocMark => m.type === "citation");
  const link = marks.find((m): m is DocMark => m.type === "link");
  if (citation) {
    const key = encodeURIComponent(String(citation.attrs?.key ?? ""));
    out = `[${out}](muse://cite/${key})`;
  } else if (link) {
    const href = String(link.attrs?.href ?? "");
    out = `[${out}](${href})`;
  }
  return out;
}

function serializeInline(nodes: DocNode[] | undefined, ctx: Ctx): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return serializeTextNode(n, ctx);
        case "hardBreak":
          return "  \n";
        case "inlineMath":
          return `$${String(n.attrs?.latex ?? "")}$`;
        case "image":
          return serializeImage(n);
        default:
          ctx.onUnknown("node", n.type);
          return collectText(n);
      }
    })
    .join("");
}

function serializeImage(node: DocNode): string {
  const src = String(node.attrs?.src ?? "");
  const alt = String(node.attrs?.alt ?? "");
  const title = node.attrs?.title ? ` "${String(node.attrs.title)}"` : "";
  return `![${alt}](${src}${title})`;
}

/** 未知节点兜底：抽取全部后代文本，不丢内容 */
function collectText(node: DocNode): string {
  if (node.text) return node.text;
  return (node.content ?? []).map(collectText).join("");
}

function indentBlock(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? line : line ? indent + line : line))
    .join("\n");
}

function serializeListItem(
  node: DocNode,
  marker: string,
  ctx: Ctx,
): string {
  const indent = " ".repeat(marker.length);
  const blocks = (node.content ?? []).map((child) => serializeBlock(child, ctx));
  const joined = blocks.filter((b) => b !== "").join("\n\n");
  return marker + indentBlock(joined, indent);
}

function serializeTable(node: DocNode, ctx: Ctx): string {
  const rows = (node.content ?? []).filter((r) => r.type === "tableRow");
  if (!rows.length) return "";
  const cellsOf = (row: DocNode) =>
    (row.content ?? []).map((cell) => {
      // 单元格内容通常是单个段落；多块时合并为一行
      const inner = (cell.content ?? [])
        .map((b) =>
          b.type === "paragraph" ? serializeInline(b.content, ctx) : collectText(b),
        )
        .join(" ")
        .trim();
      return escapeTableCell(inner);
    });
  const header = cellsOf(rows[0]);
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((r) => `| ${cellsOf(r).join(" | ")} |`),
  ];
  return lines.join("\n");
}

function serializeCodeBlock(node: DocNode): string {
  const language = String(node.attrs?.language ?? "").trim();
  const code = collectText(node).replace(/\n$/, "");
  const runs = code.match(/^`{3,}/gm);
  const fence = "`".repeat(runs ? Math.max(...runs.map((r) => r.length)) + 1 : 3);
  return `${fence}${language}\n${code}\n${fence}`;
}

function serializeBlock(node: DocNode, ctx: Ctx): string {
  switch (node.type) {
    case "paragraph":
      return serializeInline(node.content, ctx);
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      return `${"#".repeat(level)} ${serializeInline(node.content, ctx)}`;
    }
    case "bulletList":
      return (node.content ?? [])
        .map((item) => serializeListItem(item, "- ", ctx))
        .join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? [])
        .map((item, i) => serializeListItem(item, `${start + i}. `, ctx))
        .join("\n");
    }
    case "taskList":
      return (node.content ?? [])
        .map((item) => {
          const checked = Boolean(item.attrs?.checked);
          return serializeListItem(item, checked ? "- [x] " : "- [ ] ", ctx);
        })
        .join("\n");
    case "listItem":
    case "taskItem":
      // 只应出现在列表内；直接遇到时按段落序列化
      return (node.content ?? []).map((c) => serializeBlock(c, ctx)).join("\n\n");
    case "blockquote": {
      const inner = (node.content ?? [])
        .map((c) => serializeBlock(c, ctx))
        .join("\n\n");
      return inner
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n");
    }
    case "codeBlock":
      return serializeCodeBlock(node);
    case "horizontalRule":
      return "---";
    case "image":
      return serializeImage(node);
    case "table":
      return serializeTable(node, ctx);
    case "blockMath":
      return `$$\n${String(node.attrs?.latex ?? "")}\n$$`;
    default: {
      // 段落级未知节点兜底
      ctx.onUnknown("node", node.type);
      const text = node.content ? serializeInline(node.content, ctx) : collectText(node);
      return text;
    }
  }
}

export function docToMarkdown(doc: DocNode, options?: SerializeOptions): string {
  const ctx: Ctx = {
    onUnknown:
      options?.onUnknown ??
      ((kind, type) =>
        console.warn(`[markdown] 未支持的${kind === "node" ? "节点" : "标记"}类型：${type}，已降级为纯文本输出`)),
  };
  const blocks = (doc.content ?? [])
    .map((node) => serializeBlock(node, ctx))
    .filter((b) => b !== "");
  return blocks.join("\n\n").trimEnd() + "\n";
}
