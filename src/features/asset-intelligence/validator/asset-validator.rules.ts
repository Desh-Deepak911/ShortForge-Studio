import type {
  AssetValidationRuleResult,
  AssetValidationWarningType,
  AssetValidatorContext,
  AssetValidatorInput,
} from "./asset-validator.types";
import {
  clampValidatorScore,
  computeAverageQueryQuality,
  computeConfidenceConsistency,
  computeDuplicateQueryRatio,
  computeEntityCoverageScore,
  computeProviderCapabilityConsistency,
  computeVisualDiversityScore,
  detectBiographyArcPhases,
  isBiographyFixture,
  isCountdownFixture,
  isDebateFixture,
  isHistoricalScene,
  isPortraitScene,
  isTacticalScene,
} from "./asset-validator.utils";

const CONFIDENCE_RANK: Record<string, number> = {
  very_high: 1,
  high: 0.85,
  medium: 0.65,
  low: 0.35,
};

function rule(
  ruleId: AssetValidationRuleResult["ruleId"],
  score: number,
  message: string,
  warningType: AssetValidationWarningType,
  passThreshold = 0.6,
): AssetValidationRuleResult {
  const normalized = clampValidatorScore(score);

  return {
    ruleId,
    passed: normalized >= passThreshold,
    score: normalized,
    message: normalized >= passThreshold ? undefined : message,
    warningType: normalized >= passThreshold ? undefined : warningType,
  };
}

export function evaluateEverySceneHasRecommendationsRule(
  input: AssetValidatorInput,
  context: AssetValidatorContext,
): AssetValidationRuleResult {
  if (context.eligibleSceneIndexes.length === 0) {
    return rule(
      "every_scene_has_recommendations",
      1,
      "",
      "coverage",
      0.6,
    );
  }

  const covered = context.eligibleSceneIndexes.filter((index) =>
    Boolean(input.recommendation.sceneRecommendations[index]?.topRecommendation),
  ).length;

  return rule(
    "every_scene_has_recommendations",
    covered / context.eligibleSceneIndexes.length,
    "Every eligible scene should have a ranked asset recommendation.",
    "coverage",
    0.9,
  );
}

export function evaluatePrimaryRecommendationExistsRule(
  input: AssetValidatorInput,
  context: AssetValidatorContext,
): AssetValidationRuleResult {
  const scenes = context.eligibleSceneIndexes.map(
    (index) => input.recommendation.sceneRecommendations[index],
  );

  if (scenes.length === 0) {
    return rule("primary_recommendation_exists", 1, "", "coverage");
  }

  const withPrimary = scenes.filter((scene) => Boolean(scene?.topRecommendation?.query)).length;
  return rule(
    "primary_recommendation_exists",
    withPrimary / scenes.length,
    "Primary recommendation query should exist for every eligible scene.",
    "coverage",
    0.9,
  );
}

export function evaluateProviderSelectedRule(input: AssetValidatorInput): AssetValidationRuleResult {
  const eligible = input.providerPlan.sceneResults.filter((scene) => scene.query);
  if (eligible.length === 0) {
    return rule("provider_selected", 1, "", "provider");
  }

  const covered = eligible.filter((scene) => scene.primaryProvider).length;
  return rule(
    "provider_selected",
    covered / eligible.length,
    "Every recommended scene should have a selected provider.",
    "provider",
    0.9,
  );
}

export function evaluateRecommendationConfidenceRule(
  input: AssetValidatorInput,
  context: AssetValidatorContext,
): AssetValidationRuleResult {
  const scenes = context.eligibleSceneIndexes
    .map((index) => input.recommendation.sceneRecommendations[index])
    .filter(Boolean);

  if (scenes.length === 0) {
    return rule("recommendation_confidence", 1, "", "confidence");
  }

  const total = scenes.reduce((sum, scene) => sum + (CONFIDENCE_RANK[scene.confidence] ?? 0.5), 0);
  return rule(
    "recommendation_confidence",
    total / scenes.length,
    "Recommendation confidence should stay medium or higher across eligible scenes.",
    "confidence",
    0.55,
  );
}

export function evaluateEntityCoverageRule(input: AssetValidatorInput): AssetValidationRuleResult {
  return rule(
    "entity_coverage",
    computeEntityCoverageScore(input),
    "Important entities should appear in scene recommendations.",
    "entity",
    0.55,
  );
}

export function evaluateVisualDiversityRule(input: AssetValidatorInput): AssetValidationRuleResult {
  const diversityScore = computeVisualDiversityScore(input);
  const warningPenalty = Math.min(0.2, input.assetIntelligence.diversityPlan.warnings.length * 0.05);

  return rule(
    "visual_diversity",
    clampValidatorScore(diversityScore - warningPenalty),
    "Visual diversity should avoid repeated primary entities and intents.",
    "diversity",
    0.45,
  );
}

