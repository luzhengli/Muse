import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type { DocMark, DocNode } from "./types";

/**
 * Markdown → Tiptap JSON 解析器。
 * markdown-it default 预设（CommonMark + GFM 表格/删除线），
 * 另加 $...$ / $$...$$ 数学规则与 GFM 任务列表识别。
 */

/** 行内公式：$...$（两侧紧贴非空白，内容非空且不含裸 $） */
function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src[start] !== "$") return false;
  if (src[start + 1] === "$") return false; // 块级由 block rule 处理
  // 开始定界符后不能是空白
  if (/\s/.test(src[start + 1] ?? "")) return false;

  let end = start + 1;
  while (end < src.length) {
    if (src[end] === "$" && src[end - 1] !== "\\") break;
    if (src[end] === "\n") return false; // 行内公式不跨行
    end++;
  }
  if (end >= src.length || end === start + 1) return false;
  // 结束定界符前不能是空白
  if (/\s/.test(src[end - 1])) return false;

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = src.slice(start + 1, end);
  }
  state.pos = end + 1;
  return true;
}

/** 块级公式：以 $$ 开始的行，直到 $$ 结尾的行 */
function mathBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  const lineMax = state.eMarks[startLine];
  const firstLine = state.src.slice(startPos, lineMax);
  if (!firstLine.trim().startsWith("$$")) return false;
  if (silent) return true;

  let latex = firstLine.trim().slice(2);
  let nextLine = startLine;
  let closed = false;
  if (latex.trim().endsWith("$$") && latex.trim().length >= 2) {
    // 单行 $$...$$
    latex = latex.trim().slice(0, -2);
    closed = true;
  } else {
    const parts: string[] = latex.trim() ? [latex.trim()] : [];
    while (++nextLine < endLine) {
      const pos = state.bMarks[nextLine] + state.tShift[nextLine];
      const max = state.eMarks[nextLine];
      const line = state.src.slice(pos, max);
      if (line.trim().endsWith("$$")) {
        const before = line.trim().slice(0, -2).trim();
        if (before) parts.push(before);
        closed = true;
        break;
      }
      parts.push(line);
    }
    latex = parts.join("\n");
  }
  if (!closed) return false;

  const token = state.push("math_block", "math", 0);
  token.content = latex.trim();
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}

function createParser(): MarkdownIt {
  const md = new MarkdownIt("default", { html: false, linkify: true });
  md.inline.ruler.before("escape", "math_inline", mathInlineRule);
  md.block.ruler.before("fence", "math_block", mathBlockRule);
  return md;
}

const parser = createParser();

interface MarkState {
  marks: DocMark[];
}

function textNode(text: string, marks: DocMark[]): DocNode {
  const node: DocNode = { type: "text", text };
  if (marks.length) node.marks = marks.map((m) => ({ ...m }));
  return node;
}

/** 任务列表识别：list item 首段以 [ ] / [x] 开头 */
const TASK_RE = /^\[([ xX])\]\s+/;

function inlineToNodes(tokens: Token[], ctx: { images: DocNode[] }): DocNode[] {
  const out: DocNode[] = [];
  const markStack: DocMark[] = [];
  const current = (): DocMark[] => markStack.slice();

  for (const t of tokens) {
    switch (t.type) {
      case "text":
        if (t.content) out.push(textNode(t.content, current()));
        break;
      case "strong_open":
        markStack.push({ type: "bold" });
        break;
      case "strong_close":
        popMark(markStack, "bold");
        break;
      case "em_open":
        markStack.push({ type: "italic" });
        break;
      case "em_close":
        popMark(markStack, "italic");
        break;
      case "s_open":
        markStack.push({ type: "strike" });
        break;
      case "s_close":
        popMark(markStack, "strike");
        break;
      case "link_open":
        markStack.push({
          type: "link",
          attrs: { href: t.attrGet("href") ?? "" },
        });
        break;
      case "link_close":
        popMark(markStack, "link");
        break;
      case "code_inline":
        out.push(textNode(t.content, [...current(), { type: "code" }]));
        break;
      case "math_inline":
        out.push({ type: "inlineMath", attrs: { latex: t.content } });
        break;
      case "image": {
        const alt = t.children?.map((c) => c.content).join("") ?? "";
        ctx.images.push({
          type: "image",
          attrs: {
            src: t.attrGet("src") ?? "",
            alt,
            title: t.attrGet("title") || null,
          },
        });
        break;
      }
      case "softbreak":
        out.push(textNode(" ", current()));
        break;
      case "hardbreak":
        out.push({ type: "hardBreak" });
        break;
      default:
        // html_inline 等：按纯文本保留，不丢内容
        if (t.content) out.push(textNode(t.content, current()));
        break;
    }
  }
  return out;
}

function popMark(stack: DocMark[], type: string) {
  const idx = stack.map((m) => m.type).lastIndexOf(type);
  if (idx >= 0) stack.splice(idx, 1);
}

/**
 * 段落级 inline 处理：Tiptap 的 Image 是块级节点，
 * Markdown 段落内的图片会被提升为兄弟块节点（保持相对顺序）。
 */
function paragraphNodes(inlineTok: Token): DocNode[] {
  const ctx = { images: [] as DocNode[] };
  const children = inlineToNodes(inlineTok.children ?? [], ctx);
  const blocks: DocNode[] = [];
  const nonEmpty = children.filter((c) => !(c.type === "text" && c.text === ""));
  if (nonEmpty.length || !ctx.images.length) {
    blocks.push({ type: "paragraph", ...(nonEmpty.length ? { content: nonEmpty } : {}) });
  }
  blocks.push(...ctx.images);
  return blocks;
}

