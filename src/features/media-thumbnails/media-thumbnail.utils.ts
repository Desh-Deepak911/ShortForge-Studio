/**
 * Pure helpers for poster time + filmstrip sample metadata.
 * No DOM / bitmap drawing / React.
 */
import {
  DEFAULT_FILMSTRIP_THUMBNAIL_COUNT,
  type MediaThumbnailMediaInput,
} from "./media-thumbnail.types";

export function clampNonNegativeMs(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

/**
 * Clamps a poster time into [minMs, maxMs].
 * When maxMs <= minMs, returns minMs.
 */
export function clampPosterTime(timeMs: number, minMs: number, maxMs: number): number {
  const min = clampNonNegativeMs(minMs, 0);
  const max = clampNonNegativeMs(maxMs, min);
  const time = clampNonNegativeMs(timeMs, min);

  if (max <= min) {
    return min;
  }

  return Math.min(max, Math.max(min, time));
}

/** Formats a poster time for inspector display. */
export function formatPosterTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) {
    return "—";
  }

  if (ms === 0) {
    return "0.0s";
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const rem = totalSeconds % 60;
  return `${minutes}m ${rem}s`;
}

/**
 * Formats poster frame time as MM:SS.mmm for the picker label.
 * Example: 1250 → "00:01.250"
 */
export function formatPosterFrameTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) {
    return "—";
  }

  const totalMs = Math.round(ms);
  const minutes = Math.floor(totalMs / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export interface PosterTimeWindow {
  startMs: number;
  endMs: number;
  durationMs: number;
}

/**
 * Resolves the media window used for poster / filmstrip sampling.
 * Video prefers the trim window when available; otherwise full duration.
 */
export function resolvePosterSampleWindow(
  media: MediaThumbnailMediaInput | null | undefined,
): PosterTimeWindow {
  if (!media || media.type === "placeholder" || media.type === "image") {
    return { startMs: 0, endMs: 0, durationMs: 0 };
  }

  const durationMs = clampNonNegativeMs(media.durationMs, 0);
  const trimStart = clampNonNegativeMs(media.trimStartMs, 0);
  const startMs = durationMs > 0 ? Math.min(trimStart, durationMs) : trimStart;

  let endMs: number;
  if (
    typeof media.trimEndMs === "number" &&
    Number.isFinite(media.trimEndMs) &&
    media.trimEndMs > startMs
  ) {
    endMs = Math.round(media.trimEndMs);
  } else if (durationMs > 0) {
    endMs = durationMs;
  } else {
    endMs = startMs;
  }

  if (durationMs > 0) {
    endMs = Math.min(endMs, durationMs);
  }

  endMs = Math.max(startMs, endMs);

  return {
    startMs,
    endMs,
    durationMs: Math.max(0, endMs - startMs),
  };
}

/**
 * Resolves the absolute poster time for a media slot.
 * Image → 0. Video → posterTimeMs clamped into the sample window (default: window start).
 */
export function resolvePosterTime(
  media: MediaThumbnailMediaInput | null | undefined,
): number {
  if (!media || media.type === "placeholder") {
    return 0;
  }

  if (media.type === "image") {
    return 0;
  }

  const sampleWindow = resolvePosterSampleWindow(media);
  if (sampleWindow.durationMs <= 0 && sampleWindow.startMs === 0 && sampleWindow.endMs === 0) {
    // No duration — still honor an explicit posterTimeMs if provided.
    if (typeof media.posterTimeMs === "number" && Number.isFinite(media.posterTimeMs)) {
      return clampNonNegativeMs(media.posterTimeMs, 0);
    }
    return 0;
  }

  const requested =
    typeof media.posterTimeMs === "number" && Number.isFinite(media.posterTimeMs)
      ? media.posterTimeMs
      : sampleWindow.startMs;

  return clampPosterTime(requested, sampleWindow.startMs, sampleWindow.endMs);
}

/**
 * Evenly spaced sample times across [startMs, endMs].
 * For count=1 returns the midpoint (or start when zero-width).
 * For count>1 returns inclusive endpoints.
 * When duration is zero, all samples collapse to startMs.
 */
export function generateThumbnailTimes(
  startMs: number,
  endMs: number,
  count: number,
): Array<{ timeMs: number; percentage: number; index: number }> {
  const start = clampNonNegativeMs(startMs, 0);
  const end = Math.max(start, clampNonNegativeMs(endMs, start));
  const span = end - start;
  const safeCount = Math.max(0, Math.floor(count));

  if (safeCount <= 0) {
    return [];
  }

  if (span <= 0) {
    return Array.from({ length: safeCount }, (_, index) => ({
      timeMs: start,
      percentage: safeCount === 1 ? 0 : index / (safeCount - 1),
      index,
    }));
  }

  if (safeCount === 1) {
    return [
      {
        timeMs: Math.round(start + span / 2),
        percentage: 0.5,
        index: 0,
      },
    ];
  }

  return Array.from({ length: safeCount }, (_, index) => {
    const percentage = index / (safeCount - 1);
    return {
      timeMs: Math.round(start + span * percentage),
      percentage: clamp01(percentage),
      index,
    };
  });
}

/** Resolves filmstrip sample count from options / media / default. */
export function resolveFilmstripCount(
  media: MediaThumbnailMediaInput | null | undefined,
  override?: number,
): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }

  if (
    media &&
    typeof media.thumbnailCount === "number" &&
    Number.isFinite(media.thumbnailCount) &&
    media.thumbnailCount > 0
  ) {
    return Math.floor(media.thumbnailCount);
  }

  return DEFAULT_FILMSTRIP_THUMBNAIL_COUNT;
}
