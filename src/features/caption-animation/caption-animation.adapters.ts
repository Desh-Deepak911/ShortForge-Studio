import type { CaptionAnimationTimelineEvent } from "@/features/timeline-intelligence/timeline.types";
import type { FootieScene, FootieScript } from "@/features/story/types";

import {
  resolveCaptionAnimation,
  resolveCaptionAnimationFromChunk,
  resolveCaptionAnimationFromTimelineEvent,
  resolveCaptionHighlightFrame,
} from "./caption-animation.engine";
import type {
  CaptionAnimationChunkInput,
  CaptionAnimationPreset,
  CaptionAnimationResolveInput,
  CaptionAnimationState,
} from "./caption-animation.types";

export interface CaptionAnimationSceneInput {
  subtitleEffect?: FootieScene["subtitleEffect"];
  captionAnimation?: FootieScene["captionAnimation"];
}

export interface CaptionAnimationScriptInput {
  defaultCaptionAnimation?: FootieScript["defaultCaptionAnimation"];
}

export function buildCaptionAnimationResolveInput(
  scene: CaptionAnimationSceneInput,
  script?: CaptionAnimationScriptInput,
): CaptionAnimationResolveInput {
  return {
    sceneAnimation: scene.captionAnimation,
    projectAnimation: script?.defaultCaptionAnimation,
    sceneSubtitleEffect: scene.subtitleEffect,
  };
}

/** Parses translateY offset from a CSS transform string (pixels). */
export function resolveCaptionAnimationTranslateYPx(transform: string): number {
  const match = transform.match(/translateY\(([-\d.]+)px\)/);
  return match ? Number(match[1]) : 0;
}

function resolveSceneAnimationPreset(
  scene: CaptionAnimationSceneInput,
  script?: CaptionAnimationScriptInput,
): CaptionAnimationPreset {
  return resolveCaptionAnimation(buildCaptionAnimationResolveInput(scene, script)).animationPreset;
}

/** Preview adapter — timeline-driven caption animation state. */
export function resolvePreviewCaptionAnimation(
  event: CaptionAnimationTimelineEvent,
  timeMs: number,
  resolveInput: CaptionAnimationResolveInput = {},
): CaptionAnimationState {
  return resolveCaptionAnimationFromTimelineEvent(event, timeMs, resolveInput);
}

/** Export adapter — timeline-driven caption animation state. */
export function resolveExportCaptionAnimation(
  event: CaptionAnimationTimelineEvent,
  timeMs: number,
  resolveInput: CaptionAnimationResolveInput = {},
): CaptionAnimationState {
  return resolveCaptionAnimationFromTimelineEvent(event, timeMs, resolveInput);
}

/** Export adapter — legacy chunk-progress caption animation state. */
export function resolveExportCaptionAnimationFromChunk(
  scene: CaptionAnimationSceneInput,
  script: CaptionAnimationScriptInput | undefined,
  input: Omit<CaptionAnimationChunkInput, "preset" | "resolveInput">,
): CaptionAnimationState {
  return resolveCaptionAnimationFromChunk({
    ...input,
    preset: resolveSceneAnimationPreset(scene, script),
    resolveInput: buildCaptionAnimationResolveInput(scene, script),
  });
}

/** Highlight frame helper shared by preview and export renderers. */
export function resolveExportCaptionHighlightFrame(
  chunkElapsedMs: number,
  activeChunkDurationMs: number,
) {
  return resolveCaptionHighlightFrame(chunkElapsedMs, activeChunkDurationMs);
}

/** @deprecated Use resolvePreviewCaptionAnimation — kept for timeline-intelligence re-export. */
export const resolveCaptionAnimationStateFromTimelineEvent = resolvePreviewCaptionAnimation;
