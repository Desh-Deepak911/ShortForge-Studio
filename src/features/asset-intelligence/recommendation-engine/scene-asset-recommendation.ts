import { sceneRequiresAssetCandidates } from "../asset-query-planner.utils";

import {
  buildGlobalRecommendations,
  buildSceneContext,
  buildSceneReasoning,
  computeConfidenceScore,
  computeCoverageScore,
  rankSceneCandidates,
  resolveUnusedEntities,
  scoreToRecommendationConfidence,
  toRecommendedCandidate,
} from "./recommendation-engine.utils";
import type {
  RecommendationResult,
  SceneAssetRecommendationInput,
  SceneRecommendation,
} from "./recommendation-engine.types";
import { RECOMMENDATION_ENGINE_VERSION } from "./recommendation-engine.types";

function cloneRecommendationInput(
  input: SceneAssetRecommendationInput,
): SceneAssetRecommendationInput {
  return {
    entities: input.entities.map((entity) => ({
      ...entity,
      aliases: [...entity.aliases],
      sceneIds: [...entity.sceneIds],
      evidence: [...entity.evidence],
    })),
    sceneAssetPlans: input.sceneAssetPlans.map((plan) => ({
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
      ...input.diversityPlan,
      capRepeatedEntityIds: [...input.diversityPlan.capRepeatedEntityIds],
      warnings: [...input.diversityPlan.warnings],
      contrastPairs: input.diversityPlan.contrastPairs.map((pair) => ({ ...pair })),
      alternateRecommendations: input.diversityPlan.alternateRecommendations.map((entry) => ({
        ...entry,
      })),
      entitySceneCap: { ...input.diversityPlan.entitySceneCap },
    },
    mappedScenes: input.mappedScenes?.map((scene) => ({
      ...scene,
      sourceBeatIds: [...scene.sourceBeatIds],
      planningTags: [...scene.planningTags],
      mappingDecisions: [...scene.mappingDecisions],
      visualHints: { ...scene.visualHints },
      mediaHints: { ...scene.mediaHints },
      motionHints: { ...scene.motionHints },
      captionHints: {
        ...scene.captionHints,
        highlightWords: [...scene.captionHints.highlightWords],
      },
      timingMetadata: { ...scene.timingMetadata },
      narrationMetadata: {
        ...scene.narrationMetadata,
        sentenceRange: { ...scene.narrationMetadata.sentenceRange },
      },
    })),
    diagnostics: input.diagnostics ? { ...input.diagnostics } : undefined,
  };
}

/** Builds ranked scene asset recommendations from planning metadata only. */
export function buildSceneAssetRecommendations(
  input: SceneAssetRecommendationInput,
): RecommendationResult {
  const clonedInput = cloneRecommendationInput(input);
  const mappedSceneByIndex = clonedInput.mappedScenes ?? [];
  const entityUsageCounts = new Map<string, number>();
  const assignedTopQueries = new Set<string>();

  const eligibleScenes = clonedInput.sceneAssetPlans.filter((plan) =>
    sceneRequiresAssetCandidates(plan.assetRequirementType),
  );

  const contexts = clonedInput.sceneAssetPlans.map((scenePlan, index) =>
    buildSceneContext(scenePlan, mappedSceneByIndex[index]),
  );

  const sortedContextIndexes = [...contexts.entries()]
    .filter(([, context]) => sceneRequiresAssetCandidates(context.scenePlan.assetRequirementType))
    .sort(([, a], [, b]) => b.importance - a.importance)
    .map(([index]) => index);

  const sceneRecommendationMap = new Map<number, SceneRecommendation>();
  let genericRejectedCount = 0;
  let diversityAdjustments = 0;
  let entityReusePenaltyCount = 0;

  for (const sceneIndex of sortedContextIndexes) {
    const context = contexts[sceneIndex];
    const { ranked, rejected } = rankSceneCandidates({
      context,
      entities: clonedInput.entities,
      diversityPlan: clonedInput.diversityPlan,
      entityUsageCounts,
      assignedTopQueries,
    });

    genericRejectedCount += rejected.filter((entry) =>
      entry.rejectionReason.includes("generic"),
    ).length;

    let topScored = ranked[0];
    if (topScored && assignedTopQueries.has(normalizeQuery(topScored.candidate.query))) {
      const alternate = ranked.find(
        (entry) => !assignedTopQueries.has(normalizeQuery(entry.candidate.query)),
      );
      if (alternate) {
        topScored = alternate;
        diversityAdjustments += 1;
      }
    }

    if (topScored) {
      assignedTopQueries.add(normalizeQuery(topScored.candidate.query));
      const primaryEntityId = topScored.entityIds[0];
      if (primaryEntityId) {
        entityUsageCounts.set(primaryEntityId, (entityUsageCounts.get(primaryEntityId) ?? 0) + 1);
        if ((entityUsageCounts.get(primaryEntityId) ?? 0) > 1) {
          entityReusePenaltyCount += 1;
        }
      }
    }

    const topRecommendation = topScored
      ? ({ ...toRecommendedCandidate(topScored, clonedInput.entities), rank: 1 as const })
      : undefined;

    const alternatives = ranked
      .slice(topScored ? 1 : 0, topScored ? 4 : 3)
      .map((entry) => toRecommendedCandidate(entry, clonedInput.entities));

    const confidence = topRecommendation
      ? topRecommendation.confidence
      : scoreToRecommendationConfidence(0);

    sceneRecommendationMap.set(sceneIndex, {
      sceneId: context.scenePlan.sceneId,
      sceneIndex,
      topRecommendation,
      alternatives,
      rejectedCandidates: rejected,
      reasoning: buildSceneReasoning(topRecommendation, alternatives),
      confidence,
    });
  }

  for (const [index, context] of contexts.entries()) {
    if (sceneRecommendationMap.has(index)) {
      continue;
    }

    if (!sceneRequiresAssetCandidates(context.scenePlan.assetRequirementType)) {
      sceneRecommendationMap.set(index, {
        sceneId: context.scenePlan.sceneId,
        sceneIndex: index,
        alternatives: [],
        rejectedCandidates: [],
        reasoning: ["Placeholder scene — no asset recommendation required."],
        confidence: "low",
      });
      continue;
    }

    sceneRecommendationMap.set(index, {
      sceneId: context.scenePlan.sceneId,
      sceneIndex: index,
      alternatives: [],
      rejectedCandidates: [],
      reasoning: ["No viable asset recommendation for this scene."],
      confidence: "low",
    });
  }

  const sceneRecommendations = [...sceneRecommendationMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, recommendation]) => recommendation);

  const topQueries = sceneRecommendations
    .map((scene) => scene.topRecommendation?.query)
    .filter((query): query is string => Boolean(query));

  const duplicateTopQueryCount =
    topQueries.length - new Set(topQueries.map((query) => query.toLowerCase())).size;

  const unusedEntities = resolveUnusedEntities(clonedInput.entities, sceneRecommendations);
  const globalRecommendations = buildGlobalRecommendations(sceneRecommendations, unusedEntities);

  const coverageScore = computeCoverageScore(sceneRecommendations, eligibleScenes.length);
  const confidenceScore = computeConfidenceScore(sceneRecommendations);

  const averageScore =
    sceneRecommendations
      .filter((scene) => scene.topRecommendation)
      .reduce((total, scene) => total + (scene.topRecommendation?.score ?? 0), 0) /
    Math.max(sceneRecommendations.filter((scene) => scene.topRecommendation).length, 1);

  const warnings: string[] = [];
  if (coverageScore < 0.9) {
    warnings.push(`Recommendation coverage ${(coverageScore * 100).toFixed(0)}% is below 90%.`);
  }
  if (duplicateTopQueryCount > 0) {
    warnings.push(`${duplicateTopQueryCount} duplicate top recommendations detected.`);
  }

  return {
    recommendationVersion: RECOMMENDATION_ENGINE_VERSION,
    sceneRecommendations,
    globalRecommendations,
    unusedEntities: unusedEntities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
    })),
    coverageScore,
    confidenceScore,
    diagnostics: {
      scenesWithRecommendation: sceneRecommendations.filter((scene) => scene.topRecommendation).length,
      scenesWithoutRecommendation:
        eligibleScenes.length -
        sceneRecommendations.filter((scene) => scene.topRecommendation).length,
      duplicateTopQueryCount,
      averageScore: Math.round(averageScore * 1000) / 1000,
      genericRejectedCount,
      diversityAdjustments,
      entityReusePenaltyCount,
      warnings,
    },
    generatedAt: new Date().toISOString(),
  };
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Convenience wrapper accepting a full Asset Intelligence result. */
export function buildRecommendationsFromAssetIntelligence(
  result: import("../asset-intelligence.types").AssetIntelligenceResult,
  mappedScenes?: SceneAssetRecommendationInput["mappedScenes"],
): RecommendationResult {
  return buildSceneAssetRecommendations({
    entities: result.entities,
    sceneAssetPlans: result.sceneAssetPlans,
    diversityPlan: result.diversityPlan,
    mappedScenes,
    diagnostics: result.diagnostics,
  });
}
