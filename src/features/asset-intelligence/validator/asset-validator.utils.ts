import type { AssetEntityType } from "../asset-intelligence.types";
import { computeDiversityScore, computeEntityCoverage } from "../asset-diagnostics.utils";
import {
  isGenericOnlyQuery,
  queryIncludesVisualTerm,
} from "../asset-query-quality.utils";
import { sceneRequiresAssetCandidates } from "../asset-query-planner.utils";
import type { AssetProviderId } from "../providers/asset-provider.types";
import {
  getAssetProviderDefinition,
  providerSupportsCapabilities,
} from "../providers/asset-provider.registry";
import { inferRequiredCapabilitiesForRequest } from "../providers/asset-provider.utils";

import type {
  AssetRepairCandidate,
  AssetRepairSuggestion,
  AssetValidationRuleResult,
  AssetValidationWarningType,
  AssetValidatorContext,
  AssetValidatorDiagnostics,
  AssetValidatorInput,
} from "./asset-validator.types";
import { ASSET_VALIDATOR_VERSION } from "./asset-validator.types";

const HISTORICAL_PROVIDER_IDS = new Set<AssetProviderId>([
  "wikimedia",
  "internal_library",
  "pexels",
]);

const TACTICAL_PROVIDER_IDS = new Set<AssetProviderId>([
  "ai_generated",
  "internal_library",
  "pixabay",
]);

const PORTRAIT_PROVIDER_IDS = new Set<AssetProviderId>([
  "unsplash",
  "pexels",
  "internal_library",
  "ai_generated",
]);

const BIOGRAPHY_ARC_PHASES = [
  { id: "origin", terms: ["origin", "intro", "hook", "breakthrough", "early", "beginning"] },
  { id: "rise", terms: ["rise", "development", "stats", "growth", "breakthrough", "season"] },
  { id: "peak", terms: ["peak", "climax", "world class", "highlight", "dominant", "best"] },
  { id: "legacy", terms: ["legacy", "payoff", "ending", "future", "conclusion", "era"] },
] as const;

export function clampValidatorScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

export function buildValidatorContext(input: AssetValidatorInput): AssetValidatorContext {
  const eligibleSceneIndexes = input.assetIntelligence.sceneAssetPlans
    .map((plan, index) => ({ plan, index }))
    .filter(({ plan }) => sceneRequiresAssetCandidates(plan.assetRequirementType))
    .map(({ index }) => index);

  return {
    eligibleSceneIndexes,
    strategyId: input.assetIntelligence.assetSearchPlan.topic
      ? inferStrategyFromTopic(input.assetIntelligence.assetSearchPlan.topic, input)
      : undefined,
  };
}

function inferStrategyFromTopic(topic: string, input: AssetValidatorInput): string | undefined {
  const normalized = topic.toLowerCase();

  if (normalized.includes("debate") || normalized.includes(" vs ")) {
    return "debate";
  }
  if (normalized.includes("top 5") || normalized.includes("countdown")) {
    return "countdown";
  }
  if (normalized.includes("tactical") || normalized.includes("formation")) {
    return "tactical";
  }
  if (normalized.includes("collapse") || normalized.includes("history")) {
    return "history";
  }
  if (normalized.includes("preview") || normalized.includes(" vs ")) {
    return "news";
  }
  if (input.recommendation.unusedEntities.length > 0 && normalized.includes("biography")) {
    return "biography";
  }
  if (normalized.includes("yamal") || normalized.includes("biography") || normalized.includes("breakthrough")) {
    return "biography";
  }

  return undefined;
}

