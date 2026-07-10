import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import {
  db,
  materials,
  topics,
  articles,
  publishTasks,
  retroNotes,
} from "@/db";
import { createNoteMaterial } from "@/actions/materials";
import { aiConfigured } from "@/lib/ai/provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fmtTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const flow = [
  { href: "/materials", label: "素材库", desc: "采集与知识整理" },
  { href: "/topics", label: "选题板", desc: "选题卡片与 brief" },
  { href: "/articles", label: "写作台", desc: "初稿与版本" },
  { href: "/articles", label: "审阅台", desc: "AI + 人工审阅" },
  { href: "/articles", label: "包装台", desc: "标题/摘要/配图" },
  { href: "/publish", label: "发布中心", desc: "多平台分发" },
  { href: "/retro", label: "复盘中心", desc: "数据与经验" },
];

export default async function Home() {
  const [mc] = await db.select({ n: count() }).from(materials);
  const [tc] = await db.select({ n: count() }).from(topics);
  const [ac] = await db.select({ n: count() }).from(articles);
  const [pc] = await db
    .select({ n: count() })
    .from(publishTasks)
    .where(eq(publishTasks.status, "published"));
  const recentNotes = await db
    .select()
    .from(retroNotes)
    .orderBy(desc(retroNotes.createdAt))
    .limit(3);

  const stats = [
    { label: "素材", value: mc.n, href: "/materials" },
    { label: "选题", value: tc.n, href: "/topics" },
    { label: "文章", value: ac.n, href: "/articles" },
    { label: "已发布", value: pc.n, href: "/publish" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">工作台</h1>
          <p className="mt-1 text-sm text-(--color-muted)">
            从素材到复盘的创作闭环，每一步都可以回到上一步迭代。
          </p>
        </div>
        <Badge tone={aiConfigured() ? "success" : "warning"}>
          {aiConfigured() ? "AI 已连接" : "AI 未配置 · mock 模式"}
        </Badge>
      </div>

      {/* 创作闭环 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {flow.map((step, i) => (
          <div key={step.label} className="flex items-center gap-1.5">
            <Link
              href={step.href}
              className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-3 py-2 transition-colors hover:border-(--color-primary)"
            >
              <div className="text-xs font-semibold">{step.label}</div>
              <div className="text-[10px] text-(--color-muted)">{step.desc}</div>
            </Link>
            {i < flow.length - 1 && (
              <span className="text-(--color-muted)">→</span>
            )}
          </div>
        ))}
        <span className="text-(--color-muted)">↺</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:border-(--color-primary)">
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-(--color-muted)">{s.label}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* 快速灵感捕捉 */}
        <Card>
          <CardHeader>
            <CardTitle>⚡ 快速灵感捕捉</CardTitle>
            <CardDescription>
              随手记录想法，自动进入素材库（笔记类型），随时可清洗、入选题。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createNoteMaterial} className="space-y-2">
              <Input name="title" placeholder="标题（可留空，自动取首句）" />
              <Textarea
                name="content"
                required
                placeholder="灵感、金句、观察、选题萌芽……"
                className="min-h-24"
              />
              <div className="flex gap-2">
                <Input name="tags" placeholder="标签，逗号分隔" className="flex-1" />
                <Button type="submit">存入素材库</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 最近复盘 */}
        <Card>
          <CardHeader>
            <CardTitle>📊 最近复盘结论</CardTitle>
            <CardDescription>复盘经验会反哺下一轮选题。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentNotes.length === 0 && (
              <p className="text-sm text-(--color-muted)">
                还没有复盘记录。完成一次发布后，到复盘中心沉淀经验。
              </p>
            )}
            {recentNotes.map((n) => (
              <Link
                key={n.id}
                href="/retro"
                className="block rounded-(--radius-control) border border-(--color-border) p-2.5 hover:border-(--color-primary)"
              >
                <div className="text-sm font-medium">{n.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-(--color-muted)">
                  {n.insights}
                </div>
                <div className="mt-1 text-[10px] text-(--color-muted)">
                  {fmtTime(n.createdAt)}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
