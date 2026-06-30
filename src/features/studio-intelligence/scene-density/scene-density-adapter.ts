import type { SceneBlueprintCollection } from "../scene-blueprint.types";
import { refreshBlueprintCollectionStats } from "../scene-blueprint.utils";
import type {
  SceneDensityAdaptationDiagnostics,
  SceneDensityAdaptationResult,
  SceneDensityAdaptationStep,
  SceneDensityAdaptationStrategy,
} from "./scene-density.types";
import {
  SCENE_DENSITY_ADAPTER_VERSION,
  cloneSceneBlueprintCollection,
  durationPreserved,
  findBestMergeCandidate,
  findBestSplitCandidate,
  lineagePreserved,
  maxImportancePreserved,
  mergeAdjacentBlueprints,
  narrationCoveragePreserved,
  splitBlueprint,
} from "./scene-density.utils";
import type { SceneBlueprint } from "../scene-blueprint.types";

const MIN_ADAPTED_SCENE_COUNT = 3;
const MAX_ADAPTED_SCENE_COUNT = 12;

function resolveStrategy(mergeCount: number, splitCount: number): SceneDensityAdaptationStrategy {
  if (mergeCount === 0 && splitCount === 0) {
    return "none";
  }

  if (mergeCount > 0 && splitCount > 0) {
    return "mixed";
  }

  return mergeCount > 0 ? "merge" : "split";
}

function buildDiagnostics(
  original: SceneBlueprintCollection,
  adapted: SceneBlueprintCollection,
  requestedSceneCount: number,
  steps: readonly SceneDensityAdaptationStep[],
  mergeCount: number,
  splitCount: number,
): SceneDensityAdaptationDiagnostics {
  return {
    adapterVersion: SCENE_DENSITY_ADAPTER_VERSION,
    inputSceneCount: original.blueprints.length,
    requestedSceneCount,
    outputSceneCount: adapted.blueprints.length,
    strategy: resolveStrategy(mergeCount, splitCount),
    mergeCount,
    splitCount,
    originalTotalDurationMs: original.totalSuggestedDurationMs,
    adaptedTotalDurationMs: adapted.totalSuggestedDurationMs,
    originalAverageImportance: original.averageImportance,
    adaptedAverageImportance: adapted.averageImportance,
    originalConfidence: original.confidence,
    adaptedConfidence: adapted.confidence,
    steps,
  };
}

function reindexBlueprints(blueprints: SceneBlueprint[]): SceneBlueprint[] {
  return blueprints.map((blueprint, index) => ({
    ...blueprint,
    id: `blueprint-${index + 1}`,
  }));
}

function validateAdaptation(
  originalBlueprints: readonly SceneBlueprint[],
  adaptedBlueprints: readonly SceneBlueprint[],
): string | null {
  if (!durationPreserved(originalBlueprints, adaptedBlueprints)) {
    return "total duration was not preserved";
  }

  if (!lineagePreserved(originalBlueprints, adaptedBlueprints)) {
    return "beat lineage was not preserved";
  }

  if (!narrationCoveragePreserved(originalBlueprints, adaptedBlueprints)) {
    return "narration coverage was not preserved";
  }

  if (!maxImportancePreserved(originalBlueprints, adaptedBlueprints)) {
    return "importance was not preserved";
  }

  return null;
}

function failureResult(
  collection: SceneBlueprintCollection,
  requestedSceneCount: number,
  reason: string,
  steps: readonly SceneDensityAdaptationStep[] = [],
  mergeCount = 0,
  splitCount = 0,
): SceneDensityAdaptationResult {
  return {
    success: false,
    collection,
    reason,
    diagnostics: buildDiagnostics(collection, collection, requestedSceneCount, steps, mergeCount, splitCount),
  };
}

/**
 * Adapts a blueprint collection to the requested scene count before blueprint mapping.
 * Merges adjacent low-importance scenes to reduce count; splits long high-importance scenes to increase count.
 */
