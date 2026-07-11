import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { MobileNav, SideNav } from "@/components/nav";
import { RouteProgress } from "@/components/route-progress";
import { getAppSettings } from "@/lib/settings-store";

export const metadata: Metadata = {
  title: "Muse · 创作工厂",
  description:
    "面向自媒体创作者的一站式创作工厂：素材沉淀、选题策划、文章生产、审阅包装、多平台发布与数据复盘。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { appearance } = getAppSettings();
  return (
    <html
      lang="zh-CN"
      data-theme={appearance.theme}
      data-motion={appearance.motion}
    >
      <body className="antialiased">
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        <div className="app-shell flex min-h-screen flex-col md:flex-row">
          <MobileNav />
          <SideNav />
          <main className="app-main min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
