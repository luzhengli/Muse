import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "bg-(--color-muted-bg) text-(--color-muted)",
  primary: "bg-(--color-primary-soft) text-(--color-primary)",
  success: "bg-(--color-success-soft) text-(--color-success)",
  warning: "bg-(--color-warning-soft) text-(--color-warning)",
  danger: "bg-(--color-danger-soft) text-(--color-danger)",
} as const;

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
