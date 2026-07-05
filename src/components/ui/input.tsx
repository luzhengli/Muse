import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) px-3 py-1 text-sm placeholder:text-(--color-muted) focus-visible:outline-2 focus-visible:outline-(--color-primary) disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-20 w-full rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) px-3 py-2 text-sm placeholder:text-(--color-muted) focus-visible:outline-2 focus-visible:outline-(--color-primary) disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-9 rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) px-2 text-sm focus-visible:outline-2 focus-visible:outline-(--color-primary)",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-medium text-(--color-muted)", className)}
      {...props}
    />
  );
}
