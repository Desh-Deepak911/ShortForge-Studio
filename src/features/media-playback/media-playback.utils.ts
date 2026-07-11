import type { SceneMedia } from "@/features/story/types";

import { EMPTY_MEDIA_PLAYBACK_STATE } from "./media-playback.defaults";
import type {
  MediaPlaybackMediaInput,
  MediaPlaybackResolveInput,
  MediaPlaybackState,
  MediaPlaybackValidationIssue,
} from "./media-playback.types";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export function clampNonNegativeMs(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.round(value));
}

export function isPositiveDurationMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export interface SceneMediaTrimWindow {
  trimStartMs: number;
  trimEndMs: number;
  durationMs: number;
  effectiveDurationMs: number;
}

/**
 * Clamps and normalizes trimStart/trimEnd against source duration.
 * Invalid or missing duration yields a zero-width window at 0.
 */
export function clampSceneMediaTrim(
  media: Pick<MediaPlaybackMediaInput, "durationMs" | "trimStartMs" | "trimEndMs"> | null | undefined,
): SceneMediaTrimWindow {
  const durationMs = isPositiveDurationMs(media?.durationMs) ? Math.round(media.durationMs) : 0;
  const rawStart = clampNonNegativeMs(media?.trimStartMs, 0);
  const trimStartMs = durationMs > 0 ? Math.min(rawStart, durationMs) : rawStart;

  let trimEndMs: number;
  if (typeof media?.trimEndMs === "number" && Number.isFinite(media.trimEndMs) && media.trimEndMs > trimStartMs) {
    trimEndMs = Math.round(media.trimEndMs);
  } else if (durationMs > 0) {
    trimEndMs = durationMs;
  } else {
    trimEndMs = trimStartMs;
  }

  if (durationMs > 0) {
    trimEndMs = Math.min(trimEndMs, durationMs);
  }

  trimEndMs = Math.max(trimStartMs, trimEndMs);

  return {
    trimStartMs,
    trimEndMs,
    durationMs,
    effectiveDurationMs: Math.max(0, trimEndMs - trimStartMs),
  };
}

/** Trimmed clip duration in ms (trimEnd − trimStart). */
export function getSceneMediaTrimDuration(
  media: Pick<MediaPlaybackMediaInput, "durationMs" | "trimStartMs" | "trimEndMs"> | null | undefined,
): number {
  return clampSceneMediaTrim(media).effectiveDurationMs;
}

/**
 * Absolute clip time for a scene-local elapsed offset.
 * Does not apply loop wrapping — engine handles loopMode.
 */
export function resolveSceneMediaClipTime(
  media: Pick<MediaPlaybackMediaInput, "durationMs" | "trimStartMs" | "trimEndMs"> | null | undefined,
  sceneElapsedMs: number,
): { clipTimeMs: number; holdLastFrame: boolean; ended: boolean } {
  const window = clampSceneMediaTrim(media);
  const elapsed = clampNonNegativeMs(sceneElapsedMs, 0);
  const unclamped = window.trimStartMs + elapsed;
  const clipTimeMs = Math.min(window.trimEndMs, Math.max(window.trimStartMs, unclamped));
  const holdLastFrame = window.effectiveDurationMs <= 0 || unclamped >= window.trimEndMs;
  const ended = holdLastFrame && window.effectiveDurationMs > 0;

  return { clipTimeMs, holdLastFrame, ended };
}

/** True when media can be used for playback / export readiness. */
export function isSceneMediaReady(media: MediaPlaybackMediaInput | null | undefined): boolean {
  if (!media) {
    return false;
  }

  if (media.type === "placeholder") {
    return false;
  }

  const url = typeof media.url === "string" ? media.url.trim() : "";
  if (!url) {
    return false;
  }

  if (media.type === "image") {
    return true;
  }

  if (media.type === "video") {
    if (!isPositiveDurationMs(media.durationMs)) {
      return false;
    }

    const issues = validateSceneMediaPlayback(media);
    return issues.length === 0;
  }

  return false;
}

