import { redirect } from "next/navigation";

/**
 * feat-025 编辑入口收敛：独立包装页与写作台包装面板曾是两套可编辑入口，
 * 旧 URL 永久重定向到写作台对应面板，功能由面板完整承接。
 */
export default async function PackagingRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/articles/${id}?panel=packaging`);
}
