import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import katex from "katex";

/**
 * 行内 / 块级公式节点：latex 存在 attrs 中的原子节点，
 * 用 KaTeX 渲染只读视图；编辑通过 Bubble Menu 的公式输入框完成。
 * Markdown 边界表达为 $...$ / $$...$$（见 src/lib/markdown）。
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      insertInlineMath: (latex?: string) => ReturnType;
      insertBlockMath: (latex?: string) => ReturnType;
      updateMathLatex: (latex: string) => ReturnType;
    };
  }
}

function renderKatex(dom: HTMLElement, latex: string, displayMode: boolean) {
  if (!latex.trim()) {
    dom.textContent = displayMode ? "空公式（选中后编辑）" : "空公式";
    dom.classList.add("math-empty");
    return;
  }
  dom.classList.remove("math-empty");
  try {
    katex.render(latex, dom, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    dom.textContent = latex;
  }
}

function mathNodeView(displayMode: boolean) {
  return ({
    node,
    editor,
    getPos,
  }: {
    node: { attrs: Record<string, unknown> };
    editor: { commands: { command: (fn: never) => boolean } };
    getPos: (() => number | undefined) | boolean;
  }) => {
    const dom = document.createElement(displayMode ? "div" : "span");
    dom.className = displayMode ? "block-math" : "inline-math";
    dom.dataset.latex = String(node.attrs.latex ?? "");
    renderKatex(dom, String(node.attrs.latex ?? ""), displayMode);
    // 行内 atom 点击默认只会把光标放到旁边；显式选中节点以打开 Bubble 编辑框
    dom.addEventListener("mousedown", (event) => {
      if (typeof getPos !== "function") return;
      const pos = getPos();
      if (pos === undefined) return;
      event.preventDefault();
      const command = ((props: {
        tr: { doc: never; setSelection: (sel: unknown) => void };
        dispatch?: unknown;
      }) => {
        if (props.dispatch) {
          props.tr.setSelection(NodeSelection.create(props.tr.doc, pos));
        }
        return true;
      }) as never;
      editor.commands.command(command);
    });
    return {
      dom,
      update(updated: { type: { name: string }; attrs: Record<string, unknown> }) {
        if (updated.type.name !== (displayMode ? "blockMath" : "inlineMath")) {
          return false;
        }
        dom.dataset.latex = String(updated.attrs.latex ?? "");
        renderKatex(dom, String(updated.attrs.latex ?? ""), displayMode);
        return true;
      },
    };
  };
}

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-latex") ?? el.textContent ?? "",
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "inline-math",
        "data-latex": String(node.attrs.latex ?? ""),
      }),
      String(node.attrs.latex ?? ""),
    ];
  },

  addNodeView() {
    return mathNodeView(false);
  },

  addCommands() {
    return {
      insertInlineMath:
        (latex = "") =>
        ({ chain, state }) => {
          const pos = state.selection.from;
          return chain()
            .insertContentAt(pos, { type: this.name, attrs: { latex } })
            .command(({ tr, dispatch }) => {
              // 选中刚插入的公式节点，让 Bubble 编辑框立即可用
              if (dispatch) tr.setSelection(NodeSelection.create(tr.doc, pos));
              return true;
            })
            .run();
        },
      updateMathLatex:
        (latex: string) =>
        ({ state, commands }) => {
          const { selection } = state;
          if (!("node" in selection)) return false;
          const node = (selection as unknown as { node: { type: { name: string } } }).node;
          if (node.type.name !== "inlineMath" && node.type.name !== "blockMath") {
            return false;
          }
          return commands.updateAttributes(node.type.name, { latex });
        },
    };
  },
});

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-latex") ?? el.textContent ?? "",
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="block-math"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "block-math",
        "data-latex": String(node.attrs.latex ?? ""),
      }),
      String(node.attrs.latex ?? ""),
    ];
  },

  addNodeView() {
    return mathNodeView(true);
  },

  addCommands() {
    return {
      insertBlockMath:
        (latex = "") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },
});

/** 客户端渲染只读 HTML（图文预览）里的公式占位元素 */
export function renderMathInElement(root: HTMLElement) {
  root
    .querySelectorAll<HTMLElement>(
      'span[data-type="inline-math"], div[data-type="block-math"]',
    )
    .forEach((el) => {
      const latex = el.getAttribute("data-latex") ?? el.textContent ?? "";
      renderKatex(el, latex, el.tagName === "DIV");
    });
}
