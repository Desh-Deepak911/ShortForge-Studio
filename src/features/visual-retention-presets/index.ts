/**
 * Visual Retention Presets — catalog, planning, fingerprint, Apply/Undo,
 * Project Inspector UI, and non-blocking export guidance.
 */

export {
  assertValidVisualRetentionPresetRecipe,
  deriveVisualRetentionPresetAuthoringCapabilities,
  getVisualRetentionPresetById,
  getVisualRetentionPresetCatalogVersion,
  isPromotionalVisualRetentionPreset,
  listVisualRetentionPresets,
} from "./domain/visual-retention-preset.catalog";

export {
  isVisualRetentionPresetId,
  VISUAL_RETENTION_PRESET_CATALOG_VERSION,
  VISUAL_RETENTION_PRESET_IDS,
  type VisualRetentionPresetBrandStingDurationMs,
  type VisualRetentionPresetDefinitionV1,
  type VisualRetentionPresetEngagementRecipeV1,
  type VisualRetentionPresetEngagementTimingPolicy,
  type VisualRetentionPresetId,
  type VisualRetentionPresetLookPresetId,
  type VisualRetentionPresetLookRecipeV1,
  type VisualRetentionPresetMotionPresetId,
  type VisualRetentionPresetMotionRecipeV1,
  type VisualRetentionPresetOutroRecipeV1,
  type VisualRetentionPresetPacingRecipeV1,
  type VisualRetentionPresetPreservationV1,
  type VisualRetentionPresetRecipeV1,
} from "./domain/visual-retention-preset.types";

export {
  digestVisualRetentionPresetCanonicalPayload,
  fingerprintVisualRetentionPresetCanonicalPayload,
  stableStringifyVisualRetentionPresetValue,
  visualRetentionPresetStableHash,
  VISUAL_RETENTION_PRESET_FINGERPRINT_PREFIX,
  VISUAL_RETENTION_PRESET_PLANNER_VERSION,
} from "./domain/visual-retention-preset-fingerprint";

export {
  buildVisualRetentionPresetApplicationPlan,
  validateVisualRetentionPresetProjectFacts,
  VISUAL_RETENTION_PRESET_PLAN_REASON_CODES,
  VISUAL_RETENTION_PRESET_PLAN_TERMINAL_CODES,
  type BuildVisualRetentionPresetApplicationPlanInput,
  type VisualRetentionPresetApplicationPlanV1,
  type VisualRetentionPresetMediaTargetFactV1,
  type VisualRetentionPresetPlanActionV1,
  type VisualRetentionPresetPlanConflictV1,
  type VisualRetentionPresetPlanEntryCategory,
  type VisualRetentionPresetPlanningCapabilities,
  type VisualRetentionPresetPlanReasonCode,
  type VisualRetentionPresetPlanSkipV1,
  type VisualRetentionPresetPlanSummaryV1,
  type VisualRetentionPresetPlanTerminalCode,
  type VisualRetentionPresetPlanWarningV1,
  type VisualRetentionPresetProjectFactsV1,
  type VisualRetentionPresetSceneFactV1,
  type VisualRetentionPresetStoredBeatPlanFactV1,
} from "./domain/build-visual-retention-preset-plan";

export {
  projectStoryVisualRetentionPresetInput,
  serializeVisualRetentionPresetFactsForCompare,
  type ProjectStoryVisualRetentionPresetInputOptions,
} from "./adapters/project-story-visual-retention-preset-input";

export {
  resolveVisualRetentionPresetExportGuidance,
  VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES,
  VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_MESSAGES,
  type ResolveVisualRetentionPresetExportGuidanceInput,
  type VisualRetentionPresetExportGuidanceCode,
  type VisualRetentionPresetExportGuidanceItem,
} from "./adapters/resolve-visual-retention-preset-export-guidance";

export {
  evaluateVisualRetentionPresetStaleness,
  VISUAL_RETENTION_PRESET_STALE_REASONS,
  type VisualRetentionPresetEffectiveStatus,
  type VisualRetentionPresetStaleReason,
  type VisualRetentionPresetStalenessCapabilities,
  type VisualRetentionPresetStalenessProjection,
} from "./domain/evaluate-visual-retention-preset-staleness";

export {
  applyVisualRetentionPresetPlan,
  dismissVisualRetentionPresetApplication,
  keepVisualRetentionPresetApplication,
  undoVisualRetentionPresetApplication,
  type VisualRetentionPresetApplyFailure,
  type VisualRetentionPresetApplyResult,
  type VisualRetentionPresetApplySuccess,
  type VisualRetentionPresetApplyTerminalCode,
  type VisualRetentionPresetBeforeActionHook,
  type VisualRetentionPresetCommandCapabilities,
  type VisualRetentionPresetDismissFailure,
  type VisualRetentionPresetDismissResult,
  type VisualRetentionPresetDismissSuccess,
  type VisualRetentionPresetDismissTerminalCode,
  type VisualRetentionPresetFailedActionRef,
  type VisualRetentionPresetUndoFailure,
  type VisualRetentionPresetUndoResult,
  type VisualRetentionPresetUndoSuccess,
  type VisualRetentionPresetUndoTerminalCode,
} from "./editor/visual-retention-preset.commands";

export { useVisualRetentionPresetSelection } from "./editor/useVisualRetentionPresetSelection";

export {
  default as VisualRetentionPresetPlanPreview,
  type VisualRetentionPresetPlanPreviewProps,
} from "./editor/VisualRetentionPresetPlanPreview";

export {
  default as VisualRetentionPresetsPanel,
  type VisualRetentionPresetsPanelCapabilities,
  type VisualRetentionPresetsPanelProps,
} from "./editor/VisualRetentionPresetsPanel";