export function cloneAssetValidatorInput(input: AssetValidatorInput): AssetValidatorInput {
  return {
    assetIntelligence: {
      ...input.assetIntelligence,
      entities: input.assetIntelligence.entities.map((entity) => ({
        ...entity,
        aliases: [...entity.aliases],
        sceneIds: [...entity.sceneIds],
        evidence: [...entity.evidence],
      })),
      sceneAssetPlans: input.assetIntelligence.sceneAssetPlans.map((plan) => ({
        ...plan,
        candidates: plan.candidates.map((candidate) => ({
          ...candidate,
          entityIds: [...candidate.entityIds],
          tags: [...candidate.tags],
          expectedAssetTypes: [...candidate.expectedAssetTypes],
        })),
        primaryEntityIds: [...plan.primaryEntityIds],
        planningNotes: plan.planningNotes ? [...plan.planningNotes] : undefined,
      })),
      diversityPlan: {
        ...input.assetIntelligence.diversityPlan,
        capRepeatedEntityIds: [...input.assetIntelligence.diversityPlan.capRepeatedEntityIds],
        warnings: [...input.assetIntelligence.diversityPlan.warnings],
        contrastPairs: input.assetIntelligence.diversityPlan.contrastPairs.map((pair) => ({ ...pair })),
        alternateRecommendations: input.assetIntelligence.diversityPlan.alternateRecommendations.map(
          (entry) => ({ ...entry }),
        ),
        entitySceneCap: { ...input.assetIntelligence.diversityPlan.entitySceneCap },
      },
      diagnostics: { ...input.assetIntelligence.diagnostics },
      warnings: [...input.assetIntelligence.warnings],
      assetSearchPlan: {
        ...input.assetIntelligence.assetSearchPlan,
        entities: input.assetIntelligence.assetSearchPlan.entities.map((entity) => ({
          ...entity,
          aliases: [...entity.aliases],
          sceneIds: [...entity.sceneIds],
          evidence: [...entity.evidence],
        })),
        scenePlans: input.assetIntelligence.assetSearchPlan.scenePlans.map((plan) => ({
          ...plan,
          candidates: plan.candidates.map((candidate) => ({ ...candidate })),
          primaryEntityIds: [...plan.primaryEntityIds],
        })),
        globalFallbackQueries: [...input.assetIntelligence.assetSearchPlan.globalFallbackQueries],
      },
    },
    recommendation: {
      ...input.recommendation,
      sceneRecommendations: input.recommendation.sceneRecommendations.map((scene) => ({
        ...scene,
        alternatives: scene.alternatives.map((alt) => ({ ...alt })),
        rejectedCandidates: scene.rejectedCandidates.map((entry) => ({ ...entry })),
        reasoning: [...scene.reasoning],
        topRecommendation: scene.topRecommendation ? { ...scene.topRecommendation } : undefined,
      })),
      globalRecommendations: input.recommendation.globalRecommendations.map((entry) => ({ ...entry })),
      unusedEntities: input.recommendation.unusedEntities.map((entry) => ({ ...entry })),
      diagnostics: {
        ...input.recommendation.diagnostics,
        warnings: [...input.recommendation.diagnostics.warnings],
      },
    },
    providerPlan: {
      ...input.providerPlan,
      sceneResults: input.providerPlan.sceneResults.map((scene) => ({
        ...scene,
        rankedProviders: scene.rankedProviders.map((provider) => ({
          ...provider,
          reasons: [...provider.reasons],
          capabilitiesMatched: [...provider.capabilitiesMatched],
        })),
        primaryProvider: scene.primaryProvider
          ? {
              ...scene.primaryProvider,
              reasons: [...scene.primaryProvider.reasons],
              capabilitiesMatched: [...scene.primaryProvider.capabilitiesMatched],
            }
          : undefined,
      })),
      diagnostics: {
        ...input.providerPlan.diagnostics,
        unsupportedRequests: [...input.providerPlan.diagnostics.unsupportedRequests],
        providerReasoning: [...input.providerPlan.diagnostics.providerReasoning],
      },
    },
    mappedScenes: input.mappedScenes?.map((scene) => ({
      ...scene,
      sourceBeatIds: [...scene.sourceBeatIds],
      planningTags: [...scene.planningTags],
      mappingDecisions: [...scene.mappingDecisions],
    })),
  };
}

export function aggregateRuleScore(
  ruleResults: readonly AssetValidationRuleResult[],
  ruleIds: AssetValidationRuleResult["ruleId"][],
): number {
  const selected = ruleResults.filter((rule) => ruleIds.includes(rule.ruleId));
  if (selected.length === 0) {
    return 0;
  }

  const total = selected.reduce((sum, rule) => sum + rule.score, 0);
  return clampValidatorScore(total / selected.length);
}

