/**
 * Export formats public API (Sprint 6E).
 */

export type {
  ExportFallbackChoice,
  ExportFormatAdapter,
  ExportFormatArtifact,
  ExportFormatCodecPolicy,
  ExportFormatId,
  ExportMuxInput,
  FinalArtifactDurationPolicy,
} from "./export-format-adapter.types";

export {
  ExportFinalizationError,
  resolveFinalArtifactDurationPolicy,
} from "./export-format-adapter.types";

export {
  createWebmExportFormatAdapter,
  muxWebmWithManifestAudio,
  WEBM_CODEC_POLICY,
} from "./webm-export-format-adapter";

export {
  createMp4ExportFormatAdapter,
  muxMp4WithManifestAudio,
  MP4_CODEC_POLICY,
  MP4_ENCODER_ASSUMED_AVAILABLE,
} from "./mp4-export-format-adapter";

export {
  isExportFormatSupported,
  resolveExportFormatAdapter,
  resolveExportFormatId,
} from "./resolve-export-format-adapter";

export {
  probeExportMp4Runtime,
  getCachedExportRuntimeCodecProbe,
  clearExportRuntimeCodecProbeCache,
  setExportRuntimeCodecProbeForTests,
  buildExportRuntimeCodecProbeResult,
  isMp4ExportRuntimeAvailable,
  getExportRuntimeCodecProbeCacheKey,
  type ExportRuntimeCodecProbeResult,
  type ExportRuntimeCodecProbeOverrides,
} from "./export-runtime-codec-probe";

export {
  assertExportEndBufferContract,
  auditExportMuxDurationArgs,
  resolveExportEndOfProjectSnapshot,
  type ExportEndOfProjectSnapshot,
} from "./export-end-of-project";
