import type { CaptionAnimationTimelineEvent } from "@/features/timeline-intelligence/timeline.types";
import {
  cubicBezierTiming,
  getExportHighlightSubtitleFrame,
  getFadeUpSubtitleFrame,
  getTypewriterRevealedText,
  FADE_UP_DURATION_MS,
  FADE_UP_EASING,
  FADE_UP_Y_OFFSET_PX,
} from "@/features/story/utils/subtitle-effect.utils";
import { resolveMotionPresetDiagnostics } from "@/features/caption-animation-presets";

import {
  CAPTION_ANIMATION_DURATION_DEFAULT_MS,
  DEFAULT_CAPTION_ANIMATION_PRESET,
} from "./caption-animation.defaults";
import type {
  CaptionAnimation,
  CaptionAnimationChunkInput,
  CaptionAnimationDiagnostics,
  CaptionAnimationEasing,
  CaptionAnimationPhase,
  CaptionAnimationPreset,
  CaptionAnimationResolveInput,
  CaptionAnimationState,
  CaptionAnimationTimelineInput,
} from "./caption-animation.types";
import {
  clamp01,
  mapSubtitleEffectToAnimationPreset,
  mergeCaptionAnimationSettings,
  resolveCaptionAnimationFieldSources,
  resolveCaptionAnimationSource,
  resolveEffectiveAnimationPreset,
  resolveEffectiveCaptionAnimationDurationMs,
  usesLegacyCaptionAnimationTiming,
} from "./caption-animation.utils";

const INACTIVE_STATE: CaptionAnimationState = {
  opacity: 0,
  translateX: 0,
  translateY: 0,
  scale: 1,
  rotation: 0,
  blur: 0,
  clipProgress: 0,
  highlightProgress: 0,
  typewriterProgress: 0,
  visible: false,
  completed: false,
  visibleText: "",
  progress: 0,
  phase: "inactive",
  isActive: false,
  localElapsedMs: 0,
  transform: "none",
  shouldRenderFullText: false,
};

function withResolvedSettings(
  state: CaptionAnimationState,
  settings: CaptionAnimation,
): CaptionAnimationState {
  return {
    ...state,
    durationMs: settings.durationMs,
    delayMs: settings.delayMs,
    easing: settings.easing,
    direction: settings.direction,
    intensity: settings.intensity,
  };
}

function applyDirection(progress: number, direction: CaptionAnimation["direction"]): number {
  return direction === "reverse" ? 1 - progress : progress;
}

function applyCaptionAnimationEasing(
  linearProgress: number,
  easing: CaptionAnimationEasing | undefined,
  useLegacyEasing: boolean,
): number {
  const t = clamp01(linearProgress);

  if (useLegacyEasing || !easing) {
    return cubicBezierTiming(
      t,
      FADE_UP_EASING.cp1x,
      FADE_UP_EASING.cp1y,
      FADE_UP_EASING.cp2x,
      FADE_UP_EASING.cp2y,
    );
  }

  switch (easing) {
    case "linear":
      return t;
    case "ease_in":
      return t * t;
    case "ease_out":
      return 1 - (1 - t) * (1 - t);
    case "ease_in_out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return t;
  }
}

function resolveFadeFrame(
  elapsedMs: number,
  settings: CaptionAnimation,
  useLegacyTiming: boolean,
) {
  if (useLegacyTiming) {
    return getFadeUpSubtitleFrame(elapsedMs);
  }

  const durationMs = settings.durationMs ?? CAPTION_ANIMATION_DURATION_DEFAULT_MS;
  const delayMs = settings.delayMs ?? 0;
  const adjustedElapsed = Math.max(0, elapsedMs - delayMs);
  const linearProgress = clamp01(adjustedElapsed / Math.max(1, durationMs));
  const directedProgress = applyDirection(linearProgress, settings.direction);
  const easedProgress = applyCaptionAnimationEasing(
    directedProgress,
    settings.easing,
    false,
  );
  const intensityFactor = clamp01((settings.intensity ?? 100) / 100);

  return {
    opacity: 1 - (1 - easedProgress) * intensityFactor,
    yOffsetPx: (1 - easedProgress) * FADE_UP_Y_OFFSET_PX * intensityFactor,
  };
}

