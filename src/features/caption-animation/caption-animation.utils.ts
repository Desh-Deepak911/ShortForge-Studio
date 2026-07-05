import {
  resolveMotionPresetAnimationConfig,
  resolveMotionPresetDiagnostics,
} from "@/features/caption-animation-presets";

import {
  CAPTION_ANIMATION_DELAY_DEFAULT_MS,
  CAPTION_ANIMATION_DELAY_MAX_MS,
  CAPTION_ANIMATION_DELAY_MIN_MS,
  CAPTION_ANIMATION_DURATION_DEFAULT_MS,
  CAPTION_ANIMATION_DURATION_MAX_MS,
  CAPTION_ANIMATION_DURATION_MIN_MS,
  CAPTION_ANIMATION_INTENSITY_DEFAULT,
  CAPTION_ANIMATION_INTENSITY_MAX,
  CAPTION_ANIMATION_INTENSITY_MIN,
  DEFAULT_CAPTION_ANIMATION,
  DEFAULT_CAPTION_ANIMATION_PRESET,
} from "./caption-animation.defaults";
import type {
  CaptionAnimation,
  CaptionAnimationDirection,
  CaptionAnimationEasing,
  CaptionAnimationFieldSource,
  CaptionAnimationPreset,
  CaptionAnimationResolveInput,
  CaptionAnimationSource,
} from "./caption-animation.types";
import { CAPTION_ANIMATION_VERSION } from "./caption-animation.types";
import type { FootieScene, SubtitleEffect } from "@/features/story/types";

const PRESET_VALUES = new Set<CaptionAnimationPreset>(["fade", "typewriter", "highlight", "none"]);
const EASING_VALUES = new Set<CaptionAnimationEasing>([
  "linear",
  "ease_in",
  "ease_out",
  "ease_in_out",
]);
const DIRECTION_VALUES = new Set<CaptionAnimationDirection>(["normal", "reverse"]);

const CONFIG_FIELDS = [
  "preset",
  "durationMs",
  "delayMs",
  "easing",
  "direction",
  "intensity",
  "motionPresetId",
] as const satisfies ReadonlyArray<keyof CaptionAnimation>;

export function mapSubtitleEffectToAnimationPreset(
  effect: SubtitleEffect | null | undefined,
): CaptionAnimationPreset {
  switch (effect) {
    case "typewriter":
      return "typewriter";
    case "highlight":
      return "highlight";
    case "fade-up":
      return "fade";
    default:
      return DEFAULT_CAPTION_ANIMATION_PRESET;
  }
}

export function mapAnimationPresetToSubtitleEffect(
  preset: CaptionAnimationPreset,
): SubtitleEffect {
  switch (preset) {
    case "typewriter":
      return "typewriter";
    case "highlight":
      return "highlight";
    case "none":
    case "fade":
    default:
      return "fade-up";
  }
}

function normalizePreset(value: unknown, fallback: CaptionAnimationPreset): CaptionAnimationPreset {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as CaptionAnimationPreset;
    if (PRESET_VALUES.has(normalized)) {
      return normalized;
    }
  }

  return fallback;
}

function normalizeEasing(value: unknown): CaptionAnimationEasing | undefined {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as CaptionAnimationEasing;
    if (EASING_VALUES.has(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeDirection(value: unknown, fallback: CaptionAnimationDirection): CaptionAnimationDirection {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as CaptionAnimationDirection;
    if (DIRECTION_VALUES.has(normalized)) {
      return normalized;
    }
  }

  return fallback;
}

export function clampCaptionAnimationDurationMs(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(
    CAPTION_ANIMATION_DURATION_MAX_MS,
    Math.max(CAPTION_ANIMATION_DURATION_MIN_MS, Math.round(value)),
  );
}

export function clampCaptionAnimationDelayMs(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return CAPTION_ANIMATION_DELAY_DEFAULT_MS;
  }

  return Math.min(
    CAPTION_ANIMATION_DELAY_MAX_MS,
    Math.max(CAPTION_ANIMATION_DELAY_MIN_MS, Math.round(value)),
  );
}

export function clampCaptionAnimationIntensity(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) {
    return CAPTION_ANIMATION_INTENSITY_DEFAULT;
  }

  return Math.min(
    CAPTION_ANIMATION_INTENSITY_MAX,
    Math.max(CAPTION_ANIMATION_INTENSITY_MIN, Math.round(value)),
  );
}

