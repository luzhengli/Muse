import type { Metadata } from "next";
import "./globals.css";
import { SideNav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Muse · 创作工厂",
  description:
    "面向自媒体创作者的一站式创作工厂：素材沉淀、选题策划、文章生产、审阅包装、多平台发布与数据复盘。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <SideNav />
          <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
