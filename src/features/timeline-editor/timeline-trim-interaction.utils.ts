/**
 * Presentation/interaction helpers for timeline trim accessibility polish (4.2B-12).
 * No trim math changes — formatting and eligibility messaging only.
 */
import { formatTrimHandleValueText } from "@/features/editor/components/media/video-trim-range-slider.utils";

import { formatTimelineMediaSeconds } from "./timeline-media-visualization.utils";
import type { TimelineVideoTrimHandle } from "./timeline-video-trim.utils";

export const TIMELINE_TRIM_KEYBOARD_HINT = "Arrow ±0.1s · Shift ±1s";

/** Tooltip for an interactive timeline trim handle. */
export function formatTimelineTrimHandleTooltip(
  handle: TimelineVideoTrimHandle,
  timeMs: number,
): string {
  const action = handle === "start" ? "Trim clip start" : "Trim clip end";
  const stamp = formatTimelineMediaSeconds(timeMs);
  return `${action}\n${stamp}\n${TIMELINE_TRIM_KEYBOARD_HINT}`;
}

/** aria-valuetext for timeline trim handles. */
export function formatTimelineTrimHandleAriaValueText(
  handle: TimelineVideoTrimHandle,
  timeMs: number,
): string {
  const action = handle === "start" ? "Trim clip start" : "Trim clip end";
  return `${action}: ${formatTrimHandleValueText(timeMs)}`;
}

/** Accessible summary for the source mini-track. */
export function formatTimelineTrimTrackAriaLabel(input: {
  trimStartMs: number;
  trimEndMs: number;
  sceneDurationMs: number;
}): string {
  const start = formatTimelineMediaSeconds(input.trimStartMs).replace(/s$/, "");
  const end = formatTimelineMediaSeconds(input.trimEndMs).replace(/s$/, "");
  const sceneSec = Math.max(0, Math.round(input.sceneDurationMs) / 1000);
  const sceneLabel =
    Number.isInteger(sceneSec) ? String(sceneSec) : sceneSec.toFixed(1);
  return `Video clip trimmed from ${start} to ${end} seconds. Scene duration ${sceneLabel} seconds.`;
}

/** Tooltip when timeline trim is unavailable (narrow / coarse / locked). */
export function formatTimelineTrimUnavailableTooltip(reason: string | null): string {
  switch (reason) {
    case "narrow-block":
      return "Timeline trim needs a wider scene block. Use Trim in the Video Inspector.";
    case "coarse-pointer":
      return "Timeline trim is desktop-only. Use Trim in the Video Inspector.";
    case "missing-duration":
      return "Trim unavailable until video metadata is loaded.";
    case "playback-locked":
      return "Pause playback to trim the clip.";
    case "reorder-active":
      return "Finish reordering before trimming.";
    case "resize-active":
      return "Finish resizing scene duration before trimming.";
    default:
      return "Trim this clip in the Video Inspector.";
  }
}

/** Safe pointer-capture release — ignores already-released targets. */
export function releaseTimelineTrimPointerCapture(
  target: Element | null | undefined,
  pointerId: number | null | undefined,
): void {
  if (!target || pointerId == null || typeof pointerId !== "number") {
    return;
  }

  const capturer = target as Element & {
    hasPointerCapture?: (id: number) => boolean;
    releasePointerCapture?: (id: number) => void;
  };

  try {
    if (
      typeof capturer.hasPointerCapture === "function" &&
      !capturer.hasPointerCapture(pointerId)
    ) {
      return;
    }
    capturer.releasePointerCapture?.(pointerId);
  } catch {
    // Pointer may already be released by the browser.
  }
}