export function evaluateProviderDiversityRule(input: AssetValidatorInput): AssetValidationRuleResult {
  const counts = input.providerPlan.diagnostics.recommendedProviderCounts;
  const values = Object.values(counts);
  if (values.length === 0) {
    return rule("provider_diversity", 0, "No providers were selected.", "provider");
  }

  const total = values.reduce((sum, count) => sum + count, 0);
  const maxShare = Math.max(...values) / total;
  return rule(
    "provider_diversity",
    clampValidatorScore(1 - maxShare * 0.75),
    "Provider diversity should avoid over-reliance on one catalog.",
    "provider",
    0.35,
  );
}

export function evaluateHistoricalProviderMatchRule(
  input: AssetValidatorInput,
): AssetValidationRuleResult {
  const historicalScenes = input.providerPlan.sceneResults.filter((scene) =>
    isHistoricalScene(input, scene.sceneIndex),
  );

  if (historicalScenes.length === 0) {
    return rule("historical_provider_match", 1, "", "provider");
  }

  const matched = historicalScenes.filter((scene) => {
    const providerId = scene.primaryProvider?.providerId;
    return providerId === "wikimedia" || providerId === "internal_library" || providerId === "pexels";
  }).length;

  return rule(
    "historical_provider_match",
    matched / historicalScenes.length,
    "Historical scenes should use historical-capable providers.",
    "provider",
    0.75,
  );
}

export function evaluateTacticalProviderPreferenceRule(
  input: AssetValidatorInput,
): AssetValidationRuleResult {
  const tacticalScenes = input.providerPlan.sceneResults.filter((scene) =>
    isTacticalScene(input, scene.sceneIndex),
  );

  if (tacticalScenes.length === 0) {
    return rule("tactical_provider_preference", 1, "", "tactical");
  }

  const matched = tacticalScenes.filter((scene) => {
    const providerId = scene.primaryProvider?.providerId;
    return providerId === "ai_generated" || providerId === "internal_library" || providerId === "pixabay";
  }).length;

  return rule(
    "tactical_provider_preference",
    matched / tacticalScenes.length,
    "Tactical scenes should prefer tactical or generated providers.",
    "tactical",
    0.75,
  );
}

export function evaluatePortraitAssetMatchRule(input: AssetValidatorInput): AssetValidationRuleResult {
  const portraitScenes = input.providerPlan.sceneResults.filter((scene) =>
    isPortraitScene(input, scene.sceneIndex),
  );

  if (portraitScenes.length === 0) {
    return rule("portrait_asset_match", 1, "", "portrait");
  }

  const matched = portraitScenes.filter((scene) => {
    const providerId = scene.primaryProvider?.providerId;
    return (
      providerId === "unsplash" ||
      providerId === "pexels" ||
      providerId === "internal_library" ||
      providerId === "ai_generated"
    );
  }).length;

  const queryMatched = portraitScenes.filter((scene) => {
    const query = scene.query?.toLowerCase() ?? "";
    return query.includes("portrait") || query.includes("headshot") || query.includes("close-up");
  }).length;

  return rule(
    "portrait_asset_match",
    clampValidatorScore(matched / portraitScenes.length * 0.65 + queryMatched / portraitScenes.length * 0.35),
    "Portrait scenes should recommend portrait assets and portrait-capable providers.",
    "portrait",
    0.6,
  );
}

export function evaluateCountdownAssetVarietyRule(input: AssetValidatorInput): AssetValidationRuleResult {
  if (!isCountdownFixture(input)) {
    return rule("countdown_asset_variety", 1, "", "diversity");
  }

  const duplicateRatio = computeDuplicateQueryRatio(input);
  const visualIntents = new Set(
    input.recommendation.sceneRecommendations
      .map((scene) => scene.topRecommendation?.visualIntent)
      .filter(Boolean),
  );

  const intentScore = input.recommendation.sceneRecommendations.length
    ? visualIntents.size / input.recommendation.sceneRecommendations.length
    : 1;

  return rule(
    "countdown_asset_variety",
    clampValidatorScore((1 - duplicateRatio) * 0.7 + intentScore * 0.3),
    "Countdown scenes should avoid repeated assets across ranks.",
    "duplicate",
    0.55,
  );
}

