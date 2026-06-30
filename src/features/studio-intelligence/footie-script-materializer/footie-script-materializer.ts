import {
  applyGeneratedStorySceneCaptions,
  attachVoiceoverTimingMs,
} from "@/features/story/utils";
import type { FootieScene } from "@/features/story/types";

import type { BlueprintMappedScene } from "../blueprint-adapter/blueprint-adapter.types";
import type {
  FootieScriptMaterializerInput,
  FootieScriptMaterializerResult,
  MaterializedSceneDraft,
  MaterializationWarning,
} from "./footie-script-materializer.types";
import {
  buildMaterializationDiagnostics,
  clampMaterializerConfidence,
  createMaterializationWarning,
  DEFAULT_MAX_SUBTITLE_WORDS,
  isValidFootieScriptMaterializerInput,
  resolveDeferredImageMotion,
  resolveDurationWeightMs,
  resolveMaterializedNarration,
  resolveMaterializedSubtitle,
  resolveProductionSceneType,
  validateMappedSceneLineage,
  regenerateProductionSceneIds,
} from "./footie-script-materializer.utils";

function sortMappedScenes(mappedScenes: readonly BlueprintMappedScene[]): BlueprintMappedScene[] {
  return [...mappedScenes].sort((left, right) => left.order - right.order);
}

function buildSceneSkeleton(
  mappedScene: BlueprintMappedScene,
  sceneIndex: number,
  maxSubtitleWords: number,
  warnings: MaterializationWarning[],
  fallbacksUsed: string[],
): { skeleton: FootieScene; weightMs: number } {
  validateMappedSceneLineage(mappedScene, warnings);

  const sceneType = resolveProductionSceneType(mappedScene, warnings, fallbacksUsed);
  const subtitle = resolveMaterializedSubtitle(
    mappedScene,
    sceneIndex,
    maxSubtitleWords,
    warnings,
    fallbacksUsed,
  );
  const narration = resolveMaterializedNarration(mappedScene, warnings);
  const weightMs = resolveDurationWeightMs(mappedScene, warnings, fallbacksUsed);

  const skeleton: FootieScene = {
    id: `pending-${sceneIndex + 1}`,
    start: 0,
    end: 0,
    duration: 1,
    subtitle,
    sceneType,
    narration,
  };

  return { skeleton, weightMs };
}

function applySceneTiming(
  scenes: FootieScene[],
  weightsMs: number[],
  voiceoverDurationMs: number | undefined,
): FootieScene[] {
  if (voiceoverDurationMs != null && voiceoverDurationMs > 0) {
    return attachVoiceoverTimingMs(scenes, voiceoverDurationMs, weightsMs);
  }

  let cursorMs = 0;

  return scenes.map((scene, index) => {
    const durationMs = Math.max(1000, Math.round(weightsMs[index] ?? 1000));
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs;

    const start = startMs / 1000;
    const duration = durationMs / 1000;
    const end = endMs / 1000;

    return {
      ...scene,
      startMs,
      endMs,
      durationMs,
      start,
      end,
      duration,
    };
  });
}

function buildMaterializedDrafts(
  mappedScenes: readonly BlueprintMappedScene[],
  timedScenes: FootieScene[],
): MaterializedSceneDraft[] {
  return mappedScenes.map((mappedScene, index) => {
    const scene = timedScenes[index];
    const defaultImageMotion = resolveDeferredImageMotion(
      mappedScene,
      scene.sceneType ?? "context",
    );

    return {
      scene,
      lineage: {
        sourceBlueprintId: mappedScene.sourceBlueprintId,
        sourceArcId: mappedScene.sourceArcId,
        sourceBeatIds: [...mappedScene.sourceBeatIds],
        adapterSceneId: mappedScene.id,
        materializerConfidence: clampMaterializerConfidence(mappedScene.confidence),
      },
      metadata: {
        semanticSlotId: mappedScene.semanticSlotId,
        semanticSlotLabel: mappedScene.semanticSlotLabel,
        semanticRole: mappedScene.semanticRole,
        templateId: mappedScene.templateId,
        templateApplied: mappedScene.templateApplied,
        contentPattern: mappedScene.contentPattern,
        planningTags: [...mappedScene.planningTags],
        visualIntentType: mappedScene.visualIntentType,
        visualHints: { ...mappedScene.visualHints },
        mediaHints: { ...mappedScene.mediaHints },
        motionHints: { ...mappedScene.motionHints },
        assetSearchQuery: mappedScene.assetSearchQuery ?? mappedScene.mediaHints.searchQuery,
        fallbackAssetQuery:
          mappedScene.fallbackAssetQuery ?? mappedScene.mediaHints.fallbackQuery,
        ...(defaultImageMotion ? { defaultImageMotion } : {}),
      },
    };
  });
}

/**
 * Pure materializer: BlueprintMappedScene[] → production-shaped FootieScene drafts.
 * Does not call syncFootieScript or wire into generation services.
 */
export function materializeMappedScenesToFootieScript(
  input: FootieScriptMaterializerInput,
): FootieScriptMaterializerResult {
  const warnings: MaterializationWarning[] = [];
  const fallbacksUsed: string[] = [];

  if (!isValidFootieScriptMaterializerInput(input)) {
    return {
      scenes: [],
      footieScenes: [],
      warnings: [
        createMaterializationWarning(
          "INVALID_MATERIALIZER_INPUT",
          "FootieScript materializer input is invalid.",
          "error",
        ),
      ],
      diagnostics: buildMaterializationDiagnostics([], 0, warnings, fallbacksUsed),
      success: false,
    };
  }

  const maxSubtitleWords = input.options?.maxSubtitleWords ?? DEFAULT_MAX_SUBTITLE_WORDS;
  const orderedScenes = sortMappedScenes(input.mappedScenes);

  if (orderedScenes.length === 0) {
    warnings.push(
      createMaterializationWarning(
        "EMPTY_MAPPED_SCENES",
        "No mapped scenes were provided for materialization.",
        "error",
      ),
    );

    if (!input.narration.trim()) {
      warnings.push(
        createMaterializationWarning(
          "MISSING_NARRATION",
          "Story narration is empty.",
          "warning",
        ),
      );
    }

    return {
      scenes: [],
      footieScenes: [],
      warnings,
      diagnostics: buildMaterializationDiagnostics([], 0, warnings, fallbacksUsed),
      success: false,
    };
  }

  if (!input.narration.trim()) {
    warnings.push(
      createMaterializationWarning(
        "MISSING_NARRATION",
        "Story narration is empty.",
        "warning",
      ),
    );
  }

  const skeletons: FootieScene[] = [];
  const weightsMs: number[] = [];

  for (const [index, mappedScene] of orderedScenes.entries()) {
    const { skeleton, weightMs } = buildSceneSkeleton(
      mappedScene,
      index,
      maxSubtitleWords,
      warnings,
      fallbacksUsed,
    );
    skeletons.push(skeleton);
    weightsMs.push(weightMs);
  }

  const timedScenes = applySceneTiming(skeletons, weightsMs, input.voiceoverDurationMs);
  const captionedScenes = applyGeneratedStorySceneCaptions(timedScenes);
  const productionScenes = regenerateProductionSceneIds(captionedScenes);
  const drafts = buildMaterializedDrafts(orderedScenes, productionScenes);

  const hasError = warnings.some((warning) => warning.severity === "error");

  return {
    scenes: drafts,
    footieScenes: productionScenes,
    warnings,
    diagnostics: buildMaterializationDiagnostics(drafts, 0, warnings, fallbacksUsed),
    success: !hasError,
  };
}
