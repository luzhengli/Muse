import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";

export interface TrackedRange {
  from: number;
  to: number;
  valid: boolean;
}

/**
 * 跟踪一段文档范围：AI 请求期间用户继续编辑时，
 * 通过 ProseMirror mapping 把原始选区随每个事务重映射；
 * 范围被删除或塌缩则标记失效，调用方必须放弃写回。
 */
export function trackRange(editor: Editor, from: number, to: number) {
  const range: TrackedRange = { from, to, valid: true };
  const onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (!transaction.docChanged || !range.valid) return;
    const mappedFrom = transaction.mapping.mapResult(range.from, 1);
    const mappedTo = transaction.mapping.mapResult(range.to, -1);
    if (
      (mappedFrom.deleted && mappedTo.deleted) ||
      mappedFrom.pos >= mappedTo.pos
    ) {
      range.valid = false;
      return;
    }
    range.from = mappedFrom.pos;
    range.to = mappedTo.pos;
  };
  editor.on("transaction", onTransaction);
  return {
    range,
    dispose: () => {
      editor.off("transaction", onTransaction);
    },
  };
}
