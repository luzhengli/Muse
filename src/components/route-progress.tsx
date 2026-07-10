"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ROUTE_PROGRESS_START_EVENT } from "@/lib/navigation-motion";

type Phase = "idle" | "loading" | "done";

export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const navigatingRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failSafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback((timer: typeof resetTimerRef) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const finishNavigation = useCallback(() => {
    navigatingRef.current = false;
    clearTimer(failSafeTimerRef);
    setPhase("done");
    clearTimer(resetTimerRef);
    resetTimerRef.current = setTimeout(() => setPhase("idle"), 180);
  }, [clearTimer]);

  const beginNavigation = useCallback(() => {
    navigatingRef.current = true;
    clearTimer(resetTimerRef);
    clearTimer(failSafeTimerRef);
    setPhase("loading");
    // A rejected or intercepted navigation must not leave the indicator stuck.
    failSafeTimerRef.current = setTimeout(finishNavigation, 12_000);
  }, [clearTimer, finishNavigation]);

  useEffect(() => {
    if (!navigatingRef.current) return;
    finishNavigation();
  }, [finishNavigation, pathname, search]);

  useEffect(() => {
    function startNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const next = new URL(anchor.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      if (
        next.pathname === window.location.pathname &&
        next.search === window.location.search
      ) {
        return;
      }
      beginNavigation();
    }

    function startHistoryNavigation() {
      beginNavigation();
    }

    document.addEventListener("click", startNavigation, true);
    window.addEventListener("popstate", startHistoryNavigation);
    window.addEventListener(ROUTE_PROGRESS_START_EVENT, beginNavigation);
    return () => {
      document.removeEventListener("click", startNavigation, true);
      window.removeEventListener("popstate", startHistoryNavigation);
      window.removeEventListener(ROUTE_PROGRESS_START_EVENT, beginNavigation);
      clearTimer(resetTimerRef);
      clearTimer(failSafeTimerRef);
    };
  }, [beginNavigation, clearTimer]);

  return (
    <div className="route-progress" data-phase={phase} aria-hidden="true">
      <span className="route-progress-bar" />
    </div>
  );
}
