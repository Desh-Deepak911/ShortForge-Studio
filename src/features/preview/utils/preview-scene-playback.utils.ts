import type { FootieScene } from "@/features/story/types";
import { getSceneEndMs, getSceneStartMs, getSceneTimingMap } from "@/features/story/utils";

import type { PreviewScenePlaybackBounds } from "@/features/preview/types/preview-playback-scope.types";

/** Resolves scene preview window from editor timing fields. */
export function resolveScenePlaybackBounds(
  scenes: FootieScene[],
  sceneIndex: number,
): PreviewScenePlaybackBounds | null {
  const scene = scenes[sceneIndex];
  if (!scene) {
    return null;
  }

  const startMs = getSceneStartMs(scene);
  const endMs = getSceneEndMs(scene);
  if (endMs <= startMs) {
    const slot = getSceneTimingMap(scenes)[sceneIndex];
    if (!slot) {
      return null;
    }

    return {
      sceneId: slot.sceneId,
      sceneIndex: slot.index,
      startMs: slot.startMs,
      endMs: slot.endMs,
    };
  }

  return {
    sceneId: scene.id,
    sceneIndex,
    startMs,
    endMs,
  };
}

export interface ScenePlaybackBoundaryResult {
  /** Timeline position after handling the boundary (ms). */
  timelineMs: number;
  /** Whether playback should continue. */
  continuePlaying: boolean;
}

/**
 * When narration time crosses a scene preview end boundary, loop or stop within the scene window.
 */
export function resolveScenePlaybackBoundary(
  timeMs: number,
  bounds: PreviewScenePlaybackBounds,
  loopSceneEnabled: boolean,
): ScenePlaybackBoundaryResult | null {
  if (timeMs < bounds.endMs) {
    return null;
  }

  if (loopSceneEnabled) {
    return {
      timelineMs: bounds.startMs,
      continuePlaying: true,
    };
  }

  return {
    timelineMs: Math.max(bounds.startMs, bounds.endMs - 1),
    continuePlaying: false,
  };
}
