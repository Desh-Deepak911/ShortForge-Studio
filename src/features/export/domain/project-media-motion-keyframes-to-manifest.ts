/**
 * Project story media-motion keyframes into a frozen ExportManifest payload.
 *
 * Clamps against the final post-refit media-window duration. Does not mutate
 * the editor story — operates on provided motion + window duration only.
 *
 * Authoritative only when motion.enabled === true and ≥2 usable keyframes
 * remain after window normalization. Callers must also gate on
 * keyframedVisualEffectsEnabled === true before projecting into manifests.
 */

import type { MediaMotionKeyframe, SceneMediaMotion } from "@/features/story/types";
import { normalizeMediaMotionKeyframes } from "@/features/media-motion/domain/media-motion-keyframes";
import { mediaMotionRecordAllowsKeyframeAuthority } from "@/features/media-motion/adapters/resolve-rendered-media-motion";
import { resolveSceneMediaMotionFromMedia } from "@/features/media-motion";
import type { SceneMedia } from "@/features/story/types";
import { EXPORT_MEDIA_MOTION_KEYFRAME_SCHEMA_VERSION } from "./export-manifest.types";

export { EXPORT_MEDIA_MOTION_KEYFRAME_SCHEMA_VERSION };

export interface ExportMediaMotionKeyframeManifest {
  readonly offsetMs: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly opacity: number;
  readonly easing: string;
}

export interface ProjectedMediaMotionKeyframes {
  readonly keyframes: readonly ExportMediaMotionKeyframeManifest[];
  readonly keyframeSchemaVersion: typeof EXPORT_MEDIA_MOTION_KEYFRAME_SCHEMA_VERSION;
}

/**
 * Project usable keyframes for one media item window.
 * Returns undefined when motion is disabled/absent or fewer than two usable
 * keyframes remain after clamp — caller must keep v4 / preset authority and
 * must not require the keyframe capability for that item.
 */
export function projectMediaMotionKeyframesToManifest(
  motion: SceneMediaMotion | null | undefined,
  mediaWindowDurationMs: number,
): ProjectedMediaMotionKeyframes | undefined {
  if (!mediaMotionRecordAllowsKeyframeAuthority(motion)) {
    return undefined;
  }
  if (
    !Number.isFinite(mediaWindowDurationMs) ||
    !(mediaWindowDurationMs > 0)
  ) {
    return undefined;
  }

  const normalized = normalizeMediaMotionKeyframes(motion!.keyframes, {
    mediaWindowDurationMs,
  });
  if (!normalized || normalized.length < 2) {
    return undefined;
  }

  const keyframes: ExportMediaMotionKeyframeManifest[] = normalized.map(
    (frame: MediaMotionKeyframe) =>
      Object.freeze({
        offsetMs: frame.offsetMs,
        x: frame.x,
        y: frame.y,
        scale: frame.scale,
        rotation: frame.rotation,
        opacity: frame.opacity,
        easing: frame.easing,
      }),
  );

  return Object.freeze({
    keyframes: Object.freeze(keyframes),
    keyframeSchemaVersion: EXPORT_MEDIA_MOTION_KEYFRAME_SCHEMA_VERSION,
  });
}

/** Resolve motion from media then project keyframes for the item window. */
export function projectSceneMediaKeyframesToManifest(
  media: SceneMedia | null | undefined,
  mediaWindowDurationMs: number,
): ProjectedMediaMotionKeyframes | undefined {
  if (!media) {
    return undefined;
  }
  const motion = resolveSceneMediaMotionFromMedia(media);
  return projectMediaMotionKeyframesToManifest(motion, mediaWindowDurationMs);
}

/**
 * True when capability is on and at least one prepared media item satisfies
 * the complete keyframe authority rule (enabled motion + ≥2 usable frames).
 */
export function storyHasAuthoritativeMediaMotionKeyframes(
  mediaEntries: readonly {
    readonly media: SceneMedia;
    readonly mediaWindowDurationMs: number;
  }[],
  keyframedVisualEffectsEnabled: boolean,
): boolean {
  if (keyframedVisualEffectsEnabled !== true) {
    return false;
  }
  for (const entry of mediaEntries) {
    if (
      projectSceneMediaKeyframesToManifest(
        entry.media,
        entry.mediaWindowDurationMs,
      )
    ) {
      return true;
    }
  }
  return false;
}
