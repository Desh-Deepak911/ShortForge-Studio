/**
 * Pure SceneMedia.motion patch helpers (4.2C-3).
 * Mutates only scene.media.motion — never trim, poster, crop, duration, or URL.
 */
import type { FootieScene, SceneMedia, SceneMediaMotion } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";

import { normalizeMediaMotionTransform } from "./media-motion.compose";
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
  // Partial intensity/preset patches omit `keyframes` and must keep authored
  // frames. Keyframe Clear commits an explicit empty/absent field — do not
  // rehydrate current.keyframes over that intentional removal.
  const nextRecord = nextMotion as Partial<SceneMediaMotion>;
  const clearsKeyframes =
    Object.prototype.hasOwnProperty.call(nextRecord, "keyframes") &&
    (nextRecord.keyframes == null ||
      (Array.isArray(nextRecord.keyframes) && nextRecord.keyframes.length === 0));
  const mergedInput: Partial<SceneMediaMotion> & { version: typeof MEDIA_MOTION_VERSION } = {
    ...current,
    ...nextMotion,
    version: MEDIA_MOTION_VERSION,
  };
  if (clearsKeyframes) {
    delete mergedInput.keyframes;
  }
  const merged = normalizeSceneMediaMotionRecord(mergedInput);

  // Selecting static / disabling clears to a disabled static record for clarity,
  // but retains authored keyframes so capability-off / disabled motion can keep
  // dormant metadata until the user clears or re-enables them.
  const motion: SceneMediaMotion =
    merged.enabled === false || merged.presetId === "static"
      ? {
          ...MEDIA_MOTION_STATIC,
          startTransform: normalizeMediaMotionTransform(
            merged.startTransform ?? MEDIA_MOTION_STATIC.startTransform,
          ),
          endTransform: normalizeMediaMotionTransform(
            merged.endTransform ?? MEDIA_MOTION_STATIC.endTransform,
          ),
          ...(merged.keyframes && merged.keyframes.length > 0
            ? { keyframes: merged.keyframes.map((frame) => ({ ...frame })) }
            : {}),
        }
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
