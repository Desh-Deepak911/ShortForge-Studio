/**
 * Canonical transition frame authority (Sprint 11E 2G.24C).
 * Shared by Preview, Browser export, and Headless export at 30 fps frame centers.
 */

import type { TransitionEffect } from "@/features/story/types";
import { normalizeTransitionEffect } from "@/features/story/utils/timeline.utils";

import { resolveTransitionEffectLayers } from "./resolve-transition-state.utils";

export interface CanonicalTransitionFrameResolution {
  readonly active: boolean;
  readonly progress: number;
  /** True when the transition reached its completed compositing state. */
  readonly completed: boolean;
  readonly requiresCompositing: boolean;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
}

export function clampCanonicalTransitionProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.min(1, Math.max(0, progress));
}

function framePeriodMs(fps: number): number {
  return fps > 0 ? 1000 / fps : 1000 / 30;
}

/**
 * Frame-center progress for half-open `[windowStartMs, windowEndMs)`.
 * The last in-window frame snaps to progress `1` so the completed blend matches
 * the first post-transition frame without a visible pop.
 */
export function resolveCanonicalTransitionProgressForSample(input: {
  readonly sampleTimeMs: number;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly fps: number;
}): number | null {
  const { sampleTimeMs, windowStartMs, windowEndMs, fps } = input;

  if (!(windowEndMs > windowStartMs)) {
    return sampleTimeMs >= windowStartMs ? 1 : null;
  }

  if (sampleTimeMs < windowStartMs || sampleTimeMs >= windowEndMs) {
    return null;
  }

  const durationMs = windowEndMs - windowStartMs;
  const elapsedMs = sampleTimeMs - windowStartMs;
  let progress = durationMs > 0 ? elapsedMs / durationMs : 1;

  if (sampleTimeMs + framePeriodMs(fps) >= windowEndMs) {
    progress = 1;
  }

  return clampCanonicalTransitionProgress(progress);
}

/** Scene-local intra-scene overlay progress using the same boundary ownership. */
export function resolveCanonicalIntraSceneTransitionProgress(input: {
  readonly sceneElapsedMs: number;
  readonly overlayStartOffsetMs: number;
  readonly overlayEndOffsetMs: number;
  readonly effectiveDurationMs: number;
  readonly fps: number;
}): number | null {
  const progress = resolveCanonicalTransitionProgressForSample({
    sampleTimeMs: input.sceneElapsedMs,
    windowStartMs: input.overlayStartOffsetMs,
    windowEndMs: input.overlayEndOffsetMs,
    fps: input.fps,
  });
  if (progress == null) {
    return null;
  }
  if (!(input.effectiveDurationMs > 0)) {
    return null;
  }
  return progress;
}

export function resolveCanonicalTransitionFrame(input: {
  readonly sampleTimeMs: number;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly fps: number;
  readonly effect?: TransitionEffect;
}): CanonicalTransitionFrameResolution {
  const progress = resolveCanonicalTransitionProgressForSample({
    sampleTimeMs: input.sampleTimeMs,
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs,
    fps: input.fps,
  });

  if (progress == null) {
    return {
      active: false,
      progress: input.sampleTimeMs >= input.windowEndMs ? 1 : 0,
      completed: input.sampleTimeMs >= input.windowEndMs,
      requiresCompositing: false,
      windowStartMs: input.windowStartMs,
      windowEndMs: input.windowEndMs,
    };
  }

  const effect = normalizeTransitionEffect(input.effect ?? "fade");
  const resolvedProgress = effect === "cut" ? 1 : progress;

  return {
    active: true,
    progress: resolvedProgress,
    completed: resolvedProgress >= 1,
    requiresCompositing: resolvedProgress > 0 || effect === "cut",
    windowStartMs: input.windowStartMs,
    windowEndMs: input.windowEndMs,
  };
}

/** Effect layers for export/preview compositing from canonical frame authority. */
export function resolveCanonicalTransitionEffectLayers(input: {
  readonly sampleTimeMs: number;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly fps: number;
  readonly effect: TransitionEffect;
}) {
  const frame = resolveCanonicalTransitionFrame(input);
  if (!frame.active) {
    return resolveTransitionEffectLayers(input.effect, frame.progress);
  }
  const effect = normalizeTransitionEffect(input.effect);
  const progress = effect === "cut" ? 1 : frame.progress;
  return resolveTransitionEffectLayers(effect, progress);
}
