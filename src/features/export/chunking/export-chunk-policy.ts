/**
 * Deterministic chunk-size policy (Sprint 6D).
 * Not user-configurable. Evidence-based conservative defaults.
 */

/** Product FPS — chunk duration targets assume this. */
export const EXPORT_CHUNK_POLICY_FPS = 30;

/** ~4 seconds at 30 FPS — baseline for 720p. */
export const EXPORT_CHUNK_FRAMES_720P = 120;

/** ~3 seconds at 30 FPS — tighter bound for 1080p MEMFS. */
export const EXPORT_CHUNK_FRAMES_1080P = 90;

/** Absolute minimum frames per chunk (except final partial). */
export const EXPORT_CHUNK_FRAMES_MIN = 30;

/** Absolute maximum frames per chunk. */
export const EXPORT_CHUNK_FRAMES_MAX = 180;

/**
 * Resolve frames-per-chunk from output dimensions.
 * Same width/height always yields the same size (deterministic).
 */
export function resolveExportChunkSizeFrames(input: {
  readonly width: number;
  readonly height: number;
  readonly estimatedHeapLimitBytes?: number;
  readonly targetChunkDurationSec?: number;
  readonly fps?: number;
}): number {
  const fps =
    input.fps && input.fps > 0 && Number.isFinite(input.fps)
      ? input.fps
      : EXPORT_CHUNK_POLICY_FPS;

  if (
    typeof input.targetChunkDurationSec === "number" &&
    input.targetChunkDurationSec > 0 &&
    Number.isFinite(input.targetChunkDurationSec)
  ) {
    return clampChunkSize(Math.round(input.targetChunkDurationSec * fps));
  }

  const pixels = Math.max(1, input.width) * Math.max(1, input.height);
  const is1080Class = pixels >= 1080 * 1920 * 0.9;

  let size = is1080Class ? EXPORT_CHUNK_FRAMES_1080P : EXPORT_CHUNK_FRAMES_720P;

  // Tighter chunks when estimated heap is low (still deterministic).
  const heap = input.estimatedHeapLimitBytes;
  if (typeof heap === "number" && Number.isFinite(heap) && heap > 0) {
    if (heap < 256 * 1024 * 1024) {
      size = Math.min(size, is1080Class ? 60 : 90);
    } else if (heap < 400 * 1024 * 1024) {
      size = Math.min(size, is1080Class ? 90 : 120);
    }
  }

  return clampChunkSize(size);
}

function clampChunkSize(value: number): number {
  return Math.max(
    EXPORT_CHUNK_FRAMES_MIN,
    Math.min(EXPORT_CHUNK_FRAMES_MAX, Math.floor(value)),
  );
}
