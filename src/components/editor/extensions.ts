import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { InlineMath, BlockMath } from "./math";
import { Citation } from "./citation-mark";
import { CodeBlockView } from "./code-block-view";

const lowlight = createLowlight(common);

export interface EditorExtensionOptions {
  /** 点击带引用标记的文字时回调（工作台用于展示「这句话有什么依据」） */
  onCitationClick?: (key: string) => void;
}

/** 写作台编辑器的统一扩展集（feat-018 沉浸式 Markdown 编辑器） */
export function createEditorExtensions(options: EditorExtensionOptions = {}) {
  return [
    StarterKit.configure({
      codeBlock: false, // 换用 lowlight 高亮版本
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight, defaultLanguage: null }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: "noopener noreferrer" },
    }),
    Image,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    InlineMath,
    BlockMath,
    Citation.configure({ onCitationClick: options.onCitationClick }),
    CharacterCount,
    Placeholder.configure({
      placeholder: "开始写作，输入 / 插入标题、列表、代码块、公式、表格……",
    }),
  ];
}
