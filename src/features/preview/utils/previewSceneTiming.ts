import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import type { CaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import type { TimelineImageMotionInput } from "@/features/timeline-intelligence/resolve-image-motion-transform.utils";
import { getImageMotionEventForScene } from "@/features/timeline-intelligence/timeline-playback.utils";
import { getSceneTimingMap } from "@/features/story/utils";
import { resolvePreviewPlaybackState } from "@/features/preview/utils/preview-master-timeline.utils";
import type { FootieScene } from "@/features/story/types";

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
  timelineTimeMs?: number;
  sceneTimelineImageMotion?: TimelineImageMotionInput | null;
}

/** Builds timeline image motion input for one scene at an absolute time. */
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

  if (playbackMode === "narration" && masterTimeline) {
    const timeMs = input.currentTimeMs ?? Math.floor(input.elapsedSec * 1000);
    const state = resolvePreviewPlaybackState(masterTimeline, scenes, timeMs);
    if (state) {
      const sceneTimelineImageMotion = resolvePreviewTimelineImageMotion(
        masterTimeline,
        state.scene,
        timeMs,
      );

      return {
        sceneElapsedMs: state.sceneElapsedMs,
        sceneDurationMs: state.sceneDurationMs,
        activeSceneIndex: state.sceneIndex,
        activeSubtitleChunk: state.activeSubtitleChunk,
        chunkProgress: state.chunkProgress,
        captionAnimationState: state.captionAnimationState,
        subtitleAvailableDurationMs: state.subtitleAvailableDurationMs,
        timelineTimeMs: timeMs,
        sceneTimelineImageMotion,
      };
    }
  }

  const slot = getSceneTimingMap(scenes)[sceneIndex];
  const sceneDurationMs = slot?.durationMs ?? 1000;
  let sceneElapsedMs = 0;

  if (input.isPlaying && playbackMode === "browser" && input.browserSceneStartedAtMs !== null) {
    sceneElapsedMs = Math.min(sceneDurationMs, input.previewClockMs - input.browserSceneStartedAtMs);
  }

  const timelineTimeMs = resolvePreviewTimelineTimeMs(input);
  const scene = scenes[sceneIndex];
  const sceneTimelineImageMotion =
    timelineTimeMs != null && scene
      ? resolvePreviewTimelineImageMotion(masterTimeline, scene, timelineTimeMs)
      : null;

  return {
    sceneElapsedMs,
    sceneDurationMs,
    timelineTimeMs: timelineTimeMs ?? undefined,
    sceneTimelineImageMotion,
  };
}