interface Frame {
  node: DocNode;
  parent: Frame | null;
}

export function markdownToDoc(markdown: string): DocNode {
  const tokens = parser.parse(markdown, {});
  const doc: DocNode = { type: "doc", content: [] };
  let frame: Frame = { node: doc, parent: null };

  const push = (node: DocNode) => {
    (frame.node.content ??= []).push(node);
  };
  const open = (node: DocNode) => {
    push(node);
    frame = { node, parent: frame };
  };
  const close = () => {
    if (frame.parent) frame = frame.parent;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    switch (t.type) {
      case "heading_open": {
        const level = Number(t.tag.slice(1));
        const inlineTok = tokens[i + 1];
        if (inlineTok?.type === "inline") {
          const ctx = { images: [] as DocNode[] };
          const children = inlineToNodes(inlineTok.children ?? [], ctx);
          push({
            type: "heading",
            attrs: { level },
            ...(children.length ? { content: children } : {}),
          });
          for (const img of ctx.images) push(img);
          i += 2; // inline + heading_close
        } else {
          push({ type: "heading", attrs: { level } });
          i += 1;
        }
        break;
      }
      case "heading_close":
      case "paragraph_close":
      case "blockquote_close":
      case "bullet_list_close":
      case "ordered_list_close":
      case "list_item_close":
      case "table_close":
      case "tr_close":
        close();
        break;
      case "paragraph_open": {
        // 段落内容特殊处理（图片提升），open/close 由这里统一消费
        const inlineTok = tokens[i + 1];
        if (inlineTok?.type === "inline") {
          for (const node of paragraphNodes(inlineTok)) push(node);
          i += 2; // 跳过 inline 与 paragraph_close
        } else {
          push({ type: "paragraph" });
          i += 1;
        }
        break;
      }
      case "blockquote_open":
        open({ type: "blockquote" });
        break;
      case "bullet_list_open":
        open({ type: "bulletList" });
        break;
      case "ordered_list_open": {
        const start = Number(t.attrGet("start") ?? 1);
        open({ type: "orderedList", attrs: { start } });
        break;
      }
      case "list_item_open":
        open({ type: "listItem" });
        break;
      case "fence":
        push({
          type: "codeBlock",
          attrs: { language: t.info.trim() || null },
          ...(t.content
            ? { content: [{ type: "text", text: t.content.replace(/\n$/, "") }] }
            : {}),
        });
        break;
      case "code_block":
        push({
          type: "codeBlock",
          attrs: { language: null },
          ...(t.content
            ? { content: [{ type: "text", text: t.content.replace(/\n$/, "") }] }
            : {}),
        });
        break;
      case "hr":
        push({ type: "horizontalRule" });
        break;
      case "math_block":
        push({ type: "blockMath", attrs: { latex: t.content } });
        break;
      case "table_open":
        open({ type: "table" });
        break;
      case "thead_open":
      case "thead_close":
      case "tbody_open":
      case "tbody_close":
        break;
      case "tr_open":
        open({ type: "tableRow" });
        break;
      case "th_open":
      case "td_open": {
        const cellType = t.type === "th_open" ? "tableHeader" : "tableCell";
        const inlineTok = tokens[i + 1];
        const content: DocNode[] = [];
        if (inlineTok?.type === "inline") {
          const ctx = { images: [] as DocNode[] };
          const children = inlineToNodes(inlineTok.children ?? [], ctx);
          content.push({
            type: "paragraph",
            ...(children.length ? { content: children } : {}),
          });
          content.push(...ctx.images);
          i += 2; // inline + close
        } else {
          content.push({ type: "paragraph" });
        }
        push({
          type: cellType,
          attrs: { colspan: 1, rowspan: 1 },
          content,
        });
        break;
      }
      case "inline":
        // 正常情况下 inline 已被上面的分支消费；兜底为段落
        for (const node of paragraphNodes(t)) push(node);
        break;
      case "html_block":
        // html 已禁用，此分支保险：按纯文本段落保留
        if (t.content.trim()) {
          push({
            type: "paragraph",
            content: [{ type: "text", text: t.content.trim() }],
          });
        }
        break;
      default:
        break;
    }
  }

  convertTaskLists(doc);
  if (!doc.content?.length) doc.content = [{ type: "paragraph" }];
  return doc;
}

/** 把含 [ ] / [x] 前缀的 bulletList 转成 taskList */
function convertTaskLists(node: DocNode) {
  if (node.content) {
    for (const child of node.content) convertTaskLists(child);
  }
  if (node.type !== "bulletList" || !node.content?.length) return;

  const items = node.content;
  const parsed = items.map((item) => {
    const first = item.content?.[0];
    const firstText = first?.type === "paragraph" ? first.content?.[0] : undefined;
    if (firstText?.type !== "text") return null;
    const m = TASK_RE.exec(firstText.text ?? "");
    return m ? { item, firstText, checked: m[1] !== " ", prefixLen: m[0].length } : null;
  });
  if (!parsed.every(Boolean)) return;

  node.type = "taskList";
  for (const p of parsed) {
    if (!p) continue;
    p.item.type = "taskItem";
    p.item.attrs = { ...(p.item.attrs ?? {}), checked: p.checked };
    const rest = (p.firstText.text ?? "").slice(p.prefixLen);
    if (rest) {
      p.firstText.text = rest;
    } else {
      const para = p.item.content?.[0];
      para?.content?.shift();
      if (para && !para.content?.length) delete para.content;
    }
  }
}
