import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import type { CaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import type { TimelineImageMotionInput } from "@/features/timeline-intelligence/resolve-image-motion-transform.utils";
import { getImageMotionEventForScene } from "@/features/timeline-intelligence/timeline-playback.utils";
import { getSceneTimingMap } from "@/features/story/utils";
import { resolvePreviewPlaybackState } from "@/features/preview/utils/preview-master-timeline.utils";
import { resolveIdlePreviewSceneElapsedMs } from "@/features/preview/runtime-parity/reconcile-preview-playback-clock";
import type { FootieScene, FootieScript } from "@/features/story/types";

export interface PreviewSceneTimingInput {
  scenes: FootieScene[];
  sceneIndex: number;
  elapsedSec: number;
  playbackMode: "browser" | "narration" | null;
  isPlaying: boolean;
  browserSceneStartedAtMs: number | null;
  previewClockMs: number;
  masterTimeline?: MasterTimeline | null;
  currentTimeMs?: number;
  defaultCaptionAnimation?: FootieScript["defaultCaptionAnimation"];
}

export interface PreviewSceneTiming {
  sceneElapsedMs: number;
  sceneDurationMs: number;
  /** Active scene index derived from MasterTimeline (narration mode). */
  activeSceneIndex?: number;
  activeSubtitleChunk?: string;
  chunkProgress?: number;
  captionAnimationState?: CaptionAnimationState | null;
  subtitleAvailableDurationMs?: number;
  captionTooShortForEffect?: boolean;
  timelineTimeMs?: number;
}

/**
 * Builds timeline image motion input for one scene at an absolute time.
 * Legacy timeline QA helper — preview/export rendering use resolveMediaMotionState (4.2C-4/5).
 * Track events are no longer consumed by active media renderers.
 */
export function resolvePreviewTimelineImageMotion(
  masterTimeline: MasterTimeline | null | undefined,
  scene: FootieScene,
  timeMs: number,
): TimelineImageMotionInput | null {
  if (!masterTimeline) {
    return null;
  }

  const event = getImageMotionEventForScene(masterTimeline, scene.id);
  if (!event) {
    return null;
  }

  return { event, timeMs };
}

function resolvePreviewTimelineTimeMs(input: PreviewSceneTimingInput): number | null {
  const { masterTimeline, scenes, sceneIndex, playbackMode, isPlaying, browserSceneStartedAtMs, previewClockMs, currentTimeMs, elapsedSec } = input;
  if (!masterTimeline) {
    return null;
  }

  if (playbackMode === "narration") {
    return currentTimeMs ?? Math.floor(elapsedSec * 1000);
  }

  const slot = getSceneTimingMap(scenes)[sceneIndex];
  if (!slot) {
    return null;
  }

  if (isPlaying && playbackMode === "browser" && browserSceneStartedAtMs !== null) {
    const sceneElapsedMs = Math.min(slot.durationMs, previewClockMs - browserSceneStartedAtMs);
    return slot.startMs + sceneElapsedMs;
  }

  return slot.startMs;
}

/** Derives scene-local preview timing from playback clocks and MasterTimeline events. */
export function getPreviewSceneTiming(input: PreviewSceneTimingInput): PreviewSceneTiming {
  const { scenes, sceneIndex, playbackMode, masterTimeline } = input;

  if (input.isPlaying && playbackMode === "narration" && masterTimeline) {
    const timeMs = input.currentTimeMs ?? Math.floor(input.elapsedSec * 1000);
    const state = resolvePreviewPlaybackState(masterTimeline, scenes, timeMs, {
      defaultCaptionAnimation: input.defaultCaptionAnimation,
    });
    if (state) {
      return {
        sceneElapsedMs: state.sceneElapsedMs,
        sceneDurationMs: state.sceneDurationMs,
        activeSceneIndex: state.sceneIndex,
        activeSubtitleChunk: state.activeSubtitleChunk,
        chunkProgress: state.chunkProgress,
        captionAnimationState: state.captionAnimationState,
        subtitleAvailableDurationMs: state.subtitleAvailableDurationMs,
        captionTooShortForEffect: state.captionTooShortForEffect,
        timelineTimeMs: timeMs,
      };
    }
  }

  if (!input.isPlaying) {
    const slot = getSceneTimingMap(scenes)[sceneIndex];
    const scene = scenes[sceneIndex];
    const timelineMs = input.currentTimeMs ?? Math.floor(input.elapsedSec * 1000);
    const sceneElapsedMs = resolveIdlePreviewSceneElapsedMs({
      scene,
      sceneIndex,
      timelineMs,
    });
    const sceneDurationMs = slot?.durationMs ?? sceneElapsedMs + 1;
    return {
      sceneElapsedMs,
      sceneDurationMs,
      activeSceneIndex: sceneIndex,
      timelineTimeMs: (slot?.startMs ?? 0) + sceneElapsedMs,
    };
  }

  const slot = getSceneTimingMap(scenes)[sceneIndex];
  const sceneDurationMs = slot?.durationMs ?? 1000;
  let sceneElapsedMs = 0;

  if (input.isPlaying && playbackMode === "browser" && input.browserSceneStartedAtMs !== null) {
    sceneElapsedMs = Math.min(sceneDurationMs, input.previewClockMs - input.browserSceneStartedAtMs);
  }

  const timelineTimeMs = resolvePreviewTimelineTimeMs(input);

  return {
    sceneElapsedMs,
    sceneDurationMs,
    timelineTimeMs: timelineTimeMs ?? undefined,
  };
}
