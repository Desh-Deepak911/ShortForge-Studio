import type {
  BuildVideoTrimPreviewOverrideInput,
  ResolveTrimPreviewScrubTimeInput,
  VideoTrimPreviewOverride,
} from "./video-trim-preview.types";

/** One-frame-ish offset so end-handle scrub does not land on an empty last sample. */
export const VIDEO_TRIM_PREVIEW_SAFE_FRAME_OFFSET_MS = 33;

/** Skip seeks when the video is already within this tolerance of the target. */
export const VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS = 16;

/**
 * Resolves the absolute source media time to display while scrubbing trim.
 * Start handle → draft start. End handle → just before draft end.
 */
export function resolveTrimPreviewScrubTimeMs(
  input: ResolveTrimPreviewScrubTimeInput,
): number {
  const trimStartMs = Math.max(
    0,
    Number.isFinite(input.trimStartMs) ? Math.round(input.trimStartMs) : 0,
  );
  const trimEndMs = Math.max(
    trimStartMs,
    Number.isFinite(input.trimEndMs) ? Math.round(input.trimEndMs) : trimStartMs,
  );

  let scrubTimeMs =
    input.activeHandle === "end"
      ? Math.max(trimStartMs, trimEndMs - VIDEO_TRIM_PREVIEW_SAFE_FRAME_OFFSET_MS)
      : trimStartMs;

  const sourceDurationMs =
    typeof input.sourceDurationMs === "number" &&
    Number.isFinite(input.sourceDurationMs) &&
    input.sourceDurationMs > 0
      ? Math.round(input.sourceDurationMs)
      : null;

  if (sourceDurationMs != null) {
    scrubTimeMs = Math.min(sourceDurationMs, Math.max(0, scrubTimeMs));
  } else {
    scrubTimeMs = Math.max(0, scrubTimeMs);
  }

  return scrubTimeMs;
}

/** Builds a temporary preview override from draft trim + active handle. */
export function buildVideoTrimPreviewOverride(
  input: BuildVideoTrimPreviewOverrideInput,
): VideoTrimPreviewOverride {
  const trimStartMs = Math.max(
    0,
    Number.isFinite(input.trimStartMs) ? Math.round(input.trimStartMs) : 0,
  );
  const trimEndMs = Math.max(
    trimStartMs,
    Number.isFinite(input.trimEndMs) ? Math.round(input.trimEndMs) : trimStartMs,
  );
  const scrubTimeMs = resolveTrimPreviewScrubTimeMs({
    activeHandle: input.activeHandle,
    trimStartMs,
    trimEndMs,
    sourceDurationMs: input.sourceDurationMs,
  });

  const mediaItemId =
    typeof input.mediaItemId === "string" && input.mediaItemId.trim()
      ? input.mediaItemId.trim()
      : undefined;

  return {
    sceneId: input.sceneId,
    ...(mediaItemId ? { mediaItemId } : {}),
    trimStartMs,
    trimEndMs,
    scrubTimeMs,
    activeHandle: input.activeHandle,
    isActive: input.isActive !== false,
    surface: input.surface,
  };
}

function trimMediaItemId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * True when the override should drive the given scene video.
 * Item-scoped overrides apply only to that mediaItemId.
 * Legacy scene-only overrides still apply to any video in the scene.
 */
export function shouldApplyVideoTrimPreviewOverride(
  override: VideoTrimPreviewOverride | null | undefined,
  sceneId: string | null | undefined,
  mediaItemId?: string | null,
): boolean {
  if (!override?.isActive || !sceneId) {
    return false;
  }
  if (override.sceneId !== sceneId) {
    return false;
  }
  const overrideItemId = trimMediaItemId(override.mediaItemId);
  const mountedItemId = trimMediaItemId(mediaItemId);
  if (overrideItemId && mountedItemId && overrideItemId !== mountedItemId) {
    return false;
  }
  return true;
}

/** True when a seek would materially change the displayed frame. */
export function shouldSeekVideoToTimeMs(
  currentTimeMs: number,
  targetTimeMs: number,
  toleranceMs: number = VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS,
): boolean {
  if (!Number.isFinite(currentTimeMs) || !Number.isFinite(targetTimeMs)) {
    return false;
  }
  return Math.abs(currentTimeMs - targetTimeMs) > Math.max(0, toleranceMs);
}

