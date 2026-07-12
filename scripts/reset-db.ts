/**
 * 破坏式数据库重置（PRD v1.0 FR-0.1）。
 *
 * 删除本地 SQLite 数据库文件并按当前 BOOTSTRAP_SQL 重建空库；
 * 不迁移、不备份（产品未交付用户，历史数据均为测试数据）。
 * 资产/上传文件目录保留（数据库行已删除，孤儿文件可手动清理）。
 *
 * 用法：bun run db:reset -- --yes    （之后可 bun run db:seed）
 * 使用 bun:sqlite 而非 better-sqlite3：脚本运行于 bun，避开 Node ABI 冲突。
 */
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { BOOTSTRAP_SQL } from "../src/db/bootstrap";

export function resetDatabase(dataDir: string) {
  const dbPath = path.join(dataDir, "muse.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, "assets"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "uploads"), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(BOOTSTRAP_SQL);
  const tables = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  sqlite.close();
  return { dbPath, tables: tables.map((t) => t.name) };
}

if (import.meta.main) {
  const dataDir = path.resolve(process.env.MUSE_DATA_DIR ?? "./data");
  if (!process.argv.includes("--yes")) {
    console.error("⚠️  这是破坏式操作：将删除并重建数据库（不迁移、不备份）。");
    console.error(`    目标：${path.join(dataDir, "muse.db")}`);
    console.error("    确认执行请加 --yes：bun run db:reset -- --yes");
    process.exit(1);
  }
  const { dbPath, tables } = resetDatabase(dataDir);
  console.log(`✅ 已重建空数据库：${dbPath}（${tables.length} 张表）`);
  console.log("   下一步：bun run db:seed 写入演示数据（可选）");
}
