import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { BOOTSTRAP_SQL, compatibilityMigrationSql } from "./bootstrap";

export const DATA_DIR = path.resolve(process.env.MUSE_DATA_DIR ?? "./data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const ASSET_DIR = path.join(DATA_DIR, "assets");


function createDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, "muse.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(BOOTSTRAP_SQL);
  // 旧库兼容：只补列，不覆盖或猜测历史数据
  const articleCols = sqlite
    .prepare("PRAGMA table_info(articles)")
    .all() as { name: string }[];
  const variantCols = sqlite
    .prepare("PRAGMA table_info(platform_variants)")
    .all() as { name: string }[];
  const findingCols = sqlite
    .prepare("PRAGMA table_info(review_findings)")
    .all() as { name: string }[];
  const reviewCols = sqlite
    .prepare("PRAGMA table_info(reviews)")
    .all() as { name: string }[];
  const assetCols = sqlite
    .prepare("PRAGMA table_info(assets)")
    .all() as { name: string }[];
  for (const statement of compatibilityMigrationSql({
    articles: articleCols.map((c) => c.name),
    platformVariants: variantCols.map((c) => c.name),
    reviewFindings: findingCols.map((c) => c.name),
    reviews: reviewCols.map((c) => c.name),
    assets: assetCols.map((c) => c.name),
  })) {
    sqlite.exec(statement);
  }
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

// 复用连接，避免 Next.js 开发模式热重载时重复打开数据库
const globalForDb = globalThis as unknown as {
  __muse?: ReturnType<typeof createDb>;
};

const instance = (globalForDb.__muse ??= createDb());

export const sqlite = instance.sqlite;
export const db = instance.db;
export * from "./schema";
