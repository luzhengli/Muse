"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { createCollection, addMaterialsToCollection } from "@/actions/materials";
import { generateTopicsFromCollection } from "@/actions/topics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  q: string;
  tag: string;
  allTags: string[];
  collections: { id: number; name: string; count: number }[];
  materials: { id: number; title: string }[];
}

export function MaterialToolbar({ q, tag, allTags, collections, materials }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [showCollect, setShowCollect] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/materials?${next.toString()}`);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <form
          className="flex flex-1 gap-2"
          action={(fd) => setParam("q", String(fd.get("q") ?? ""))}
        >
          <Input
            name="q"
            defaultValue={q}
            placeholder="全文搜索语料块（FTS5，支持中文子串）"
            className="flex-1"
          />
          <Button type="submit" variant="outline">
            搜索
          </Button>
          {(q || tag) && (
            <Button type="button" variant="ghost" onClick={() => router.push("/materials")}>
              清除
            </Button>
          )}
        </form>
        <Button variant="secondary" onClick={() => setShowCollect((v) => !v)}>
          {showCollect ? "收起集合" : "素材集合"}
        </Button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-(--color-muted)">标签：</span>
          {allTags.map((t) => (
            <button key={t} onClick={() => setParam("tag", t === tag ? "" : t)}>
              <Badge tone={t === tag ? "primary" : "default"}>{t}</Badge>
            </button>
          ))}
        </div>
      )}

      {showCollect && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold">素材集合</div>
            <div className="flex flex-wrap gap-2">
              {collections.length === 0 && (
                <span className="text-xs text-(--color-muted)">
                  还没有集合。勾选下方素材创建第一个集合，作为选题的输入。
                </span>
              )}
              {collections.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-(--radius-control) border border-(--color-border) px-2.5 py-1.5"
                >
                  <span className="text-xs font-medium">{c.name}</span>
                  <Badge>{c.count} 条</Badge>
                  {selected.length > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await addMaterialsToCollection(c.id, selected);
                          setSelected([]);
                        })
                      }
                    >
                      +加入所选
                    </Button>
                  )}
                  <form action={generateTopicsFromCollection}>
                    <input type="hidden" name="collectionId" value={c.id} />
                    <Button size="sm" variant="secondary" disabled={c.count === 0}>
                      生成选题 →
                    </Button>
                  </form>
                </div>
              ))}
            </div>

            <div className="max-h-40 space-y-1 overflow-auto rounded-(--radius-control) border border-(--color-border) p-2">
              {materials.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, m.id]
                          : prev.filter((id) => id !== m.id),
                      )
                    }
                  />
                  <span className="line-clamp-1">{m.title}</span>
                </label>
              ))}
              {materials.length === 0 && (
                <span className="text-xs text-(--color-muted)">暂无素材</span>
              )}
            </div>

            <form
              action={(fd) => {
                selected.forEach((id) => fd.append("materialIds", String(id)));
                startTransition(async () => {
                  await createCollection(fd);
                  setSelected([]);
                });
              }}
              className="flex gap-2"
            >
              <Input name="name" required placeholder="新集合名称" className="w-48" />
              <Input name="description" placeholder="描述（可选）" className="flex-1" />
              <Button disabled={pending}>
                创建集合{selected.length > 0 ? `（含 ${selected.length} 条所选）` : ""}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
