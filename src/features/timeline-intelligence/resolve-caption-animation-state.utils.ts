import type { SubtitleEffect } from "@/features/story/types";
import {
  getExportHighlightSubtitleFrame,
  getFadeUpSubtitleFrame,
} from "@/features/story/utils/subtitle-effect.utils";

import type { CaptionAnimationTimelineEvent } from "./timeline.types";

export interface CaptionAnimationState {
  isActive: boolean;
  localElapsedMs: number;
  /** Linear reveal progress through the scheduled animation window (0–1). */
  progress: number;
  visibleText: string;
  opacity: number;
  scale: number;
  transform: string;
  shouldRenderFullText: boolean;
}

const INACTIVE_STATE: CaptionAnimationState = {
  isActive: false,
  localElapsedMs: 0,
  progress: 0,
  visibleText: "",
  opacity: 0,
  scale: 1,
  transform: "none",
  shouldRenderFullText: false,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolveAnimationProgress(
  timeMs: number,
  animationStartMs: number,
  animationEndMs: number,
): number {
  const animationDurationMs = Math.max(1, animationEndMs - animationStartMs);
  const animationElapsedMs = Math.max(0, timeMs - animationStartMs);
  return clamp01(animationElapsedMs / animationDurationMs);
}

function resolveTypewriterVisibleText(
  text: string,
  localElapsedMs: number,
  availableDurationMs: number,
  captionTooShortForEffect: boolean,
): { visibleText: string; shouldRenderFullText: boolean } {
  const normalized = text.trim();
  if (!normalized) {
    return { visibleText: "", shouldRenderFullText: false };
  }

  const charCount = Math.max(normalized.length, 1);
  const msPerChar = availableDurationMs / charCount;

  if (localElapsedMs >= availableDurationMs) {
    return { visibleText: normalized, shouldRenderFullText: true };
  }

  const estimatedChars = Math.floor(localElapsedMs / msPerChar);
  const visibleLength = Math.min(normalized.length, Math.max(1, estimatedChars));

  if (visibleLength >= normalized.length) {
    return { visibleText: normalized, shouldRenderFullText: true };
  }

  if (captionTooShortForEffect) {
    const remainingMs = availableDurationMs - localElapsedMs;
    if (remainingMs <= msPerChar) {
      return { visibleText: normalized, shouldRenderFullText: true };
    }
  }

  const partial = normalized.slice(0, visibleLength);
  const nextIndex = visibleLength;
  const completesWord =
    nextIndex >= normalized.length ||
    normalized[nextIndex] === " " ||
    partial.endsWith(" ");

  if (!completesWord && localElapsedMs + msPerChar >= availableDurationMs) {
    return { visibleText: normalized, shouldRenderFullText: true };
  }

  return { visibleText: partial, shouldRenderFullText: false };
}

function resolveEffectVisuals(
  effect: SubtitleEffect,
  timeMs: number,
  meta: CaptionAnimationTimelineEvent["metadata"],
  localElapsedMs: number,
  animationComplete: boolean,
): Pick<CaptionAnimationState, "opacity" | "scale" | "transform"> {
  const animationElapsedMs = Math.max(0, timeMs - meta.animationStartMs);

  switch (effect) {
    case "fade-up": {
      if (animationComplete) {
        return { opacity: 1, scale: 1, transform: "none" };
      }

      const frame = getFadeUpSubtitleFrame(animationElapsedMs);
      return {
        opacity: frame.opacity,
        scale: 1,
        transform: `translateY(${frame.yOffsetPx}px)`,
      };
    }
    case "highlight": {
      const highlight = getExportHighlightSubtitleFrame(
        localElapsedMs,
        Math.max(1, meta.availableDurationMs),
      );
      return {
        opacity: 1,
        scale: highlight.barScale,
        transform: "none",
      };
    }
    case "typewriter":
    default:
      return { opacity: 1, scale: 1, transform: "none" };
  }
}

/** Parses translateY offset from a CSS transform string (pixels). */
export function resolveCaptionAnimationTranslateYPx(transform: string): number {
  const match = transform.match(/translateY\(([-\d.]+)px\)/);
  return match ? Number(match[1]) : 0;
}

/** Shared preview/export caption animation state from a timeline event and absolute time. */
export function resolveCaptionAnimationState(
  event: CaptionAnimationTimelineEvent,
  timeMs: number,
): CaptionAnimationState {
  const meta = event.metadata;
  const text = meta.text?.trim() ?? "";
  const effect = meta.effectType ?? meta.effect;

  if (timeMs < meta.subtitleStartMs) {
    return INACTIVE_STATE;
  }

  if (timeMs >= meta.subtitleEndMs) {
    if (!text) {
      return INACTIVE_STATE;
    }

    return {
      isActive: false,
      localElapsedMs: meta.availableDurationMs,
      progress: 1,
      visibleText: text,
      opacity: 1,
      scale: 1,
      transform: "none",
      shouldRenderFullText: true,
    };
  }

  const localElapsedMs = timeMs - meta.subtitleStartMs;
  const progress = resolveAnimationProgress(
    timeMs,
    meta.animationStartMs,
    meta.animationEndMs,
  );
  const inHoldPhase = timeMs >= meta.animationEndMs;
  const animationComplete = inHoldPhase || progress >= 1;
  const captionTooShortForEffect = meta.captionTooShortForEffect ?? false;

  let visibleText = text;
  let shouldRenderFullText = effect !== "typewriter" || inHoldPhase;

  if (effect === "typewriter" && text) {
    const typewriter = resolveTypewriterVisibleText(
      text,
      localElapsedMs,
      Math.max(1, meta.availableDurationMs),
      captionTooShortForEffect,
    );
    visibleText = typewriter.visibleText;
    shouldRenderFullText = shouldRenderFullText || typewriter.shouldRenderFullText;
  }

  const visuals = resolveEffectVisuals(
    effect,
    timeMs,
    meta,
    localElapsedMs,
    animationComplete,
  );

  return {
    isActive: true,
    localElapsedMs,
    progress: inHoldPhase ? 1 : progress,
    visibleText,
    ...visuals,
    shouldRenderFullText,
  };
}
