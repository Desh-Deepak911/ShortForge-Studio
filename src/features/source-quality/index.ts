export type {
  SourceQualityAssessment,
  SourceQualityMetrics,
  SourceQualityStatus,
  SourceQualitySummaryKey,
  SourceQualityTargetId,
  SourceQualityTargetReadiness,
  SourceQualityWarningCode,
} from "./domain/source-quality-assessment";
export { resolveSourceQualityMedia } from "./adapters/resolve-source-quality-media";
export {
  resolveSourceQualityWinningAdjustmentTarget,
  type SourceQualityWinningAdjustmentTarget,
} from "./adapters/resolve-source-quality-adjustment-target";
export {
  assessSourceQuality,
  type SourceQualityFramingInput,
} from "./domain/assess-source-quality";
export {
  normalizeSourceQualityRotationDeg,
  normalizeSourceQualityZoom,
  resolveSourceQualityEffectiveDimensions,
} from "./domain/source-quality-effective-geometry";
export {
  SOURCE_QUALITY_AGGRESSIVE_CROP_RETAINED_AREA_THRESHOLD,
  SOURCE_QUALITY_ASPECT_MISMATCH_RELATIVE_TOLERANCE,
  SOURCE_QUALITY_TARGET_1080P,
  SOURCE_QUALITY_TARGET_4K,
  SOURCE_QUALITY_TARGET_720P,
  SOURCE_QUALITY_TARGET_ASPECT_RATIO,
  SOURCE_QUALITY_VERTICAL_TARGETS,
} from "./domain/source-quality-thresholds";
export type { SourceMediaMetadataFacts } from "./domain/source-media-metadata";
export {
  normalizeSourceMediaDimension,
  normalizeSourceMediaDurationMs,
  normalizeSourceMediaMetadataFacts,
  normalizeSourceMediaMimeType,
  sourceMediaMetadataFactsFromAssetResult,
} from "./domain/source-media-metadata";
export type {
  SourceQualityAdjustmentProvenance,
  SourceQualityAdjustmentProvenanceV1,
  SourceQualityAdjustmentRecommendationCode,
  SourceQualityNormalizedFramingSnapshot,
} from "./domain/source-quality-adjustment-provenance";
export {
  SOURCE_QUALITY_ADJUSTMENT_PROVENANCE_VERSION,
  framingSnapshotsEqual,
  normalizeSourceQualityAdjustmentProvenance,
  toFramingSnapshot,
} from "./domain/source-quality-adjustment-provenance";
export type {
  SourceQualityFramingPatchProposal,
  SourceQualityRecommendationReason,
  SourceQualitySafeAdjustmentRecommendation,
} from "./domain/safe-visual-adjustment-recommendation";
export {
  SOURCE_QUALITY_RECOMMENDATION_VERSION,
  fingerprintSourceQualityMedia,
  recommendSafeVisualAdjustment,
  sourceQualityRecommendationsSemanticallyEqual,
  sourceQualityStableHash,
} from "./domain/safe-visual-adjustment-recommendation";
export type {
  SourceQualityAdjustmentPresenceStatus,
  SourceQualityAdjustmentStaleReason,
  SourceQualityAdjustmentStalenessProjection,
} from "./domain/evaluate-source-quality-adjustment-staleness";
export { evaluateSourceQualityAdjustmentStaleness } from "./domain/evaluate-source-quality-adjustment-staleness";
export type {
  SourceQualityAdjustmentCommandFailure,
  SourceQualityAdjustmentCommandResult,
  SourceQualityAdjustmentCommandSuccess,
  SourceQualityAdjustmentTerminalCode,
} from "./editor/source-quality-adjustment.commands";
export {
  applySourceQualityAdjustmentRecommendation,
  dismissSourceQualityAdjustmentProvenance,
  undoSourceQualityAdjustmentRecommendation,
} from "./editor/source-quality-adjustment.commands";
export { default as SourceQualitySummary } from "./editor/SourceQualitySummary";
export type { SourceQualitySummaryProps } from "./editor/SourceQualitySummary";
export { default as SourceQualityAdjustmentControls } from "./editor/SourceQualityAdjustmentControls";
export type { SourceQualityAdjustmentControlsProps } from "./editor/SourceQualityAdjustmentControls";
