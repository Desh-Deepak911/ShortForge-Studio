export type {
  AssetRequirement,
  AssetRequirementType,
  NarrativeArc,
  NarrativeArcType,
  NarrativeBeat,
  NarrativeBeatType,
  SceneImportanceScore,
  ScenePlan,
  ScenePlanRole,
  StoryModeStrategy,
  StoryStructureArcId,
  StoryStructurePlan,
  StudioIntelligenceInput,
  StudioIntelligenceMetrics,
  StudioIntelligenceResult,
  StudioIntelligenceSummary,
  StudioIntelligenceDiagnostics,
  TimingSuggestion,
  VisualIntent,
  VisualIntentType,
} from "./studio-intelligence.types";

export type {
  AssetBlueprint,
  AssetBlueprintOrientation,
  CaptionBlueprint,
  CaptionBlueprintEmphasis,
  CaptionBlueprintStyleHint,
  MotionBlueprint,
  MotionBlueprintIntensity,
  MotionBlueprintSuggestion,
  SceneBlueprint,
  SceneBlueprintCollection,
  SceneBlueprintKind,
  SceneBlueprintRole,
  SceneBlueprintSource,
  TimingBlueprint,
  TimingBlueprintPacing,
  VisualBlueprint,
} from "./scene-blueprint.types";

export {
  DEFAULT_SCENE_IMPORTANCE_RANGES,
  DEFAULT_STORY_MODE_STRATEGIES,
  DEFAULT_TIMING_WEIGHTS,
  NARRATIVE_ARC_SCENE_COUNT_RANGES,
  NARRATIVE_ARC_TYPE_LABELS,
  NARRATIVE_BEAT_TYPE_LABELS,
  STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
  STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS,
  STUDIO_INTELLIGENCE_SUPPORTED_STORY_STRUCTURES,
  STUDIO_INTELLIGENCE_VERSION,
  STUDIO_INTELLIGENCE_WORDS_PER_SECOND,
  VISUAL_INTENT_TYPE_LABELS,
  resolveDefaultStoryModeStrategy,
  resolveSupportedStoryStructure,
} from "./studio-intelligence.constants";

export {
  clampSceneDurationMs,
  createEmptyStudioIntelligenceResult,
  estimateReadingTimeMs,
  getDefaultHookTimingWeight,
  getSupportedStoryStructureCount,
  normalizeNarrationText,
  resolveSceneImportanceTier,
  splitNarrationIntoSentences,
} from "./studio-intelligence.utils";

export {
  classifySentenceBeat,
  detectNarrativeBeats,
  inferBeatEmotion,
  inferBeatPurpose,
  scoreBeatImportance,
} from "./narrative-beat-detector";

export {
  buildNarrativeArcs,
  calculateArcDuration,
  calculateArcImportance,
  determineDominantEmotion,
  determineDominantPurpose,
  groupConflictArc,
  groupDevelopmentArc,
  groupEndingArc,
  groupOpeningArc,
  suggestArcSceneCount,
} from "./narrative-arc-builder";

export {
  calculateBlueprintCollectionStats,
  clampBlueprintConfidence,
  createEmptySceneBlueprintCollection,
  createSceneBlueprintId,
  mapImportanceToMotionIntensity,
  mapVisualIntentToAssetRequirement,
  normalizeAssetSearchQuery,
  refreshBlueprintCollectionStats,
} from "./scene-blueprint.utils";

export {
  chooseSceneBlueprintKind,
  chooseSceneBlueprintRole,
  createCaptionBlueprintForBeat,
  createTimingBlueprintForBeat,
  planSceneBlueprintsFromArcs,
  planScenesForArc,
} from "./scene-planner";

export {
  buildAssetSearchQuery,
  buildFallbackAssetQuery,
  createAssetBlueprintForScene,
  createMotionBlueprintForScene,
  createVisualBlueprintForScene,
  enrichBlueprintsWithVisuals,
  inferCompositionFromVisualIntent,
  inferVisualIntentFromRole,
} from "./visual-planner";

export {
  allocateDurationAcrossBlueprints,
  applyDynamicTiming,
  calculateBlueprintTimingWeight,
  calculateTargetDurationMs,
  enforceTimingBounds,
  inferPacingFromRoleAndImportance,
  normalizeDurationAllocation,
} from "./dynamic-timing-planner";

