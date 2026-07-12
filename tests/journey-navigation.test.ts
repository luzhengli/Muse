import { describe, expect, test } from "bun:test";
import {
  getJourneyDestination,
  normalizeJourneyPanel,
} from "@/lib/journey-navigation";

describe("journey navigation（步骤条导航语义）", () => {
  test("初始 URL 与后续 URL 都使用同一 panel 解析规则", () => {
    expect(normalizeJourneyPanel("materials")).toBe("materials");
    expect(normalizeJourneyPanel("review")).toBe("review");
    expect(normalizeJourneyPanel("writing")).toBe("writing");
    expect(normalizeJourneyPanel("unknown")).toBeNull();
    expect(normalizeJourneyPanel(null)).toBeNull();
  });

  test("方向、写作、检查分别产生资料面板、编辑器和审阅面板目标", () => {
    expect(getJourneyDestination(8, "direction")).toEqual({
      href: "/articles/8?panel=materials",
      target: "materials",
    });
    expect(getJourneyDestination(8, "writing")).toEqual({
      href: "/articles/8?panel=writing",
      target: "writing",
    });
    expect(getJourneyDestination(8, "checking")).toEqual({
      href: "/articles/8?panel=review",
      target: "review",
    });
  });

  test("发布准备、已发布、复盘保留跨页面目的地", () => {
    expect(getJourneyDestination(8, "preparing").href).toBe("/articles/8/variants");
    expect(getJourneyDestination(8, "published").href).toBe("/publish");
    expect(getJourneyDestination(8, "retro").href).toBe("/retro");
  });
});