export function adaptSceneDensity(
  collection: SceneBlueprintCollection,
  requestedSceneCount: number,
): SceneDensityAdaptationResult {
  const normalizedCount = Math.round(requestedSceneCount);

  if (!Number.isFinite(normalizedCount)) {
    return failureResult(collection, requestedSceneCount, "requested scene count must be finite");
  }

  if (normalizedCount < MIN_ADAPTED_SCENE_COUNT || normalizedCount > MAX_ADAPTED_SCENE_COUNT) {
    return failureResult(
      collection,
      normalizedCount,
      `requested scene count must be between ${MIN_ADAPTED_SCENE_COUNT} and ${MAX_ADAPTED_SCENE_COUNT}`,
    );
  }

  const original = refreshBlueprintCollectionStats(cloneSceneBlueprintCollection(collection));
  const inputCount = original.blueprints.length;

  if (inputCount === normalizedCount) {
    return {
      success: true,
      collection: original,
      diagnostics: buildDiagnostics(original, original, normalizedCount, [], 0, 0),
    };
  }

  if (inputCount === 0) {
    return failureResult(original, normalizedCount, "cannot adapt an empty blueprint collection");
  }

  let working = original.blueprints.map((blueprint) => ({ ...blueprint, beatIds: [...blueprint.beatIds] }));
  const steps: SceneDensityAdaptationStep[] = [];
  let mergeCount = 0;
  let splitCount = 0;
  const maxIterations = Math.abs(inputCount - normalizedCount) * 4 + 8;

  for (let iteration = 0; iteration < maxIterations && working.length !== normalizedCount; iteration += 1) {
    if (working.length > normalizedCount) {
      const candidate = findBestMergeCandidate(working);
      if (!candidate) {
        break;
      }

      const left = working[candidate.index];
      const right = working[candidate.index + 1];
      if (!left || !right) {
        break;
      }

      const merged = mergeAdjacentBlueprints(left, right, candidate.index);
      working = [
        ...working.slice(0, candidate.index),
        merged,
        ...working.slice(candidate.index + 2),
      ];
      mergeCount += 1;
      steps.push({
        action: "merge",
        sourceBlueprintIds: [left.id, right.id],
        resultBlueprintIds: [merged.id],
        reason: candidate.strictLowImportance
          ? "Adjacent low-importance blueprints merged to reduce scene count."
          : "Adjacent non-peak blueprints merged to reduce scene count while preserving peak importance.",
      });
      continue;
    }

    const splitIndex = findBestSplitCandidate(working);
    if (splitIndex == null) {
      break;
    }

    const blueprint = working[splitIndex];
    if (!blueprint) {
      break;
    }

    const [first, second] = splitBlueprint(blueprint, splitIndex);
    working = [
      ...working.slice(0, splitIndex),
      first,
      second,
      ...working.slice(splitIndex + 1),
    ];
    splitCount += 1;
    steps.push({
      action: "split",
      sourceBlueprintIds: [blueprint.id],
      resultBlueprintIds: [first.id, second.id],
      reason: "Long high-importance blueprint split to increase scene count.",
    });
  }

  if (working.length !== normalizedCount) {
    return failureResult(
      original,
      normalizedCount,
      `unable to adapt ${inputCount} blueprints to ${normalizedCount} scenes within merge/split rules`,
      steps,
      mergeCount,
      splitCount,
    );
  }

  const reindexed = reindexBlueprints(working);
  const validationError = validateAdaptation(original.blueprints, reindexed);
  if (validationError) {
    return failureResult(original, normalizedCount, validationError, steps, mergeCount, splitCount);
  }

  const adapted = refreshBlueprintCollectionStats({
    ...original,
    blueprints: reindexed,
    warnings: [
      ...original.warnings,
      `Scene density adapted from ${inputCount} to ${normalizedCount} scenes (${resolveStrategy(mergeCount, splitCount)}).`,
    ],
  });

  return {
    success: true,
    collection: adapted,
    diagnostics: buildDiagnostics(original, adapted, normalizedCount, steps, mergeCount, splitCount),
  };
}
