import type { TimelineLayoutSegment, TimelineLayoutVM, TimelineResizeState } from "./timeline-editor.types";

export const TIMELINE_RESIZE_MIN_DURATION_SEC = 1;
export const TIMELINE_RESIZE_MAX_DURATION_SEC = 20;
export const TIMELINE_RESIZE_NUDGE_STEP_SEC = 1;
export const TIMELINE_RESIZE_NUDGE_STEP_LARGE_SEC = 5;

/** Keyboard nudge — clamps to the same 1–20s range as pointer resize. */
export function nudgeDurationSec(
  currentDurationSec: number,
  deltaSec: number,
  minDurationSec = TIMELINE_RESIZE_MIN_DURATION_SEC,
  maxDurationSec = TIMELINE_RESIZE_MAX_DURATION_SEC,
): number {
  const current = Math.round(currentDurationSec);
  return Math.min(maxDurationSec, Math.max(minDurationSec, current + deltaSec));
}

/** Resolves arrow-key nudge delta (seconds). Returns 0 when the key is not a duration nudge. */
export function resolveDurationNudgeDeltaSec(
  key: string,
  shiftKey: boolean,
): number {
  if (key === "ArrowRight") {
    return shiftKey
      ? TIMELINE_RESIZE_NUDGE_STEP_LARGE_SEC
      : TIMELINE_RESIZE_NUDGE_STEP_SEC;
  }
  if (key === "ArrowLeft") {
    return shiftKey
      ? -TIMELINE_RESIZE_NUDGE_STEP_LARGE_SEC
      : -TIMELINE_RESIZE_NUDGE_STEP_SEC;
  }
  return 0;
}

/** Converts a horizontal pointer delta into a snapped, clamped duration in seconds. */
export function resolveResizedDurationSec(input: {
  startDurationMs: number;
  pointerDeltaX: number;
  railWidthPx: number;
  totalDurationMs: number;
  minDurationSec?: number;
  maxDurationSec?: number;
}): number {
  const minDurationSec = input.minDurationSec ?? TIMELINE_RESIZE_MIN_DURATION_SEC;
  const maxDurationSec = input.maxDurationSec ?? TIMELINE_RESIZE_MAX_DURATION_SEC;
  const railWidthPx = Math.max(1, input.railWidthPx);
  const totalDurationMs = Math.max(1, input.totalDurationMs);
  const pxPerMs = railWidthPx / totalDurationMs;
  const deltaMs = input.pointerDeltaX / pxPerMs;
  const nextDurationMs = input.startDurationMs + deltaMs;
  const nextDurationSec = Math.round(nextDurationMs / 1000);

  return Math.min(maxDurationSec, Math.max(minDurationSec, nextDurationSec));
}

/** Local layout preview while resizing — does not mutate script. */
export function applyResizePreviewToLayout(
  layout: TimelineLayoutVM,
  resizeState: TimelineResizeState,
): TimelineLayoutVM {
  const previewDurationMs = Math.max(1, resizeState.previewDurationSec * 1000);
  const newTotalDurationMs = Math.max(
    1,
    layout.totalDurationMs - resizeState.startDurationMs + previewDurationMs,
  );

  const segments: TimelineLayoutSegment[] = layout.segments.map((segment) => {
    if (segment.type !== "scene") {
      return segment;
    }

    const durationMs =
      segment.block.sceneId === resizeState.sceneId
        ? previewDurationMs
        : segment.block.durationMs;

    return {
      type: "scene",
      block: {
        ...segment.block,
        durationMs,
        widthPercent: (durationMs / newTotalDurationMs) * 100,
        durationLabelSec: durationMs / 1000,
      },
    };
  });

  return {
    ...layout,
    totalDurationMs: newTotalDurationMs,
    segments,
  };
}
