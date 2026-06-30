import type { AssetProviderResult } from "@/features/asset-intelligence/providers/asset-provider.types";
import type {
  RecommendedAssetCandidate,
  SceneRecommendation,
} from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import type {
  AssetRepairSuggestion,
  AssetValidationResult,
} from "@/features/asset-intelligence/validator/asset-validator.types";

import type { CreatorAssetStudioPlanningData } from "./creator-asset-studio.types";

function findSceneRecommendation(
  planning: CreatorAssetStudioPlanningData | null | undefined,
  sceneIndex: number,
): SceneRecommendation | undefined {
  return planning?.recommendation.sceneRecommendations.find(
    (scene) => scene.sceneIndex === sceneIndex,
  );
}

/** Returns the scene recommendation for a selected scene index. */
export function selectSceneRecommendation(
  planning: CreatorAssetStudioPlanningData | null | undefined,
  sceneIndex: number,
): SceneRecommendation | undefined {
  return findSceneRecommendation(planning, sceneIndex);
}

/** Returns ranked provider planning output for a selected scene index. */
export function selectSceneProviders(
  planning: CreatorAssetStudioPlanningData | null | undefined,
  sceneIndex: number,
): AssetProviderResult | undefined {
  return planning?.providerPlan.sceneResults.find((scene) => scene.sceneIndex === sceneIndex);
}

/** Returns project-level validation output for the planning run. */
export function selectSceneValidation(
  planning: CreatorAssetStudioPlanningData | null | undefined,
): AssetValidationResult | undefined {
  return planning?.validationResult;
}

/** Returns ranked alternative recommendations for a selected scene index. */
export function selectSceneAlternatives(
  planning: CreatorAssetStudioPlanningData | null | undefined,
  sceneIndex: number,
): RecommendedAssetCandidate[] {
  return findSceneRecommendation(planning, sceneIndex)?.alternatives ?? [];
}

/** Returns repair suggestions scoped to a selected scene when possible. */
export function selectSceneRepairSuggestions(
  planning: CreatorAssetStudioPlanningData | null | undefined,
  sceneIndex: number,
): AssetRepairSuggestion[] {
  if (!planning) {
    return [];
  }

  const sceneId = findSceneRecommendation(planning, sceneIndex)?.sceneId;
  const suggestions = planning.validationResult.repairSuggestions;

  if (!sceneId) {
    return [...suggestions];
  }

  const scoped = suggestions.filter(
    (suggestion) => !suggestion.targetSceneId || suggestion.targetSceneId === sceneId,
  );

  return scoped.length > 0 ? scoped : [...suggestions];
}

/** Returns whether the selected scene has a primary recommendation to render. */
export function selectSceneHasRecommendation(
  planning: CreatorAssetStudioPlanningData | null | undefined,
  sceneIndex: number,
): boolean {
  return Boolean(findSceneRecommendation(planning, sceneIndex)?.topRecommendation);
}

/** Returns the recommended search query for a selected scene. */
export function selectSceneSearchQuery(
  planning: CreatorAssetStudioPlanningData | null | undefined,
  sceneIndex: number,
): string {
  const sceneRecommendation = findSceneRecommendation(planning, sceneIndex);
  const providerResult = selectSceneProviders(planning, sceneIndex);

  return sceneRecommendation?.topRecommendation?.query ?? providerResult?.query ?? "";
}