function hasAnimationFields(animation: Partial<CaptionAnimation> | null | undefined): boolean {
  if (!animation) {
    return false;
  }

  return Object.keys(animation).some(
    (key) => key !== "version" && animation[key as keyof CaptionAnimation] != null,
  );
}

function hasStoredField(
  animation: Partial<CaptionAnimation> | null | undefined,
  field: keyof CaptionAnimation,
): boolean {
  return animation?.[field] != null;
}

export function isDefaultCaptionAnimationStorage(
  sceneAnimation?: Partial<CaptionAnimation> | null,
  projectAnimation?: Partial<CaptionAnimation> | null,
): boolean {
  return !hasAnimationFields(sceneAnimation) && !hasAnimationFields(projectAnimation);
}

export function usesLegacyCaptionAnimationTiming(
  sceneAnimation?: Partial<CaptionAnimation> | null,
  projectAnimation?: Partial<CaptionAnimation> | null,
): boolean {
  return (
    !hasStoredField(sceneAnimation, "durationMs") &&
    !hasStoredField(projectAnimation, "durationMs") &&
    !hasStoredField(sceneAnimation, "delayMs") &&
    !hasStoredField(projectAnimation, "delayMs") &&
    !hasStoredField(sceneAnimation, "easing") &&
    !hasStoredField(projectAnimation, "easing")
  );
}

export function resolveEffectiveAnimationPreset(
  timelinePreset: CaptionAnimationPreset,
  resolveInput: CaptionAnimationResolveInput,
  resolvedPreset: CaptionAnimationPreset,
): CaptionAnimationPreset {
  if (hasAnimationFields(resolveInput.sceneAnimation) || hasAnimationFields(resolveInput.projectAnimation)) {
    return resolvedPreset;
  }

  if (resolveInput.sceneSubtitleEffect) {
    return resolvedPreset;
  }

  return timelinePreset;
}

function resolveFieldSource(
  field: keyof CaptionAnimation,
  input: CaptionAnimationResolveInput,
  motionPresetConfig: Partial<CaptionAnimation> = {},
): CaptionAnimationFieldSource {
  if (hasStoredField(input.sceneAnimation, field)) {
    return "scene";
  }

  if (field === "preset" && input.sceneSubtitleEffect) {
    return "legacy";
  }

  if (hasStoredField(input.projectAnimation, field)) {
    return "project";
  }

  if (field !== "motionPresetId" && hasStoredField(motionPresetConfig, field)) {
    return "preset";
  }

  if (field === "preset" && !hasAnimationFields(input.sceneAnimation) && input.sceneSubtitleEffect) {
    return "legacy";
  }

  return "engine";
}

export function resolveCaptionAnimationFieldSources(input: CaptionAnimationResolveInput = {}) {
  const motionPresetConfig = resolveMotionPresetAnimationConfig(input);

  return {
    durationSource: resolveFieldSource("durationMs", input, motionPresetConfig),
    delaySource: resolveFieldSource("delayMs", input, motionPresetConfig),
    easingSource: resolveFieldSource("easing", input, motionPresetConfig),
    directionSource: resolveFieldSource("direction", input, motionPresetConfig),
    intensitySource: resolveFieldSource("intensity", input, motionPresetConfig),
    presetSource: resolveFieldSource("preset", input, motionPresetConfig),
    motionPresetIdSource: resolveFieldSource("motionPresetId", input, motionPresetConfig),
  };
}

