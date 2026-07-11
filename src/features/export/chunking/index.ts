/**
 * Export chunking public API (Sprint 6D).
 */

export type {
  BuildExportChunkPlanInput,
  EncodedExportChunk,
  ExportChunkCleanupReport,
  ExportChunkDescriptor,
  ExportChunkPlan,
  ExportChunkValidationResult,
} from "./export-chunk.types";

export { EXPORT_CHUNKED_RENDERER_VERSION } from "./export-chunk.types";

export {
  EXPORT_CHUNK_FRAMES_1080P,
  EXPORT_CHUNK_FRAMES_720P,
  EXPORT_CHUNK_FRAMES_MAX,
  EXPORT_CHUNK_FRAMES_MIN,
  EXPORT_CHUNK_POLICY_FPS,
  resolveExportChunkSizeFrames,
} from "./export-chunk-policy";

export {
  assertExportChunkPlanCoverage,
  buildChunkFrameFilename,
  buildChunkFramePattern,
  buildExportChunkPlan,
  buildSegmentOutputPath,
} from "./build-export-chunk-plan";

export {
  assertExportSegmentEncodeArgs,
  buildExportSegmentEncodeArgs,
  EXPORT_SEGMENT_BITRATE,
  EXPORT_SEGMENT_CODEC,
  EXPORT_SEGMENT_CPU_USED,
  EXPORT_SEGMENT_DEADLINE,
  EXPORT_SEGMENT_PIXEL_FORMAT,
} from "./encode-export-chunk";

export {
  assertOrderedChunkSegments,
  buildExportChunkConcatArgs,
  buildExportChunkConcatList,
  CONCAT_LIST_FILENAME,
  CONCAT_OUTPUT_FILENAME,
} from "./concat-export-chunks";

export {
  cleanupExportChunkFiles,
  cleanupExportChunkFrames,
  listChunkFrameFilenames,
} from "./cleanup-export-chunk";

export {
  resolveChunkExpectedDurationSec,
  toEncodedExportChunk,
  validateConcatenatedVisual,
  validateEncodedExportChunk,
} from "./validate-export-chunk";

export {
  classifyExportFfmpegFailure,
  isExportFfmpegPoisonFailure,
  type ExportFfmpegFailureCode,
} from "./export-ffmpeg-failure";

export {
  renderExportChunkFrames,
  type RenderExportChunkResult,
} from "./render-export-chunk";

export {
  renderChunkedSilentVisual,
  type ChunkedSilentVisualResult,
} from "./render-chunked-silent-visual";
