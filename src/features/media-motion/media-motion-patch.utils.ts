/**
 * Pure SceneMedia.motion patch helpers (4.2C-3).
 * Mutates only scene.media.motion — never trim, poster, crop, duration, or URL.
 */
import type { FootieScene, SceneMedia, SceneMediaMotion } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils";

import { getMediaMotionPreset } from "./media-motion.presets";
import { normalizeSceneMediaMotionRecord } from "./media-motion.legacy";
import { resolveSceneMediaMotion } from "./media-motion.normalize";
import { MEDIA_MOTION_STATIC, MEDIA_MOTION_VERSION } from "./media-motion.types";

export type SceneMediaMotionPatch = Pick<FootieScene, "media">;

export interface MediaMotionPatchResult {
  patch: SceneMediaMotionPatch;
  motion: SceneMediaMotion;
  media: SceneMedia;
}

function resolveMotionCapableMedia(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): SceneMedia | null {
  const media = getSceneMedia(scene);
  if (!media || (media.type !== "image" && media.type !== "video")) {
    return null;
  }
  if (!media.url?.trim()) {
    return null;
  }
  return media;
}

function cloneMediaWithoutMotion(media: SceneMedia): SceneMedia {
  const next: SceneMedia = { ...media };
  delete next.motion;
  return next;
}

/**
 * Builds a media-only patch that sets scene.media.motion.
 * Does not rewrite legacy imageMotion fields.
 */
export function buildMediaMotionPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  nextMotion: Partial<SceneMediaMotion> | SceneMediaMotion,
): MediaMotionPatchResult | null {
  const media = resolveMotionCapableMedia(scene);
  if (!media) {
    return null;
  }

  const current = resolveSceneMediaMotion(scene);
  const merged = normalizeSceneMediaMotionRecord({
    ...current,
    ...nextMotion,
    version: MEDIA_MOTION_VERSION,
  });

  // Selecting static / disabling clears to a disabled static record for clarity.
  const motion =
    merged.enabled === false || merged.presetId === "static"
      ? { ...MEDIA_MOTION_STATIC }
      : merged;

  const nextMedia: SceneMedia = {
    ...media,
    motion,
  };

  return {
    patch: { media: nextMedia },
    motion,
    media: nextMedia,
  };
}

/** Clears scene.media.motion only — preserves trim, poster, transform, URL. */
export function buildResetMediaMotionPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): MediaMotionPatchResult | null {
  const media = resolveMotionCapableMedia(scene);
  if (!media) {
    return null;
  }

  const nextMedia = cloneMediaWithoutMotion(media);
  return {
    patch: { media: nextMedia },
    motion: { ...MEDIA_MOTION_STATIC },
    media: nextMedia,
  };
}

/** Convenience: enable motion with a preset from the registry. */
export function buildEnableMediaMotionPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  presetId = "slow-zoom-in",
): MediaMotionPatchResult | null {
  const preset = getMediaMotionPreset(presetId === "static" ? "slow-zoom-in" : presetId);
  return buildMediaMotionPatch(scene, {
    version: MEDIA_MOTION_VERSION,
    enabled: true,
    presetId: preset.id,
    easing: preset.defaultEasing,
    intensity: preset.defaultIntensity > 0 ? preset.defaultIntensity : 1,
    startTransform: preset.startDelta,
    endTransform: preset.endDelta,
  });
}

/** Convenience: disable motion (static). */
export function buildDisableMediaMotionPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): MediaMotionPatchResult | null {
  return buildMediaMotionPatch(scene, { ...MEDIA_MOTION_STATIC });
}
