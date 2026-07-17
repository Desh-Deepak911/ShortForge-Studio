/**
 * Stable structured fingerprints for story-patch classification of media timelines.
 * Uses JSON serialization of normalized fields — delimiter-safe for IDs/URLs.
 */

import type {
  FootieScene,
  SceneMedia,
  SceneMediaMotion,
  SceneMediaTimeline,
  SceneMediaTransform,
} from "@/features/story/types";

import { normalizeSceneMediaTimeline } from "./normalize-timeline";

function stableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function stableTransform(transform: SceneMediaTransform | undefined): unknown {
  if (!transform) {
    return null;
  }
  return {
    x: stableNumber(transform.x) ?? 0,
    y: stableNumber(transform.y) ?? 0,
    scale: stableNumber(transform.scale) ?? 1,
    rotation: stableNumber(transform.rotation) ?? 0,
  };
}

function stableMotion(motion: SceneMediaMotion | undefined): unknown {
  if (!motion) {
    return null;
  }
  return {
    version: 1,
    enabled: motion.enabled ?? null,
    presetId: motion.presetId ?? null,
    easing: motion.easing ?? null,
    intensity: stableNumber(motion.intensity),
    startTransform: stableTransform(motion.startTransform),
    endTransform: stableTransform(motion.endTransform),
  };
}

function stableImageMotion(imageMotion: SceneMedia["imageMotion"]): unknown {
  if (!imageMotion) {
    return null;
  }
  return {
    type: imageMotion.type,
    intensity: imageMotion.intensity,
  };
}

/** Every normalized SceneMedia field that future per-item editing may change. */
function stableMediaFingerprint(media: SceneMedia): unknown {
  return {
    type: media.type,
    url: media.url ?? null,
    source: media.source ?? null,
    mimeType: media.mimeType ?? null,
    durationMs: stableNumber(media.durationMs),
    trimStartMs: stableNumber(media.trimStartMs),
    trimEndMs: stableNumber(media.trimEndMs),
    width: stableNumber(media.width),
    height: stableNumber(media.height),
    muted: typeof media.muted === "boolean" ? media.muted : null,
    fitMode: media.fitMode ?? null,
    transform: stableTransform(media.transform),
    imageMotion: stableImageMotion(media.imageMotion),
    motion: stableMotion(media.motion),
    posterUrl: media.posterUrl ?? null,
    posterTimeMs: stableNumber(media.posterTimeMs),
    thumbnailCount: stableNumber(media.thumbnailCount),
  };
}

/**
 * Order + identity + weights + full media content fingerprint.
 * Structured JSON — IDs/URLs containing `|` or `:` cannot collide.
 */
export function sceneMediaTimelineSignature(
  timeline: SceneMediaTimeline | undefined | null,
): string {
  const { timeline: normalized } = normalizeSceneMediaTimeline(timeline);
  if (!normalized) {
    return "[]";
  }

  return JSON.stringify(
    normalized.items.map((item, index) => ({
      index,
      id: item.id,
      durationWeight: item.durationWeight,
      media: stableMediaFingerprint(item.media),
    })),
  );
}

export function sceneMediaTimelineChanged(prev: FootieScene, next: FootieScene): boolean {
  return (
    sceneMediaTimelineSignature(prev.mediaTimeline) !==
    sceneMediaTimelineSignature(next.mediaTimeline)
  );
}
