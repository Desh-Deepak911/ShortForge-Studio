/**
 * Pure helpers for the interactive video trim range slider.
 * Pointer math only — commit authority remains buildVideoTrimPatch.
 */
import { MIN_VIDEO_TRIM_DURATION_MS } from "@/features/media-playback";

export const VIDEO_TRIM_SLIDER_NUDGE_MS = 100;
export const VIDEO_TRIM_SLIDER_SHIFT_NUDGE_MS = 1000;

export type VideoTrimHandle = "start" | "end";

export interface VideoTrimRangeDraft {
  trimStartMs: number;
  trimEndMs: number;
}

/** Maps a client X position on the track to absolute source time. */
export function clientXToTrimTimeMs(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  sourceDurationMs: number,
): number {
  if (!(sourceDurationMs > 0) || !(trackWidth > 0)) {
    return 0;
  }

  const ratio = Math.min(1, Math.max(0, (clientX - trackLeft) / trackWidth));
  return Math.round(ratio * sourceDurationMs);
}

/** Converts absolute source time to a 0–100 track percentage. */
export function trimTimeMsToPercent(
  timeMs: number,
  sourceDurationMs: number,
): number {
  if (!(sourceDurationMs > 0)) {
    return 0;
  }

  return Math.min(100, Math.max(0, (timeMs / sourceDurationMs) * 100));
}

/**
 * Clamps a requested start so the window stays valid:
 * 0 ≤ start ≤ end − minGap, end ≤ duration.
 */
export function clampTrimStartForSlider(
  requestedStartMs: number,
  trimEndMs: number,
  sourceDurationMs: number,
  minGapMs: number = MIN_VIDEO_TRIM_DURATION_MS,
): number {
  const duration = Math.max(0, Math.round(sourceDurationMs));
  const gap = Math.max(1, Math.round(minGapMs));
  const end = Math.min(duration, Math.max(gap, Math.round(trimEndMs)));
  const maxStart = Math.max(0, end - gap);
  const start = Math.round(requestedStartMs);
  return Math.min(maxStart, Math.max(0, start));
}

/**
 * Clamps a requested end so the window stays valid:
 * start + minGap ≤ end ≤ duration.
 */
export function clampTrimEndForSlider(
  requestedEndMs: number,
  trimStartMs: number,
  sourceDurationMs: number,
  minGapMs: number = MIN_VIDEO_TRIM_DURATION_MS,
): number {
  const duration = Math.max(0, Math.round(sourceDurationMs));
  const gap = Math.max(1, Math.round(minGapMs));
  const start = Math.min(duration, Math.max(0, Math.round(trimStartMs)));
  const minEnd = Math.min(duration, start + gap);
  const end = Math.round(requestedEndMs);
  return Math.min(duration, Math.max(minEnd, end));
}

/** Applies a pointer-time update to one handle without crossing. */
export function applyTrimHandleDrag(
  handle: VideoTrimHandle,
  pointerTimeMs: number,
  current: VideoTrimRangeDraft,
  sourceDurationMs: number,
  minGapMs: number = MIN_VIDEO_TRIM_DURATION_MS,
): VideoTrimRangeDraft {
  if (handle === "start") {
    return {
      trimStartMs: clampTrimStartForSlider(
        pointerTimeMs,
        current.trimEndMs,
        sourceDurationMs,
        minGapMs,
      ),
      trimEndMs: current.trimEndMs,
    };
  }

  return {
    trimStartMs: current.trimStartMs,
    trimEndMs: clampTrimEndForSlider(
      pointerTimeMs,
      current.trimStartMs,
      sourceDurationMs,
      minGapMs,
    ),
  };
}

/** Keyboard nudge for a focused handle. */
export function nudgeTrimHandle(
  handle: VideoTrimHandle,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
  current: VideoTrimRangeDraft,
  sourceDurationMs: number,
  shiftKey = false,
  minGapMs: number = MIN_VIDEO_TRIM_DURATION_MS,
): VideoTrimRangeDraft {
  const duration = Math.max(0, Math.round(sourceDurationMs));
  const gap = Math.max(1, Math.round(minGapMs));

  if (key === "Home") {
    if (handle === "start") {
      return {
        trimStartMs: 0,
        trimEndMs: clampTrimEndForSlider(current.trimEndMs, 0, duration, gap),
      };
    }
    return {
      trimStartMs: current.trimStartMs,
      trimEndMs: clampTrimEndForSlider(
        current.trimStartMs + gap,
        current.trimStartMs,
        duration,
        gap,
      ),
    };
  }

  if (key === "End") {
    if (handle === "start") {
      return {
        trimStartMs: clampTrimStartForSlider(
          current.trimEndMs - gap,
          current.trimEndMs,
          duration,
          gap,
        ),
        trimEndMs: current.trimEndMs,
      };
    }
    return {
      trimStartMs: current.trimStartMs,
      trimEndMs: duration,
    };
  }

  const step = shiftKey ? VIDEO_TRIM_SLIDER_SHIFT_NUDGE_MS : VIDEO_TRIM_SLIDER_NUDGE_MS;
  const delta = key === "ArrowRight" ? step : -step;

  if (handle === "start") {
    return applyTrimHandleDrag(
      "start",
      current.trimStartMs + delta,
      current,
      duration,
      gap,
    );
  }

  return applyTrimHandleDrag(
    "end",
    current.trimEndMs + delta,
    current,
    duration,
    gap,
  );
}

/** Formats aria-valuetext for a handle. */
export function formatTrimHandleValueText(timeMs: number): string {
  const totalMs = Math.max(0, Math.round(timeMs));
  const seconds = totalMs / 1000;
  return `${seconds.toFixed(3)} seconds`;
}

/** Clamps a poster marker into the draft trim window for display only. */
export function clampPosterMarkerToDraft(
  posterTimeMs: number | null | undefined,
  draft: VideoTrimRangeDraft,
): number {
  const start = Math.round(draft.trimStartMs);
  const end = Math.max(start, Math.round(draft.trimEndMs));
  if (typeof posterTimeMs !== "number" || !Number.isFinite(posterTimeMs)) {
    return start;
  }
  return Math.min(end, Math.max(start, Math.round(posterTimeMs)));
}
