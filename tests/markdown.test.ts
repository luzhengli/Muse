import { describe, expect, test } from "bun:test";
import { docToMarkdown, markdownToDoc, type DocNode } from "@/lib/markdown";

/** MD → doc → MD 往返应稳定（第二轮起完全收敛） */
function roundTrip(md: string): string {
  return docToMarkdown(markdownToDoc(md));
}

function expectStable(md: string) {
  const once = roundTrip(md);
  expect(roundTrip(once)).toBe(once);
  return once;
}

describe("headings", () => {
  test("h1-h6 round-trip", () => {
    const md = "# 一级\n\n## 二级\n\n### 三级\n\n#### 四级\n\n##### 五级\n\n###### 六级\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("heading content is inline (no nested paragraph)", () => {
    const seen: string[] = [];
    const doc = markdownToDoc("## 带 **格式** 的标题\n");
    expect(doc.content![0].type).toBe("heading");
    expect(doc.content![0].content![0].type).toBe("text");
    const md = docToMarkdown(doc, { onUnknown: (_k, t) => seen.push(t) });
    expect(seen).toEqual([]);
    expect(md).toBe("## 带 **格式** 的标题\n");
  });
});

describe("inline marks", () => {
  test("bold / italic / strike / code", () => {
    const md = "普通 **加粗** *斜体* ~~删除~~ `code` 文本\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("nested bold+italic", () => {
    const doc = markdownToDoc("***双重***\n");
    const text = doc.content![0].content![0];
    const types = (text.marks ?? []).map((m) => m.type).sort();
    expect(types).toEqual(["bold", "italic"]);
    expectStable("***双重***\n");
  });

  test("link with formatted text", () => {
    const md = "看 [**官方文档**](https://example.com) 了解\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("inline code containing backticks", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "a ` b", marks: [{ type: "code" }] }],
        },
      ],
    };
    const md = docToMarkdown(doc);
    expect(md).toBe("``a ` b``\n");
    const back = markdownToDoc(md);
    expect(back.content![0].content![0].text).toBe("a ` b");
  });

  test("special characters escaped and restored", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "价格 $5 * 2 = [10]，_强调_ #标签" }],
        },
      ],
    };
    const md = docToMarkdown(doc);
    const back = markdownToDoc(md);
    expect(back.content![0].content![0].text).toBe("价格 $5 * 2 = [10]，_强调_ #标签");
  });
});

describe("code blocks", () => {
  test("fenced code with language", () => {
    const md = "```typescript\nconst a: number = 1;\nconsole.log(a);\n```\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("code without language", () => {
    const md = "```\nplain text\n```\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("language attr preserved in doc", () => {
    const doc = markdownToDoc("```python\nprint('hi')\n```\n");
    expect(doc.content![0].attrs?.language).toBe("python");
  });

  test("code containing triple backticks", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "md" },
          content: [{ type: "text", text: "```\ninner\n```" }],
        },
      ],
    };
    const md = docToMarkdown(doc);
    const back = markdownToDoc(md);
    expect(back.content![0].content![0].text).toBe("```\ninner\n```");
    expect(back.content![0].attrs?.language).toBe("md");
  });

  test("markdown syntax inside code not parsed", () => {
    const md = "```\n**not bold** [not link](x)\n```\n";
    expect(roundTrip(md)).toBe(md);
  });
});

describe("lists", () => {
  test("bullet list", () => {
    const md = "- 第一项\n- 第二项\n- 第三项\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("ordered list with start", () => {
    const md = "3. 三\n4. 四\n";
    const out = roundTrip(md);
    expect(out).toBe(md);
    const doc = markdownToDoc(md);
    expect(doc.content![0].attrs?.start).toBe(3);
  });

  test("task list", () => {
    const md = "- [ ] 待办\n- [x] 已完成\n";
    expect(roundTrip(md)).toBe(md);
    const doc = markdownToDoc(md);
    expect(doc.content![0].type).toBe("taskList");
    expect(doc.content![0].content![0].attrs?.checked).toBe(false);
    expect(doc.content![0].content![1].attrs?.checked).toBe(true);
  });

  test("nested list", () => {
    const md = "- 外层\n  - 内层一\n  - 内层二\n- 外层二\n";
    expectStable(md);
    const doc = markdownToDoc(md);
    const firstItem = doc.content![0].content![0];
    expect(firstItem.content!.some((n) => n.type === "bulletList")).toBe(true);
  });

  test("mixed bullet list not converted to task list", () => {
    const md = "- [ ] 待办\n- 普通项\n";
    const doc = markdownToDoc(md);
    expect(doc.content![0].type).toBe("bulletList");
  });
});

describe("blockquote / hr", () => {
  test("blockquote", () => {
    const md = "> 引用第一段\n>\n> 引用第二段\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("nested blockquote", () => {
    expectStable("> 外层\n>\n> > 内层\n");
  });

  test("horizontal rule", () => {
    const md = "上文\n\n---\n\n下文\n";
    expect(roundTrip(md)).toBe(md);
  });
});

