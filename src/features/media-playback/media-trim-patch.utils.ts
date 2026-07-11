/**
 * Authoritative video trim write path — pure patch builders.
 * Uses clampSceneMediaTrim as the single clamp authority.
 * Does not modify scene duration, narration, voice, or timeline.
 */
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils";

import {
  clampNonNegativeMs,
  clampSceneMediaTrim,
  isPositiveDurationMs,
  validateSceneMediaPlayback,
} from "./media-playback.utils";
import type {
  SceneVideoTrimPatch,
  VideoTrimPatchResult,
  VideoTrimRequest,
  VideoTrimValidationResult,
  VideoTrimWindow,
} from "./media-trim.types";

/** Minimum positive trim window width (ms) when source duration allows it. */
export const MIN_VIDEO_TRIM_DURATION_MS = 100;

function resolveVideoMedia(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): SceneMedia | null {
  const media = getSceneMedia(scene);
  if (!media || media.type !== "video") {
    return null;
  }

  return media;
}

function enforcePositiveTrimWindow(
  trimStartMs: number,
  trimEndMs: number,
  durationMs: number,
): { trimStartMs: number; trimEndMs: number } {
  let start = trimStartMs;
  let end = trimEndMs;

  if (end > start) {
    return { trimStartMs: start, trimEndMs: end };
  }

  if (start < durationMs) {
    end = Math.min(durationMs, start + MIN_VIDEO_TRIM_DURATION_MS);
  } else {
    start = Math.max(0, durationMs - MIN_VIDEO_TRIM_DURATION_MS);
    end = durationMs;
  }

  return { trimStartMs: start, trimEndMs: end };
}

/**
 * Normalizes a requested trim window against source duration.
 * Guarantees trimEndMs > trimStartMs when sourceDurationMs > 0.
 * Delegates bounds clamping to clampSceneMediaTrim.
 */
export function normalizeVideoTrim(
  sourceDurationMs: number,
  request: VideoTrimRequest,
): VideoTrimWindow {
  const durationMs = isPositiveDurationMs(sourceDurationMs)
    ? Math.round(sourceDurationMs)
    : 0;

  if (durationMs <= 0) {
    return {
      trimStartMs: 0,
      trimEndMs: 0,
      trimDurationMs: 0,
      sourceDurationMs: 0,
      wasClamped: true,
    };
  }

  const rawRequestedStart = request.trimStartMs;
  const rawRequestedEnd = request.trimEndMs;
  const requestedStart = clampNonNegativeMs(rawRequestedStart, 0);
  const requestedEnd = clampNonNegativeMs(rawRequestedEnd, 0);

  let trimStartMs: number;
  let trimEndMs: number;

  if (requestedEnd > requestedStart) {
    const shared = clampSceneMediaTrim({
      durationMs,
      trimStartMs: requestedStart,
      trimEndMs: requestedEnd,
    });
    trimStartMs = shared.trimStartMs;
    trimEndMs = shared.trimEndMs;
  } else {
    // Collapsed / inverted request — place a minimum window near the requested start.
    const startSeed = Math.min(requestedStart, durationMs);
    const enforced = enforcePositiveTrimWindow(startSeed, startSeed, durationMs);
    trimStartMs = enforced.trimStartMs;
    trimEndMs = enforced.trimEndMs;
  }

  const positive = enforcePositiveTrimWindow(trimStartMs, trimEndMs, durationMs);
  trimStartMs = positive.trimStartMs;
  trimEndMs = positive.trimEndMs;

  const wasClamped =
    trimStartMs !== rawRequestedStart ||
    trimEndMs !== rawRequestedEnd ||
    !Number.isFinite(rawRequestedStart) ||
    !Number.isFinite(rawRequestedEnd);

  return {
    trimStartMs,
    trimEndMs,
    trimDurationMs: Math.max(0, trimEndMs - trimStartMs),
    sourceDurationMs: durationMs,
    wasClamped,
  };
}

/** Validates a trim request (or current media trim) via playback validation. */
export function validateVideoTrimWindow(
  media:
    | Pick<SceneMedia, "type" | "url" | "durationMs" | "trimStartMs" | "trimEndMs">
    | null
    | undefined,
  request?: VideoTrimRequest,
): VideoTrimValidationResult {
  if (!media || media.type !== "video") {
    return {
      ok: false,
      issues: [
        {
          code: "unsupported_type",
          message: "Trim is only supported for video media.",
        },
      ],
      window: null,
    };
  }

  if (!isPositiveDurationMs(media.durationMs)) {
    return {
      ok: false,
      issues: [
        {
          code: "missing_duration",
          message: "Video media requires durationMs.",
        },
      ],
      window: null,
    };
  }

  const window = normalizeVideoTrim(media.durationMs, {
    trimStartMs: request?.trimStartMs ?? media.trimStartMs ?? 0,
    trimEndMs: request?.trimEndMs ?? media.trimEndMs ?? media.durationMs,
  });

  const issues = validateSceneMediaPlayback({
    type: "video",
    url: media.url,
    durationMs: media.durationMs,
    trimStartMs: window.trimStartMs,
    trimEndMs: window.trimEndMs,
  });

  return {
    ok: issues.length === 0,
    issues,
    window,
  };
}