/**
 * Latest-target seek queue — at most one pending target; newer values replace older ones.
 * Pure helpers so scheduling can be tested without DOM/rAF.
 */
export interface TrimPreviewSeekQueue {
  pendingMs: number | null;
  appliedMs: number | null;
  scheduled: boolean;
}

export function createTrimPreviewSeekQueue(
  appliedMs: number | null = null,
): TrimPreviewSeekQueue {
  return {
    pendingMs: null,
    appliedMs,
    scheduled: false,
  };
}

/**
 * Queue a seek target. Returns whether a flush should be scheduled (rAF).
 * Skips queueing when the target matches the last applied time within tolerance.
 */
export function queueTrimPreviewSeek(
  queue: TrimPreviewSeekQueue,
  targetMs: number,
  toleranceMs: number = VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS,
): { queue: TrimPreviewSeekQueue; shouldSchedule: boolean } {
  if (!Number.isFinite(targetMs)) {
    return { queue, shouldSchedule: false };
  }

  const rounded = Math.round(targetMs);
  if (
    queue.appliedMs != null &&
    !shouldSeekVideoToTimeMs(queue.appliedMs, rounded, toleranceMs) &&
    queue.pendingMs == null
  ) {
    return { queue, shouldSchedule: false };
  }

  if (queue.pendingMs === rounded) {
    return { queue, shouldSchedule: false };
  }

  const next: TrimPreviewSeekQueue = {
    ...queue,
    pendingMs: rounded,
  };

  if (queue.scheduled) {
    return { queue: next, shouldSchedule: false };
  }

  return {
    queue: { ...next, scheduled: true },
    shouldSchedule: true,
  };
}

/** Take the latest pending seek target and clear the schedule flag. */
export function takePendingTrimPreviewSeek(
  queue: TrimPreviewSeekQueue,
): { queue: TrimPreviewSeekQueue; targetMs: number | null } {
  if (queue.pendingMs == null) {
    return {
      queue: { ...queue, scheduled: false },
      targetMs: null,
    };
  }

  const targetMs = queue.pendingMs;
  return {
    queue: {
      pendingMs: null,
      appliedMs: targetMs,
      scheduled: false,
    },
    targetMs,
  };
}

/** Clears an override when the selected scene changes. */
export function shouldClearTrimPreviewOnSceneChange(
  override: VideoTrimPreviewOverride | null | undefined,
  selectedSceneId: string | null | undefined,
): boolean {
  if (!override?.isActive) {
    return false;
  }
  return !selectedSceneId || override.sceneId !== selectedSceneId;
}

/** Clears an override when its media item is removed or no longer selected. */
export function shouldClearTrimPreviewOnMediaItemChange(
  override: VideoTrimPreviewOverride | null | undefined,
  sceneId: string | null | undefined,
  mediaItemId: string | null | undefined,
): boolean {
  if (!override?.isActive) {
    return false;
  }
  if (!sceneId || override.sceneId !== sceneId) {
    return false;
  }
  const overrideItemId = trimMediaItemId(override.mediaItemId);
  if (!overrideItemId) {
    return false;
  }
  return trimMediaItemId(mediaItemId) !== overrideItemId;
}

/** Clears an override when media URL is replaced or removed. */
export function shouldClearTrimPreviewOnMediaChange(
  override: VideoTrimPreviewOverride | null | undefined,
  sceneId: string | null | undefined,
  mediaUrl: string | null | undefined,
): boolean {
  if (!override?.isActive) {
    return false;
  }
  if (!sceneId || override.sceneId !== sceneId) {
    return false;
  }
  return !mediaUrl?.trim();
}

/** Image / non-video media must never produce a trim preview override. */
export function canCreateVideoTrimPreviewOverride(input: {
  mediaType?: string | null;
  sourceDurationMs?: number | null;
}): boolean {
  if (input.mediaType !== "video") {
    return false;
  }
  return (
    typeof input.sourceDurationMs === "number" &&
    Number.isFinite(input.sourceDurationMs) &&
    input.sourceDurationMs > 0
  );
}
