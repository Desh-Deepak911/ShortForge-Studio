import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import {
  resolveTimelineTransitionOverlay,
  type TimelineTransitionOverlay,
} from "@/features/timeline-intelligence/resolve-timeline-transition-overlay.utils";
import type { FootieScene } from "@/features/story/types";

export type PreviewTransitionOverlay = TimelineTransitionOverlay;

/** Resolves preview transition overlay from MasterTimeline absolute time. */
export function resolvePreviewTransitionOverlay(
  masterTimeline: MasterTimeline | null | undefined,
  scenes: FootieScene[],
  timeMs: number,
): PreviewTransitionOverlay | null {
  if (!masterTimeline) {
    return null;
  }

  return resolveTimelineTransitionOverlay(masterTimeline, scenes, timeMs);
}

export type { TimelineTransitionOverlay };
