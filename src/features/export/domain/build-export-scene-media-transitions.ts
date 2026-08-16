/**
 * Freeze StoryDocument intra-scene transitions into ExportManifest v3 tracks.
 * Matches Preview fallback: non-drawable / incoherent peers → omit (hard cut).
 */

import type { FootieScene } from "@/features/story/types";
import {
  isSupportedIntraSceneTransitionDuration,
  isSupportedIntraSceneTransitionEffect,
} from "@/features/scene-media-transitions/domain/effect-support";
import { normalizeSceneMediaTransitionTrack } from "@/features/scene-media-transitions/domain/normalize-track";
import { resolveEffectiveIntraSceneTransitionDurationMs } from "@/features/scene-media-transitions/resolution/resolve-effective-duration";
import {
  CONTINUOUS_INTRA_SCENE_TRANSITION_TIMING_MODEL,
  resolveContinuousTransitionFootageAvailability,
} from "@/features/scene-media-transitions/resolution/resolve-continuous-intra-scene-transition-timing";

import type {
  ExportSceneMediaTimelineManifest,
  ExportSceneMediaTransitionBoundaryManifest,
  ExportSceneMediaTransitionTrackManifest,
  ExportMediaManifest,
} from "./export-manifest.types";

function isDrawableMediaManifest(media: ExportMediaManifest): boolean {
  if (media.type === "placeholder") {
    return false;
  }
  return typeof media.source === "string" && Boolean(media.source.trim());
}

/**
 * Build a canonical v3 mediaTransitions track from story metadata + frozen timeline.
 * Always returns a track (empty boundaries when none apply). Does not mutate the scene.
 */
export function buildExportSceneMediaTransitionTrack(
  scene: FootieScene,
  mediaTimeline: ExportSceneMediaTimelineManifest,
  options: { readonly continuousTimingEnabled?: boolean } = {},
): ExportSceneMediaTransitionTrackManifest {
  const items = mediaTimeline.items;
  if (items.length < 2) {
    return { version: 1, boundaries: [] };
  }

  const itemIds = items.map((item) => item.id);
  const { track } = normalizeSceneMediaTransitionTrack(scene.mediaTransitions, itemIds);
  if (!track || track.boundaries.length === 0) {
    return { version: 1, boundaries: [] };
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const boundaries: ExportSceneMediaTransitionBoundaryManifest[] = [];

  for (let i = 0; i < items.length - 1; i += 1) {
    const fromItem = items[i]!;
    const toItem = items[i + 1]!;
    const stored = track.boundaries.find(
      (boundary) =>
        boundary.fromItemId === fromItem.id && boundary.toItemId === toItem.id,
    );
    if (!stored) {
      continue;
    }

    if (
      !isSupportedIntraSceneTransitionEffect(stored.effect) ||
      !isSupportedIntraSceneTransitionDuration(stored.durationMs)
    ) {
      continue;
    }

    const fromFrozen = byId.get(fromItem.id);
    const toFrozen = byId.get(toItem.id);
    if (!fromFrozen || !toFrozen) {
      continue;
    }
    if (
      !isDrawableMediaManifest(fromFrozen.media) ||
      !isDrawableMediaManifest(toFrozen.media)
    ) {
      continue;
    }

    const effectiveDurationMs = resolveEffectiveIntraSceneTransitionDurationMs({
      requestedDurationMs: stored.durationMs,
      fromWindowDurationMs: fromFrozen.durationMs,
      toWindowDurationMs: toFrozen.durationMs,
    });
    if (effectiveDurationMs <= 0) {
      continue;
    }

    const continuousTimingEnabled = options.continuousTimingEnabled === true;
    if (
      continuousTimingEnabled &&
      !resolveContinuousTransitionFootageAvailability({
        fromMedia: fromFrozen.media,
        toMedia: toFrozen.media,
        fromWindowDurationMs: fromFrozen.durationMs,
        effectiveDurationMs,
      }).allowed
    ) {
      continue;
    }
    const overlayStartOffsetMs = continuousTimingEnabled
      ? toFrozen.startOffsetMs - Math.floor(effectiveDurationMs / 2)
      : toFrozen.startOffsetMs;
    const overlayEndOffsetMs = overlayStartOffsetMs + effectiveDurationMs;
    if (
      overlayStartOffsetMs < fromFrozen.startOffsetMs ||
      overlayEndOffsetMs > toFrozen.endOffsetMs
    ) {
      continue;
    }

    boundaries.push({
      fromItemId: fromFrozen.id,
      toItemId: toFrozen.id,
      fromItemIndex: fromFrozen.index,
      toItemIndex: toFrozen.index,
      effect: stored.effect,
      requestedDurationMs: stored.durationMs,
      effectiveDurationMs,
      overlayStartOffsetMs,
      overlayEndOffsetMs,
      ...(continuousTimingEnabled
        ? { timingModel: CONTINUOUS_INTRA_SCENE_TRANSITION_TIMING_MODEL }
        : {}),
    });
  }

  return { version: 1, boundaries };
}
