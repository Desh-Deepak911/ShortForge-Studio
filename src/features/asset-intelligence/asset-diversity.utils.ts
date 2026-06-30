import { normalizeAssetSearchQuery } from "@/features/studio-intelligence/scene-blueprint.utils";

import type {
  AssetDiversityPlan,
  AssetEntity,
  AssetEntityType,
  SceneAssetPlan,
} from "./asset-intelligence.types";
import { computeDiversityScore, computeRepeatedEntityRatio } from "./asset-diagnostics.utils";
import { ENTITY_QUERY_BIAS } from "./asset-query-planner.utils";
import { buildEntityFocusedQuery } from "./asset-query-quality.utils";

const MAX_CONSECUTIVE_SAME_PRIMARY = 2;
const DOMINANCE_THRESHOLD = 0.5;

interface PrimaryEntityUsage {
  entityId: string;
  entityName: string;
  entityType: AssetEntityType;
  sceneIds: string[];
}

function resolveEntityLabel(entityId: string, entities: AssetEntity[]): string {
  return entities.find((entity) => entity.id === entityId)?.name ?? entityId;
}

function resolveEntityType(entityId: string, entities: AssetEntity[]): AssetEntityType {
  return entities.find((entity) => entity.id === entityId)?.type ?? "generic_topic";
}

function collectPrimaryUsage(
  scenePlans: SceneAssetPlan[],
  entities: AssetEntity[],
): PrimaryEntityUsage[] {
  const usage = new Map<string, PrimaryEntityUsage>();

  for (const plan of scenePlans) {
    const primaryId = plan.primaryEntityIds[0];
    if (!primaryId) {
      continue;
    }

    const existing = usage.get(primaryId);
    if (!existing) {
      usage.set(primaryId, {
        entityId: primaryId,
        entityName: resolveEntityLabel(primaryId, entities),
        entityType: resolveEntityType(primaryId, entities),
        sceneIds: [plan.sceneId],
      });
      continue;
    }

    existing.sceneIds.push(plan.sceneId);
  }

  return [...usage.values()];
}

function detectConsecutiveRepeats(
  scenePlans: SceneAssetPlan[],
  entities: AssetEntity[],
): { warnings: string[]; cappedEntityIds: string[] } {
  const warnings: string[] = [];
  const cappedEntityIds = new Set<string>();

  let streakEntityId: string | undefined;
  let streakLength = 0;

  for (const plan of scenePlans) {
    const primaryId = plan.primaryEntityIds[0];
    if (!primaryId) {
      streakEntityId = undefined;
      streakLength = 0;
      continue;
    }

    if (primaryId === streakEntityId) {
      streakLength += 1;
    } else {
      streakEntityId = primaryId;
      streakLength = 1;
    }

    if (streakLength > MAX_CONSECUTIVE_SAME_PRIMARY) {
      cappedEntityIds.add(primaryId);
      const label = resolveEntityLabel(primaryId, entities);
      warnings.push(
        `Primary entity "${label}" appears in ${streakLength} consecutive scenes — consider alternating imagery.`,
      );
    }
  }

  return { warnings, cappedEntityIds: [...cappedEntityIds] };
}

function detectDominance(
  scenePlans: SceneAssetPlan[],
  entities: AssetEntity[],
): { warnings: string[]; entitySceneCap: Record<string, number> } {
  const warnings: string[] = [];
  const entitySceneCap: Record<string, number> = {};
  const nonPlaceholderScenes = scenePlans.filter(
    (plan) => plan.assetRequirementType !== "placeholder",
  );

  if (nonPlaceholderScenes.length === 0) {
    return { warnings, entitySceneCap };
  }

  const usage = collectPrimaryUsage(nonPlaceholderScenes, entities);

  for (const entry of usage) {
    const share = entry.sceneIds.length / nonPlaceholderScenes.length;
    entitySceneCap[entry.entityId] = Math.min(0.4, share);

    if (share >= DOMINANCE_THRESHOLD) {
      warnings.push(
        `Entity "${entry.entityName}" dominates ${Math.round(share * 100)}% of scenes — diversify with alternate subjects.`,
      );
    }
  }

  return { warnings, entitySceneCap };
}

