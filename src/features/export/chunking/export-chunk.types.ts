/**
 * Export chunk domain types (Sprint 6D).
 * Chunk boundaries are implementation details — global frame indexes remain canonical.
 */

export const EXPORT_CHUNKED_RENDERER_VERSION = "chunked-browser-v1" as const;

export interface ExportChunkDescriptor {
  readonly chunkIndex: number;
  /** Inclusive global frame index. */
  readonly globalStartFrame: number;
  /** Exclusive global frame index. */
  readonly globalEndFrameExclusive: number;
  readonly frameCount: number;
  /** Frame-center timestamp of first frame in chunk (ms). */
  readonly startTimestampMs: number;
  /** Frame-center timestamp of last frame in chunk (ms). */
  readonly endTimestampMs: number;
  /** MEMFS segment path for this chunk (e.g. segment-000.webm). */
  readonly outputPath: string;
}

export interface ExportChunkPlan {
  readonly totalFrames: number;
  readonly chunkSizeFrames: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly rendererVersion: typeof EXPORT_CHUNKED_RENDERER_VERSION;
  readonly chunks: readonly ExportChunkDescriptor[];
}

export interface EncodedExportChunk {
  readonly descriptor: ExportChunkDescriptor;
  readonly path: string;
  readonly frameCount: number;
  readonly durationSec: number;
  readonly byteSize: number;
}

export interface ExportChunkValidationResult {
  readonly ok: boolean;
  readonly path: string;
  readonly frameCount: number;
  readonly expectedDurationSec: number;
  readonly byteSize: number;
  readonly detail?: string;
}

export interface ExportChunkCleanupReport {
  readonly deletedFrameCount: number;
  readonly chunkIndex: number;
}

export interface BuildExportChunkPlanInput {
  readonly totalFrames: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly estimatedHeapLimitBytes?: number;
  /** Override only for tests — production uses policy. */
  readonly targetChunkDurationSec?: number;
  readonly chunkSizeFrames?: number;
}
