import { eq } from "drizzle-orm";
import { db, appSettings } from "@/db";
import { nowUnix } from "@/lib/utils";
import {
  parseSettings,
  settingsSchema,
  resolveAiConfig,
  type AppSettings,
  type EffectiveAiConfig,
} from "./settings";

const SETTINGS_KEY = "app";

/** 读取应用设置（缺失/损坏回退默认） */
export function getAppSettings(): AppSettings {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SETTINGS_KEY))
    .all()[0];
  return parseSettings(row?.value);
}

/** 合并保存设置（分区块局部更新），返回校验后的完整设置 */
export function saveAppSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getAppSettings();
  const merged = settingsSchema.parse({
    editor: { ...current.editor, ...(patch.editor ?? {}) },
    ai: { ...current.ai, ...(patch.ai ?? {}) },
    appearance: { ...current.appearance, ...(patch.appearance ?? {}) },
    onboarding: { ...current.onboarding, ...(patch.onboarding ?? {}) },
  });
  const value = JSON.stringify(merged);
  const existing = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SETTINGS_KEY))
    .all()[0];
  if (existing) {
    db.update(appSettings)
      .set({ value, updatedAt: nowUnix() })
      .where(eq(appSettings.key, SETTINGS_KEY))
      .run();
  } else {
    db.insert(appSettings)
      .values({ key: SETTINGS_KEY, value, updatedAt: nowUnix() })
      .run();
  }
  return merged;
}

/** 恢复某一区块为内置默认 */
export function resetAppSettingsSection(
  section: keyof AppSettings,
): AppSettings {
  const defaults = settingsSchema.parse({});
  return saveAppSettings({ [section]: defaults[section] } as Partial<AppSettings>);
}

/** AI 生效配置（设置 > 环境变量 > 默认），每次 AI 调用即时读取 */
export function getEffectiveAiConfig(): EffectiveAiConfig {
  return resolveAiConfig(getAppSettings().ai);
}
