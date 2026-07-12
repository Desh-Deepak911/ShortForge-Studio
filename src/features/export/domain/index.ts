/**
 * Export domain public API (Sprint 6B).
 */

export {
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
} from "./export-manifest.types";
export type {
  ExportManifest,
  ExportManifestDraft,
  ExportProjectManifest,
  ExportOutputManifest,
  ExportSceneManifest,
  ExportMediaManifest,
  ExportCaptionManifest,
  ExportCaptionLayoutManifest,
  ExportCaptionStyleManifest,
  ExportAudioManifest,
  ExportBrandingManifest,
  ExportCapabilitySnapshot,
  ExportEnvironmentSnapshot,
  ExportManifestFormat,
  ExportManifestQuality,
  ExportManifestResolutionLabel,
} from "./export-manifest.types";

export { deepFreezeExportManifest } from "./export-manifest-freeze";
export { buildExportManifestFingerprint } from "./export-manifest-fingerprint";
export {
  formatExportVideoBitrateArg,
  isExportVisualQualityDebugEnabled,
  logExportVisualQualityProfile,
  resolveExportFrameIntermediateQuality,
  resolveExportVisualQualityProfile,
  summarizeExportVisualQualityProfile,
  type ExportFrameIntermediateFormat,
  type ExportVisualQualityProfile,
  type ExportVisualQualityProfileInput,
} from "./export-visual-quality-profile";
export {
  buildExportManifest,
  type BuildExportManifestInput,
} from "./build-export-manifest";
export {
  normalizeCaptionOpacity,
  normalizeCaptionOpacityPercent,
  normalizeCaptionOpacityAlpha,
  composeCaptionAnimationOpacity,
} from "./normalize-caption-opacity";
export {
  resolveExportCaptionLayout,
  captionLayoutManifestToCaptionLayout,
  scaleReferenceCaptionOffsetX,
  scaleReferenceCaptionOffsetY,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  type ResolvedExportCaptionLayout,
} from "./resolve-export-caption-layout";
export {
  buildExportEnvironmentSnapshot,
  markExportFfmpegRuntimePoisoned,
  isExportFfmpegRuntimePoisoned,
} from "./export-environment.utils";
export { estimateExportCost } from "./export-cost-estimate.utils";
export { runExportCapabilityPreflight } from "./run-export-capability-preflight";
export {
  selectExportRenderer,
  exportRequiresServerRenderer,
} from "./select-export-renderer";
export {
  prepareExportRequest,
  isExportPreflightError,
  type PrepareExportRequestInput,
  type PrepareExportRequestResult,
} from "./prepare-export-request";
export {
  ExportPreflightError,
  type ExportCapabilityResult,
  type ExportRendererKind,
  type ExportBlocker,
  type ExportWarning,
  type ExportCostEstimate,
  type PreparedExportRequest,
  type ExportBlockerCode,
  type ExportWarningCode,
} from "./export-capability.types";
export {
  EXPORT_BLOCKER_MESSAGES,
  EXPORT_WARNING_MESSAGES,
  EXPORT_SUPPORTED_TRANSITIONS,
} from "./export-preflight.constants";
