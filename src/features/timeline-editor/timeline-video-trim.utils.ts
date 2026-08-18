/**
 * Pure helpers for desktop timeline video trim mini-track (4.2B-10).
 * Source-duration mapping only — scene duration must never drive trim math.
 */
import {
  applyTrimHandleDrag,
  clampTrimEndForSlider,
  clampTrimStartForSlider,
  clientXToTrimTimeMs,
  formatTrimHandleValueText,
  nudgeTrimHandle,
  trimTimeMsToPercent,
  VIDEO_TRIM_SLIDER_NUDGE_MS,
  VIDEO_TRIM_SLIDER_SHIFT_NUDGE_MS,
  type VideoTrimHandle,
  type VideoTrimRangeDraft,
} from "@/features/editor/components/media/video-trim-range-slider.utils";
import { clampSceneMediaTrim, MIN_VIDEO_TRIM_DURATION_MS } from "@/features/media-playback";
import { projectSceneMediaTimeline } from "@/features/scene-media-timeline";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneMedia, getSceneMediaType } from "@/features/story/utils";

/**
 * Minimum scene-block width (px) required to show interactive timeline trim handles.
 * Narrower blocks keep the video badge and fall back to inspector trim.
 */
export const TIMELINE_VIDEO_TRIM_MIN_BLOCK_WIDTH_PX = 140;

export type TimelineVideoTrimHandle = VideoTrimHandle;

export interface TimelineVideoTrimWindow {
  sourceDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  trimDurationMs: number;
}

export interface TimelineVideoTrimEligibilityInput {
  scene: FootieScene | null | undefined;
  blockWidthPx: number;
  /** Fine pointer only — coarse/touch hides interactive handles in v1. */
  isFinePointer: boolean;
  playbackLocked: boolean;
  reorderActive: boolean;
  resizeActive: boolean;
  trimActiveElsewhere?: boolean;
}

export interface TimelineVideoTrimEligibility {
  isVideo: boolean;
  hasSourceDuration: boolean;
  wideEnough: boolean;
  isFinePointer: boolean;
  unlocked: boolean;
  /** Interactive mini-track handles may be shown. */
  showHandles: boolean;
  /** Video badge / inspector fallback affordance. */
  showVideoBadge: boolean;
  /** Narrow or coarse — point users at the inspector. */
  showInspectorFallback: boolean;
  reason: string | null;
}

/** Resolves committed trim window from scene media (source-duration authority). */
export function resolveTimelineVideoTrimWindow(
  scene: FootieScene | null | undefined,
  mediaItemId?: string | null,
): TimelineVideoTrimWindow | null {
  if (!scene) {
    return null;
  }

  const itemId = typeof mediaItemId === "string" ? mediaItemId.trim() : "";
  const itemMedia = itemId
    ? projectSceneMediaTimeline(scene).items.find((item) => item.id === itemId)?.media
    : undefined;
  const media = itemMedia ?? getSceneMedia(scene);
  if (!media || media.type !== "video") {
    return null;
  }

  const window = clampSceneMediaTrim(media);
  if (!(window.durationMs > 0)) {
    return null;
  }

  return {
    sourceDurationMs: window.durationMs,
    trimStartMs: window.trimStartMs,
    trimEndMs: window.trimEndMs,
    trimDurationMs: window.effectiveDurationMs,
  };
}

export function isTimelineVideoScene(scene: FootieScene | null | undefined): boolean {
  if (!scene) {
    return false;
  }
  return getSceneMediaType(scene) === "video";
}

/**
 * Availability gate for interactive timeline trim handles.
 * Does not change scene-block width math — only whether handles render.
 */
