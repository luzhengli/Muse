import { desc } from "drizzle-orm";
import { db, retroNotes } from "@/db";
import { CreateWizard } from "./wizard";
import { getAppSettings } from "@/lib/settings-store";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}) {
  const { entry } = await searchParams;
  const settings = getAppSettings();
  const notes = await db
    .select({
      id: retroNotes.id,
      title: retroNotes.title,
      insights: retroNotes.insights,
      convertedTopicId: retroNotes.convertedTopicId,
      createdAt: retroNotes.createdAt,
    })
    .from(retroNotes)
    .orderBy(desc(retroNotes.createdAt))
    .limit(5);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">开始一次新创作</h1>
        <p className="mt-1 text-sm text-(--color-muted)">
          选一个起点就行，后面的整理、保存和检查交给系统。
        </p>
      </div>
      <CreateWizard
        primaryPlatform={settings.onboarding.primaryPlatform}
        startFrom={entry === "retro" ? "retro" : settings.onboarding.startFrom}
        retroNotes={notes}
      />
    </div>
  );
}
