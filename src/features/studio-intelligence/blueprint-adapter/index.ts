export type {
  AdapterStatistics,
  BlueprintAdapterDiagnostics,
  BlueprintAdapterInput,
  BlueprintAdapterMappingVersion,
  BlueprintAdapterResult,
  BlueprintAdapterWarning,
  BlueprintAdapterWarningSeverity,
  BlueprintMappedScene,
  BlueprintSceneCaptionHints,
  BlueprintSceneMediaHints,
  BlueprintSceneMotionHints,
  BlueprintSceneNarrationMetadata,
  BlueprintSceneNarrationStrategy,
  BlueprintSceneSemanticMetadata,
  BlueprintSceneTimingMetadata,
  BlueprintSceneVisualHints,
  NarrationSlicingStrategy,
  SceneMappingDecision,
  SceneMappingMethod,
} from "./blueprint-adapter.types";

export {
  BLUEPRINT_ADAPTER_VERSION,
  EMPTY_ADAPTER_DIAGNOSTICS,
  EMPTY_ADAPTER_STATISTICS,
  LOW_CONFIDENCE_THRESHOLD,
  aggregateAdapterStatistics,
  buildAdapterDiagnostics,
  clampAdapterConfidence,
  cloneBlueprintAdapterInput,
  collectLowConfidenceSceneIds,
  countWarningsByType,
  createBlueprintAdapterWarning,
  createEmptyBlueprintAdapterResult,
  deriveMappedSceneId,
  isValidBlueprintAdapterInput,
  isValidBlueprintAdapterResult,
} from "./blueprint-adapter.utils";

export {
  createPlaceholderNarrationMetadata,
  enrichMappedScenesWithNarration,
  resolveNarrationSlicingStrategy,
  sliceNarrationFromBlueprintSummary,
  sliceNarrationProportionally,
} from "./blueprint-adapter-enrichment.utils";

export {
  isCollapsedSemanticKind,
  resolveBlueprintSemanticMetadata,
  resolveContentPattern,
  sceneHasPreservedTemplateSemantics,
  visualIntentSupportsContentPattern,
} from "./blueprint-adapter-semantics.utils";

export {
  collectBlueprintMapperWarnings,
  mapBlueprintAssetToMediaHints,
  mapBlueprintCaptionToCaptionHints,
  mapBlueprintKindToSceneType,
  mapBlueprintMotionToMotionPreset,
  mapBlueprintRoleToSceneRole,
  mapBlueprintsToScenes,
  mapBlueprintTimingToSceneDuration,
  mapBlueprintToScene,
  mapBlueprintVisualToSceneHints,
} from "./blueprint-mapper";
