"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { updateArticleTitle, deleteArticle } from "@/actions/articles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { articleStatusLabel } from "@/lib/labels";

interface Props {
  articleId: number;
  title: string;
  status: string;
  topicTitle?: string | null;
  /** 写作台由 readiness 展示状态（feat-023），隐藏 articles.status 徽章 */
  hideStatus?: boolean;
}

export function ArticleHeader({ articleId, title, status, topicTitle, hideStatus }: Props) {
  const [value, setValue] = useState(title);
  const [pending, startTransition] = useTransition();
  const st = articleStatusLabel[status] ?? articleStatusLabel.draft;

  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-(--color-muted)">
        <Link href="/articles" className="hover:text-(--color-primary)">
          ← 写作台
        </Link>
        {topicTitle && <span>· 选题：{topicTitle}</span>}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value.trim() && value !== title) {
              startTransition(() => updateArticleTitle(articleId, value));
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-xl font-bold focus:outline-none"
        />
        {!hideStatus && <Badge tone={st.tone}>{pending ? "保存中…" : st.text}</Badge>}
        {hideStatus && pending && <Badge tone="default">保存中…</Badge>}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm("删除这篇文章及其所有版本？")) {
              startTransition(() => deleteArticle(articleId));
            }
          }}
        >
          删除
        </Button>
      </div>
    </div>
  );
}
