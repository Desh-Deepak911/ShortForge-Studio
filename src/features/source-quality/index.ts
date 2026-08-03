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
export { default as SourceQualitySummary } from "./editor/SourceQualitySummary";
export type { SourceQualitySummaryProps } from "./editor/SourceQualitySummary";
