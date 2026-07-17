/**
 * Neutral, dependency-light transition vocabulary shared by:
 * - scene-to-scene TransitionTimelineItem
 * - intra-scene SceneMediaTransitionBoundary
 *
 * Must not import scene-media-transitions, timeline-intelligence, Preview, or Export.
 */

import type { TransitionEffect } from "@/features/story/types";

/** Default scene-to-scene effect when normalizing unknown values. */
export const DEFAULT_TRANSITION_EFFECT: TransitionEffect = "fade";

/** Default duration when normalizing unsupported values (scene-to-scene). */
export const DEFAULT_TRANSITION_DURATION_MS = 500;

/** Canonical effect options (includes Cut). */
export const TRANSITION_EFFECT_OPTIONS: { value: TransitionEffect; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "blur", label: "Blur" },
];

/** Non-Cut effects that may be persisted for intra-scene boundaries. */
export const TRANSITION_VISUAL_EFFECTS: readonly Exclude<TransitionEffect, "cut">[] = [
  "fade",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "blur",
];

/** Canonical duration registry — single source for scene-to-scene and intra-scene. */
export const TRANSITION_DURATION_OPTIONS = [300, 500, 800, 1000] as const;

export type TransitionDurationMs = (typeof TRANSITION_DURATION_OPTIONS)[number];

export const TRANSITION_DURATION_LABELS: Record<TransitionDurationMs, string> = {
  300: "Fast",
  500: "Normal",
  800: "Slow",
  1000: "Cinematic",
};

export function getTransitionEffectLabel(effect: TransitionEffect | string): string {
  const match = TRANSITION_EFFECT_OPTIONS.find((option) => option.value === effect);
  return match?.label ?? "Fade";
}

export function normalizeTransitionDurationMs(durationMs: number): TransitionDurationMs {
  if (TRANSITION_DURATION_OPTIONS.includes(durationMs as TransitionDurationMs)) {
    return durationMs as TransitionDurationMs;
  }
  return DEFAULT_TRANSITION_DURATION_MS;
}

export function getTransitionDurationLabel(durationMs: number): string {
  const normalized = normalizeTransitionDurationMs(durationMs);
  return TRANSITION_DURATION_LABELS[normalized];
}