/** Merges scene override, project default, motion preset, and engine defaults. */
export function mergeCaptionAnimationSettings(
  input: CaptionAnimationResolveInput = {},
): CaptionAnimation {
  const base = DEFAULT_CAPTION_ANIMATION;
  const motionPresetConfig = resolveMotionPresetAnimationConfig(input);
  const motionPresetDiagnostics = resolveMotionPresetDiagnostics(input);
  const scenePreset = input.sceneAnimation?.preset;
  const projectPreset = input.projectAnimation?.preset;
  const legacyScenePreset = mapSubtitleEffectToAnimationPreset(input.sceneSubtitleEffect ?? undefined);

  const mergedPreset =
    scenePreset ??
    projectPreset ??
    motionPresetConfig.preset ??
    (input.sceneSubtitleEffect ? legacyScenePreset : undefined) ??
    base.preset!;

  const durationMs =
    input.sceneAnimation?.durationMs ??
    input.projectAnimation?.durationMs ??
    motionPresetConfig.durationMs ??
    undefined;
  const delayMs =
    input.sceneAnimation?.delayMs ??
    input.projectAnimation?.delayMs ??
    motionPresetConfig.delayMs ??
    base.delayMs ??
    CAPTION_ANIMATION_DELAY_DEFAULT_MS;
  const easing =
    input.sceneAnimation?.easing ??
    input.projectAnimation?.easing ??
    motionPresetConfig.easing ??
    undefined;
  const direction =
    input.sceneAnimation?.direction ??
    input.projectAnimation?.direction ??
    motionPresetConfig.direction ??
    base.direction ??
    "normal";
  const intensity =
    input.sceneAnimation?.intensity ??
    input.projectAnimation?.intensity ??
    motionPresetConfig.intensity ??
    base.intensity ??
    CAPTION_ANIMATION_INTENSITY_DEFAULT;

  return {
    version: CAPTION_ANIMATION_VERSION,
    preset: normalizePreset(mergedPreset, DEFAULT_CAPTION_ANIMATION_PRESET),
    ...(motionPresetDiagnostics.motionPresetId
      ? { motionPresetId: motionPresetDiagnostics.motionPresetId }
      : {}),
    ...(durationMs != null ? { durationMs: clampCaptionAnimationDurationMs(durationMs) } : {}),
    delayMs: clampCaptionAnimationDelayMs(delayMs),
    ...(easing ? { easing: normalizeEasing(easing) } : {}),
    direction: normalizeDirection(direction, "normal"),
    intensity: clampCaptionAnimationIntensity(intensity),
  };
}

export function resolveCaptionAnimationSource(
  input: CaptionAnimationResolveInput = {},
): CaptionAnimationSource {
  if (hasAnimationFields(input.sceneAnimation)) {
    return "scene";
  }

  if (input.sceneSubtitleEffect) {
    return "legacy";
  }

  if (hasAnimationFields(input.projectAnimation)) {
    return "project";
  }

  return "engine";
}

export function buildSceneCaptionAnimationPatch(
  animation: CaptionAnimation,
): { captionAnimation: CaptionAnimation } {
  return { captionAnimation: animation };
}

export function buildSceneCaptionAnimationPresetPatch(
  animation: CaptionAnimation,
): Pick<FootieScene, "captionAnimation" | "subtitleEffect"> {
  const preset = animation.preset ?? DEFAULT_CAPTION_ANIMATION_PRESET;
  return {
    captionAnimation: animation,
    subtitleEffect: mapAnimationPresetToSubtitleEffect(preset),
  };
}

export function buildResetCaptionAnimationPatch(): { captionAnimation?: undefined } {
  return { captionAnimation: undefined };
}

export function resolveEffectiveCaptionAnimationDurationMs(
  resolved: CaptionAnimation,
  timelineDurationMs: number,
): number {
  return resolved.durationMs ?? Math.max(1, timelineDurationMs || CAPTION_ANIMATION_DURATION_DEFAULT_MS);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export { CONFIG_FIELDS as CAPTION_ANIMATION_CONFIG_FIELDS };
