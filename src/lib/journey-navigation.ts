import type { JourneyStep } from "@/lib/readiness";

export type JourneyPanel = "review" | "packaging" | "versions" | "materials" | "writing";

export function normalizeJourneyPanel(value: string | null | undefined): JourneyPanel | null {
  if (
    value === "review" ||
    value === "packaging" ||
    value === "versions" ||
    value === "materials" ||
    value === "writing"
  ) {
    return value;
  }
  return null;
}

export function getJourneyDestination(
  articleId: number,
  step: JourneyStep,
): { href: string; target: JourneyPanel | null } {
  switch (step) {
    case "direction":
      return { href: `/articles/${articleId}?panel=materials`, target: "materials" };
    case "writing":
      return { href: `/articles/${articleId}?panel=writing`, target: "writing" };
    case "checking":
      return { href: `/articles/${articleId}?panel=review`, target: "review" };
    case "preparing":
      return { href: `/articles/${articleId}/variants`, target: null };
    case "published":
      return { href: "/publish", target: null };
    case "retro":
      return { href: "/retro", target: null };
  }
}