function resolveAnimationProgress(
  timeMs: number,
  animationStartMs: number,
  animationEndMs: number,
  settings?: CaptionAnimation,
  useLegacyTiming = true,
): number {
  const timelineDurationMs = Math.max(1, animationEndMs - animationStartMs);

  if (useLegacyTiming || !settings) {
    const animationElapsedMs = Math.max(0, timeMs - animationStartMs);
    return clamp01(animationElapsedMs / timelineDurationMs);
  }

  const delayMs = settings.delayMs ?? 0;
  const durationMs = resolveEffectiveCaptionAnimationDurationMs(settings, timelineDurationMs);
  const effectiveStartMs = animationStartMs + delayMs;
  const animationElapsedMs = Math.max(0, timeMs - effectiveStartMs);
  const linearProgress = clamp01(animationElapsedMs / Math.max(1, durationMs));
  return applyDirection(linearProgress, settings.direction);
}

function resolveTypewriterVisibleText(
  text: string,
  localElapsedMs: number,
  revealDurationMs: number,
  availableDurationMs: number,
  captionTooShortForEffect: boolean,
  settings?: CaptionAnimation,
  useLegacyTiming = true,
): { visibleText: string; shouldRenderFullText: boolean; typewriterProgress: number } {
  const normalized = text.trim();
  if (!normalized) {
    return { visibleText: "", shouldRenderFullText: false, typewriterProgress: 0 };
  }

  const configuredDuration = settings?.durationMs;
  const delayMs = useLegacyTiming ? 0 : (settings?.delayMs ?? 0);
  const adjustedElapsed = Math.max(0, localElapsedMs - delayMs);
  const pacingDurationMs = captionTooShortForEffect
    ? Math.max(1, availableDurationMs)
    : Math.max(
        1,
        useLegacyTiming || configuredDuration == null
          ? revealDurationMs
          : configuredDuration,
      );
  const completionDurationMs = pacingDurationMs;
  const charCount = Math.max(normalized.length, 1);
  const msPerChar = pacingDurationMs / charCount;

  if (adjustedElapsed >= completionDurationMs) {
    return { visibleText: normalized, shouldRenderFullText: true, typewriterProgress: 1 };
  }

  const estimatedChars = Math.floor(adjustedElapsed / msPerChar);
  const visibleLength = Math.min(normalized.length, Math.max(1, estimatedChars));

  if (visibleLength >= normalized.length) {
    return { visibleText: normalized, shouldRenderFullText: true, typewriterProgress: 1 };
  }

  if (captionTooShortForEffect) {
    const remainingMs = availableDurationMs - adjustedElapsed;
    if (remainingMs <= msPerChar) {
      return { visibleText: normalized, shouldRenderFullText: true, typewriterProgress: 1 };
    }
  }

  const partial = normalized.slice(0, visibleLength);
  const nextIndex = visibleLength;
  const completesWord =
    nextIndex >= normalized.length ||
    normalized[nextIndex] === " " ||
    partial.endsWith(" ");

  if (!completesWord && adjustedElapsed + msPerChar >= completionDurationMs) {
    return { visibleText: normalized, shouldRenderFullText: true, typewriterProgress: 1 };
  }

  let typewriterProgress = visibleLength / normalized.length;
  if (!useLegacyTiming && settings?.direction === "reverse") {
    typewriterProgress = 1 - typewriterProgress;
  }

  return {
    visibleText: partial,
    shouldRenderFullText: false,
    typewriterProgress,
  };
}

function resolveEffectVisuals(
  preset: CaptionAnimationPreset,
  timeMs: number,
  input: CaptionAnimationTimelineInput,
  localElapsedMs: number,
  animationComplete: boolean,
  settings: CaptionAnimation,
  useLegacyTiming: boolean,
): Pick<
  CaptionAnimationState,
  | "opacity"
  | "scale"
  | "translateX"
  | "translateY"
  | "transform"
  | "highlightProgress"
  | "rotation"
  | "blur"
