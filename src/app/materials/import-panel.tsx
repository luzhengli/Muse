"use client";

import { useState, useTransition } from "react";
import {
  createUrlMaterial,
  createTextMaterial,
  createFileMaterial,
  createNoteMaterial,
} from "@/actions/materials";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "url", label: "🔗 URL" },
  { id: "text", label: "📄 文本" },
  { id: "file", label: "📁 文件" },
  { id: "note", label: "✏️ 笔记" },
] as const;

export function ImportPanel() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("url");
  const [pending, startTransition] = useTransition();

  function submit(action: (fd: FormData) => Promise<void>) {
    return (fd: FormData) => {
      startTransition(async () => {
        await action(fd);
      });
    };
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-(--radius-control) px-3 py-1.5 text-xs font-medium",
                tab === t.id
                  ? "bg-(--color-primary-soft) text-(--color-primary)"
                  : "text-(--color-muted) hover:bg-(--color-muted-bg)",
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="ml-auto self-center text-xs text-(--color-muted)">
            {pending ? "导入中…" : "导入后可一键清洗为可检索语料"}
          </span>
        </div>

        {tab === "url" && (
          <form action={submit(createUrlMaterial)} className="flex gap-2">
            <Input name="url" required placeholder="https:// 文章链接，自动抓取正文" className="flex-1" />
            <Input name="tags" placeholder="标签" className="w-40" />
            <Button disabled={pending}>抓取导入</Button>
          </form>
        )}
        {tab === "text" && (
          <form action={submit(createTextMaterial)} className="space-y-2">
            <Input name="title" required placeholder="素材标题" />
            <Textarea name="content" required placeholder="粘贴原文内容" />
            <div className="flex gap-2">
              <Input name="tags" placeholder="标签，逗号分隔" className="flex-1" />
              <Button disabled={pending}>导入文本</Button>
            </div>
          </form>
        )}
        {tab === "file" && (
          <form action={submit(createFileMaterial)} className="space-y-2">
            <div className="flex gap-2">
              <Input type="file" name="file" required className="flex-1 pt-1.5" />
              <Input name="title" placeholder="标题（默认文件名）" className="w-56" />
            </div>
            <div className="flex gap-2">
              <Input name="tags" placeholder="标签" className="flex-1" />
              <Button disabled={pending}>上传导入</Button>
            </div>
            <Label>txt / md / csv / json / html 会读入原文；其他格式仅保存文件。</Label>
          </form>
        )}
        {tab === "note" && (
          <form action={submit(createNoteMaterial)} className="space-y-2">
            <Input name="title" placeholder="标题（可留空）" />
            <Textarea name="content" required placeholder="手动笔记 / 灵感" />
            <div className="flex gap-2">
              <Input name="tags" placeholder="标签" className="flex-1" />
              <Button disabled={pending}>保存笔记</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
