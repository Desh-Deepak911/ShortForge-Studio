/**
 * Motion normalization — single read authority for SceneMedia.motion (4.2C-2).
 *
 * Read order:
 *   scene.media.motion
 *   → scene.media.imageMotion
 *   → scene.image.imageMotion
 *   → static
 */
import type { FootieScene, SceneMedia, SceneMediaMotion } from "@/features/story/types";
import { getSceneImage, getSceneMedia } from "@/features/story/utils/scene.utils";

import {
  mapLegacyImageMotionToSceneMediaMotion,
  normalizeSceneMediaMotionRecord,
} from "./media-motion.legacy";
import { MEDIA_MOTION_STATIC } from "./media-motion.types";

/**
 * Normalize a raw motion value (or return static).
 * Prefer resolveSceneMediaMotion(scene) for scene-level reads.
 */
export function normalizeSceneMediaMotion(
  value: unknown,
): SceneMediaMotion {
  return normalizeSceneMediaMotionRecord(value);
}

/**
 * Resolves the authoritative SceneMediaMotion for a scene.
 * Callers must not care which legacy field supplied the config.
 */
export function resolveSceneMediaMotion(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media"> | null | undefined,
): SceneMediaMotion {
  if (!scene) {
    return { ...MEDIA_MOTION_STATIC };
  }

  const media = getSceneMedia(scene);
  if (media?.motion != null) {
    return normalizeSceneMediaMotionRecord(media.motion);
  }

  if (media?.imageMotion != null) {
    return mapLegacyImageMotionToSceneMediaMotion(media.imageMotion);
  }

  const image = getSceneImage(scene);
  if (image?.imageMotion != null) {
    return mapLegacyImageMotionToSceneMediaMotion(image.imageMotion);
  }

  return { ...MEDIA_MOTION_STATIC };
}

/** Resolve motion from a SceneMedia record alone (no legacy image fallback). */
export function resolveSceneMediaMotionFromMedia(
  media: SceneMedia | null | undefined,
): SceneMediaMotion {
  if (!media) {
    return { ...MEDIA_MOTION_STATIC };
  }
  if (media.motion != null) {
    return normalizeSceneMediaMotionRecord(media.motion);
  }
  if (media.imageMotion != null) {
    return mapLegacyImageMotionToSceneMediaMotion(media.imageMotion);
  }
  return { ...MEDIA_MOTION_STATIC };
}

/** Stable fingerprint fragment for motion config. */
export function serializeSceneMediaMotionFingerprint(
  motion: SceneMediaMotion | null | undefined,
): string {
  const normalized = normalizeSceneMediaMotionRecord(motion);
  const start = normalized.startTransform;
  const end = normalized.endTransform;
  return JSON.stringify({
    v: normalized.version,
    e: normalized.enabled === false ? 0 : 1,
    p: normalized.presetId ?? "static",
    ease: normalized.easing ?? "linear",
    i: normalized.intensity ?? 0,
    s: start
      ? [start.x, start.y, start.scale, start.rotation ?? 0]
      : null,
    t: end ? [end.x, end.y, end.scale, end.rotation ?? 0] : null,
  });
}