describe("images", () => {
  test("standalone image becomes block image", () => {
    const md = "![封面](/api/assets/a.png)\n";
    expect(roundTrip(md)).toBe(md);
    const doc = markdownToDoc(md);
    expect(doc.content![0].type).toBe("image");
  });

  test("image inside paragraph hoisted after text", () => {
    const doc = markdownToDoc("前文 ![图](/x.png) 后文\n");
    const types = doc.content!.map((n) => n.type);
    expect(types).toEqual(["paragraph", "image"]);
    expect(doc.content![1].attrs?.src).toBe("/x.png");
  });

  test("image with title", () => {
    const md = '![alt](/a.png "标题")\n';
    expect(roundTrip(md)).toBe(md);
  });
});

describe("tables", () => {
  test("basic table round-trip", () => {
    const md = "| 平台 | 定位 |\n| --- | --- |\n| 小红书 | 图文 |\n| X | 短文 |\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("table cell structure", () => {
    const doc = markdownToDoc("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
    const table = doc.content![0];
    expect(table.type).toBe("table");
    expect(table.content![0].content![0].type).toBe("tableHeader");
    expect(table.content![1].content![0].type).toBe("tableCell");
  });

  test("cell with pipe escaped", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "a|b" }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const md = docToMarkdown(doc);
    const back = markdownToDoc(md);
    const cellText = back.content![0].content![0].content![0].content![0].content![0];
    expect(cellText.text).toBe("a|b");
  });

  test("cell with inline formatting", () => {
    expectStable("| **加粗** | `code` |\n| --- | --- |\n| *斜体* | 普通 |\n");
  });
});

describe("math", () => {
  test("inline math round-trip", () => {
    const md = "能量公式 $E = mc^2$ 很有名\n";
    expect(roundTrip(md)).toBe(md);
    const doc = markdownToDoc(md);
    const inline = doc.content![0].content!.find((n) => n.type === "inlineMath");
    expect(inline?.attrs?.latex).toBe("E = mc^2");
  });

  test("block math round-trip", () => {
    const md = "$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n";
    expect(roundTrip(md)).toBe(md);
    const doc = markdownToDoc(md);
    expect(doc.content![0].type).toBe("blockMath");
    expect(doc.content![0].attrs?.latex).toBe("\\int_0^1 x^2 \\, dx = \\frac{1}{3}");
  });

  test("multi-line block math", () => {
    const md = "$$\na = 1 \\\\\nb = 2\n$$\n";
    expectStable(md);
  });

  test("single-line $$...$$", () => {
    const doc = markdownToDoc("$$x+y$$\n");
    expect(doc.content![0].type).toBe("blockMath");
    expect(doc.content![0].attrs?.latex).toBe("x+y");
  });

  test("dollar amounts not parsed as math", () => {
    const doc = markdownToDoc("价格 $5 和 $10 都不是公式\n");
    // "$5 和 $" 中定界符边界含空白，不应成为公式
    const types = doc.content![0].content!.map((n) => n.type);
    expect(types).toEqual(["text"]);
  });

  test("inline math not crossing lines", () => {
    const doc = markdownToDoc("a $x\nb$ c\n");
    expect(doc.content![0].content!.every((n) => n.type === "text")).toBe(true);
  });
});

describe("unknown nodes", () => {
  test("unknown block node degrades to text, reports type", () => {
    const seen: string[] = [];
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "customCallout",
          content: [{ type: "text", text: "重要提醒内容" }],
        },
      ],
    };
    const md = docToMarkdown(doc, { onUnknown: (_k, type) => seen.push(type) });
    expect(md).toContain("重要提醒内容");
    expect(seen).toContain("customCallout");
  });

  test("unknown mark keeps text", () => {
    const seen: string[] = [];
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "高亮文字", marks: [{ type: "highlight" }] },
          ],
        },
      ],
    };
    const md = docToMarkdown(doc, { onUnknown: (_k, type) => seen.push(type) });
    expect(md).toContain("高亮文字");
    expect(seen).toContain("highlight");
  });
});

describe("document level", () => {
  test("empty doc", () => {
    expect(docToMarkdown({ type: "doc", content: [] })).toBe("\n");
    expect(markdownToDoc("").content).toEqual([{ type: "paragraph" }]);
  });

  test("hard break", () => {
    const md = "第一行  \n第二行\n";
    expect(roundTrip(md)).toBe(md);
  });

  test("full article round-trip stability", () => {
    const md = [
      "# 标题",
      "",
      "开头段落，包含 **加粗**、*斜体*、`code` 和 [链接](https://example.com)。",
      "",
      "## 代码",
      "",
      "```ts\nconst x = 1;\n```",
      "",
      "## 列表",
      "",
      "- 甲\n- 乙",
      "",
      "1. 一\n2. 二",
      "",
      "- [ ] 未完成\n- [x] 已完成",
      "",
      "> 引用一句话",
      "",
      "| 列A | 列B |\n| --- | --- |\n| 1 | 2 |",
      "",
      "行内公式 $a^2+b^2=c^2$ 与块级：",
      "",
      "$$\n\\sum_{i=1}^n i\n$$",
      "",
      "![配图](/api/assets/pic.png)",
      "",
      "---",
      "",
      "结尾。",
      "",
    ].join("\n");
    const once = roundTrip(md);
    expect(roundTrip(once)).toBe(once);
    // 关键结构不丢失
    for (const probe of [
      "# 标题",
      "```ts",
      "- [x] 已完成",
      "| 列A | 列B |",
      "$a^2+b^2=c^2$",
      "$$",
      "![配图](/api/assets/pic.png)",
      "---",
    ]) {
      expect(once).toContain(probe);
    }
  });
});
