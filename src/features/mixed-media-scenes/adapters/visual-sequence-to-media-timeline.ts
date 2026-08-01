/**
 * Dual-write helper: visual sequence → Sprint 8 mediaTimeline weights.
 * Preserves shared Preview / Browser / Headless window resolution.
 */

import type {
  SceneMedia,
  SceneMediaTimeline,
  SceneVisualSequence,
} from "@/features/story/types";

/** Converts normalized sequence durations into proportional timeline weights. */
export function visualSequenceToMediaTimeline(
  sequence: SceneVisualSequence,
): SceneMediaTimeline {
  return {
    version: 1,
    items: sequence.items.map((item) => ({
      id: item.id,
      media: item.media,
      durationWeight: Math.max(1, item.durationMs),
    })),
  };
}

/** Builds a visual sequence from resolved contiguous windows (ms). */
export function mediaTimelineWindowsToVisualSequence(input: {
  readonly items: ReadonlyArray<{
    id: string;
    media: SceneMedia;
    startMs: number;
    durationMs: number;
  }>;
}): SceneVisualSequence {
  return {
    version: 1,
    items: input.items.map((item) => ({
      id: item.id,
      media: item.media,
      startOffsetMs: Math.max(0, Math.round(item.startMs)),
      durationMs: Math.max(1, Math.round(item.durationMs)),
    })),
  };
}
