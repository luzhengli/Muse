import { NextResponse } from "next/server";
import { db, sqlite } from "@/db";
import {
  getCommandHomeCore,
  searchCommandCore,
  type CommandSearchDeps,
} from "@/lib/command-search";

export const dynamic = "force-dynamic";

/** 命令面板的只读跨域搜索：任何请求都不产生写库 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const deps = { db, sqlite } as unknown as CommandSearchDeps;
  try {
    if (!q) {
      const home = await getCommandHomeCore(deps);
      return NextResponse.json({ ok: true, groups: [], ...home });
    }
    const groups = await searchCommandCore(deps, q);
    return NextResponse.json({
      ok: true,
      groups,
      continueArticle: null,
      recent: [],
    });
  } catch (error) {
    console.error("[command-search] 查询失败", {
      errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, message: "搜索暂时不可用，请重试。" },
      { status: 500 },
    );
  }
}
