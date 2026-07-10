"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AiActionResult } from "@/lib/ai";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const feedbackTone = {
  success: "text-(--color-success)",
  warning: "text-(--color-warning)",
  danger: "text-(--color-danger)",
} as const;

export function AiActionFeedback({
  result,
  className,
}: {
  result: AiActionResult<unknown> | null;
  className?: string;
}) {
  if (!result) return null;
  return (
    <p
      role={result.tone === "danger" ? "alert" : "status"}
      aria-live="polite"
      className={cn("text-xs leading-relaxed", feedbackTone[result.tone], className)}
    >
      {result.message}
    </p>
  );
}

function clientFailure(): AiActionResult {
  return {
    ok: false,
    message: "请求未完成，请检查连接后重试。",
    tone: "danger",
  };
}

export function AiActionButton({
  action,
  label,
  pendingLabel,
  disabled,
  variant,
  size,
  className,
  feedbackClassName,
}: {
  action: () => Promise<AiActionResult<unknown>>;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  feedbackClassName?: string;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AiActionResult<unknown> | null>(null);

  async function run() {
    if (submittingRef.current || disabled) return;
    submittingRef.current = true;
    setPending(true);
    setResult(null);
    try {
      const next = await action();
      setResult(next);
      if (next.redirectTo) router.push(next.redirectTo);
    } catch {
      setResult(clientFailure());
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-1", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || pending}
        aria-busy={pending}
        onClick={run}
      >
        {pending ? pendingLabel : label}
      </Button>
      <AiActionFeedback result={result} className={feedbackClassName} />
    </div>
  );
}

export function AiActionForm({
  action,
  children,
  label,
  pendingLabel,
  disabled,
  variant,
  size,
  formClassName,
  className,
}: {
  action: (formData: FormData) => Promise<AiActionResult<unknown>>;
  children: ReactNode;
  label: string;
  pendingLabel: string;
  disabled?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  formClassName?: string;
  className?: string;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AiActionResult<unknown> | null>(null);

  async function submit(formData: FormData) {
    if (submittingRef.current || disabled) return;
    submittingRef.current = true;
    setPending(true);
    setResult(null);
    try {
      const next = await action(formData);
      setResult(next);
      if (next.redirectTo) router.push(next.redirectTo);
    } catch {
      setResult(clientFailure());
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <form action={submit} className={formClassName} aria-busy={pending}>
        {children}
        <Button variant={variant} size={size} disabled={disabled || pending}>
          {pending ? pendingLabel : label}
        </Button>
      </form>
      <AiActionFeedback result={result} />
    </div>
  );
}
