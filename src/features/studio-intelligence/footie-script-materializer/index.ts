export type {
  FootieScriptMaterializerInput,
  FootieScriptMaterializerResult,
  FootieScriptMaterializerVersion,
  MaterializedSceneDraft,
  MaterializedSceneLineage,
  MaterializedScenePlanningMetadata,
  MaterializationDiagnostics,
  MaterializationWarning,
  MaterializationWarningSeverity,
} from "./footie-script-materializer.types";

export {
  DEFAULT_MAX_SUBTITLE_WORDS,
  EMPTY_MATERIALIZATION_DIAGNOSTICS,
  FOOTIE_SCRIPT_MATERIALIZER_VERSION,
  buildMaterializationDiagnostics,
  capSubtitleWords,
  clampMaterializerConfidence,
  cloneFootieScriptMaterializerInput,
  countMaterializationWarningsByType,
  createMaterializationWarning,
  isValidFootieScriptMaterializerInput,
  mapBlueprintMotionToDeferredImageMotion,
  materializerInputsEqual,
  regenerateProductionSceneIds,
  resolveDeferredImageMotion,
  resolveDurationWeightMs,
  resolveFirstSentence,
  resolveMaterializedNarration,
  resolveMaterializedSubtitle,
  resolveProductionSceneType,
  subtitlesWithinWordCap,
  validateMappedSceneLineage,
} from "./footie-script-materializer.utils";

export { materializeMappedScenesToFootieScript } from "./footie-script-materializer";
