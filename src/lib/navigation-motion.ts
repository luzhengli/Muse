export const ROUTE_PROGRESS_START_EVENT = "muse:route-progress-start";

/**
 * Programmatic navigation does not emit a document click, so callers signal the
 * global route indicator before invoking router.push/replace.
 */
export function startRouteProgress() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ROUTE_PROGRESS_START_EVENT));
}
