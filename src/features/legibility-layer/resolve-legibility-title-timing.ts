/**
 * Opening story-title timing — shared Preview / Browser / Headless policy.
 *
 * Window: first 2000ms of content (clamped to content duration).
 * Fade-out: final 300ms of that window.
 * Title does not restart at scene boundaries (absolute content time only).
 */

import {
  LEGIBILITY_TITLE_FADE_MS,
  LEGIBILITY_TITLE_WINDOW_MS,
} from "./legibility-layer.types";

export interface ResolvedLegibilityTitleTiming {
  readonly visible: boolean;
  readonly opacity: number;
  readonly fadePhase: "hidden" | "solid" | "fading";
  readonly effectiveWindowMs: number;
  readonly fadeStartMs: number;
}

export function resolveLegibilityTitleTiming(input: {
  readonly absoluteContentTimeMs: number;
  readonly contentDurationMs: number;
  readonly hasTitleText: boolean;
}): ResolvedLegibilityTitleTiming {
  if (!input.hasTitleText) {
    return {
      visible: false,
      opacity: 0,
      fadePhase: "hidden",
      effectiveWindowMs: 0,
      fadeStartMs: 0,
    };
  }

  const contentDurationMs = Math.max(
    0,
    Number.isFinite(input.contentDurationMs) ? input.contentDurationMs : 0,
  );
  const timeMs = Math.max(
    0,
    Number.isFinite(input.absoluteContentTimeMs)
      ? input.absoluteContentTimeMs
      : 0,
  );

  const effectiveWindowMs = Math.min(LEGIBILITY_TITLE_WINDOW_MS, contentDurationMs);
  if (effectiveWindowMs <= 0 || timeMs >= effectiveWindowMs) {
    return {
      visible: false,
      opacity: 0,
      fadePhase: "hidden",
      effectiveWindowMs,
      fadeStartMs: Math.max(0, effectiveWindowMs - LEGIBILITY_TITLE_FADE_MS),
    };
  }

  const fadeStartMs = Math.max(0, effectiveWindowMs - LEGIBILITY_TITLE_FADE_MS);
  if (timeMs < fadeStartMs) {
    return {
      visible: true,
      opacity: 1,
      fadePhase: "solid",
      effectiveWindowMs,
      fadeStartMs,
    };
  }

  const fadeSpan = Math.max(1, effectiveWindowMs - fadeStartMs);
  const opacity = Math.max(0, Math.min(1, 1 - (timeMs - fadeStartMs) / fadeSpan));
  return {
    visible: opacity > 0.01,
    opacity,
    fadePhase: opacity <= 0.01 ? "hidden" : "fading",
    effectiveWindowMs,
    fadeStartMs,
  };
}
