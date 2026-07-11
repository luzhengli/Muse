import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

/**
 * 证据引用 mark：attrs.key 关联 evidence_citations.key。
 * 持久化为 <span data-citation="KEY">，Markdown 边界表达为 [文本](muse://cite/KEY)。
 * 点击已引用文字时通过 onCitationClick 通知工作台展示「这句话有什么依据」。
 */

export interface CitationOptions {
  onCitationClick?: (key: string) => void;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    citation: {
      setCitation: (key: string) => ReturnType;
      unsetCitation: () => ReturnType;
    };
  }
}

export const Citation = Mark.create<CitationOptions>({
  name: "citation",
  // 在引用文字边缘继续输入时不扩展引用范围
  inclusive: false,
  keepOnSplit: false,

  addOptions() {
    return { onCitationClick: undefined };
  },

  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-citation") ?? "",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-citation]" }];
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-citation": String(mark.attrs.key ?? ""),
        class: "citation-ref",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCitation:
        (key: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { key }),
      unsetCitation:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
    };
  },

  addProseMirrorPlugins() {
    const markName = this.name;
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey("citationClick"),
        props: {
          handleClick(view, pos) {
            if (!options.onCitationClick) return false;
            const $pos = view.state.doc.resolve(pos);
            const node = $pos.nodeAfter ?? $pos.nodeBefore;
            const mark = node?.marks.find((m) => m.type.name === markName);
            if (!mark) return false;
            options.onCitationClick(String(mark.attrs.key ?? ""));
            return false; // 不拦截默认光标行为
          },
        },
      }),
    ];
  },
});

/** 扫描文档中某个引用 key 的全部文本范围 */
export function findCitationRanges(
  doc: PmNode,
  key: string,
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const has = node.marks.some(
      (m) => m.type.name === "citation" && String(m.attrs.key) === key,
    );
    if (has) {
      const from = pos;
      const to = pos + node.nodeSize;
      const last = ranges[ranges.length - 1];
      if (last && last.to === from) last.to = to;
      else ranges.push({ from, to });
    }
  });
  return ranges;
}

/** 文档中出现的全部引用 key（用于面板显示「未出现在正文中」） */
export function collectCitationKeys(doc: PmNode): Set<string> {
  const keys = new Set<string>();
  doc.descendants((node) => {
    for (const mark of node.marks) {
      if (mark.type.name === "citation" && mark.attrs.key) {
        keys.add(String(mark.attrs.key));
      }
    }
  });
  return keys;
}

/** 定位并选中正文中的引用；找不到返回 false */
export function selectCitation(editor: Editor, key: string): boolean {
  const ranges = findCitationRanges(editor.state.doc, key);
  if (!ranges.length) return false;
  editor
    .chain()
    .focus()
    .setTextSelection({ from: ranges[0].from, to: ranges[0].to })
    .scrollIntoView()
    .run();
  return true;
}

/** 移除正文中某个引用 key 的全部 mark（保留文字本身） */
export function removeCitationMarks(editor: Editor, key: string) {
  const ranges = findCitationRanges(editor.state.doc, key);
  if (!ranges.length) return;
  let chain = editor.chain();
  for (const range of ranges) {
    chain = chain.setTextSelection(range).unsetMark("citation");
  }
  chain.setTextSelection(ranges[0].from).run();
}