> {
  const animationElapsedMs = Math.max(0, timeMs - input.animationStartMs);
  const intensityFactor = clamp01((settings.intensity ?? 100) / 100);

  switch (preset) {
    case "fade": {
      if (animationComplete) {
        return {
          opacity: 1,
          scale: 1,
          translateX: 0,
          translateY: 0,
          transform: "none",
          highlightProgress: 0,
          rotation: 0,
          blur: 0,
        };
      }

      const frame = resolveFadeFrame(animationElapsedMs, settings, useLegacyTiming);
      return {
        opacity: frame.opacity,
        scale: 1,
        translateX: 0,
        translateY: frame.yOffsetPx,
        transform: `translateY(${frame.yOffsetPx}px)`,
        highlightProgress: 0,
        rotation: 0,
        blur: 0,
      };
    }
    case "highlight": {
      const highlightDurationMs = useLegacyTiming
        ? Math.max(1, input.availableDurationMs)
        : resolveEffectiveCaptionAnimationDurationMs(
            settings,
            Math.max(1, input.availableDurationMs),
          );
      const delayMs = useLegacyTiming ? 0 : (settings.delayMs ?? 0);
      const adjustedElapsed = Math.max(0, localElapsedMs - delayMs);
      const highlight = getExportHighlightSubtitleFrame(adjustedElapsed, highlightDurationMs);
      const scaledProgress =
        1 - (1 - highlight.highlightWidthProgress) * intensityFactor;
      const scaledScale = 1 - (1 - highlight.barScale) * intensityFactor;

      return {
        opacity: 1,
        scale: scaledScale,
        translateX: 0,
        translateY: 0,
        transform: "none",
        highlightProgress: scaledProgress,
        rotation: 0,
        blur: 0,
      };
    }
    case "none":
      return {
        opacity: 1,
        scale: 1,
        translateX: 0,
        translateY: 0,
        transform: "none",
        highlightProgress: 0,
        rotation: 0,
        blur: 0,
      };
    case "typewriter":
    default:
      return {
        opacity: 1,
        scale: 1,
        translateX: 0,
        translateY: 0,
        transform: "none",
        highlightProgress: 0,
        rotation: 0,
        blur: 0,
      };
  }
}

function buildCaptionAnimationState(
  preset: CaptionAnimationPreset,
  input: CaptionAnimationTimelineInput,
  timeMs: number,
  settings: CaptionAnimation,
  useLegacyTiming: boolean,
): CaptionAnimationState {
  const text = input.text.trim();

  if (timeMs < input.subtitleStartMs) {
    return withResolvedSettings(INACTIVE_STATE, settings);
  }

  if (timeMs >= input.subtitleEndMs) {
    if (!text) {
      return withResolvedSettings(INACTIVE_STATE, settings);
    }

    return withResolvedSettings(
      {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: 1,
        rotation: 0,
        blur: 0,
        clipProgress: 1,
        highlightProgress: 1,
        typewriterProgress: 1,
        visible: false,
        completed: true,
        visibleText: text,
        progress: 1,
        phase: "completed",
        isActive: false,
        localElapsedMs: input.availableDurationMs,
        transform: "none",
        shouldRenderFullText: true,
      },
      settings,
    );
  }

  const localElapsedMs = timeMs - input.subtitleStartMs;
  const progress = resolveAnimationProgress(
    timeMs,
    input.animationStartMs,
    input.animationEndMs,
    settings,
    useLegacyTiming,
  );
  const inHoldPhase = timeMs >= input.animationEndMs;
  const animationComplete = inHoldPhase || progress >= 1;
  const captionTooShortForEffect = input.captionTooShortForEffect ?? false;
  const phase: CaptionAnimationPhase = animationComplete ? "hold" : "animating";

  let visibleText = text;
  let shouldRenderFullText = preset !== "typewriter";
  let typewriterProgress = preset === "typewriter" ? 0 : 1;

  if (preset === "typewriter" && text) {
    const revealDurationMs = Math.max(1, input.animationEndMs - input.animationStartMs);
    const typewriter = resolveTypewriterVisibleText(
      text,
      localElapsedMs,
      revealDurationMs,
      Math.max(1, input.availableDurationMs),
      captionTooShortForEffect,
      settings,
      useLegacyTiming,
    );
    visibleText = typewriter.visibleText;
    shouldRenderFullText = typewriter.shouldRenderFullText;
    typewriterProgress = typewriter.typewriterProgress;
  }

  const visuals = resolveEffectVisuals(
    preset,
    timeMs,
    input,
    localElapsedMs,
    animationComplete,
    settings,
    useLegacyTiming,
  );

  return withResolvedSettings(
    {
      ...visuals,
      clipProgress: inHoldPhase ? 1 : progress,
      typewriterProgress,
      visible: Boolean(visibleText) && visuals.opacity > 0,
      completed: animationComplete,
      visibleText,
      progress: inHoldPhase ? 1 : progress,
      phase,
      isActive: true,
      localElapsedMs,
      shouldRenderFullText,
    },
    settings,
  );
}

