import type {
  AdapterStatistics,
  BlueprintAdapterDiagnostics,
  BlueprintAdapterInput,
  BlueprintAdapterResult,
  BlueprintAdapterWarning,
  BlueprintMappedScene,
  NarrationSlicingStrategy,
} from "./blueprint-adapter.types";
import type { MotionBlueprintSuggestion } from "../scene-blueprint.types";
import type { VisualIntentType } from "../studio-intelligence.types";
import { resolveNarrationSlicingStrategy } from "./blueprint-adapter-enrichment.utils";
import {
  isCollapsedSemanticKind,
  sceneHasPreservedTemplateSemantics,
} from "./blueprint-adapter-semantics.utils";

/** Current blueprint adapter contract version. */
export const BLUEPRINT_ADAPTER_VERSION = "0.4.0";

const LOW_CONFIDENCE_THRESHOLD = 0.45;

export const EMPTY_ADAPTER_STATISTICS: AdapterStatistics = {
  sceneCount: 0,
  totalDurationMs: 0,
  averageSceneDurationMs: 0,
  minSceneDurationMs: 0,
  maxSceneDurationMs: 0,
  averageConfidence: 1,
  visualIntentCoverage: 0,
  assetQueryCoverage: 0,
  motionCoverage: 0,
  captionCoverage: 0,
  mappedVisualIntents: {},
  mappedMotions: {},
};

export const EMPTY_ADAPTER_DIAGNOSTICS: BlueprintAdapterDiagnostics = {
  mappingVersion: BLUEPRINT_ADAPTER_VERSION,
  unmappedFields: [],
  confidence: 1,
  fallbacksUsed: [],
  processedBlueprintCount: 0,
  skippedBlueprintCount: 0,
  narrationSlicingStrategy: "none",
  lowConfidenceSceneIds: [],
  warningCountsByType: {},
};

/** Clamps a normalized confidence value to `[0, 1]`. */
export function clampAdapterConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

/** Validates that adapter input includes a blueprint collection shell. */
export function isValidBlueprintAdapterInput(input: BlueprintAdapterInput | null | undefined): input is BlueprintAdapterInput {
  if (input == null) {
    return false;
  }

  if (input.collection == null || !Array.isArray(input.collection.blueprints)) {
    return false;
  }

  if (input.targetDurationMs != null && (!Number.isFinite(input.targetDurationMs) || input.targetDurationMs < 0)) {
    return false;
  }

  return true;
}

/** Returns whether a result satisfies the adapter output contract shape. */
export function isValidBlueprintAdapterResult(result: BlueprintAdapterResult): boolean {
  return (
    Array.isArray(result.mappedScenes) &&
    Array.isArray(result.warnings) &&
    result.diagnostics != null &&
    result.statistics != null &&
    typeof result.success === "boolean" &&
    typeof result.diagnostics.mappingVersion === "string" &&
    Array.isArray(result.diagnostics.unmappedFields) &&
    Array.isArray(result.diagnostics.fallbacksUsed) &&
    Array.isArray(result.diagnostics.lowConfidenceSceneIds) &&
    typeof result.diagnostics.narrationSlicingStrategy === "string" &&
    Number.isFinite(result.statistics.sceneCount) &&
    Number.isFinite(result.statistics.totalDurationMs) &&
    Number.isFinite(result.statistics.averageConfidence) &&
    Number.isFinite(result.statistics.averageSceneDurationMs) &&
    Number.isFinite(result.statistics.minSceneDurationMs) &&
    Number.isFinite(result.statistics.maxSceneDurationMs) &&
    Number.isFinite(result.statistics.visualIntentCoverage) &&
    Number.isFinite(result.statistics.assetQueryCoverage) &&
    Number.isFinite(result.statistics.motionCoverage) &&
    Number.isFinite(result.statistics.captionCoverage)
  );
}

/** Returns an empty adapter result shell. */
export function createEmptyBlueprintAdapterResult(
  input?: BlueprintAdapterInput,
): BlueprintAdapterResult {
  const blueprintCount = input?.collection.blueprints.length ?? 0;

  return {
    mappedScenes: [],
    warnings: [],
    diagnostics: {
      ...EMPTY_ADAPTER_DIAGNOSTICS,
      processedBlueprintCount: blueprintCount,
    },
    statistics: {
      ...EMPTY_ADAPTER_STATISTICS,
    },
    success: blueprintCount === 0,
  };
}

/** Creates a structured adapter warning. */
export function createBlueprintAdapterWarning(
  code: string,
  message: string,
  severity: BlueprintAdapterWarning["severity"] = "warning",
  blueprintId?: string,
  field?: string,
): BlueprintAdapterWarning {
  return {
    code,
    message,
    severity,
    blueprintId,
    field,
  };
}

/** Derives a mapped scene id from a blueprint id while preserving lineage. */
export function deriveMappedSceneId(blueprintId: string): string {
  const normalized = blueprintId.trim();
  if (!normalized) {
    return "mapped-scene-unknown";
  }

  return normalized.startsWith("mapped:") ? normalized : `mapped:${normalized}`;
}

function sceneHasVisualCoverage(scene: BlueprintMappedScene): boolean {
  return (
    scene.visualIntentType !== "neutral_broll" ||
    Boolean(scene.visualHints.composition || scene.visualHints.subject || scene.visualHints.emotion)
  );
}

function sceneHasAssetCoverage(scene: BlueprintMappedScene): boolean {
  return Boolean(scene.assetSearchQuery?.trim() || scene.mediaHints.searchQuery?.trim());
}

function sceneHasMotionCoverage(scene: BlueprintMappedScene): boolean {
  return scene.motionHints.suggestedMotion !== "static" || scene.motionHints.intensity !== "low";
}

