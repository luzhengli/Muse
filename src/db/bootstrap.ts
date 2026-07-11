/** 幂等建表 SQL：运行时与测试共用（测试用 bun:sqlite 内存库执行） */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  file_path TEXT,
  raw_content TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  clean_status TEXT NOT NULL DEFAULT 'raw',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS material_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS collection_materials (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, material_id)
);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT '',
  core_points TEXT NOT NULL DEFAULT '[]',
  angle TEXT NOT NULL DEFAULT '',
  recommended_platforms TEXT NOT NULL DEFAULT '[]',
  material_ids TEXT NOT NULL DEFAULT '[]',
  brief TEXT,
  status TEXT NOT NULL DEFAULT 'idea',
  origin TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  cover_asset_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS article_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  content_html TEXT NOT NULL,
  content_text TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS article_drafts (
  article_id INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  content_html TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  base_version_id INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS article_citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES article_versions(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS review_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  quote TEXT NOT NULL DEFAULT '',
  suggestion TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS packagings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES article_versions(id) ON DELETE SET NULL,
  title_candidates TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '',
  cover_prompt TEXT NOT NULL DEFAULT '',
  image_prompts TEXT NOT NULL DEFAULT '[]',
  card_structure TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS platform_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  source_version_id INTEGER REFERENCES article_versions(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  hashtags TEXT NOT NULL DEFAULT '[]',
  cta TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  publish_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS publish_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id INTEGER NOT NULL REFERENCES platform_variants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  published_at INTEGER,
  external_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS publish_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES publish_tasks(id) ON DELETE SET NULL,
  variant_id INTEGER REFERENCES platform_variants(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  external_url TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  comment_feedback TEXT NOT NULL DEFAULT '',
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS retro_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER REFERENCES publish_results(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  insights TEXT NOT NULL,
  next_topic_hint TEXT NOT NULL DEFAULT '',
  converted_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE VIRTUAL TABLE IF NOT EXISTS chunk_fts USING fts5(
  content,
  chunk_id UNINDEXED,
  material_id UNINDEXED,
  tokenize = 'unicode61'
);

CREATE INDEX IF NOT EXISTS idx_chunks_material ON material_chunks(material_id);
CREATE INDEX IF NOT EXISTS idx_versions_article ON article_versions(article_id);
CREATE INDEX IF NOT EXISTS idx_variants_article ON platform_variants(article_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON publish_tasks(status, scheduled_at);
`;

/** 根据现有列返回幂等兼容迁移；旧数据不伪造无法确认的来源版本。 */
export function compatibilityMigrationSql(columns: {
  articles: string[];
  platformVariants: string[];
}) {
  const statements: string[] = [];
  if (!columns.articles.includes("summary")) {
    statements.push("ALTER TABLE articles ADD COLUMN summary TEXT NOT NULL DEFAULT ''");
  }
  if (!columns.articles.includes("cover_asset_id")) {
    statements.push("ALTER TABLE articles ADD COLUMN cover_asset_id INTEGER");
  }
  if (!columns.platformVariants.includes("source_version_id")) {
    statements.push(
      "ALTER TABLE platform_variants ADD COLUMN source_version_id INTEGER REFERENCES article_versions(id) ON DELETE SET NULL",
    );
  }
  statements.push(
    "CREATE INDEX IF NOT EXISTS idx_variants_source_version ON platform_variants(source_version_id)",
  );
  return statements;
}
