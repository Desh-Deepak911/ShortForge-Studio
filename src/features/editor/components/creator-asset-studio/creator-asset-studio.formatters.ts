import type { AssetRecommendation, RecommendationConfidence, RecommendationReason } from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import type { AssetProviderId } from "@/features/asset-intelligence/providers/asset-provider.types";
import type { AssetRepairSuggestion } from "@/features/asset-intelligence/validator/asset-validator.types";

const REASON_EXPLANATION_PHRASES: Record<RecommendationReason, string> = {
  highest_confidence_entity: "matches the most reliable entity in this scene",
  matches_climax_scene: "supports the emotional climax of the story",
  supports_tactical_explanation: "clarifies the tactical moment for viewers",
  best_historical_context: "adds meaningful historical context",
  strong_visual_diversity: "improves visual diversity across the story",
  best_portrait_opportunity: "delivers a strong portrait moment",
  highest_narrative_impact: "reinforces the narration at a key story beat",
  matches_visual_intent: "aligns with the scene's visual intent",
  template_slot_alignment: "fits the story template slot naturally",
  high_query_quality: "uses a precise, searchable visual query",
  caption_emphasis_match: "echoes the caption emphasis in the visuals",
  timing_importance: "lands at a high-impact timing moment",
  matches_scene_role: "supports the narrative role of this scene",
  diversity_alternate: "offers a diverse visual alternative",
};

const PROVIDER_LABELS: Record<AssetProviderId, string> = {
  manual: "Manual Upload",
  pexels: "Pexels",
  unsplash: "Unsplash",
  pixabay: "Pixabay",
  wikimedia: "Wikimedia Commons",
  internal_library: "Internal Library",
  ai_generated: "AI Generated",
};

const POSITIVE_SUGGESTION_BY_MESSAGE: Record<string, string> = {
  "Replace duplicate portrait with an alternate player angle or action shot.":
    "Add alternate player angle or action shot",
  "Use archive provider for historical scenes (Wikimedia or internal library).":
    "Include archive imagery from historical sources",
  "Recommend tactical board or generated overlay for formation scenes.":
    "Add tactical board or generated overlay",
  "Recommend portrait-first asset for player spotlight scenes.":
    "Include a portrait-first asset for spotlight scenes",
  "Avoid repeated assets across countdown ranks — vary player, trophy, and archive imagery.":
    "Vary player, trophy, and archive imagery across countdown ranks",
  "Introduce comparison graphic covering both sides of the debate.":
    "Include a comparison graphic for both sides of the debate",
  "Strengthen biography arc coverage from origin through rise, peak, and legacy.":
    "Cover origin, rise, peak, and legacy beats",
  "Surface unused important entities such as trophies, awards, or rival clubs.":
    "Include trophy, award, or rival club moments",
  "Improve generic queries with entity-focused visual terms.":
    "Use entity-focused visual search terms",
  "Increase stadium imagery and alternate visual intents for stronger diversity.":
    "Add stadium atmosphere and alternate visual intents",
  "Rotate providers across scenes to avoid over-reliance on one catalog.":
    "Diversify provider sources across scenes",
  "Strengthen climax visual with higher-confidence entity match.":
    "Include a stronger climax visual with a high-confidence entity match",
  "Recommend trophy scene or stat overlay for uncovered planning scenes.":
    "Include trophy moment or stat overlay",
  "Cover origin, rise, peak, and legacy beats across biography scenes.":
    "Include origin, rise, peak, and legacy imagery",
};

const POSITIVE_SUGGESTION_BY_CATEGORY: Record<AssetRepairSuggestion["category"], string> = {
  entity: "Include important entity imagery",
  provider: "Diversify provider sources",
  visual: "Add varied visual imagery",
  query: "Use more specific visual search terms",
  diversity: "Add crowd imagery for stronger diversity",
  arc: "Include story arc imagery across key beats",
  comparison: "Include comparison visuals for both sides",
  tactical: "Add tactical board or formation imagery",
  climax: "Include a stronger climax visual",
  portrait: "Reduce portrait repetition with alternate angles",
  archive: "Include archive or historical imagery",
};

