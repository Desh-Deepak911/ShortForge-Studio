import type { AssetValidationResult } from "@/features/asset-intelligence/validator/asset-validator.types";
import type { AssetRepairSuggestion } from "@/features/asset-intelligence/validator/asset-validator.types";
import type {
  AssetRecommendation,
  RecommendationConfidence,
  RecommendedAssetCandidate,
} from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import type { ProviderRecommendation } from "@/features/asset-intelligence/providers/asset-provider.types";

import {
  formatConfidenceLabel,
  formatImprovementSuggestion,
  formatPlanningScore,
  formatProviderLabel,
} from "./creator-asset-studio.formatters";

export interface RecommendationComparisonMetrics {
  confidenceLabel: string;
  confidencePercent: string;
  providerLabel: string;
  visualFit: number;
  narrativeFit: number;
}

export interface CreatorTip {
  id: string;
  message: string;
}

const TIP_BY_CATEGORY: Record<AssetRepairSuggestion["category"], string> = {
  archive: "Use archive imagery here.",
  portrait: "Avoid another portrait.",
  visual: "Add stadium atmosphere.",
  diversity: "Use crowd reaction.",
  entity: "Include important entity imagery.",
  provider: "Try a different provider source.",
  query: "Use more specific search terms.",
  arc: "Cover another story arc beat.",
  comparison: "Add a comparison visual.",
  tactical: "Use tactical board imagery.",
  climax: "Strengthen the climax visual.",
};

const TIP_BY_WARNING: Array<{ match: RegExp; tip: string }> = [
  { match: /portrait/i, tip: "Avoid another portrait." },
  { match: /divers/i, tip: "Use crowd reaction." },
  { match: /archive|historical/i, tip: "Use archive imagery here." },
  { match: /stadium|crowd/i, tip: "Add stadium atmosphere." },
  { match: /duplicate/i, tip: "Vary imagery to reduce repetition." },
];

function clampScore(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function hasNarrativeReason(candidate: RecommendedAssetCandidate | AssetRecommendation): boolean {
  return candidate.reasons.some((reason) =>
    ["matches_scene_role", "highest_narrative_impact", "template_slot_alignment", "matches_climax_scene"].includes(
      reason,
    ),
  );
}

function hasVisualAlignment(
  candidate: RecommendedAssetCandidate,
  current: AssetRecommendation,
): boolean {
  return Boolean(
    candidate.visualIntent &&
      current.visualIntent &&
      candidate.visualIntent === current.visualIntent,
  );
}

/** Builds visual fit score from planning metadata only. */
export function computeVisualFitScore(
  candidate: RecommendedAssetCandidate,
  current: AssetRecommendation,
): number {
  if (hasVisualAlignment(candidate, current)) {
    return clampScore(0.82 + candidate.score * 0.15);
  }

  if (candidate.visualIntent && current.visualIntent) {
    return clampScore(candidate.score * 0.75);
  }

  return clampScore(candidate.score * 0.68);
}

/** Builds narrative fit score from planning metadata only. */
export function computeNarrativeFitScore(candidate: RecommendedAssetCandidate): number {
  if (hasNarrativeReason(candidate)) {
    return clampScore(0.65 + candidate.score * 0.3);
  }

  if (candidate.semanticRole) {
    return clampScore(0.5 + candidate.score * 0.35);
  }

  return clampScore(candidate.score * 0.55);
}

export function buildRecommendationComparisonMetrics(input: {
  candidate: RecommendedAssetCandidate;
  current: AssetRecommendation;
  provider?: ProviderRecommendation;
  fallbackProvider?: ProviderRecommendation;
}): RecommendationComparisonMetrics {
  const provider = input.fallbackProvider ?? input.provider;

  return {
    confidenceLabel: formatConfidenceLabel(input.candidate.confidence),
    confidencePercent: formatPlanningScore(input.candidate.score),
    providerLabel: provider ? formatProviderLabel(provider.providerId) : "Planning match",
    visualFit: computeVisualFitScore(input.candidate, input.current),
    narrativeFit: computeNarrativeFitScore(input.candidate),
  };
}

export function buildCurrentComparisonMetrics(input: {
  current: AssetRecommendation;
  sceneConfidence: RecommendationConfidence;
  provider?: ProviderRecommendation;
}): RecommendationComparisonMetrics {
  return {
    confidenceLabel: formatConfidenceLabel(input.sceneConfidence),
    confidencePercent: formatPlanningScore(input.current.score),
    providerLabel: input.provider ? formatProviderLabel(input.provider.providerId) : "Planning match",
    visualFit: clampScore(0.7 + input.current.score * 0.25),
    narrativeFit: hasNarrativeReason(input.current)
      ? clampScore(0.75 + input.current.score * 0.2)
      : clampScore(0.55 + input.current.score * 0.3),
  };
}

/** Formats recommendation text for clipboard copy. */
export function formatRecommendationCopyText(recommendation: AssetRecommendation): string {
  const lines = [
    recommendation.query,
    recommendation.entityNames.length > 0 ? `Entities: ${recommendation.entityNames.join(", ")}` : null,
    recommendation.reasonLabels.length > 0 ? `Reasons: ${recommendation.reasonLabels.join("; ")}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

/** Builds concise creator tips from validation metadata only. */
export function buildCreatorTips(input: {
  validationResult?: AssetValidationResult;
  repairSuggestions: readonly AssetRepairSuggestion[];
  maxItems?: number;
}): CreatorTip[] {
  const tips: CreatorTip[] = [];
  const seen = new Set<string>();
  let index = 0;

  const pushTip = (message: string) => {
    const normalized = message.trim();
    if (!normalized || seen.has(normalized.toLowerCase())) {
      return;
    }

    seen.add(normalized.toLowerCase());
    tips.push({ id: `creator-tip-${index++}`, message: normalized });
  };

  for (const suggestion of input.repairSuggestions) {
    const categoryTip = TIP_BY_CATEGORY[suggestion.category];
    if (categoryTip) {
      pushTip(categoryTip);
    } else {
      pushTip(formatImprovementSuggestion(suggestion));
    }
  }

  for (const warning of input.validationResult?.warnings ?? []) {
    const matched = TIP_BY_WARNING.find((entry) => entry.match.test(warning));
    if (matched) {
      pushTip(matched.tip);
    }
  }

  if (tips.length === 0 && (input.validationResult?.visualDiversityScore ?? 1) < 0.72) {
    pushTip("Add stadium atmosphere.");
  }

  if (tips.length === 0 && (input.validationResult?.entityCoverageScore ?? 1) < 0.72) {
    pushTip("Include important entity imagery.");
  }

  return tips.slice(0, input.maxItems ?? 5);
}
