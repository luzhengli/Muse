"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createCollection, addMaterialsToCollection } from "@/actions/materials";
import { generateTopicsFromCollection } from "@/actions/topics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AiActionForm } from "@/components/ai-action";

interface Props {
  collections: { id: number; name: string; count: number }[];
  materials: { id: number; title: string }[];
}

export function MaterialToolbar({ collections, materials }: Props) {
  const [showCollect, setShowCollect] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setShowCollect((v) => !v)}>
          {showCollect ? "收起集合" : "素材集合"}
        </Button>
      </div>

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
                  <Link
                    href={`/materials/collections/${c.id}`}
                    className="text-xs font-medium text-(--color-primary) hover:underline"
                  >
                    {c.name}
                  </Link>
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
                  <AiActionForm
                    action={generateTopicsFromCollection}
                    label="生成选题 →"
                    pendingLabel="生成中…"
                    size="sm"
                    variant="secondary"
                    disabled={c.count === 0}
                  >
                    <input type="hidden" name="collectionId" value={c.id} />
                  </AiActionForm>
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
