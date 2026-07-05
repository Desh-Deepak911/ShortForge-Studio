import type { CaptionPresetId } from "@/features/caption-engine/caption-engine.types";
import { inferCaptionTooShortForTypewriter } from "@/features/caption-engine/tiktok-motion-caption-style.utils";
import { resolveSceneCaptionPreset } from "@/features/caption-engine/caption-engine.utils";
import type { ActiveTimelineEvent } from "@/features/timeline-intelligence/timeline-playback.utils";
import {
  buildCaptionAnimationResolveInput,
  resolveExportCaptionAnimation,
  resolveExportCaptionAnimationFromChunk,
} from "@/features/caption-animation";
import type { CaptionAnimationState } from "@/features/caption-animation";
import type { CaptionAnimationTimelineEvent, SubtitleTimelineEvent } from "@/features/timeline-intelligence/timeline.types";
import type { ExportScene } from "@/features/export/services/export-payload.service";
import type { FootieScript, SubtitleEffect } from "@/features/story/types";
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
} from "@/features/story/utils/subtitle-effect.utils";

/** @deprecated Use SUBTITLE_MAX_VISIBLE_LINES */
export const EXPORT_SUBTITLE_MAX_VISIBLE_LINES = SUBTITLE_MAX_VISIBLE_LINES;

type ExportSubtitleScene = Pick<
  ExportScene,
  | "id"
  | "captionMode"
  | "captionPreset"
  | "subtitleEffect"
  | "captionAnimation"
  | "subtitleChunks"
  | "subtitleText"
  | "narration"
  | "subtitle"
>;

export interface ResolveExportSubtitleDisplayOptions {
  defaultCaptionAnimation?: FootieScript["defaultCaptionAnimation"];
}

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
  /** Resolved caption preset for fade-safe export styling (visual only). */
  captionPreset?: CaptionPresetId;
  /** When true, motion presets degrade to legacy typewriter styling. */
  captionTooShortForEffect?: boolean;
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
  const captionPreset = resolveSceneCaptionPreset(scene);
  const captionTooShortForEffect =
    effect === "typewriter"
      ? inferCaptionTooShortForTypewriter(activeChunk, state.activeChunkDurationMs)
      : false;

  if (effect === "typewriter") {
    const animationState = resolveExportCaptionAnimationFromChunk(scene, undefined, {
      text: activeChunk,
      chunkElapsedMs: state.chunkElapsedMs,
      chunkDurationMs: state.activeChunkDurationMs,
      captionTooShortForEffect,
    });
    const revealed = animationState.visibleText.trim();
    if (!revealed) {
      return null;
    }

    const layout = resolveExportSubtitleLines(activeChunk, effect, state.effectProgress);

    return {
      activeChunk,
      lines: layout.lines.length > 0 ? layout.lines : [revealed],
      effect,
      captionPreset,
      captionTooShortForEffect,
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
    captionPreset,
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
  options: ResolveExportSubtitleDisplayOptions = {},
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
    ? resolveExportCaptionAnimation(
        captionAnimation.event,
        currentTimeMs,
        buildCaptionAnimationResolveInput(scene, {
          defaultCaptionAnimation: options.defaultCaptionAnimation,
        }),
      )
    : null;
  const effect =
    captionAnimation?.event.metadata.effectType ??
    captionAnimation?.event.metadata.effect ??
    normalizeSubtitleEffect(scene.subtitleEffect);
  const captionPreset = resolveSceneCaptionPreset(scene);
  const subtitleAvailableDurationMs =
    captionAnimation?.event.metadata.availableDurationMs ?? subtitle.durationMs;
  const captionTooShortForEffect =
    captionAnimation?.event.metadata.captionTooShortForEffect ??
    (effect === "typewriter"
      ? inferCaptionTooShortForTypewriter(activeChunk, subtitleAvailableDurationMs)
      : false);
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
      captionPreset,
      captionTooShortForEffect,
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
    captionPreset,
    captionTooShortForEffect,
    sceneElapsedMs: chunkElapsedMs,
    chunkElapsedMs,
    activeChunkDurationMs: subtitleAvailableDurationMs,
    effectProgress,
    fontScale: layout.fontScale,
    animationState: animationState ?? undefined,
    subtitleAvailableDurationMs,
  };
}