export function hasSceneMediaEnded(state: Pick<MediaPlaybackState, "ended">): boolean {
  return state.ended === true;
}

/**
 * Validates video SceneMedia for playback/export.
 * Images with a URL are accepted; placeholders and unsupported types are rejected.
 */
export function validateSceneMediaPlayback(
  media: MediaPlaybackMediaInput | null | undefined,
  sceneId?: string,
): MediaPlaybackValidationIssue[] {
  const issues: MediaPlaybackValidationIssue[] = [];
  const withScene = (issue: Omit<MediaPlaybackValidationIssue, "sceneId">): MediaPlaybackValidationIssue =>
    sceneId ? { ...issue, sceneId } : issue;

  if (!media) {
    issues.push(
      withScene({
        code: "missing_media",
        message: "Scene has no media.",
      }),
    );
    return issues;
  }

  if (media.type !== "image" && media.type !== "video" && media.type !== "placeholder") {
    issues.push(
      withScene({
        code: "unsupported_type",
        message: `Unsupported media type: ${String(media.type)}.`,
      }),
    );
    return issues;
  }

  if (media.type === "placeholder") {
    issues.push(
      withScene({
        code: "unsupported_type",
        message: "Placeholder media is not export-ready.",
      }),
    );
    return issues;
  }

  const url = typeof media.url === "string" ? media.url.trim() : "";
  if (!url) {
    issues.push(
      withScene({
        code: "missing_url",
        message: "Media is missing a URL.",
      }),
    );
  }

  if (media.type === "image") {
    return issues;
  }

  // video
  if (media.durationMs == null) {
    issues.push(
      withScene({
        code: "missing_duration",
        message: "Video media requires durationMs.",
      }),
    );
  } else if (!isPositiveDurationMs(media.durationMs)) {
    issues.push(
      withScene({
        code: "invalid_duration",
        message: "Video durationMs must be a positive number.",
      }),
    );
  }

  if (isPositiveDurationMs(media.durationMs)) {
    const durationMs = Math.round(media.durationMs);
    const trimStart =
      typeof media.trimStartMs === "number" && Number.isFinite(media.trimStartMs)
        ? media.trimStartMs
        : 0;
    const trimEnd =
      typeof media.trimEndMs === "number" && Number.isFinite(media.trimEndMs)
        ? media.trimEndMs
        : durationMs;

    if (!(trimStart < trimEnd)) {
      issues.push(
        withScene({
          code: "invalid_trim",
          message: "Video trimStartMs must be less than trimEndMs.",
        }),
      );
    }

    if (trimEnd > durationMs) {
      issues.push(
        withScene({
          code: "trim_exceeds_duration",
          message: "Video trimEndMs must be less than or equal to durationMs.",
        }),
      );
    }

    if (trimStart < 0) {
      issues.push(
        withScene({
          code: "invalid_trim",
          message: "Video trimStartMs must be greater than or equal to 0.",
        }),
      );
    }
  }

  return issues;
}

/** Builds a resolve input from SceneMedia + scene clocks. */
export function buildMediaPlaybackResolveInput(
  sceneMedia: SceneMedia | null | undefined,
  sceneElapsedMs: number,
  sceneDurationMs: number,
  playing = false,
  loopMode: MediaPlaybackResolveInput["loopMode"] = "none",
): MediaPlaybackResolveInput {
  return {
    sceneMedia: sceneMedia ?? null,
    sceneElapsedMs,
    sceneDurationMs,
    playing,
    loopMode,
  };
}

export function createEmptyMediaPlaybackState(
  sceneDurationMs = 0,
): MediaPlaybackState {
  const duration = clampNonNegativeMs(sceneDurationMs, 0);
  return {
    ...EMPTY_MEDIA_PLAYBACK_STATE,
    remainingMs: duration,
  };
}