export function resolveTimelineVideoTrimEligibility(
  input: TimelineVideoTrimEligibilityInput,
): TimelineVideoTrimEligibility {
  const isVideo = isTimelineVideoScene(input.scene);
  const window = resolveTimelineVideoTrimWindow(input.scene);
  const hasSourceDuration = window != null && window.sourceDurationMs > 0;
  const wideEnough = input.blockWidthPx >= TIMELINE_VIDEO_TRIM_MIN_BLOCK_WIDTH_PX;
  const unlocked =
    !input.playbackLocked &&
    !input.reorderActive &&
    !input.resizeActive &&
    !input.trimActiveElsewhere;

  const showVideoBadge = isVideo;
  const showInspectorFallback =
    isVideo && (!input.isFinePointer || !wideEnough || !hasSourceDuration);
  const showHandles =
    isVideo &&
    hasSourceDuration &&
    input.isFinePointer &&
    wideEnough &&
    unlocked;

  let reason: string | null = null;
  if (!isVideo) {
    reason = "not-video";
  } else if (!hasSourceDuration) {
    reason = "missing-duration";
  } else if (!input.isFinePointer) {
    reason = "coarse-pointer";
  } else if (!wideEnough) {
    reason = "narrow-block";
  } else if (input.playbackLocked) {
    reason = "playback-locked";
  } else if (input.reorderActive) {
    reason = "reorder-active";
  } else if (input.resizeActive) {
    reason = "resize-active";
  } else if (input.trimActiveElsewhere) {
    reason = "trim-active-elsewhere";
  }

  return {
    isVideo,
    hasSourceDuration,
    wideEnough,
    isFinePointer: input.isFinePointer,
    unlocked,
    showHandles,
    showVideoBadge,
    showInspectorFallback,
    reason,
  };
}

/**
 * Maps pointer X on the source mini-track to absolute source time.
 * Uses sourceDurationMs only — never scene duration.
 */
export function pointerXToSourceTimeMs(
  pointerX: number,
  stripLeftPx: number,
  stripWidthPx: number,
  sourceDurationMs: number,
): number {
  return clientXToTrimTimeMs(pointerX, stripLeftPx, stripWidthPx, sourceDurationMs);
}

export function applyTimelineTrimHandleDrag(
  handle: TimelineVideoTrimHandle,
  pointerX: number,
  stripLeftPx: number,
  stripWidthPx: number,
  current: VideoTrimRangeDraft,
  sourceDurationMs: number,
): VideoTrimRangeDraft {
  const pointerTimeMs = pointerXToSourceTimeMs(
    pointerX,
    stripLeftPx,
    stripWidthPx,
    sourceDurationMs,
  );
  return applyTrimHandleDrag(handle, pointerTimeMs, current, sourceDurationMs);
}

export function formatTimelineTrimDurationLabel(trimDurationMs: number): string {
  const sec = Math.max(0, trimDurationMs) / 1000;
  if (sec >= 10) {
    return `${sec.toFixed(1)}s clip`;
  }
  return `${sec.toFixed(2)}s clip`;
}

export function formatTimelineTrimValueText(timeMs: number): string {
  return formatTrimHandleValueText(timeMs);
}

export {
  MIN_VIDEO_TRIM_DURATION_MS,
  VIDEO_TRIM_SLIDER_NUDGE_MS,
  VIDEO_TRIM_SLIDER_SHIFT_NUDGE_MS,
  clampTrimEndForSlider,
  clampTrimStartForSlider,
  nudgeTrimHandle,
  trimTimeMsToPercent,
  type VideoTrimRangeDraft,
};

/** Filmstrip-style marker percentages for optional ticks (metadata only). */
export function buildTimelineTrimMarkerPercents(
  sourceDurationMs: number,
  count = 8,
): number[] {
  if (!(sourceDurationMs > 0) || count < 2) {
    return [];
  }

  const markers: number[] = [];
  for (let i = 0; i < count; i += 1) {
    markers.push(trimTimeMsToPercent((i / (count - 1)) * sourceDurationMs, sourceDurationMs));
  }
  return markers;
}

/** True when media looks like a video clip with a usable source duration. */
export function mediaSupportsTimelineVideoTrim(
  media: SceneMedia | null | undefined,
): boolean {
  return media?.type === "video" && clampSceneMediaTrim(media).durationMs > 0;
}
