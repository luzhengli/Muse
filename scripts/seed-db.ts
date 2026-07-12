/**
 * v1.0 新模型种子数据脚本（PRD v1.0 FR-0.1）。
 *
 * 幂等：库中已有创作项目时跳过。核心逻辑在 src/lib/seed.ts（可测）。
 * 用法：bun run db:seed
 */
import { Database } from "bun:sqlite";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { BOOTSTRAP_SQL } from "../src/db/bootstrap";
import * as schema from "../src/db/schema";
import type { MuseDb } from "../src/lib/drafts";
import { seedCore } from "../src/lib/seed";

if (import.meta.main) {
  const dataDir = path.resolve(process.env.MUSE_DATA_DIR ?? "./data");
  const dbPath = path.join(dataDir, "muse.db");
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(BOOTSTRAP_SQL);
  const db = drizzle(sqlite, { schema }) as unknown as MuseDb;

  const result = await seedCore(db, { assetDir: path.join(dataDir, "assets") });
  sqlite.close();
  if (!result.seeded) {
    console.log(`⏭️  ${result.reason}`);
    process.exit(0);
  }
  const s = result.summary!;
  console.log(
    `✅ 种子数据完成：${s.creations} 个创作项目、${s.outputs} 份平台作品、` +
      `${s.publications} 条发布记录、${s.snapshots} 次表现快照、` +
      `${s.materials} 条素材、${s.assets} 张演示图片（${dbPath}）`,
  );
}
