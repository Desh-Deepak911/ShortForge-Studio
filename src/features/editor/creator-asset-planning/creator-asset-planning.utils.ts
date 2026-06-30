import type { AssetIntelligenceInput } from "@/features/asset-intelligence";
import { buildAssetProviderPlan } from "@/features/asset-intelligence/providers";
import { buildRecommendationsFromAssetIntelligence } from "@/features/asset-intelligence/recommendation-engine";
import { runAssetIntelligence } from "@/features/asset-intelligence/run-asset-intelligence";
import { validateAssetRecommendations } from "@/features/asset-intelligence/validator";
import type { BlueprintMappedScene } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import type { StudioIntelligenceResult } from "@/features/studio-intelligence/studio-intelligence.types";
import type { FootieScript } from "@/features/story/types";
import type { ScriptMode } from "@/types/footiebitz";

import { updatePlanningCache } from "./creator-asset-planning.cache";
import type {
  CreatorAssetPlanningCacheEntry,
  CreatorAssetPlanningCacheKeyInput,
  CreatorAssetPlanningSnapshot,
  CreatorAssetStudioPlanningData,
} from "./creator-asset-planning.types";
import { CREATOR_ASSET_PLANNING_VERSION as PLANNING_VERSION } from "./creator-asset-planning.types";

export interface BuildCreatorAssetPlanningCacheEntryInput {
  storyId: string;
  script: FootieScript;
  storyMode?: ScriptMode;
  planning: CreatorAssetStudioPlanningData;
}

/** Builds a stable script hash from story metadata — not editor selection. */
export function buildScriptHash(script: FootieScript): string {
  return [
    script.title.trim(),
    script.narration.trim(),
    script.scenes.length,
    script.totalDuration,
    script.voiceoverDurationMs ?? 0,
  ].join("|");
}

/** Builds a cache key from story identity and script metadata. */
export function buildPlanningCacheKey(input: CreatorAssetPlanningCacheKeyInput): string {
  return [input.storyId, input.scriptHash, input.sceneCount, input.storyMode].join("::");
}

/** Returns whether meaningful script metadata changed since the cached entry was written. */
export function hasPlanningChanged(
  cached: Pick<CreatorAssetPlanningCacheEntry, "storyId" | "scriptHash" | "sceneCount" | "storyMode">,
  next: CreatorAssetPlanningCacheKeyInput,
): boolean {
  return (
    cached.storyId !== next.storyId ||
    cached.scriptHash !== next.scriptHash ||
    cached.sceneCount !== next.sceneCount ||
    cached.storyMode !== next.storyMode
  );
}

/** Executes the Asset Intelligence pipeline from prepared planning input. */
export function buildCreatorAssetPlanningFromAssetInput(
  assetInput: AssetIntelligenceInput,
): CreatorAssetStudioPlanningData {
  const assetIntelligence = runAssetIntelligence(assetInput);
  const recommendation = buildRecommendationsFromAssetIntelligence(
    assetIntelligence,
    assetInput.mappedScenes,
  );
  const providerPlan = buildAssetProviderPlan({
    recommendation,
    sceneAssetPlans: assetIntelligence.sceneAssetPlans,
    mappedScenes: assetInput.mappedScenes,
  });
  const validationResult = validateAssetRecommendations({
    assetIntelligence,
    recommendation,
    providerPlan,
    mappedScenes: assetInput.mappedScenes,
  });

  return {
    recommendation,
    providerPlan,
    validationResult,
  };
}

/** Builds planning during story generation from Studio Intelligence scene-plan output. */
export function buildCreatorAssetPlanningFromScenePlan(input: {
  intelligence: StudioIntelligenceResult;
  mappedScenes: BlueprintMappedScene[];
  topic: string;
}): CreatorAssetStudioPlanningData {
  const assetInput: AssetIntelligenceInput = {
    topic: input.topic,
    studioIntelligence: input.intelligence,
    mappedScenes: input.mappedScenes,
    sceneTexts: input.mappedScenes.map((scene) => ({
      sceneId: scene.id,
      narration: scene.narrationExcerpt,
      caption: scene.captionText,
      summary: scene.title,
      title: scene.title,
    })),
    strategyId: input.intelligence.strategyId,
  };

  return buildCreatorAssetPlanningFromAssetInput(assetInput);
}

export function buildCreatorAssetPlanningCacheEntry(
  input: BuildCreatorAssetPlanningCacheEntryInput,
): CreatorAssetPlanningCacheEntry {
  const storyMode = input.storyMode ?? "default";

  return {
    planningVersion: PLANNING_VERSION,
    generatedAt: new Date().toISOString(),
    storyId: input.storyId,
    scriptHash: buildScriptHash(input.script),
    sceneCount: input.script.scenes.length,
    storyMode,
    planning: input.planning,
  };
}

/** Stores planning in the cache after story generation or hydration. */
export function cacheCreatorAssetPlanning(
  input: BuildCreatorAssetPlanningCacheEntryInput,
): CreatorAssetPlanningCacheEntry {
  const entry = buildCreatorAssetPlanningCacheEntry(input);
  updatePlanningCache(input.storyId, entry);
  return entry;
}

/** Hydrates the client cache from a generation snapshot. */
export function hydrateCreatorAssetPlanningCache(
  storyId: string,
  snapshot: CreatorAssetPlanningSnapshot,
): CreatorAssetPlanningCacheEntry {
  const entry: CreatorAssetPlanningCacheEntry = {
    ...snapshot,
    storyId,
    planning: snapshot.planning,
  };

  return updatePlanningCache(storyId, entry).entry as CreatorAssetPlanningCacheEntry;
}

/** Builds a generation snapshot without binding a story id — filled during hydration. */
export function buildCreatorAssetPlanningSnapshot(input: {
  script: FootieScript;
  storyMode?: ScriptMode;
  planning: CreatorAssetStudioPlanningData;
}): CreatorAssetPlanningSnapshot {
  const storyMode = input.storyMode ?? "default";

  return {
    planningVersion: PLANNING_VERSION,
    generatedAt: new Date().toISOString(),
    scriptHash: buildScriptHash(input.script),
    sceneCount: input.script.scenes.length,
    storyMode,
    planning: input.planning,
  };
}