function sceneHasCaptionCoverage(scene: BlueprintMappedScene): boolean {
  return Boolean(
    scene.captionText?.trim() ||
      scene.captionHints.captionText?.trim() ||
      scene.captionHints.highlightWords.length > 0,
  );
}

/** Aggregates adapter statistics from mapped scenes. */
export function aggregateAdapterStatistics(mappedScenes: readonly BlueprintMappedScene[]): AdapterStatistics {
  if (mappedScenes.length === 0) {
    return { ...EMPTY_ADAPTER_STATISTICS };
  }

  const mappedVisualIntents: Partial<Record<VisualIntentType, number>> = {};
  const mappedMotions: Partial<Record<MotionBlueprintSuggestion, number>> = {};
  const durations = mappedScenes.map((scene) => scene.durationMs);
  let confidenceTotal = 0;
  let visualCount = 0;
  let assetCount = 0;
  let motionCount = 0;
  let captionCount = 0;

  for (const scene of mappedScenes) {
    confidenceTotal += scene.confidence;

    const intent = scene.visualIntentType;
    mappedVisualIntents[intent] = (mappedVisualIntents[intent] ?? 0) + 1;

    const motion = scene.motionSuggestion;
    mappedMotions[motion] = (mappedMotions[motion] ?? 0) + 1;

    if (sceneHasVisualCoverage(scene)) {
      visualCount += 1;
    }
    if (sceneHasAssetCoverage(scene)) {
      assetCount += 1;
    }
    if (sceneHasMotionCoverage(scene)) {
      motionCount += 1;
    }
    if (sceneHasCaptionCoverage(scene)) {
      captionCount += 1;
    }
  }

  const totalDurationMs = durations.reduce((total, duration) => total + duration, 0);
  const sceneCount = mappedScenes.length;

  return {
    sceneCount,
    totalDurationMs,
    averageSceneDurationMs: totalDurationMs / sceneCount,
    minSceneDurationMs: Math.min(...durations),
    maxSceneDurationMs: Math.max(...durations),
    averageConfidence: clampAdapterConfidence(confidenceTotal / sceneCount),
    visualIntentCoverage: clampAdapterConfidence(visualCount / sceneCount),
    assetQueryCoverage: clampAdapterConfidence(assetCount / sceneCount),
    motionCoverage: clampAdapterConfidence(motionCount / sceneCount),
    captionCoverage: clampAdapterConfidence(captionCount / sceneCount),
    mappedVisualIntents,
    mappedMotions,
  };
}

/** Counts adapter warnings grouped by warning code. */
export function countWarningsByType(
  warnings: readonly BlueprintAdapterWarning[],
): Readonly<Partial<Record<string, number>>> {
  const counts: Partial<Record<string, number>> = {};

  for (const warning of warnings) {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1;
  }

  return counts;
}

/** Collects mapped scene ids below the adapter confidence threshold. */
export function collectLowConfidenceSceneIds(
  mappedScenes: readonly BlueprintMappedScene[],
  threshold: number = LOW_CONFIDENCE_THRESHOLD,
): string[] {
  return mappedScenes.filter((scene) => scene.confidence < threshold).map((scene) => scene.id);
}

/** Builds adapter diagnostics from a mapping pass. */
export function buildAdapterDiagnostics(options: {
  unmappedFields: readonly string[];
  fallbacksUsed: readonly string[];
  processedBlueprintCount: number;
  skippedBlueprintCount: number;
  mappedScenes: readonly BlueprintMappedScene[];
  warnings: readonly BlueprintAdapterWarning[];
  narrationSlicingStrategy?: NarrationSlicingStrategy;
}): BlueprintAdapterDiagnostics {
  const statistics = aggregateAdapterStatistics(options.mappedScenes);
  const sceneCount = options.mappedScenes.length;

  let semanticsPreserved = 0;
  const collapsedKinds = new Set<string>();

  for (const scene of options.mappedScenes) {
    if (sceneHasPreservedTemplateSemantics(scene)) {
      semanticsPreserved += 1;
    }

    if (
      isCollapsedSemanticKind(scene.blueprintKind, scene.contentPattern, scene.proposedSceneType)
    ) {
      collapsedKinds.add(scene.blueprintKind);
    }
  }

  const semanticCoverage =
    sceneCount === 0
      ? 0
      : clampAdapterConfidence(
          options.mappedScenes.filter((scene) => Boolean(scene.semanticSlotId)).length /
            sceneCount,
        );

  return {
    mappingVersion: BLUEPRINT_ADAPTER_VERSION,
    unmappedFields: [...options.unmappedFields],
    confidence: statistics.averageConfidence,
    fallbacksUsed: [...options.fallbacksUsed],
    processedBlueprintCount: options.processedBlueprintCount,
    skippedBlueprintCount: options.skippedBlueprintCount,
    narrationSlicingStrategy:
      options.narrationSlicingStrategy ?? resolveNarrationSlicingStrategy(options.mappedScenes),
    lowConfidenceSceneIds: collectLowConfidenceSceneIds(options.mappedScenes),
    warningCountsByType: countWarningsByType(options.warnings),
    semanticCoverage,
    collapsedSemanticKinds: [...collapsedKinds],
    modeTemplateSemanticsPreserved: semanticsPreserved,
  };
}

/** Returns a shallow clone of adapter input for safe handoff between phases. */
export function cloneBlueprintAdapterInput(input: BlueprintAdapterInput): BlueprintAdapterInput {
  return {
    ...input,
    collection: {
      ...input.collection,
      blueprints: [...input.collection.blueprints],
      sourceArcIds: [...input.collection.sourceArcIds],
      warnings: [...input.collection.warnings],
    },
  };
}

export { LOW_CONFIDENCE_THRESHOLD };
