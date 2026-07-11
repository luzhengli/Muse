"use client";

import { Button } from "@/components/ui/button";

/**
 * 破坏性操作的二次确认按钮（feat-025）：放在 <form action=…> 内使用，
 * 未确认时阻止提交。领域级软删除/回收站不在本轮范围（见 progress.md）。
 */
export function ConfirmButton({
  message,
  children,
  size = "sm",
  variant = "ghost",
}: {
  message: string;
  children: React.ReactNode;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "secondary" | "outline" | "ghost" | "danger";
}) {
  return (
    <Button
      type="submit"
      size={size}
      variant={variant}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
