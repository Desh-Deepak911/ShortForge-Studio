import type { RecommendationConfidence } from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";

export {
  buildRecommendationExplanation,
  formatConfidenceLabel,
  formatConfidenceWithPercent,
  formatImportanceLabel,
  formatImprovementSuggestion,
  formatNarrativeRoleLabel,
  formatPlanningScore,
  formatProviderLabel,
  formatRecommendationTypeLabel,
  formatVisualTypeLabel,
} from "./creator-asset-studio.formatters";

import { formatImportanceLabel } from "./creator-asset-studio.formatters";

/** @deprecated Prefer formatImportanceLabel */
export function formatImportanceScore(score: number): string {
  return formatImportanceLabel(score);
}

export function confidenceBadgeClass(confidence: RecommendationConfidence): string {
  switch (confidence) {
    case "very_high":
      return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25";
    case "high":
      return "bg-accent/15 text-accent ring-accent/25";
    case "medium":
      return "bg-amber-500/15 text-amber-200 ring-amber-500/25";
    default:
      return "bg-surface-elevated/60 text-muted ring-border/25";
  }
}

export function importanceBadgeClass(score: number): string {
  if (score >= 0.85) {
    return "bg-rose-500/10 text-rose-200 ring-rose-500/20";
  }
  if (score >= 0.68) {
    return "bg-violet-500/10 text-violet-200 ring-violet-500/20";
  }
  if (score >= 0.48) {
    return "bg-sky-500/10 text-sky-200 ring-sky-500/20";
  }
  return "bg-surface-elevated/60 text-muted ring-border/25";
}

export const creatorAssetSectionClass =
  "rounded-2xl bg-surface-elevated/20 p-4 ring-1 ring-border/15 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:ring-border/25 motion-reduce:transform-none motion-reduce:shadow-none";

export const creatorAssetHeroClass =
  "rounded-2xl bg-gradient-to-b from-surface-elevated/45 to-surface-elevated/20 p-5 ring-1 ring-accent/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] hover:ring-accent/25 motion-reduce:transform-none motion-reduce:shadow-none";

export const creatorAssetBadgeClass =
  "transition-all duration-300 hover:scale-[1.03] motion-reduce:transform-none";

export async function copyPlanningText(value: string): Promise<boolean> {
  if (!value.trim()) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
