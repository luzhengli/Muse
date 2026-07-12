/**
 * 平台规则层（PRD v1.0 FR-0.2 + §3.2）统一出口。
 *
 * - registry：平台规则注册表（每条规则带来源 URL / 核对日期 / rules_version）
 * - x-text：X 官方 twitter-text 加权字符计数
 * - payloads：四种平台作品的 Zod 类型化 payload（判别联合 + schemaVersion）
 * - checks：按注册表出具的发布检查 checklist（阻断/提醒）
 */
export * from "./registry";
export * from "./x-text";
export * from "./payloads";
export * from "./checks";
