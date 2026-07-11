import { describe, expect, test } from "bun:test";
import { briefFingerprint, briefRequiredFields, normalizeTopicBrief } from "@/lib/briefs";

describe("TopicBrief 兼容与默认值", () => {
  test("旧 JSON 自动补创作目标、核心主张和逐要点证据", () => {
    const brief = normalizeTopicBrief({
      audience: "独立创作者",
      platforms: ["wechat"],
      keyPoints: ["先建立证据", "再形成主张"],
      angle: "实操",
      tone: "克制",
      outline: ["开头", "正文", "结尾"],
      citedMaterialIds: [1, 2],
    });
    expect(brief.objective).toBe("");
    expect(brief.coreClaim).toBe("先建立证据");
    expect(brief.evidence).toEqual([
      { keyPoint: "先建立证据", materialIds: [], noCitationRequired: false },
      { keyPoint: "再形成主张", materialIds: [], noCitationRequired: false },
    ]);
  });

  test("缺失旧 Brief 时用选题字段补默认", () => {
    const brief = normalizeTopicBrief(null, {
      audience: "目标读者",
      keyPoints: ["核心观点"],
      angle: "经验分享",
      platforms: ["x"],
      materialIds: [7],
    });
    expect(brief.audience).toBe("目标读者");
    expect(brief.coreClaim).toBe("核心观点");
    expect(brief.citedMaterialIds).toEqual([7]);
  });

  test("直接传入 Topic 字段名时也能补读者、要点和平台", () => {
    const brief = normalizeTopicBrief(null, {
      targetAudience: "Topic 读者",
      corePoints: ["Topic 要点"],
      recommendedPlatforms: ["wechat"],
      angle: "实操",
    });
    expect(brief.audience).toBe("Topic 读者");
    expect(brief.keyPoints).toEqual(["Topic 要点"]);
    expect(brief.platforms).toEqual(["wechat"]);
  });

  test("要点调整时只保留仍能按文本匹配的证据", () => {
    const brief = normalizeTopicBrief({
      keyPoints: ["保留", "新增"],
      evidence: [
        { keyPoint: "保留", materialIds: [3], noCitationRequired: false },
        { keyPoint: "已删除", materialIds: [4], noCitationRequired: true },
      ],
    });
    expect(brief.evidence).toEqual([
      { keyPoint: "保留", materialIds: [3], noCitationRequired: false },
      { keyPoint: "新增", materialIds: [], noCitationRequired: false },
    ]);
  });

  test("必填字段完整性逐项计算", () => {
    const brief = normalizeTopicBrief({
      audience: "读者",
      objective: "帮助决策",
      coreClaim: "证据先于观点",
      platforms: ["wechat"],
      keyPoints: ["要点"],
      angle: "指南",
      tone: "专业",
      outline: ["开头", "结尾"],
    });
    expect(Object.values(briefRequiredFields(brief)).every(Boolean)).toBe(true);
  });

  test("Brief 修改后指纹变化，使旧 AI 预览可被拒绝", () => {
    const original = normalizeTopicBrief({
      audience: "读者",
      objective: "目标",
      coreClaim: "原主张",
      platforms: ["wechat"],
      keyPoints: ["要点"],
      angle: "指南",
      tone: "专业",
      outline: ["开头", "结尾"],
    });
    const changed = normalizeTopicBrief({ ...original, coreClaim: "新主张" });
    expect(briefFingerprint(changed)).not.toBe(briefFingerprint(original));
  });
});
