import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

export function fmtTime(unix: number | null | undefined): string {
  if (!unix) return "-";
  return new Date(unix * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

/** 解析 yyyy-mm-dd 日期范围为 unix 秒（to 取当天末尾） */
export function parseDateRange(from?: string, to?: string) {
  const fromUnix = from ? Math.floor(new Date(`${from}T00:00:00`).getTime() / 1000) : null;
  const toUnix = to ? Math.floor(new Date(`${to}T23:59:59`).getTime() / 1000) : null;
  return {
    fromUnix: Number.isFinite(fromUnix) ? fromUnix : null,
    toUnix: Number.isFinite(toUnix) ? toUnix : null,
  };
}

export function inDateRange(
  unix: number,
  range: { fromUnix: number | null; toUnix: number | null },
): boolean {
  if (range.fromUnix !== null && unix < range.fromUnix) return false;
  if (range.toUnix !== null && unix > range.toUnix) return false;
  return true;
}

/** 按自然日分组（倒序输入保持组内顺序），用于时间线展示 */
export function groupByDay<T>(rows: T[], getUnix: (row: T) => number) {
  const groups: { label: string; items: T[] }[] = [];
  for (const row of rows) {
    const label = new Date(getUnix(row) * 1000).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(row);
    else groups.push({ label, items: [row] });
  }
  return groups;
}

/**
 * FTS5 的 unicode61 分词器会把连续 CJK 字符当作一个整体 token，
 * 导致中文子串检索失效。写入与查询时都在 CJK 字符之间插入空格，
 * 让每个汉字成为独立 token，查询按短语匹配即可实现中文子串搜索。
 */
export function segmentCjk(text: string): string {
  return text.replace(/([぀-ヿ㐀-鿿豈-﫿])/g, " $1 ").replace(/\s+/g, " ").trim();
}

/** 资产表 filePath（data/assets/<name>）→ 可访问 URL */
export function assetUrl(filePath: string): string {
  const name = filePath.split("/").pop() ?? filePath;
  return `/api/assets/${encodeURIComponent(name)}`;
}
