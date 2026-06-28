import type { ActiveTimelineEvent } from "@/features/timeline-intelligence/timeline-playback.utils";
import { resolveCaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import type { CaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import type { CaptionAnimationTimelineEvent, SubtitleTimelineEvent } from "@/features/timeline-intelligence/timeline.types";
import type { ExportScene } from "@/features/export/services/export-payload.service";
import type { SubtitleEffect } from "@/features/story/types";
import {
  getActiveSubtitleChunkFromList,
  getSubtitleDisplayChunks,
  getSubtitleChunkDurationMs,
  normalizeCaptionMode,
  normalizeSubtitleEffect,
  resolveActiveSubtitleTiming,
  SUBTITLE_MAX_VISIBLE_LINES,
  type DisplayCaptionTiming,
} from "@/features/story/utils";
import {
  resolveSubtitleDisplayLayout,
  type SubtitleDisplayLayout,
} from "@/features/story/utils/subtitle-layout.utils";
import {
  getExportSubtitleEffectProgress,
  getTypewriterRevealedText,
} from "@/features/story/utils/subtitle-effect.utils";

/** @deprecated Use SUBTITLE_MAX_VISIBLE_LINES */
export const EXPORT_SUBTITLE_MAX_VISIBLE_LINES = SUBTITLE_MAX_VISIBLE_LINES;

type ExportSubtitleScene = Pick<
  ExportScene,
  | "id"
  | "captionMode"
  | "subtitleEffect"
  | "subtitleChunks"
  | "subtitleText"
  | "narration"
  | "subtitle"
>;

export interface ExportSubtitleChunkState {
  chunk: string;
  progress: number;
  chunkElapsedMs: number;
  activeChunkDurationMs: number;
  effectProgress: number;
}

function resolveExportSubtitleChunks(scene: ExportSubtitleScene): string[] {
  if (scene.subtitleChunks && scene.subtitleChunks.length > 0) {
    return scene.subtitleChunks;
  }

  return getSubtitleDisplayChunks(scene);
}

export function getExportActiveChunkDurationMs(
  sceneDurationMs: number,
  chunkCount: number,
): number {
  return getSubtitleChunkDurationMs(sceneDurationMs, chunkCount);
}

/** Returns the single timed subtitle chunk visible at this export frame. */
export function getExportActiveSubtitleChunk(
  scene: ExportSubtitleScene,
  timing: DisplayCaptionTiming,
): string {
  if (normalizeCaptionMode(scene.captionMode) !== "subtitles") {
    return "";
  }

  const chunks = resolveExportSubtitleChunks(scene);
  if (chunks.length === 0) {
    return "";
  }

  return getActiveSubtitleChunkFromList(
    chunks,
    timing.sceneElapsedMs,
    timing.sceneDurationMs,
  );
}

/** Active chunk timing state for export frame rendering. */
export function getExportSubtitleChunkState(
  scene: ExportSubtitleScene,
  timing: DisplayCaptionTiming,
): ExportSubtitleChunkState {
  const chunks = resolveExportSubtitleChunks(scene);
  const state = resolveActiveSubtitleTiming(chunks, timing);
  const activeChunkDurationMs = state.chunkDurationMs;
  const effectProgress = getExportSubtitleEffectProgress(
    state.chunkElapsedMs,
    activeChunkDurationMs,
  );

  return {
    chunk: state.activeChunk,
    progress: state.chunkProgress,
    chunkElapsedMs: state.chunkElapsedMs,
    activeChunkDurationMs,
    effectProgress,
  };
}

export interface ExportSubtitleDisplay {
  /** The one timed chunk selected for this frame. */
  activeChunk: string;
  /** Word-wrap rows derived from the active chunk (typewriter uses progressive reveal). */
  lines: string[];
  effect: SubtitleEffect;
  sceneElapsedMs: number;
  chunkElapsedMs: number;
  activeChunkDurationMs: number;
  effectProgress: number;
  fontScale?: number;
  /** Timeline-driven animation state (preview/export MasterTimeline path). */
  animationState?: CaptionAnimationState;
  subtitleAvailableDurationMs?: number;
}

function resolveExportSubtitleLines(
  activeChunk: string,
  effect: SubtitleEffect,
  effectProgress: number,
  layoutSource = activeChunk,
): SubtitleDisplayLayout {
  if (effect === "typewriter") {
    const revealed = layoutSource.trim();
    if (!revealed) {
      return { lines: [], fontScale: 1 };
    }

    return resolveSubtitleDisplayLayout(revealed, {
      maxLines: SUBTITLE_MAX_VISIBLE_LINES,
    });
  }

  return resolveSubtitleDisplayLayout(activeChunk, {
    maxLines: SUBTITLE_MAX_VISIBLE_LINES,
  });
}

/**
 * Resolves export subtitle display for one frame — exactly one timed chunk,
 * never the full subtitle array or adjacent chunks.
 */
export function resolveExportSubtitleDisplay(
  scene: ExportSubtitleScene,
  timing: DisplayCaptionTiming,
): ExportSubtitleDisplay | null {
  if (normalizeCaptionMode(scene.captionMode) !== "subtitles") {
    return null;
  }

  const state = getExportSubtitleChunkState(scene, timing);
  const activeChunk = state.chunk.trim();
  if (!activeChunk) {
    return null;
  }

  const effect = normalizeSubtitleEffect(scene.subtitleEffect);

  if (effect === "typewriter") {
    const revealed = getTypewriterRevealedText(activeChunk, state.effectProgress).trim();
    if (!revealed) {
      return null;
    }

    const layout = resolveExportSubtitleLines(activeChunk, effect, state.effectProgress);

    return {
      activeChunk,
      lines: layout.lines.length > 0 ? layout.lines : [revealed],
      effect,
      sceneElapsedMs: timing.sceneElapsedMs,
      chunkElapsedMs: state.chunkElapsedMs,
      activeChunkDurationMs: state.activeChunkDurationMs,
      effectProgress: state.effectProgress,
      fontScale: layout.fontScale,
    };
  }

  const layout = resolveExportSubtitleLines(activeChunk, effect, state.effectProgress);

  if (layout.lines.length === 0) {
    return null;
  }

  return {
    activeChunk,
    lines: layout.lines,
    effect,
    sceneElapsedMs: timing.sceneElapsedMs,
    chunkElapsedMs: state.chunkElapsedMs,
    activeChunkDurationMs: state.activeChunkDurationMs,
    effectProgress: state.effectProgress,
    fontScale: layout.fontScale,
  };
}

/** Export subtitle display from MasterTimeline absolute events (Phase 3A). */
export function resolveExportSubtitleDisplayFromTimeline(
  scene: ExportSubtitleScene,
  subtitle: ActiveTimelineEvent<SubtitleTimelineEvent> | null,
  captionAnimation: ActiveTimelineEvent<CaptionAnimationTimelineEvent> | null,
  currentTimeMs: number,
): ExportSubtitleDisplay | null {
  if (normalizeCaptionMode(scene.captionMode) !== "subtitles") {
    return null;
  }

  if (!subtitle || subtitle.event.metadata.sceneId !== scene.id) {
    return null;
  }

  const activeChunk = subtitle.event.metadata.text.trim();
  if (!activeChunk) {
    return null;
  }

  const animationState = captionAnimation
    ? resolveCaptionAnimationState(captionAnimation.event, currentTimeMs)
    : null;
  const effect =
    captionAnimation?.event.metadata.effectType ??
    captionAnimation?.event.metadata.effect ??
    normalizeSubtitleEffect(scene.subtitleEffect);
  const subtitleAvailableDurationMs =
    captionAnimation?.event.metadata.availableDurationMs ?? subtitle.durationMs;
  const chunkElapsedMs = animationState?.localElapsedMs ?? subtitle.elapsedMs;
  const effectProgress = animationState?.progress ?? captionAnimation?.progress ?? subtitle.progress;

  const progressiveText =
    effect === "typewriter" && animationState
      ? animationState.visibleText.trim()
      : activeChunk;

  if (effect === "typewriter" && !progressiveText) {
    return null;
  }

  const layoutSource = effect === "typewriter" ? progressiveText : activeChunk;
  const layout = resolveExportSubtitleLines(activeChunk, effect, effectProgress, layoutSource);

  if (layout.lines.length === 0 && effect !== "typewriter") {
    return null;
  }

  if (effect === "typewriter") {
    return {
      activeChunk,
      lines: layout.lines.length > 0 ? layout.lines : [progressiveText],
      effect,
      sceneElapsedMs: chunkElapsedMs,
      chunkElapsedMs,
      activeChunkDurationMs: subtitleAvailableDurationMs,
      effectProgress,
      fontScale: layout.fontScale,
      animationState: animationState ?? undefined,
      subtitleAvailableDurationMs,
    };
  }

  if (layout.lines.length === 0) {
    return null;
  }

  return {
    activeChunk,
    lines: layout.lines,
    effect,
    sceneElapsedMs: chunkElapsedMs,
    chunkElapsedMs,
    activeChunkDurationMs: subtitleAvailableDurationMs,
    effectProgress,
    fontScale: layout.fontScale,
    animationState: animationState ?? undefined,
    subtitleAvailableDurationMs,
  };
}