/**
 * Clamps an absolute poster time into [trimStartMs, trimEndMs].
 * When no explicit poster is set, returns trimStartMs (default poster).
 */
export function clampPosterTimeToTrimWindow(
  posterTimeMs: number | null | undefined,
  window: Pick<VideoTrimWindow, "trimStartMs" | "trimEndMs">,
): { posterTimeMs: number; wasClamped: boolean; hadExplicitPoster: boolean } {
  const hadExplicitPoster =
    typeof posterTimeMs === "number" && Number.isFinite(posterTimeMs);

  if (!hadExplicitPoster) {
    return {
      posterTimeMs: window.trimStartMs,
      wasClamped: false,
      hadExplicitPoster: false,
    };
  }

  const requested = Math.round(posterTimeMs);
  const clamped = Math.min(
    window.trimEndMs,
    Math.max(window.trimStartMs, Math.max(0, requested)),
  );

  return {
    posterTimeMs: clamped,
    wasClamped: clamped !== requested,
    hadExplicitPoster: true,
  };
}

function applyTrimToMedia(
  media: SceneMedia,
  window: VideoTrimWindow,
): VideoTrimPatchResult {
  const previousPosterTime =
    typeof media.posterTimeMs === "number" && Number.isFinite(media.posterTimeMs)
      ? Math.round(media.posterTimeMs)
      : null;
  const hadExplicitPoster = previousPosterTime != null;
  const poster = clampPosterTimeToTrimWindow(media.posterTimeMs, window);

  const nextPosterTimeMs = hadExplicitPoster ? poster.posterTimeMs : undefined;
  const posterTimeChanged =
    hadExplicitPoster && previousPosterTime !== nextPosterTimeMs;
  const posterUrlCleared = posterTimeChanged && Boolean(media.posterUrl?.trim());

  const nextMedia: SceneMedia = {
    ...media,
    trimStartMs: window.trimStartMs,
    trimEndMs: window.trimEndMs,
  };

  if (hadExplicitPoster && nextPosterTimeMs != null) {
    nextMedia.posterTimeMs = nextPosterTimeMs;
  }

  if (posterUrlCleared) {
    delete nextMedia.posterUrl;
  }

  return {
    patch: { media: nextMedia },
    window,
    posterTimeMs: nextPosterTimeMs ?? window.trimStartMs,
    posterWasClamped: poster.wasClamped,
    posterUrlCleared,
    media: nextMedia,
  };
}

/**
 * Builds a scene.media-only patch for a new trim window.
 * Returns null for non-video media or missing source duration.
 */
export function buildVideoTrimPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  nextTrim: VideoTrimRequest,
): VideoTrimPatchResult | null {
  const media = resolveVideoMedia(scene);
  if (!media) {
    return null;
  }

  if (!isPositiveDurationMs(media.durationMs)) {
    return null;
  }

  const window = normalizeVideoTrim(media.durationMs, nextTrim);
  if (window.trimDurationMs <= 0) {
    return null;
  }

  return applyTrimToMedia(media, window);
}

/**
 * Resets trim to the full source window [0, durationMs].
 * Keeps posterTimeMs when still valid; clamps into the full window otherwise.
 */
export function buildResetVideoTrimPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): VideoTrimPatchResult | null {
  const media = resolveVideoMedia(scene);
  if (!media) {
    return null;
  }

  if (!isPositiveDurationMs(media.durationMs)) {
    return null;
  }

  const window = normalizeVideoTrim(media.durationMs, {
    trimStartMs: 0,
    trimEndMs: media.durationMs,
  });

  return applyTrimToMedia(media, window);
}

/** Convenience: scene patch only (for applySceneUpdate). */
export function buildVideoTrimScenePatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  nextTrim: VideoTrimRequest,
): SceneVideoTrimPatch | null {
  return buildVideoTrimPatch(scene, nextTrim)?.patch ?? null;
}

export function buildResetVideoTrimScenePatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): SceneVideoTrimPatch | null {
  return buildResetVideoTrimPatch(scene)?.patch ?? null;
}