export {
  STUDIO_INTELLIGENCE_PLANNER_STEPS,
  runStudioIntelligence,
} from "./studio-intelligence-runtime";

export type {
  StoryStrategy,
  StoryStrategyArcStrategy,
  StoryStrategyAssetBias,
  StoryStrategyCaptionBias,
  StoryStrategyHookStrategy,
  StoryStrategyId,
  StoryStrategyModeInput,
  StoryStrategyMotionBias,
  StoryStrategySceneDensity,
  StoryStrategyTimingBias,
  StoryStrategyVisualBias,
} from "./story-strategy";

export {
  DEFAULT_STORY_STRATEGY_ID,
  SCRIPT_MODE_TO_STORY_STRATEGY_ID,
  STORY_STRATEGY_ALIASES,
  STORY_STRATEGY_IDS,
  STORY_STRATEGY_REGISTRY,
  STORY_STRATEGY_VERSION,
  getDefaultStoryStrategy,
  getStoryStrategyById,
  getStoryStrategyRegistry,
  isKnownStoryStrategyMode,
  listStoryStrategies,
  listStoryStrategyIds,
  mapModeToStoryStrategyId,
  normalizeStoryStrategyModeInput,
  resolveStoryStrategy,
  resolvePlannerStrategy,
  resolveScriptModeFromStrategy,
  resolveStructureLabelFromStrategy,
  strategyFallbackQuery,
  strategyIntroVisualOverride,
} from "./story-strategy";

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
  BlueprintSceneTimingMetadata,
  BlueprintSceneVisualHints,
  NarrationSlicingStrategy,
  SceneMappingDecision,
  SceneMappingMethod,
} from "./blueprint-adapter";

export {
  BLUEPRINT_ADAPTER_VERSION,
  EMPTY_ADAPTER_DIAGNOSTICS,
  EMPTY_ADAPTER_STATISTICS,
  LOW_CONFIDENCE_THRESHOLD,
  aggregateAdapterStatistics,
  buildAdapterDiagnostics,
  clampAdapterConfidence,
  cloneBlueprintAdapterInput,
  collectBlueprintMapperWarnings,
  collectLowConfidenceSceneIds,
  countWarningsByType,
  createBlueprintAdapterWarning,
  createEmptyBlueprintAdapterResult,
  createPlaceholderNarrationMetadata,
  deriveMappedSceneId,
  enrichMappedScenesWithNarration,
  isValidBlueprintAdapterInput,
  isValidBlueprintAdapterResult,
  mapBlueprintAssetToMediaHints,
  mapBlueprintCaptionToCaptionHints,
  mapBlueprintKindToSceneType,
  mapBlueprintMotionToMotionPreset,
  mapBlueprintRoleToSceneRole,
  mapBlueprintsToScenes,
  mapBlueprintTimingToSceneDuration,
  mapBlueprintToScene,
  mapBlueprintVisualToSceneHints,
  resolveNarrationSlicingStrategy,
  sliceNarrationFromBlueprintSummary,
  sliceNarrationProportionally,
} from "./blueprint-adapter";

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
} from "./footie-script-materializer";

export type {
  SceneDensityAdaptationDiagnostics,
  SceneDensityAdaptationResult,
  SceneDensityAdaptationStep,
  SceneDensityAdaptationStrategy,
  SceneDensityAdapterVersion,
} from "./scene-density/scene-density.types";

export {
  adaptSceneDensity,
} from "./scene-density/scene-density-adapter";

export {
  SCENE_DENSITY_ADAPTER_VERSION,
  cloneSceneBlueprint,
  cloneSceneBlueprintCollection,
  collectBlueprintBeatIds,
  collectNormalizedSummaries,
  durationPreserved,
  findBestMergeCandidate,
  findBestSplitCandidate,
  isHighImportanceBlueprint,
  isLowImportanceBlueprint,
  isSplittableBlueprint,
  lineagePreserved,
  maxImportancePreserved,
  mergeAdjacentBlueprints,
  narrationCoveragePreserved,
  splitBlueprint,
  sumBlueprintDurationMs,
} from "./scene-density/scene-density.utils";

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
  materializeMappedScenesToFootieScript,
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
} from "./footie-script-materializer";
