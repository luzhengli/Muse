import type { Platform, PlatformVariant } from "@/db/schema";
import { platformName } from "@/lib/platforms";

export interface PublishPayload {
  variant: PlatformVariant;
}

export interface PublishOutcome {
  ok: boolean;
  externalUrl?: string;
  error?: string;
}

/**
 * 平台发布适配器接口。
 * 真实平台 API 可用后，为对应平台实现该接口并在 ADAPTERS 中替换。
 */
export interface PublisherAdapter {
  platform: Platform;
  publish(payload: PublishPayload): Promise<PublishOutcome>;
}

/** mock 发布器：模拟网络耗时与可配置失败率，用于跑通闭环与演示失败重试 */
function createMockAdapter(platform: Platform): PublisherAdapter {
  return {
    platform,
    async publish({ variant }) {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
      const failRate = Number(process.env.MUSE_MOCK_PUBLISH_FAIL_RATE ?? "0.1");
      if (Math.random() < failRate) {
        return {
          ok: false,
          error: `[mock] ${platformName(platform)} 接口超时，请重试`,
        };
      }
      const slug = `${platform}-${variant.id}-${Date.now().toString(36)}`;
      return {
        ok: true,
        externalUrl: `https://mock.muse.local/${platform}/${slug}`,
      };
    },
  };
}

export const ADAPTERS: Record<Platform, PublisherAdapter> = {
  xiaohongshu: createMockAdapter("xiaohongshu"),
  x: createMockAdapter("x"),
  wechat: createMockAdapter("wechat"),
};

export function getAdapter(platform: string): PublisherAdapter {
  return ADAPTERS[platform as Platform] ?? createMockAdapter(platform as Platform);
}
