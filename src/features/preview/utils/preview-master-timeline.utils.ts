import {
  buildOptimizedMasterTimeline,
} from "@/features/timeline-intelligence/build-optimized-master-timeline.utils";
import {
  resolveCaptionAnimationState,
} from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import type { CaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import {
  resolveTimelineSceneFrame,
  resolveTimelineSubtitleChunkAtTime,
} from "@/features/timeline-intelligence/timeline-playback.utils";
import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import type { FootieScene, FootieScript } from "@/features/story/types";

export interface PreviewPlaybackState {
  scene: FootieScene;
  sceneIndex: number;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  activeSubtitleChunk: string;
  chunkProgress: number;
  captionAnimationState: CaptionAnimationState | null;
  subtitleAvailableDurationMs: number;
  currentTimeMs: number;
}

/** Builds the canonical preview timeline (refitted to voiceover when present). */
export function buildPreviewMasterTimeline(script: FootieScript | null | undefined): MasterTimeline | null {
  if (!script || script.scenes.length === 0) {
    return null;
  }

  return buildOptimizedMasterTimeline(script, {
    mode: "preview",
    useVoiceoverRefit: true,
  });
}

/** Resolves active scene + subtitle state from shared MasterTimeline helpers. */
export function resolvePreviewPlaybackState(
  masterTimeline: MasterTimeline,
  scenes: FootieScene[],
  currentTimeMs: number,
): PreviewPlaybackState | null {
  const frame = resolveTimelineSceneFrame(masterTimeline, scenes, currentTimeMs);
  if (!frame) {
    return null;
  }

  const subtitleChunk = resolveTimelineSubtitleChunkAtTime(
    frame.scene.id,
    frame.subtitle,
    frame.captionAnimation,
  );
  const captionAnimationState = frame.captionAnimation
    ? resolveCaptionAnimationState(frame.captionAnimation.event, currentTimeMs)
    : null;
  const subtitleAvailableDurationMs =
    frame.captionAnimation?.event.metadata.availableDurationMs ??
    frame.subtitle?.durationMs ??
    0;

  return {
    scene: frame.scene,
    sceneIndex: frame.sceneIndex,
    sceneElapsedMs: frame.sceneElapsedMs,
    sceneDurationMs: frame.sceneDurationMs,
    activeSubtitleChunk: subtitleChunk?.activeSubtitleChunk ?? "",
    chunkProgress: captionAnimationState?.progress ?? subtitleChunk?.chunkProgress ?? 0,
    captionAnimationState,
    subtitleAvailableDurationMs,
    currentTimeMs,
  };
}

export function resolvePreviewDurationSec(masterTimeline: MasterTimeline | null): number {
  if (!masterTimeline) {
    return 0;
  }

  return masterTimeline.renderDurationMs / 1000;
}
