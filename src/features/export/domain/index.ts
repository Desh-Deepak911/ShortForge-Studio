/**
 * Export domain public API (Sprint 6B).
 */

export {
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_V2,
  isExportManifestV2,
  isExportManifestV3,
  isExportSceneManifestV3,
} from "./export-manifest.types";
export type {
  ExportManifest,
  ExportManifestV2,
  ExportManifestV3,
  ExportManifestDraft,
  ExportProjectManifest,
  ExportOutputManifest,
  ExportSceneManifest,
  ExportSceneManifestV2,
  ExportSceneManifestV3,
  ExportSceneMediaTimelineManifest,
  ExportSceneMediaTimelineItemManifest,
  ExportSceneMediaTransitionTrackManifest,
  ExportSceneMediaTransitionBoundaryManifest,
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
export {
  resolveExportActiveSceneMediaFrame,
  type ExportActiveSceneMediaFrame,
} from "./resolve-export-active-scene-media-frame";
export {
  resolveExportIntraSceneTransitionAtElapsed,
  type ResolvedExportIntraSceneTransition,
} from "./resolve-export-intra-scene-transition";
export { buildExportSceneMediaTransitionTrack } from "./build-export-scene-media-transitions";
export {
  validateExportManifestV2SceneMedia,
  assertExportManifestV2SceneMedia,
  exportMediaManifestSemanticallyEqual,
  validateExportSceneMediaTimelineFields,
  type ExportManifestV2IntegrityIssue,
  type ExportManifestV2IntegrityResult,
} from "./assert-export-manifest-v2-scene-media";
export {
  validateExportManifestV3SceneMedia,
  assertExportManifestV3SceneMedia,
  type ExportManifestV3IntegrityIssue,
  type ExportManifestV3IntegrityResult,
} from "./assert-export-manifest-v3-scene-media";
export {
  validateExportManifest,
  assertExportManifest,
  type ExportManifestIntegrityIssue,
  type ExportManifestIntegrityResult,
} from "./validate-export-manifest";
export {
  summarizeExportManifestV3Diagnostics,
  type ExportManifestV3DiagnosticsSummary,
} from "./export-manifest-v3-diagnostics";

export { deepFreezeExportManifest } from "./export-manifest-freeze";
export {
  buildExportManifestFingerprint,
  verifyExportManifestFingerprintCoherence,
} from "./export-manifest-fingerprint";
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
export {
  runExportCapabilityPreflight,
  EXPORT_INVALID_MANIFEST_COST_SENTINEL,
} from "./run-export-capability-preflight";
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
