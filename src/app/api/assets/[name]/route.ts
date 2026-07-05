import fs from "node:fs";
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
  if (!abs.startsWith(ASSET_DIR) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return new NextResponse("not found", { status: 404 });
  }
  const ext = path.extname(abs).toLowerCase();
  return new NextResponse(new Uint8Array(fs.readFileSync(abs)), {
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
