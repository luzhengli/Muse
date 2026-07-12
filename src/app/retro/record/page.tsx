import Link from "next/link";
import { db } from "@/db";
import { getRetroContextCore } from "@/lib/retro";
import { RetroWizard } from "./wizard";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** 复盘向导：自动带入文章 / 平台 / 平台稿 / 链接，用户只回答创作问题 */
export default async function RetroRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ taskId?: string }>;
}) {
  const { taskId } = await searchParams;
  const context = taskId ? await getRetroContextCore(db, Number(taskId)) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">记录这次表现</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          回答几个问题，系统会整理成一条可复用的经验。单次表现只作观察，不下因果结论。
        </p>
      </div>
      {context ? (
        <RetroWizard context={context} />
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-(--color-muted)">
            没有找到对应的发布记录。请从
            <Link href="/publish" className="mx-1 text-(--color-primary) underline">
              发布记录
            </Link>
            页选择一条已发布的内容进入。
          </CardContent>
        </Card>
      )}
    </div>
  );
}
