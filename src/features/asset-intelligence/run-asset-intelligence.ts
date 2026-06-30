import { mapBlueprintsToScenes } from "@/features/studio-intelligence/blueprint-adapter/blueprint-mapper";
import { normalizeAssetSearchQuery } from "@/features/studio-intelligence/scene-blueprint.utils";

import { buildAssetDiversityPlan } from "./asset-diversity.utils";
import { buildAssetIntelligenceDiagnostics } from "./asset-diagnostics.utils";
import { mergeAssetEntities } from "./asset-entity-merge.utils";
import {
  ASSET_INTELLIGENCE_VERSION,
  type AssetIntelligenceInput,
  type AssetIntelligenceResult,
  type AssetSearchPlan,
} from "./asset-intelligence.types";
import { buildSceneAssetPlans, sceneRequiresAssetCandidates } from "./asset-query-planner.utils";

const ALL_ENTITY_TYPES = [
  "player",
  "club",
  "manager",
  "tournament",
  "country",
  "national_team",
  "tactic",
  "season",
  "award",
  "match",
  "generic_topic",
] as const;

/** Returns whether Asset Intelligence runtime wiring is enabled. */
export function isAssetIntelligenceEnabled(): boolean {
  return process.env.ASSET_INTELLIGENCE_ENABLED === "true";
}

function cloneAssetIntelligenceInput(input: AssetIntelligenceInput): AssetIntelligenceInput {
  return {
    ...input,
    inputEntities: input.inputEntities ? [...input.inputEntities] : undefined,
    entitySummaries: input.entitySummaries
      ? input.entitySummaries.map((summary) => ({ ...summary }))
      : undefined,
    sceneTexts: input.sceneTexts
      ? input.sceneTexts.map((scene) => ({ ...scene }))
      : undefined,
    mappedScenes: input.mappedScenes
      ? input.mappedScenes.map((scene) => ({
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
        }))
      : undefined,
  };
}

function resolveMappedScenes(input: AssetIntelligenceInput) {
  if (input.mappedScenes?.length) {
    return input.mappedScenes;
  }

  const collection = input.studioIntelligence?.sceneBlueprintCollection;
  if (!collection || collection.blueprints.length === 0) {
    return [];
  }

  const adapterResult = mapBlueprintsToScenes({
    collection,
    strategyId: input.strategyId ?? input.studioIntelligence?.strategyId,
    topic: input.topic,
    normalizedNarration: input.studioIntelligence?.normalizedNarration,
    targetDurationMs: input.studioIntelligence?.input.targetDurationMs,
  });

  return adapterResult.mappedScenes;
}

function buildGlobalFallbackQueries(
  entities: AssetIntelligenceResult["entities"],
  topic: string,
): string[] {
  const queries = [
    normalizeAssetSearchQuery(topic),
    ...entities.slice(0, 3).map((entity) =>
      normalizeAssetSearchQuery(`${entity.name} football highlights`),
    ),
    "football highlights",
  ].filter(Boolean);

  return [...new Set(queries)].slice(0, 4);
}

function countLegacyQueryStats(scenePlans: AssetIntelligenceResult["sceneAssetPlans"]) {
  let legacyQueryPreservedCount = 0;
  let legacyQueryDiffCount = 0;

  for (const plan of scenePlans) {
    if (!plan.legacySearchQuery) {
      continue;
    }

    legacyQueryPreservedCount += 1;
    const primaryCandidate = plan.candidates.find((candidate) => candidate.priority === "primary");
    if (
      primaryCandidate &&
      normalizeAssetSearchQuery(primaryCandidate.query) !==
        normalizeAssetSearchQuery(plan.legacySearchQuery)
    ) {
      legacyQueryDiffCount += 1;
    }
  }

  return { legacyQueryPreservedCount, legacyQueryDiffCount };
}

/** Runs the Asset Intelligence planning pipeline without mutating input. */
export function runAssetIntelligence(input: AssetIntelligenceInput): AssetIntelligenceResult {
  const clonedInput = cloneAssetIntelligenceInput(input);
  const entities = mergeAssetEntities(clonedInput);
  const mappedScenes = resolveMappedScenes(clonedInput);
  const sceneAssetPlans = buildSceneAssetPlans(clonedInput, entities, mappedScenes);
  const diversityPlan = buildAssetDiversityPlan(sceneAssetPlans, entities);

  const warnings: string[] = [...diversityPlan.warnings];

  for (const plan of sceneAssetPlans) {
    if (
      sceneRequiresAssetCandidates(plan.assetRequirementType) &&
      plan.candidates.length === 0
    ) {
      warnings.push(`Scene "${plan.sceneId}" has no asset query candidates.`);
    }
  }

  const entityTypes = new Set(entities.map((entity) => entity.type));
  const uncoveredEntityTypes = ALL_ENTITY_TYPES.filter((type) => !entityTypes.has(type));
  const legacyStats = countLegacyQueryStats(sceneAssetPlans);

  const generatedAt = new Date().toISOString();
  const assetSearchPlan: AssetSearchPlan = {
    version: ASSET_INTELLIGENCE_VERSION,
    topic: clonedInput.topic,
    entities,
    scenePlans: sceneAssetPlans,
    diversity: diversityPlan,
    globalFallbackQueries: buildGlobalFallbackQueries(entities, clonedInput.topic),
    generatedAt,
  };

  const diagnostics = buildAssetIntelligenceDiagnostics({
    entities,
    scenePlans: sceneAssetPlans,
    diversityPlan,
    warnings,
    legacyQueryPreservedCount: legacyStats.legacyQueryPreservedCount,
    legacyQueryDiffCount: legacyStats.legacyQueryDiffCount,
    uncoveredEntityTypes,
  });

  return {
    version: ASSET_INTELLIGENCE_VERSION,
    entities,
    sceneAssetPlans,
    assetSearchPlan,
    diversityPlan,
    diagnostics,
    warnings: diagnostics.warnings,
    plannerStep: "asset_intelligence",
    generatedAt,
  };
}
