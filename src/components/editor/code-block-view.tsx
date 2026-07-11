"use client";

import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";

/** 代码块常用语言（lowlight common 子集 + 常见别名） */
export const CODE_LANGUAGES = [
  { value: "", label: "纯文本" },
  { value: "bash", label: "Bash" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "css", label: "CSS" },
  { value: "diff", label: "Diff" },
  { value: "go", label: "Go" },
  { value: "graphql", label: "GraphQL" },
  { value: "html", label: "HTML" },
  { value: "java", label: "Java" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "kotlin", label: "Kotlin" },
  { value: "lua", label: "Lua" },
  { value: "makefile", label: "Makefile" },
  { value: "markdown", label: "Markdown" },
  { value: "php", label: "PHP" },
  { value: "python", label: "Python" },
  { value: "r", label: "R" },
  { value: "ruby", label: "Ruby" },
  { value: "rust", label: "Rust" },
  { value: "shell", label: "Shell" },
  { value: "sql", label: "SQL" },
  { value: "swift", label: "Swift" },
  { value: "typescript", label: "TypeScript" },
  { value: "yaml", label: "YAML" },
];

export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const language = String(node.attrs.language ?? "");
  return (
    <NodeViewWrapper className="code-block-wrapper">
      <select
        contentEditable={false}
        aria-label="代码语言"
        value={CODE_LANGUAGES.some((l) => l.value === language) ? language : ""}
        disabled={!editor.isEditable}
        onChange={(e) => updateAttributes({ language: e.target.value || null })}
        className="code-block-lang"
      >
        {CODE_LANGUAGES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
