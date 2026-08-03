/**
 * Headless-worker-safe export domain surface.
 *
 * Intentionally omits prepareExportRequest / buildExportManifest / capability
 * preflight / cost estimate — those pull drafts, browser UI, and product paths.
 * Hosted worker packaging must import from this module (or deeper leaves),
 * never from the full `./index` barrel.
 */

export {
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  EXPORT_MANIFEST_V5_VERSION,
  EXPORT_RENDERER_CONTRACT_V5,
  EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
  EXPORT_MANIFEST_V3_VERSION,
  EXPORT_RENDERER_CONTRACT_V3,
  EXPORT_MANIFEST_V2_VERSION,
  EXPORT_RENDERER_CONTRACT_V2,
  isExportManifestV2,
  isExportManifestV3,
  isExportManifestV4,
  isExportManifestV5,
  isExportSceneManifestV3,
} from "./export-manifest.types";
export type {
  ExportManifest,
  ExportManifestV2,
  ExportManifestV3,
  ExportManifestV4,
  ExportManifestV5,
  ExportManifestV5Draft,
  ExportRendererCapabilityId,
  ExportManifestV4Draft,
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
  validateExportManifestV4SceneMedia,
  assertExportManifestV4SceneMedia,
} from "./assert-export-manifest-v4-scene-media";
export {
  validateExportManifestV5SceneMedia,
  assertExportManifestV5SceneMedia,
} from "./assert-export-manifest-v5-scene-media";
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