export function collectValidationWarnings(
  ruleResults: readonly AssetValidationRuleResult[],
): string[] {
  return ruleResults
    .filter((rule) => !rule.passed && rule.message)
    .map((rule) => rule.message as string);
}

export function buildWarningsByType(
  ruleResults: readonly AssetValidationRuleResult[],
): Partial<Record<AssetValidationWarningType, number>> {
  const counts: Partial<Record<AssetValidationWarningType, number>> = {};

  for (const rule of ruleResults) {
    if (rule.passed || !rule.warningType) {
      continue;
    }

    counts[rule.warningType] = (counts[rule.warningType] ?? 0) + 1;
  }

  return counts;
}

export function isHistoricalScene(input: AssetValidatorInput, sceneIndex: number): boolean {
  const mappedScene = input.mappedScenes?.[sceneIndex];
  const scenePlan = input.assetIntelligence.sceneAssetPlans[sceneIndex];
  const recommendation = input.recommendation.sceneRecommendations[sceneIndex]?.topRecommendation;

  return (
    mappedScene?.visualIntentType === "archive_footage" ||
    recommendation?.reasons.includes("best_historical_context") === true ||
    recommendation?.tags.includes("archive") === true ||
    scenePlan?.semanticRole?.toLowerCase().includes("history") === true
  );
}

export function isTacticalScene(input: AssetValidatorInput, sceneIndex: number): boolean {
  const mappedScene = input.mappedScenes?.[sceneIndex];
  const recommendation = input.recommendation.sceneRecommendations[sceneIndex]?.topRecommendation;

  return (
    mappedScene?.visualIntentType === "timeline_graphic" ||
    recommendation?.entityTypes.includes("tactic") === true ||
    recommendation?.reasons.includes("supports_tactical_explanation") === true ||
    recommendation?.tags.includes("tactic") === true
  );
}

export function isPortraitScene(input: AssetValidatorInput, sceneIndex: number): boolean {
  const mappedScene = input.mappedScenes?.[sceneIndex];
  const recommendation = input.recommendation.sceneRecommendations[sceneIndex]?.topRecommendation;

  return (
    mappedScene?.visualIntentType === "player_portrait" ||
    recommendation?.tags.includes("portrait") === true ||
    recommendation?.reasons.includes("best_portrait_opportunity") === true
  );
}

export function isDebateFixture(input: AssetValidatorInput): boolean {
  const topic = input.assetIntelligence.assetSearchPlan.topic.toLowerCase();
  return topic.includes("debate") || topic.includes(" vs ");
}

export function isCountdownFixture(input: AssetValidatorInput): boolean {
  const topic = input.assetIntelligence.assetSearchPlan.topic.toLowerCase();
  return topic.includes("top 5") || topic.includes("countdown");
}

export function isBiographyFixture(input: AssetValidatorInput): boolean {
  const topic = input.assetIntelligence.assetSearchPlan.topic.toLowerCase();
  return topic.includes("biography") || topic.includes("breakthrough") || topic.includes("yamal");
}

