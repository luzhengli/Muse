"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleAlert, Sparkles } from "lucide-react";
import type { AiActionResult } from "@/lib/ai";
import { Button, type ButtonProps } from "@/components/ui/button";
import { startRouteProgress } from "@/lib/navigation-motion";
import { cn } from "@/lib/utils";

const feedbackTone = {
  success: "bg-(--color-success-soft) text-(--color-success)",
  warning: "bg-(--color-warning-soft) text-(--color-warning)",
  danger: "bg-(--color-danger-soft) text-(--color-danger)",
} as const;

const feedbackIcon = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: CircleAlert,
} as const;

export function AiPendingLabel({ children }: { children: ReactNode }) {
  return (
    <span className="ai-pending-label">
      <Sparkles className="ai-pending-icon h-3.5 w-3.5" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export function AiButtonContent({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: ReactNode;
  pendingLabel: ReactNode;
}) {
  return (
    <span className="grid place-items-center">
      <span
        aria-hidden={pending}
        className={cn(
          "col-start-1 row-start-1 transition-[opacity,transform] duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:scale-100 motion-reduce:transition-none",
          pending ? "scale-[0.96] opacity-0" : "scale-100 opacity-100",
        )}
      >
        {label}
      </span>
      <span
        aria-hidden={!pending}
        className={cn(
          "col-start-1 row-start-1 transition-[opacity,transform] duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:scale-100 motion-reduce:transition-none",
          pending ? "scale-100 opacity-100" : "scale-[0.96] opacity-0",
        )}
      >
        <AiPendingLabel>{pendingLabel}</AiPendingLabel>
      </span>
    </span>
  );
}

export function AiActionFeedback({
  result,
  className,
}: {
  result: AiActionResult<unknown> | null;
  className?: string;
}) {
  if (!result) return null;
  const Icon = feedbackIcon[result.tone];
  return (
    <p
      role={result.tone === "danger" ? "alert" : "status"}
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "ai-feedback inline-flex items-start gap-1.5 rounded-(--radius-control) px-2 py-1 text-xs leading-relaxed",
        feedbackTone[result.tone],
        className,
      )}
    >
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{result.message}</span>
    </p>
  );
}

export function AiResultTransition({
  signature,
  children,
  className,
}: {
  signature: string | number;
  children: ReactNode;
  className?: string;
}) {
  const previousSignature = useRef(signature);
  const changed = previousSignature.current !== signature;

  useEffect(() => {
    previousSignature.current = signature;
  }, [signature]);

  return (
    <div
      key={String(signature)}
      className={cn(changed && "ai-result-reveal", className)}
    >
      {children}
    </div>
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
      if (next.redirectTo) {
        startRouteProgress();
        router.push(next.redirectTo);
      }
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
        className={cn(
          "ai-action-trigger",
          pending && "ai-action-pending disabled:opacity-100",
        )}
        disabled={disabled || pending}
        aria-busy={pending}
        aria-label={pending ? pendingLabel : label}
        onClick={run}
      >
        <AiButtonContent pending={pending} label={label} pendingLabel={pendingLabel} />
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
      if (next.redirectTo) {
        startRouteProgress();
        router.push(next.redirectTo);
      }
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
        <Button
          variant={variant}
          size={size}
          className={cn(
            "ai-action-trigger",
            pending && "ai-action-pending disabled:opacity-100",
          )}
          disabled={disabled || pending}
          aria-busy={pending}
          aria-label={pending ? pendingLabel : label}
        >
          <AiButtonContent pending={pending} label={label} pendingLabel={pendingLabel} />
        </Button>
      </form>
      <AiActionFeedback result={result} />
    </div>
  );
}