function joinExplanationPhrases(phrases: string[]): string {
  if (phrases.length === 0) {
    return "This recommendation aligns with the scene planning metadata and supports the story visually.";
  }

  if (phrases.length === 1) {
    return `This recommendation ${phrases[0]}.`;
  }

  if (phrases.length === 2) {
    return `This recommendation ${phrases[0]} and ${phrases[1]}.`;
  }

  const head = phrases.slice(0, -1).join(", ");
  const tail = phrases[phrases.length - 1];
  return `This recommendation ${head}, and ${tail}.`;
}

function humanizeToken(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Builds a natural-language explanation from existing planning metadata only. */
export function buildRecommendationExplanation(input: {
  recommendation: AssetRecommendation;
  reasoning?: readonly string[];
}): string {
  const phrases: string[] = [];

  for (const reason of input.recommendation.reasons) {
    const phrase = REASON_EXPLANATION_PHRASES[reason];
    if (phrase && !phrases.includes(phrase)) {
      phrases.push(phrase);
    }
  }

  if (phrases.length === 0) {
    for (const label of input.recommendation.reasonLabels) {
      const normalized = label.trim().toLowerCase();
      if (!normalized) {
        continue;
      }

      const phrase = normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
      if (!phrases.includes(phrase)) {
        phrases.push(phrase);
      }
    }
  }

  if (phrases.length === 0 && input.reasoning && input.reasoning.length > 0) {
    phrases.push(input.reasoning[0].trim().toLowerCase());
  }

  return joinExplanationPhrases(phrases.slice(0, 3));
}

export function formatProviderLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId as AssetProviderId] ?? humanizeToken(providerId);
}

export function formatVisualTypeLabel(value?: string): string | null {
  if (!value?.trim()) {
    return null;
  }

  return humanizeToken(value.trim());
}

export function formatRecommendationTypeLabel(recommendation: AssetRecommendation): string {
  return (
    formatVisualTypeLabel(recommendation.assetRequirementType) ??
    formatVisualTypeLabel(recommendation.visualIntent) ??
    (recommendation.tags[0] ? humanizeToken(recommendation.tags[0]) : "Visual Asset")
  );
}

export function formatNarrativeRoleLabel(value?: string): string | null {
  if (!value?.trim()) {
    return null;
  }

  return humanizeToken(value.trim());
}

export function formatConfidenceWithPercent(
  confidence: RecommendationConfidence,
  score: number,
): { label: string; percent: string } {
  return {
    label: formatConfidenceLabel(confidence),
    percent: formatPlanningScore(score),
  };
}

export function formatConfidenceLabel(confidence: RecommendationConfidence): string {
  switch (confidence) {
    case "very_high":
      return "Very High";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    default:
      return "Low";
  }
}

export function formatPlanningScore(score: number): string {
  return `${Math.round(Math.min(1, Math.max(0, score)) * 100)}%`;
}

export function formatImportanceLabel(score: number): string {
  if (score >= 0.85) {
    return "Critical";
  }
  if (score >= 0.68) {
    return "High";
  }
  if (score >= 0.48) {
    return "Medium";
  }
  return "Low";
}

/** Converts validator repair suggestions into positive improvement language. */
export function formatImprovementSuggestion(suggestion: AssetRepairSuggestion): string {
  const mapped = POSITIVE_SUGGESTION_BY_MESSAGE[suggestion.message.trim()];
  if (mapped) {
    return mapped;
  }

  const categoryFallback = POSITIVE_SUGGESTION_BY_CATEGORY[suggestion.category];
  if (categoryFallback) {
    return categoryFallback;
  }

  return suggestion.message
    .replace(/^avoid\s+/i, "Reduce ")
    .replace(/^replace\s+/i, "Add ")
    .replace(/^improve\s+/i, "Strengthen ")
    .replace(/^recommend\s+/i, "Include ")
    .replace(/^use\s+/i, "Include ")
    .replace(/^increase\s+/i, "Add ")
    .replace(/^surface\s+/i, "Include ")
    .replace(/^rotate\s+/i, "Diversify ")
    .replace(/^introduce\s+/i, "Include ")
    .replace(/^strengthen\s+/i, "Include ")
    .replace(/\.$/, "");
}