export function evaluateDebateBothSidesRule(input: AssetValidatorInput): AssetValidationRuleResult {
  if (!isDebateFixture(input)) {
    return rule("debate_both_sides", 1, "", "comparison");
  }

  const playerEntities = input.assetIntelligence.entities.filter((entity) => entity.type === "player");
  if (playerEntities.length < 2) {
    return rule("debate_both_sides", 0.7, "Debate fixture should include two player entities.", "comparison");
  }

  const coveredNames = new Set<string>();
  for (const scene of input.recommendation.sceneRecommendations) {
    const names = scene.topRecommendation?.entityNames ?? [];
    for (const name of names) {
      coveredNames.add(name.toLowerCase());
    }
  }

  const sidesCovered = playerEntities.filter((entity) =>
    [...coveredNames].some((name) => name.includes(entity.name.toLowerCase()) || entity.name.toLowerCase().includes(name)),
  ).length;

  const comparisonScenes = input.recommendation.sceneRecommendations.filter(
    (scene) =>
      scene.topRecommendation?.visualIntent === "comparison_split" ||
      scene.topRecommendation?.tags.includes("debate") ||
      scene.topRecommendation?.tags.includes("comparison"),
  ).length;

  const sideScore = sidesCovered / playerEntities.length;
  const comparisonScore = comparisonScenes > 0 ? 1 : 0.45;

  return rule(
    "debate_both_sides",
    clampValidatorScore(sideScore * 0.7 + comparisonScore * 0.3),
    "Debate scenes should recommend both sides with comparison coverage.",
    "comparison",
    0.65,
  );
}

export function evaluateBiographyArcCoverageRule(input: AssetValidatorInput): AssetValidationRuleResult {
  if (!isBiographyFixture(input)) {
    return rule("biography_arc_coverage", 1, "", "arc");
  }

  const phases = detectBiographyArcPhases(input);
  return rule(
    "biography_arc_coverage",
    phases.size / 4,
    "Biography should cover origin, rise, peak, and legacy beats.",
    "arc",
    0.5,
  );
}

export function evaluateQueryQualityRule(input: AssetValidatorInput): AssetValidationRuleResult {
  return rule(
    "query_quality",
    computeAverageQueryQuality(input),
    "Top recommendation queries should stay entity-focused and human-readable.",
    "query",
    0.5,
  );
}

export function evaluateDuplicateRecommendationsRule(
  input: AssetValidatorInput,
): AssetValidationRuleResult {
  const duplicateRatio = computeDuplicateQueryRatio(input);
  const duplicateCount = input.recommendation.diagnostics.duplicateTopQueryCount;

  const score =
    duplicateCount === 0
      ? clampValidatorScore(1 - duplicateRatio)
      : clampValidatorScore(Math.max(0, 1 - duplicateCount * 0.18 - duplicateRatio));

  return rule(
    "duplicate_recommendations",
    score,
    "Duplicate top recommendations should be flagged for replacement.",
    "duplicate",
    duplicateCount === 0 ? 0.75 : 0.85,
  );
}

export function evaluateUnusedImportantEntitiesRule(
  input: AssetValidatorInput,
): AssetValidationRuleResult {
  const unused = input.recommendation.unusedEntities;
  if (unused.length === 0) {
    return rule("unused_important_entities", 1, "", "entity");
  }

  const importantUnused = unused.filter((entity) =>
    ["player", "club", "award", "tournament", "national_team"].includes(entity.type),
  ).length;

  const score = clampValidatorScore(1 - importantUnused / Math.max(input.assetIntelligence.entities.length, 1));
  return rule(
    "unused_important_entities",
    score,
    "Important entities should not remain unused in recommendations.",
    "entity",
    importantUnused === 0 ? 0.6 : 0.75,
  );
}

export function evaluateConfidenceConsistencyRule(input: AssetValidatorInput): AssetValidationRuleResult {
  return rule(
    "confidence_consistency",
    computeConfidenceConsistency(input),
    "Recommendation confidence should stay consistent across scenes.",
    "confidence",
    0.55,
  );
}

export function evaluateProviderCapabilityConsistencyRule(
  input: AssetValidatorInput,
): AssetValidationRuleResult {
  return rule(
    "provider_capability_consistency",
    computeProviderCapabilityConsistency(input),
    "Selected providers should satisfy required capabilities for each scene.",
    "capability",
    0.9,
  );
}

/** Evaluates all asset validation rules against planning output. */
export function evaluateAllAssetValidationRules(
  input: AssetValidatorInput,
  context: AssetValidatorContext,
): AssetValidationRuleResult[] {
  return [
    evaluateEverySceneHasRecommendationsRule(input, context),
    evaluatePrimaryRecommendationExistsRule(input, context),
    evaluateProviderSelectedRule(input),
    evaluateRecommendationConfidenceRule(input, context),
    evaluateEntityCoverageRule(input),
    evaluateVisualDiversityRule(input),
    evaluateProviderDiversityRule(input),
    evaluateHistoricalProviderMatchRule(input),
    evaluateTacticalProviderPreferenceRule(input),
    evaluatePortraitAssetMatchRule(input),
    evaluateCountdownAssetVarietyRule(input),
    evaluateDebateBothSidesRule(input),
    evaluateBiographyArcCoverageRule(input),
    evaluateQueryQualityRule(input),
    evaluateDuplicateRecommendationsRule(input),
    evaluateUnusedImportantEntitiesRule(input),
    evaluateConfidenceConsistencyRule(input),
    evaluateProviderCapabilityConsistencyRule(input),
  ];
}
