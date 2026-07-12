import type { MuseDb } from "@/lib/drafts";
import { getJourneyDestination } from "@/lib/journey-navigation";
import {
  computeReadiness,
  deriveJourneyStep,
  getReadinessFactsCore,
} from "@/lib/readiness";
import { segmentCjk } from "@/lib/utils";

/**
 * 全局命令面板的跨域只读搜索（feat-028）。
 * 覆盖文章（标题/摘要）、素材（复用 chunk_fts FTS5 + 标题兜底）、
 * 选题（标题/Brief）、复盘经验（Learning 文本），全部为 SELECT：
 * 打开面板或输入关键词绝不产生写库。
 * db（drizzle）与 sqlite（最小 prepare/all 句柄）显式传入：
 * 运行时用 better-sqlite3 实例，测试用 bun:sqlite 内存库。
 */

export interface CommandSqlite {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

export interface CommandSearchDeps {
  db: MuseDb;
  sqlite: CommandSqlite;
}

export type CommandGroupType = "article" | "material" | "topic" | "retro";

export interface CommandHit {
  type: CommandGroupType;
  id: number;
  title: string;
  /** 命中上下文：摘要、语料片段或经验摘录 */
  subtitle: string;
  /** 自然语言状态（文章 = readiness 状态与下一步） */
  status: string;
  /** 回车直达的目的地（含写作台 ?panel= 面板目标） */
  href: string;
}

export interface CommandGroup {
  type: CommandGroupType;
  label: string;
  items: CommandHit[];
}

/** 空查询数据：常用动作的「继续上次创作」目标 + 最近更新的创作 */
export interface CommandHome {
  continueArticle: CommandHit | null;
  recent: CommandHit[];
}

export const COMMAND_GROUP_LABELS: Record<CommandGroupType, string> = {
  article: "文章",
  material: "素材",
  topic: "选题",
  retro: "复盘经验",
};

/** LIKE 通配符转义（\ % _），与查询中的 ESCAPE '\' 配套使用 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

const topicStatusText: Record<string, string> = {
  idea: "还是一个想法",
  briefed: "已有创作说明",
  drafting: "创作中",
  done: "已完成",
};

function excerpt(text: string, max = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

interface ArticleRow {
  id: number;
  title: string;
  summary: string;
}

/** 文章命中：附 readiness 自然语言状态与旅程直达目的地 */
async function articleHit(deps: CommandSearchDeps, row: ArticleRow): Promise<CommandHit | null> {
  const facts = await getReadinessFactsCore(deps.db, row.id);
  if (!facts) return null;
  const readiness = computeReadiness(facts);
  const step = deriveJourneyStep(facts, readiness);
  const dest = getJourneyDestination(row.id, step);
  // 已发布/复盘步骤的旅程目的地是全局页面；从搜索点开一篇文章应回到文章本身
  const href =
    step === "published" || step === "retro" ? `/articles/${row.id}` : dest.href;
  return {
    type: "article",
    id: row.id,
    title: row.title,
    subtitle: excerpt(row.summary),
    status: `${readiness.state} · 下一步：${readiness.nextAction.label}`,
    href,
  };
}

async function searchArticles(
  deps: CommandSearchDeps,
  pattern: string,
  limit: number,
): Promise<CommandHit[]> {
  const rows = deps.sqlite
    .prepare(
      `SELECT id, title, summary FROM articles
       WHERE title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\'
       ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(pattern, pattern, limit) as ArticleRow[];
  const items: CommandHit[] = [];
  for (const row of rows) {
    const hit = await articleHit(deps, row);
    if (hit) items.push(hit);
  }
  return items;
}

interface MaterialRow {
  id: number;
  title: string;
  summary: string;
  cleanStatus: string;
}

function materialHit(row: MaterialRow, subtitle: string): CommandHit {
  return {
    type: "material",
    id: row.id,
    title: row.title,
    subtitle,
    status: row.cleanStatus === "cleaned" ? "已整理" : "待整理",
    href: `/materials/${row.id}`,
  };
}

/** FTS5 短语匹配语料块（与 db/fts.ts 同一转义与去分词规则），按素材去重 */
function searchMaterialChunks(
  sqlite: CommandSqlite,
  query: string,
  limit: number,
): { materialId: number; snippet: string }[] {
  const phrase = `"${segmentCjk(query).replace(/"/g, '""')}"`;
  try {
    const rows = sqlite
      .prepare(
        `SELECT material_id AS materialId,
                snippet(chunk_fts, 0, '[', ']', '…', 24) AS snippet
         FROM chunk_fts WHERE chunk_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(phrase, limit * 4) as { materialId: number; snippet: string }[];
    const seen = new Set<number>();
    const hits: { materialId: number; snippet: string }[] = [];
    for (const row of rows) {
      if (seen.has(row.materialId)) continue;
      seen.add(row.materialId);
      hits.push({
        materialId: row.materialId,
        snippet: row.snippet.replace(/ ?([㐀-鿿]) ?/g, "$1"),
      });
      if (hits.length >= limit) break;
    }
    return hits;
  } catch {
    return [];
  }
}

function searchMaterials(
  deps: CommandSearchDeps,
  query: string,
  pattern: string,
  limit: number,
): CommandHit[] {
  const items: CommandHit[] = [];
  const seen = new Set<number>();
  for (const hit of searchMaterialChunks(deps.sqlite, query, limit)) {
    const rows = deps.sqlite
      .prepare(
        `SELECT id, title, summary, clean_status AS cleanStatus FROM materials WHERE id = ?`,
      )
      .all(hit.materialId) as MaterialRow[];
    if (!rows[0]) continue;
    seen.add(rows[0].id);
    items.push(materialHit(rows[0], hit.snippet));
  }
  // 标题兜底：未清洗的素材没有语料块，不在 FTS 索引内
  const titleRows = deps.sqlite
    .prepare(
      `SELECT id, title, summary, clean_status AS cleanStatus FROM materials
       WHERE title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(pattern, limit) as MaterialRow[];
  for (const row of titleRows) {
    if (items.length >= limit) break;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    items.push(materialHit(row, excerpt(row.summary)));
  }
  return items;
}

interface TopicRow {
  id: number;
  title: string;
  brief: string | null;
  status: string;
}

function searchTopics(
  deps: CommandSearchDeps,
  pattern: string,
  limit: number,
): CommandHit[] {
  const rows = deps.sqlite
    .prepare(
      `SELECT id, title, brief, status FROM topics
       WHERE title LIKE ? ESCAPE '\\' OR (brief IS NOT NULL AND brief LIKE ? ESCAPE '\\')
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(pattern, pattern, limit) as TopicRow[];
  return rows.map((row) => {
    let subtitle = "";
    if (row.brief) {
      try {
        const brief = JSON.parse(row.brief) as {
          coreClaim?: string;
          angle?: string;
          audience?: string;
        };
        subtitle = excerpt(brief.coreClaim || brief.angle || brief.audience || "");
      } catch {
        subtitle = "";
      }
    }
    // 选题已开始创作 → 直达写作台资料面板（Brief 所在处）；否则去选题库
    const articleRows = deps.sqlite
      .prepare(
        `SELECT id FROM articles WHERE topic_id = ? ORDER BY updated_at DESC LIMIT 1`,
      )
      .all(row.id) as { id: number }[];
    return {
      type: "topic" as const,
      id: row.id,
      title: row.title,
      subtitle,
      status: topicStatusText[row.status] ?? row.status,
      href: articleRows[0] ? `/articles/${articleRows[0].id}?panel=materials` : "/topics",
    };
  });
}

interface RetroRow {
  id: number;
  title: string;
  insights: string;
  convertedTopicId: number | null;
}

function searchRetroNotes(
  deps: CommandSearchDeps,
  pattern: string,
  limit: number,
): CommandHit[] {
  const rows = deps.sqlite
    .prepare(
      `SELECT id, title, insights, converted_topic_id AS convertedTopicId FROM retro_notes
       WHERE title LIKE ? ESCAPE '\\' OR insights LIKE ? ESCAPE '\\' OR next_topic_hint LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(pattern, pattern, pattern, limit) as RetroRow[];
  return rows.map((row) => ({
    type: "retro" as const,
    id: row.id,
    title: row.title,
    subtitle: excerpt(row.insights),
    status: row.convertedTopicId ? "已转为新方向" : "可在新创作中复用",
    href: "/retro",
  }));
}

/** 跨域搜索：固定分组顺序 文章 → 素材 → 选题 → 复盘经验，空组不返回 */
export async function searchCommandCore(
  deps: CommandSearchDeps,
  query: string,
  limitPerGroup = 5,
): Promise<CommandGroup[]> {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${escapeLikePattern(q)}%`;
  const groups: CommandGroup[] = [
    {
      type: "article",
      label: COMMAND_GROUP_LABELS.article,
      items: await searchArticles(deps, pattern, limitPerGroup),
    },
    {
      type: "material",
      label: COMMAND_GROUP_LABELS.material,
      items: searchMaterials(deps, q, pattern, limitPerGroup),
    },
    {
      type: "topic",
      label: COMMAND_GROUP_LABELS.topic,
      items: searchTopics(deps, pattern, limitPerGroup),
    },
    {
      type: "retro",
      label: COMMAND_GROUP_LABELS.retro,
      items: searchRetroNotes(deps, pattern, limitPerGroup),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

/** 空查询首屏：最近更新的创作（只读，代替访问记录，不引入新表） */
export async function getCommandHomeCore(
  deps: CommandSearchDeps,
  limit = 5,
): Promise<CommandHome> {
  const rows = deps.sqlite
    .prepare(`SELECT id, title, summary FROM articles ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as ArticleRow[];
  const recent: CommandHit[] = [];
  for (const row of rows) {
    const hit = await articleHit(deps, row);
    if (hit) recent.push(hit);
  }
  return { continueArticle: recent[0] ?? null, recent };
}
