import {
  buildOptimizedMasterTimeline,
} from "@/features/timeline-intelligence/build-optimized-master-timeline.utils";
import {
  buildCaptionAnimationResolveInput,
  resolvePreviewCaptionAnimation,
} from "@/features/caption-animation";
import type { CaptionAnimationState } from "@/features/caption-animation";
import {
  resolveTimelineSceneFrame,
  resolveTimelineSubtitleChunkAtTime,
  resolveTimelineVisualTimeMs,
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
  captionTooShortForEffect: boolean;
  currentTimeMs: number;
}

export interface BuildPreviewMasterTimelineOptions {
  /**
   * When true, skip defensive script sync inside `buildMasterTimeline`.
   * Use for editor runtime scripts already synced at DraftEditorFlow.
   */
  assumeSynced?: boolean;
}

/** Builds the canonical preview timeline (refitted to voiceover when present). */
export function buildPreviewMasterTimeline(
  script: FootieScript | null | undefined,
  options: BuildPreviewMasterTimelineOptions = {},
): MasterTimeline | null {
  if (!script || script.scenes.length === 0) {
    return null;
  }

  return buildOptimizedMasterTimeline(script, {
    mode: "preview",
    useVoiceoverRefit: true,
    assumeSynced: options.assumeSynced,
  });
}

export interface ResolvePreviewPlaybackStateOptions {
  defaultCaptionAnimation?: FootieScript["defaultCaptionAnimation"];
}

/** Resolves active scene + subtitle state from shared MasterTimeline helpers. */
export function resolvePreviewPlaybackState(
  masterTimeline: MasterTimeline,
  scenes: FootieScene[],
  currentTimeMs: number,
  options: ResolvePreviewPlaybackStateOptions = {},
): PreviewPlaybackState | null {
  const frame = resolveTimelineSceneFrame(masterTimeline, scenes, currentTimeMs);
  if (!frame) {
    return null;
  }

  const visualTimeMs = resolveTimelineVisualTimeMs(masterTimeline, currentTimeMs);
  const subtitleChunk = resolveTimelineSubtitleChunkAtTime(
    frame.scene.id,
    frame.subtitle,
    frame.captionAnimation,
  );
  const captionAnimationState = frame.captionAnimation
    ? resolvePreviewCaptionAnimation(
        frame.captionAnimation.event,
        visualTimeMs,
        buildCaptionAnimationResolveInput(frame.scene, {
          defaultCaptionAnimation: options.defaultCaptionAnimation,
        }),
      )
    : null;
  const subtitleAvailableDurationMs =
    frame.captionAnimation?.event.metadata.availableDurationMs ??
    frame.subtitle?.durationMs ??
    0;
  const captionTooShortForEffect =
    frame.captionAnimation?.event.metadata.captionTooShortForEffect ?? false;

  return {
    scene: frame.scene,
    sceneIndex: frame.sceneIndex,
    sceneElapsedMs: frame.sceneElapsedMs,
    sceneDurationMs: frame.sceneDurationMs,
    activeSubtitleChunk: subtitleChunk?.activeSubtitleChunk ?? "",
    chunkProgress: captionAnimationState?.progress ?? subtitleChunk?.chunkProgress ?? 0,
    captionAnimationState,
    subtitleAvailableDurationMs,
    captionTooShortForEffect,
    currentTimeMs,
  };
}

export function resolvePreviewDurationSec(masterTimeline: MasterTimeline | null): number {
  if (!masterTimeline) {
    return 0;
  }

  return masterTimeline.renderDurationMs / 1000;
}