/** Resolves scene/project animation preset settings. */
export function resolveCaptionAnimation(input: CaptionAnimationResolveInput = {}) {
  const resolvedAnimation = mergeCaptionAnimationSettings(input);
  const animationSource = resolveCaptionAnimationSource(input);
  const animationPreset = resolvedAnimation.preset ?? DEFAULT_CAPTION_ANIMATION_PRESET;
  const fieldSources = resolveCaptionAnimationFieldSources(input);
  const useLegacyTiming = usesLegacyCaptionAnimationTiming(
    input.sceneAnimation,
    input.projectAnimation,
  );

  return {
    resolvedAnimation,
    animationPreset,
    animationSource,
    fieldSources,
    useLegacyTiming,
  };
}

export function resolveCaptionAnimationDiagnostics(
  input: CaptionAnimationResolveInput = {},
  state: CaptionAnimationState = INACTIVE_STATE,
): CaptionAnimationDiagnostics {
  const resolved = resolveCaptionAnimation(input);
  const motionPreset = resolveMotionPresetDiagnostics(input);

  return {
    animationPreset: resolved.animationPreset,
    animationSource: resolved.animationSource,
    resolvedAnimation: resolved.resolvedAnimation,
    progress: state.progress,
    phase: state.phase,
    visible: state.visible,
    durationSource: resolved.fieldSources.durationSource,
    delaySource: resolved.fieldSources.delaySource,
    easingSource: resolved.fieldSources.easingSource,
    directionSource: resolved.fieldSources.directionSource,
    intensitySource: resolved.fieldSources.intensitySource,
    motionPresetId: motionPreset.motionPresetId,
    motionPresetSource: motionPreset.motionPresetSource,
    resolvedMotionPreset: motionPreset.resolvedMotionPreset
      ? {
          id: motionPreset.resolvedMotionPreset.id,
          label: motionPreset.resolvedMotionPreset.label,
          category: motionPreset.resolvedMotionPreset.category,
        }
      : null,
    resolvedState: state,
  };
}

/** Timeline-driven caption animation state — single source of truth. */
export function resolveCaptionAnimationState(
  input: CaptionAnimationTimelineInput,
  timeMs: number,
  preset: CaptionAnimationPreset = mapSubtitleEffectToAnimationPreset(input.effect),
  resolveInput: CaptionAnimationResolveInput = {},
): CaptionAnimationState {
  const resolved = resolveCaptionAnimation(resolveInput);
  const effectivePreset = resolveEffectiveAnimationPreset(
    preset,
    resolveInput,
    resolved.animationPreset,
  );

  return buildCaptionAnimationState(
    effectivePreset,
    input,
    timeMs,
    resolved.resolvedAnimation,
    resolved.useLegacyTiming,
  );
}

/** Resolves animation state from a master-timeline caption animation event. */
export function resolveCaptionAnimationFromTimelineEvent(
  event: CaptionAnimationTimelineEvent,
  timeMs: number,
  resolveInput: CaptionAnimationResolveInput = {},
): CaptionAnimationState {
  const meta = event.metadata;
  const timelinePreset = mapSubtitleEffectToAnimationPreset(meta.effectType ?? meta.effect);

  return resolveCaptionAnimationState(
    {
      sceneId: meta.sceneId,
      chunkIndex: meta.chunkIndex,
      text: meta.text ?? "",
      effect: meta.effectType ?? meta.effect,
      subtitleStartMs: meta.subtitleStartMs,
      subtitleEndMs: meta.subtitleEndMs,
      animationStartMs: meta.animationStartMs,
      animationEndMs: meta.animationEndMs,
      availableDurationMs: meta.availableDurationMs,
      captionTooShortForEffect: meta.captionTooShortForEffect,
    },
    timeMs,
    timelinePreset,
    resolveInput,
  );
}

