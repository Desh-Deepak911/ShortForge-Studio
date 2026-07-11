/**
 * Pure SceneMedia poster patch helpers.
 * Updates scene.media poster fields only — no trim, preview, or export side effects.
 */
import { clampSceneMediaTrim } from "@/features/media-playback";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils";

import { clampPosterTime } from "./media-thumbnail.utils";

export type ScenePosterPatch = Pick<FootieScene, "media">;

function resolveVideoMedia(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): SceneMedia | null {
  const media = getSceneMedia(scene);
  if (!media || media.type !== "video") {
    return null;
  }

  return media;
}

function resolvePosterDurationMs(media: SceneMedia): number {
  if (typeof media.durationMs === "number" && Number.isFinite(media.durationMs) && media.durationMs > 0) {
    return Math.round(media.durationMs);
  }

  return 0;
}

/** Resolves the valid poster picker range — trim window when present. */
export function resolvePosterPickerRange(
  media: Pick<SceneMedia, "type" | "durationMs" | "trimStartMs" | "trimEndMs"> | null | undefined,
): { minMs: number; maxMs: number; available: boolean } {
  if (!media || media.type !== "video") {
    return { minMs: 0, maxMs: 0, available: false };
  }

  const durationMs = resolvePosterDurationMs(media as SceneMedia);
  if (durationMs <= 0) {
    return { minMs: 0, maxMs: 0, available: false };
  }

  const window = clampSceneMediaTrim({
    durationMs,
    trimStartMs: media.trimStartMs,
    trimEndMs: media.trimEndMs,
  });

  return {
    minMs: window.trimStartMs,
    maxMs: window.trimEndMs,
    available: window.effectiveDurationMs > 0,
  };
}

/** True when the poster picker can edit this video (duration metadata present). */
export function isPosterPickerAvailable(
  media: Pick<SceneMedia, "type" | "durationMs" | "trimStartMs" | "trimEndMs"> | null | undefined,
): boolean {
  return resolvePosterPickerRange(media).available;
}

/**
 * Builds a scene patch that sets posterTimeMs (clamped to the trim window).
 * Clears posterUrl so a stale still cannot outlive the new time.
 * Returns null when the scene has no video media or duration is missing.
 */
export function buildPosterTimePatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  posterTimeMs: number,
): ScenePosterPatch | null {
  const media = resolveVideoMedia(scene);
  if (!media) {
    return null;
  }

  const range = resolvePosterPickerRange(media);
  if (!range.available) {
    return null;
  }

  const nextTimeMs = clampPosterTime(posterTimeMs, range.minMs, range.maxMs);
  const { posterUrl: _clearedPosterUrl, ...rest } = media;
  void _clearedPosterUrl;

  return {
    media: {
      ...rest,
      posterTimeMs: nextTimeMs,
    },
  };
}

/**
 * Builds a scene patch that clears posterTimeMs and posterUrl.
 * Returns null when the scene has no video media.
 */
export function buildResetPosterPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): ScenePosterPatch | null {
  const media = resolveVideoMedia(scene);
  if (!media) {
    return null;
  }

  const { posterTimeMs: _clearedTime, posterUrl: _clearedUrl, ...rest } = media;
  void _clearedTime;
  void _clearedUrl;

  return {
    media: { ...rest },
  };
}