function buildAlternateRecommendations(
  scenePlans: SceneAssetPlan[],
  entities: AssetEntity[],
  dominantEntityIds: string[],
): AssetDiversityPlan["alternateRecommendations"] {
  const recommendations: AssetDiversityPlan["alternateRecommendations"] = [];

  for (const plan of scenePlans) {
    const primaryId = plan.primaryEntityIds[0];
    if (!primaryId || !dominantEntityIds.includes(primaryId)) {
      continue;
    }

    const alternate = entities.find(
      (entity) =>
        entity.id !== primaryId &&
        !dominantEntityIds.includes(entity.id) &&
        entity.type !== "generic_topic",
    );

    if (!alternate) {
      continue;
    }

    const bias = ENTITY_QUERY_BIAS[alternate.type]?.[0];
    const suggestedQuery = bias
      ? buildEntityFocusedQuery(alternate, bias.term)
      : `${alternate.name} football highlights`;

    recommendations.push({
      sceneId: plan.sceneId,
      entityId: alternate.id,
      suggestedQuery: normalizeAssetSearchQuery(suggestedQuery),
      reason: `Alternate to reduce dominance of ${resolveEntityLabel(primaryId, entities)}`,
    });
  }

  return recommendations;
}

function buildContrastPairs(scenePlans: SceneAssetPlan[]): AssetDiversityPlan["contrastPairs"] {
  const pairs: AssetDiversityPlan["contrastPairs"] = [];

  for (let index = 1; index < scenePlans.length; index += 1) {
    const previous = scenePlans[index - 1];
    const current = scenePlans[index];

    if (
      previous.primaryEntityIds[0] &&
      previous.primaryEntityIds[0] === current.primaryEntityIds[0] &&
      previous.diversityKey === current.diversityKey
    ) {
      pairs.push({
        sceneIdA: previous.sceneId,
        sceneIdB: current.sceneId,
        reason: "Repeated primary entity and diversity key — imagery may feel repetitive",
      });
    }
  }

  return pairs;
}

/** Builds cross-scene diversity constraints and warnings. */
export function buildAssetDiversityPlan(
  scenePlans: SceneAssetPlan[],
  entities: AssetEntity[],
): AssetDiversityPlan {
  const consecutive = detectConsecutiveRepeats(scenePlans, entities);
  const dominance = detectDominance(scenePlans, entities);

  const dominantEntityIds = collectPrimaryUsage(scenePlans, entities)
    .filter((entry) => entry.sceneIds.length / Math.max(scenePlans.length, 1) >= DOMINANCE_THRESHOLD)
    .map((entry) => entry.entityId);

  const alternateRecommendations = buildAlternateRecommendations(
    scenePlans,
    entities,
    dominantEntityIds,
  );

  const distinctVisualIntents = new Set(
    scenePlans.map((plan) => plan.diversityKey.split(":").slice(-1)[0]).filter(Boolean),
  );

  const draftPlan: AssetDiversityPlan = {
    capRepeatedEntityIds: consecutive.cappedEntityIds,
    minDistinctVisualIntents: Math.max(2, Math.min(distinctVisualIntents.size, scenePlans.length)),
    contrastPairs: buildContrastPairs(scenePlans),
    entitySceneCap: dominance.entitySceneCap,
    warnings: [...consecutive.warnings, ...dominance.warnings],
    alternateRecommendations,
    repeatedEntityRatio: computeRepeatedEntityRatio(scenePlans),
    diversityScore: 0,
  };

  return {
    ...draftPlan,
    diversityScore: computeDiversityScore(draftPlan, scenePlans),
  };
}
