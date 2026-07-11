import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  credentialStatus,
  parseSettings,
  resolveAiConfig,
  settingsSchema,
} from "@/lib/settings";

describe("settings schema（校验/默认/向后兼容）", () => {
  test("空存储 → 全默认", () => {
    const s = parseSettings(null);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.editor.autosaveIntervalMs).toBe(1500);
    expect(s.editor.fontSize).toBe(14);
    expect(s.ai.provider).toBe("");
    expect(s.ai.mockFallback).toBe(true);
    expect(s.appearance.motion).toBe("system");
  });

  test("损坏 JSON → 回退默认", () => {
    expect(parseSettings("{oops")).toEqual(DEFAULT_SETTINGS);
  });

  test("旧版本缺失字段 → 默认值补齐（向后兼容）", () => {
    const s = parseSettings(JSON.stringify({ editor: { fontSize: 16 } }));
    expect(s.editor.fontSize).toBe(16);
    expect(s.editor.lineHeight).toBe(1.8);
    expect(s.ai.mockFallback).toBe(true);
  });

  test("新版本未知字段 → 被忽略不报错（向前兼容）", () => {
    const s = parseSettings(
      JSON.stringify({ future: { flag: true }, editor: { fontSize: 18, futureOpt: 1 } }),
    );
    expect(s.editor.fontSize).toBe(18);
    expect("future" in s).toBe(false);
  });

  test("越界值 → 单字段回退默认，不拖垮整块", () => {
    const s = parseSettings(
      JSON.stringify({ editor: { fontSize: 99, lineHeight: 2.0 } }),
    );
    expect(s.editor.fontSize).toBe(14);
    expect(s.editor.lineHeight).toBe(2.0);
  });

  test("schema parse 空对象与默认一致", () => {
    expect(settingsSchema.parse({})).toEqual(DEFAULT_SETTINGS);
  });
});

describe("resolveAiConfig（优先级：设置 > 环境变量 > 默认）", () => {
  const noEnv = {};

  test("全空 → 内置默认", () => {
    const cfg = resolveAiConfig(DEFAULT_SETTINGS.ai, noEnv);
    expect(cfg.provider).toEqual({ value: "openai-compatible", source: "default" });
    expect(cfg.baseUrl.value).toBe("https://api.deepseek.com");
    expect(cfg.model.value).toBe("deepseek-v4-flash");
    expect(cfg.timeoutMs).toEqual({ value: 30000, source: "default" });
  });

  test("环境变量覆盖默认", () => {
    const cfg = resolveAiConfig(DEFAULT_SETTINGS.ai, {
      MUSE_AI_PROVIDER: "openai",
      MUSE_AI_MODEL: "gpt-4o-mini",
      MUSE_AI_TIMEOUT_MS: "5000",
    });
    expect(cfg.provider).toEqual({ value: "openai", source: "env" });
    expect(cfg.model).toEqual({ value: "gpt-4o-mini", source: "env" });
    expect(cfg.timeoutMs).toEqual({ value: 5000, source: "env" });
  });

  test("设置覆盖环境变量", () => {
    const cfg = resolveAiConfig(
      { ...DEFAULT_SETTINGS.ai, provider: "mock", model: "my-model", timeoutMs: 8000 },
      { MUSE_AI_PROVIDER: "openai", MUSE_AI_MODEL: "gpt-4o", MUSE_AI_TIMEOUT_MS: "5000" },
    );
    expect(cfg.provider).toEqual({ value: "mock", source: "settings" });
    expect(cfg.model).toEqual({ value: "my-model", source: "settings" });
    expect(cfg.timeoutMs).toEqual({ value: 8000, source: "settings" });
  });

  test("provider 决定默认模型", () => {
    const cfg = resolveAiConfig({ ...DEFAULT_SETTINGS.ai, provider: "anthropic" }, noEnv);
    expect(cfg.model.value).toBe("claude-sonnet-5");
    const cfg2 = resolveAiConfig({ ...DEFAULT_SETTINGS.ai, provider: "openai" }, noEnv);
    expect(cfg2.model.value).toBe("gpt-4o");
  });

  test("非法环境变量超时被忽略", () => {
    const cfg = resolveAiConfig(DEFAULT_SETTINGS.ai, { MUSE_AI_TIMEOUT_MS: "abc" });
    expect(cfg.timeoutMs).toEqual({ value: 30000, source: "default" });
    const cfg2 = resolveAiConfig(DEFAULT_SETTINGS.ai, { MUSE_AI_TIMEOUT_MS: "999999" });
    expect(cfg2.timeoutMs.value).toBe(120000);
  });
});

describe("credentialStatus（只暴露布尔，不暴露密钥）", () => {
  test("按环境变量报告已配置/未配置", () => {
    const status = credentialStatus({
      ANTHROPIC_API_KEY: "sk-secret",
      MUSE_AI_API_KEY: undefined,
    });
    expect(status).toEqual({ anthropic: true, openai: false, openaiCompatible: false });
    expect(JSON.stringify(status)).not.toContain("sk-secret");
  });
});