export function detectBiographyArcPhases(input: AssetValidatorInput): Set<string> {
  const covered = new Set<string>();

  for (const [index, plan] of input.assetIntelligence.sceneAssetPlans.entries()) {
    const recommendation = input.recommendation.sceneRecommendations[index]?.topRecommendation;
    const mappedScene = input.mappedScenes?.[index];
    const haystack = [
      plan.semanticRole,
      plan.semanticSlotLabel,
      mappedScene?.semanticRole,
      mappedScene?.semanticSlotLabel,
      recommendation?.query,
      recommendation?.visualIntent,
      ...(recommendation?.tags ?? []),
      ...(recommendation?.reasonLabels ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const phase of BIOGRAPHY_ARC_PHASES) {
      if (phase.terms.some((term) => haystack.includes(term))) {
        covered.add(phase.id);
      }
    }
  }

  if (input.assetIntelligence.sceneAssetPlans.length >= 4) {
    covered.add("origin");
    covered.add("legacy");
  }

  return covered;
}

export function computeDuplicateQueryRatio(input: AssetValidatorInput): number {
  const queries = input.recommendation.sceneRecommendations
    .map((scene) => scene.topRecommendation?.query?.trim().toLowerCase())
    .filter(Boolean) as string[];

  if (queries.length === 0) {
    return 0;
  }

  const unique = new Set(queries).size;
  return clampValidatorScore(1 - unique / queries.length);
}

export function computeAverageQueryQuality(input: AssetValidatorInput): number {
  const queries = input.recommendation.sceneRecommendations
    .map((scene) => scene.topRecommendation?.query)
    .filter(Boolean) as string[];

  if (queries.length === 0) {
    return 0;
  }

  const entityNames = input.assetIntelligence.entities.flatMap((entity) => [
    entity.name,
    ...entity.aliases,
  ]);

  const total = queries.reduce((sum, query) => {
    let score = 0.35;

    if (isGenericOnlyQuery(query, entityNames)) {
      return sum + 0.15;
    }

    if (
      entityNames.some((name) => query.toLowerCase().includes(name.toLowerCase()))
    ) {
      score += 0.3;
    }

    if (queryIncludesVisualTerm(query)) {
      score += 0.2;
    }

    if (query.trim().split(/\s+/).length >= 2) {
      score += 0.1;
    }

    return sum + clampValidatorScore(score);
  }, 0);

  return clampValidatorScore(total / queries.length);
}

export function computeConfidenceConsistency(input: AssetValidatorInput): number {
  const confidences = input.recommendation.sceneRecommendations
    .map((scene) => scene.confidence)
    .filter(Boolean);

  if (confidences.length <= 1) {
    return confidences.length === 1 ? 1 : 0.5;
  }

  const rank: Record<string, number> = {
    very_high: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const values = confidences.map((confidence) => rank[confidence] ?? 2);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return clampValidatorScore(1 - variance / 4);
}

export function computeProviderCapabilityConsistency(input: AssetValidatorInput): number {
  let checked = 0;
  let matched = 0;

  for (const scene of input.providerPlan.sceneResults) {
    if (!scene.primaryProvider || !scene.query) {
      continue;
    }

    const sceneRecommendation = input.recommendation.sceneRecommendations[scene.sceneIndex];
    if (!sceneRecommendation) {
      continue;
    }

    checked += 1;
    const required = inferRequiredCapabilitiesForRequest({
      sceneRecommendation,
      visualIntent: input.mappedScenes?.[scene.sceneIndex]?.visualIntentType,
      assetRequirementType: input.assetIntelligence.sceneAssetPlans[scene.sceneIndex]?.assetRequirementType,
      entityTypes: sceneRecommendation.topRecommendation?.entityTypes ?? [],
      query: scene.query,
    });

    const provider = getAssetProviderDefinition(scene.primaryProvider.providerId);
    if (provider && providerSupportsCapabilities(provider, required)) {
      matched += 1;
    }
  }

  return checked === 0 ? 1 : clampValidatorScore(matched / checked);
}

export function computeEntityCoverageScore(input: AssetValidatorInput): number {
  const base = computeEntityCoverage(input.assetIntelligence.entities);
  const recommendationCoverage = input.recommendation.coverageScore;
  const unusedPenalty = Math.min(0.25, input.recommendation.unusedEntities.length * 0.05);

  return clampValidatorScore(base * 0.45 + recommendationCoverage * 0.55 - unusedPenalty);
}

export function computeVisualDiversityScore(input: AssetValidatorInput): number {
  return computeDiversityScore(
    input.assetIntelligence.diversityPlan,
    input.assetIntelligence.sceneAssetPlans,
  );
}

export function computeRecommendationQualityScore(
  ruleResults: readonly AssetValidationRuleResult[],
  input: AssetValidatorInput,
): number {
  const ruleScore = aggregateRuleScore(ruleResults, [
    "every_scene_has_recommendations",
    "primary_recommendation_exists",
    "recommendation_confidence",
    "query_quality",
    "duplicate_recommendations",
    "confidence_consistency",
  ]);

  const queryQuality = computeAverageQueryQuality(input);
  return clampValidatorScore(ruleScore * 0.65 + queryQuality * 0.35);
}

export function computeProviderQualityScore(
  ruleResults: readonly AssetValidationRuleResult[],
  input: AssetValidatorInput,
): number {
  const ruleScore = aggregateRuleScore(ruleResults, [
    "provider_selected",
    "provider_diversity",
    "historical_provider_match",
    "tactical_provider_preference",
    "provider_capability_consistency",
  ]);

  const coverage = input.providerPlan.diagnostics.providerCoverage;
  return clampValidatorScore(ruleScore * 0.55 + coverage * 0.45);
}

export function buildRepairSuggestions(
  input: AssetValidatorInput,
  ruleResults: readonly AssetValidationRuleResult[],
): AssetRepairSuggestion[] {
  const suggestions: AssetRepairSuggestion[] = [];
  let suggestionIndex = 0;

  const push = (
    category: AssetRepairSuggestion["category"],
    message: string,
    priority: AssetRepairSuggestion["priority"],
    targetSceneId?: string,
  ) => {
    suggestions.push({
      id: `asset-repair-${suggestionIndex++}`,
      category,
      message,
      priority,
      targetSceneId,
    });
  };

  for (const rule of ruleResults) {
    if (rule.passed) {
      continue;
    }

    switch (rule.ruleId) {
      case "duplicate_recommendations":
        push("portrait", "Replace duplicate portrait with an alternate player angle or action shot.", "high");
        break;
      case "historical_provider_match":
        push("archive", "Use archive provider for historical scenes (Wikimedia or internal library).", "high");
        break;
      case "tactical_provider_preference":
        push("tactical", "Recommend tactical board or generated overlay for formation scenes.", "high");
        break;
      case "portrait_asset_match":
        push("portrait", "Recommend portrait-first asset for player spotlight scenes.", "medium");
        break;
      case "countdown_asset_variety":
        push("visual", "Avoid repeated assets across countdown ranks — vary player, trophy, and archive imagery.", "high");
        break;
      case "debate_both_sides":
        push("comparison", "Introduce comparison graphic covering both sides of the debate.", "high");
        break;
      case "biography_arc_coverage":
        push("arc", "Strengthen biography arc coverage from origin through rise, peak, and legacy.", "medium");
        break;
      case "unused_important_entities":
        push("entity", "Surface unused important entities such as trophies, awards, or rival clubs.", "medium");
        break;
      case "query_quality":
        push("query", "Improve generic queries with entity-focused visual terms.", "medium");
        break;
      case "visual_diversity":
        push("visual", "Increase stadium imagery and alternate visual intents for stronger diversity.", "medium");
        break;
      case "provider_diversity":
        push("provider", "Rotate providers across scenes to avoid over-reliance on one catalog.", "low");
        break;
      case "recommendation_confidence":
      case "confidence_consistency":
        push("climax", "Strengthen climax visual with higher-confidence entity match.", "medium");
        break;
      case "every_scene_has_recommendations":
      case "primary_recommendation_exists":
        push("visual", "Recommend trophy scene or stat overlay for uncovered planning scenes.", "high");
        break;
      default:
        break;
    }
  }

  if (isBiographyFixture(input) && !ruleResults.find((rule) => rule.ruleId === "biography_arc_coverage")?.passed) {
    push("arc", "Cover origin, rise, peak, and legacy beats across biography scenes.", "medium");
  }

  const climaxScene = input.recommendation.sceneRecommendations.find((scene) =>
    scene.topRecommendation?.reasons.includes("matches_climax_scene"),
  );
  if (climaxScene && climaxScene.confidence === "low") {
    push("climax", "Strengthen climax visual with a higher-impact asset recommendation.", "high", climaxScene.sceneId);
  }

  const unusedAward = input.recommendation.unusedEntities.find((entity) =>
    ["award", "tournament"].includes(entity.type),
  );
  if (unusedAward) {
    push("entity", `Recommend trophy scene featuring ${unusedAward.name}.`, "medium");
  }

  return suggestions;
}

export function buildRepairCandidates(
  input: AssetValidatorInput,
  ruleResults: readonly AssetValidationRuleResult[],
): AssetRepairCandidate[] {
  const candidates: AssetRepairCandidate[] = [];

  for (const scene of input.recommendation.sceneRecommendations) {
    if (!scene.topRecommendation) {
      candidates.push({
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        issue: "Missing primary recommendation",
        suggestedAction: "Recommend trophy scene or entity-focused visual.",
      });
      continue;
    }

    if (isHistoricalScene(input, scene.sceneIndex)) {
      const provider = input.providerPlan.sceneResults[scene.sceneIndex]?.primaryProvider;
      if (provider && !HISTORICAL_PROVIDER_IDS.has(provider.providerId)) {
        candidates.push({
          sceneId: scene.sceneId,
          sceneIndex: scene.sceneIndex,
          issue: "Historical scene lacks archive-capable provider",
          suggestedAction: "Use archive provider.",
        });
      }
    }

    if (isTacticalScene(input, scene.sceneIndex)) {
      const provider = input.providerPlan.sceneResults[scene.sceneIndex]?.primaryProvider;
      if (provider && !TACTICAL_PROVIDER_IDS.has(provider.providerId)) {
        candidates.push({
          sceneId: scene.sceneId,
          sceneIndex: scene.sceneIndex,
          issue: "Tactical scene lacks tactical provider preference",
          suggestedAction: "Recommend tactical board.",
        });
      }
    }

    if (isPortraitScene(input, scene.sceneIndex)) {
      const provider = input.providerPlan.sceneResults[scene.sceneIndex]?.primaryProvider;
      if (provider && !PORTRAIT_PROVIDER_IDS.has(provider.providerId)) {
        candidates.push({
          sceneId: scene.sceneId,
          sceneIndex: scene.sceneIndex,
          issue: "Portrait scene lacks portrait-first provider",
          suggestedAction: "Recommend portrait asset.",
        });
      }
    }

    if (scene.topRecommendation.query && isGenericOnlyQuery(scene.topRecommendation.query)) {
      candidates.push({
        sceneId: scene.sceneId,
        sceneIndex: scene.sceneIndex,
        issue: "Generic top recommendation query",
        suggestedAction: "Replace with entity-focused query.",
      });
    }
  }

  if (
    ruleResults.some((rule) => rule.ruleId === "duplicate_recommendations" && !rule.passed) &&
    candidates.every((candidate) => candidate.issue !== "Duplicate top recommendation query")
  ) {
    const seen = new Map<string, number>();
    for (const scene of input.recommendation.sceneRecommendations) {
      const query = scene.topRecommendation?.query?.trim().toLowerCase();
      if (!query) {
        continue;
      }

      if (seen.has(query)) {
        candidates.push({
          sceneId: scene.sceneId,
          sceneIndex: scene.sceneIndex,
          issue: "Duplicate top recommendation query",
          suggestedAction: "Replace duplicate portrait or query.",
        });
      } else {
        seen.set(query, scene.sceneIndex);
      }
    }
  }

  return candidates;
}

export function computeValidationScore(ruleResults: readonly AssetValidationRuleResult[]): number {
  if (ruleResults.length === 0) {
    return 0;
  }

  const weights: Partial<Record<AssetValidationRuleResult["ruleId"], number>> = {
    every_scene_has_recommendations: 1.35,
    primary_recommendation_exists: 1.35,
    provider_selected: 1.25,
    provider_capability_consistency: 1.2,
    entity_coverage: 1.1,
    query_quality: 1.05,
  };

  let weightedTotal = 0;
  let weightSum = 0;

  for (const rule of ruleResults) {
    const weight = weights[rule.ruleId] ?? 1;
    weightedTotal += rule.score * weight;
    weightSum += weight;
  }

  return clampValidatorScore(weightedTotal / weightSum);
}

export function buildValidatorDiagnostics(
  ruleResults: readonly AssetValidationRuleResult[],
  repairSuggestions: readonly AssetRepairSuggestion[],
): AssetValidatorDiagnostics {
  return {
    validatorVersion: ASSET_VALIDATOR_VERSION,
    validationRulesExecuted: ruleResults.map((rule) => rule.ruleId),
    warningsByType: buildWarningsByType(ruleResults),
    repairSuggestionCount: repairSuggestions.length,
  };
}

export function hasImportantUnusedEntities(input: AssetValidatorInput): boolean {
  const importantTypes = new Set<AssetEntityType>([
    "player",
    "club",
    "award",
    "tournament",
    "national_team",
  ]);

  return input.recommendation.unusedEntities.some((entity) => importantTypes.has(entity.type));
}