/** Legacy chunk-progress animation state for export frames without master timeline. */
export function resolveCaptionAnimationFromChunk(
  input: CaptionAnimationChunkInput,
): CaptionAnimationState {
  const text = input.text.trim();
  if (!text) {
    return INACTIVE_STATE;
  }

  const resolved = input.resolveInput
    ? resolveCaptionAnimation(input.resolveInput)
    : resolveCaptionAnimation();
  const settings = resolved.resolvedAnimation;
  const useLegacyTiming = resolved.useLegacyTiming;
  const chunkDurationMs = Math.max(1, input.chunkDurationMs);
  const chunkProgress = clamp01(input.chunkElapsedMs / chunkDurationMs);
  const preset = input.preset;

  if (preset === "typewriter") {
    const visibleText = getTypewriterRevealedText(text, chunkProgress).trim();
    if (!visibleText) {
      return withResolvedSettings(INACTIVE_STATE, settings);
    }

    return withResolvedSettings(
      {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: 1,
        rotation: 0,
        blur: 0,
        clipProgress: chunkProgress,
        highlightProgress: 0,
        typewriterProgress: chunkProgress,
        visible: true,
        completed: chunkProgress >= 1,
        visibleText,
        progress: chunkProgress,
        phase: chunkProgress >= 1 ? "completed" : "animating",
        isActive: true,
        localElapsedMs: input.chunkElapsedMs,
        transform: "none",
        shouldRenderFullText: chunkProgress >= 1,
      },
      settings,
    );
  }

  if (preset === "fade") {
    const frame = resolveFadeFrame(input.chunkElapsedMs, settings, useLegacyTiming);
    return withResolvedSettings(
      {
        opacity: frame.opacity,
        translateX: 0,
        translateY: frame.yOffsetPx,
        scale: 1,
        rotation: 0,
        blur: 0,
        clipProgress: chunkProgress,
        highlightProgress: 0,
        typewriterProgress: 1,
        visible: frame.opacity > 0,
        completed: chunkProgress >= 1,
        visibleText: text,
        progress: chunkProgress,
        phase: chunkProgress >= 1 ? "completed" : "animating",
        isActive: true,
        localElapsedMs: input.chunkElapsedMs,
        transform: `translateY(${frame.yOffsetPx}px)`,
        shouldRenderFullText: true,
      },
      settings,
    );
  }

  if (preset === "highlight") {
    const highlightDurationMs = useLegacyTiming
      ? chunkDurationMs
      : resolveEffectiveCaptionAnimationDurationMs(settings, chunkDurationMs);
    const delayMs = useLegacyTiming ? 0 : (settings.delayMs ?? 0);
    const adjustedElapsed = Math.max(0, input.chunkElapsedMs - delayMs);
    const highlight = getExportHighlightSubtitleFrame(adjustedElapsed, highlightDurationMs);
    const intensityFactor = clamp01((settings.intensity ?? 100) / 100);
    const scaledProgress =
      1 - (1 - highlight.highlightWidthProgress) * intensityFactor;
    const scaledScale = 1 - (1 - highlight.barScale) * intensityFactor;

    return withResolvedSettings(
      {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: scaledScale,
        rotation: 0,
        blur: 0,
        clipProgress: chunkProgress,
        highlightProgress: scaledProgress,
        typewriterProgress: 1,
        visible: true,
        completed: chunkProgress >= 1,
        visibleText: text,
        progress: chunkProgress,
        phase: chunkProgress >= 1 ? "completed" : "animating",
        isActive: true,
        localElapsedMs: input.chunkElapsedMs,
        transform: "none",
        shouldRenderFullText: true,
      },
      settings,
    );
  }

  return withResolvedSettings(
    {
      opacity: 1,
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotation: 0,
      blur: 0,
      clipProgress: chunkProgress,
      highlightProgress: 0,
      typewriterProgress: 1,
      visible: true,
      completed: chunkProgress >= 1,
      visibleText: text,
      progress: chunkProgress,
      phase: chunkProgress >= 1 ? "completed" : "animating",
      isActive: true,
      localElapsedMs: input.chunkElapsedMs,
      transform: "none",
      shouldRenderFullText: true,
    },
    settings,
  );
}

export function resolveCaptionHighlightFrame(
  chunkElapsedMs: number,
  activeChunkDurationMs: number,
) {
  return getExportHighlightSubtitleFrame(chunkElapsedMs, activeChunkDurationMs);
}

export { FADE_UP_DURATION_MS };
