import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ASSET_DIR } from "@/db";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

/** 提供 data/assets 下的本地图片，供编辑器与包装预览引用 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const fileName = decodeURIComponent(name);
  const abs = path.join(ASSET_DIR, fileName);
  // 防目录穿越
  const relative = path.relative(ASSET_DIR, abs);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return new NextResponse("not found", { status: 404 });
  }
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) return new NextResponse("not found", { status: 404 });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
  const ext = path.extname(abs).toLowerCase();
  return new NextResponse(new Uint8Array(await fs.readFile(abs)), {
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
