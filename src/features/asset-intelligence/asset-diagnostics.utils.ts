import { normalizeAssetSearchQuery } from "@/features/studio-intelligence/scene-blueprint.utils";

import type {
  AssetDiversityPlan,
  AssetEntity,
  AssetIntelligenceDiagnostics,
  AssetQueryCandidate,
  SceneAssetPlan,
} from "./asset-intelligence.types";
import {
  collectGenericQueryWarnings,
  computeCandidateQualityScore,
  isGenericOnlyQuery,
} from "./asset-query-quality.utils";
import { sceneRequiresAssetCandidates } from "./asset-query-planner.utils";

function roundScore(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

/** Computes entity type coverage in `[0, 1]`. */
export function computeEntityCoverage(entities: AssetEntity[]): number {
  if (entities.length === 0) {
    return 0;
  }

  const distinctTypes = new Set(entities.map((entity) => entity.type));
  const highConfidence = entities.filter((entity) => entity.confidence === "high").length;
  const typeScore = Math.min(1, distinctTypes.size / 4);
  const confidenceScore = Math.min(1, highConfidence / Math.max(entities.length, 1));

  return roundScore(typeScore * 0.65 + confidenceScore * 0.35);
}

/** Computes query candidate coverage across non-placeholder scenes in `[0, 1]`. */
export function computeQueryCoverage(scenePlans: SceneAssetPlan[]): number {
  const requiredScenes = scenePlans.filter((plan) =>
    sceneRequiresAssetCandidates(plan.assetRequirementType),
  );

  if (requiredScenes.length === 0) {
    return 1;
  }

  const covered = requiredScenes.filter((plan) => plan.candidates.length > 0).length;
  return roundScore(covered / requiredScenes.length);
}

/** Computes the highest primary-entity repetition ratio in `[0, 1]`. */
export function computeRepeatedEntityRatio(scenePlans: SceneAssetPlan[]): number {
  const eligiblePlans = scenePlans.filter((plan) => plan.primaryEntityIds.length > 0);
  if (eligiblePlans.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const plan of eligiblePlans) {
    const primaryId = plan.primaryEntityIds[0];
    counts.set(primaryId, (counts.get(primaryId) ?? 0) + 1);
  }

  const maxCount = Math.max(...counts.values());
  return roundScore(maxCount / eligiblePlans.length);
}

/** Computes diversity score in `[0, 1]` — higher is more visually diverse. */
export function computeDiversityScore(
  diversityPlan: AssetDiversityPlan,
  scenePlans: SceneAssetPlan[],
): number {
  const repeatedRatio = computeRepeatedEntityRatio(scenePlans);
  const distinctKeys = new Set(scenePlans.map((plan) => plan.diversityKey)).size;
  const distinctRatio = scenePlans.length > 0 ? distinctKeys / scenePlans.length : 1;
  const warningPenalty = Math.min(0.35, diversityPlan.warnings.length * 0.08);
  const alternateBonus = Math.min(0.15, diversityPlan.alternateRecommendations.length * 0.02);

  return roundScore(
    (1 - repeatedRatio) * 0.55 + distinctRatio * 0.35 + alternateBonus - warningPenalty,
  );
}

function countQualityCandidates(
  scenePlans: SceneAssetPlan[],
  entities: AssetEntity[],
): number {
  return scenePlans.reduce((total, plan) => {
    return (
      total +
      plan.candidates.filter((candidate) => {
        const entityNames = entities
          .filter((entity) => candidate.entityIds.includes(entity.id))
          .flatMap((entity) => [entity.name, ...entity.aliases]);
        return !isGenericOnlyQuery(candidate.query, entityNames);
      }).length
    );
  }, 0);
}

/** Builds enhanced Asset Intelligence diagnostics. */
export function buildAssetIntelligenceDiagnostics(input: {
  entities: AssetEntity[];
  scenePlans: SceneAssetPlan[];
  diversityPlan: AssetDiversityPlan;
  warnings: string[];
  legacyQueryPreservedCount: number;
  legacyQueryDiffCount: number;
  uncoveredEntityTypes: AssetIntelligenceDiagnostics["uncoveredEntityTypes"];
}): AssetIntelligenceDiagnostics {
  const genericQueryWarnings = collectGenericQueryWarnings(input.scenePlans, input.entities);
  const entityTypes = new Set(input.entities.map((entity) => entity.type));

  return {
    entityCount: input.entities.length,
    entityTypeCount: entityTypes.size,
    scenesWithEntities: input.scenePlans.filter((plan) => plan.primaryEntityIds.length > 0).length,
    scenesWithCandidates: input.scenePlans.filter((plan) => plan.candidates.length > 0).length,
    legacyQueryPreservedCount: input.legacyQueryPreservedCount,
    legacyQueryDiffCount: input.legacyQueryDiffCount,
    uncoveredEntityTypes: input.uncoveredEntityTypes,
    entityCoverage: computeEntityCoverage(input.entities),
    queryCoverage: computeQueryCoverage(input.scenePlans),
    genericQueryWarnings,
    repeatedEntityRatio: computeRepeatedEntityRatio(input.scenePlans),
    diversityScore: computeDiversityScore(input.diversityPlan, input.scenePlans),
    candidateQualityScore: computeCandidateQualityScore(input.scenePlans, input.entities),
    qualityCandidateCount: countQualityCandidates(input.scenePlans, input.entities),
    warnings: [...input.warnings, ...genericQueryWarnings],
  };
}

/** Returns whether a candidate query is human-readable and sufficiently specific. */
export function isHumanReadableQuery(
  candidate: AssetQueryCandidate,
  entities: AssetEntity[],
): boolean {
  const query = normalizeAssetSearchQuery(candidate.query);
  if (!query || query.split(/\s+/).length < 2) {
    return false;
  }

  const entityNames = entities
    .filter((entity) => candidate.entityIds.includes(entity.id))
    .flatMap((entity) => [entity.name, ...entity.aliases]);

  return !isGenericOnlyQuery(query, entityNames);
}

/** Checks whether any query across scene plans includes an expected theme term. */
export function queriesIncludeThemes(
  scenePlans: SceneAssetPlan[],
  themes: string[],
): boolean {
  const normalizedThemes = themes.map((theme) => normalizeAssetSearchQuery(theme));
  const allQueries = scenePlans.flatMap((plan) => plan.candidates.map((candidate) => candidate.query));

  return normalizedThemes.every((theme) =>
    allQueries.some((query) => normalizeAssetSearchQuery(query).includes(theme)),
  );
}

/** Finds entities matching partial expected primary names. */
export function findExpectedPrimaryEntities(
  entities: AssetEntity[],
  expectedNames: string[],
): AssetEntity[] {
  return expectedNames
    .map((expected) =>
      entities.find((entity) =>
        normalizeAssetSearchQuery(entity.name).includes(normalizeAssetSearchQuery(expected)),
      ),
    )
    .filter((entity): entity is AssetEntity => Boolean(entity));
}
