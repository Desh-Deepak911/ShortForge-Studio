/**
 * Immutable visual-effect authoring commands.
 * Pure media transforms — parents own story writes and dual-write authority.
 */

import type { SceneMedia, SceneMediaVisualEffect } from "@/features/story/types";
import { SCENE_MEDIA_VISUAL_EFFECT_VERSION } from "@/features/story/types";

import {
  getMediaVisualEffectPreset,
  isMediaVisualEffectPresetId,
  type MediaVisualEffectPresetId,
} from "../domain/media-visual-effect-presets";
import { normalizeSceneMediaVisualEffect } from "../domain/resolve-media-visual-effect";

export type MediaVisualEffectCommandStatus = "ok" | "recoverable" | "terminal";

export interface MediaVisualEffectCommandOptions {
  readonly keyframedVisualEffectsEnabled?: boolean;
  readonly requiresMediaItemSelection?: boolean;
}

export interface MediaVisualEffectCommandResult {
  readonly status: MediaVisualEffectCommandStatus;
  readonly media: SceneMedia;
  readonly effect: SceneMediaVisualEffect | undefined;
  readonly warnings: readonly string[];
  readonly message?: string;
}

export const MEDIA_VISUAL_EFFECT_CAPABILITY_OFF_MESSAGE =
  "Visual effects are turned off for this project.";

export const MEDIA_VISUAL_EFFECT_SELECTION_REQUIRED_MESSAGE =
  "Select a visual to edit its look.";

function cloneMedia(media: SceneMedia): SceneMedia {
  // Preserve visualAdjustments by reference so reset is byte-stable for that field.
  return {
    ...media,
    ...(media.visualEffect ? { visualEffect: { ...media.visualEffect } } : {}),
    ...(media.motion ? { motion: { ...media.motion } } : {}),
  };
}

function withEffect(
  media: SceneMedia,
  effect: SceneMediaVisualEffect | undefined,
): SceneMedia {
  const next = cloneMedia(media);
  if (!effect) {
    delete next.visualEffect;
    return next;
  }
  next.visualEffect = {
    version: SCENE_MEDIA_VISUAL_EFFECT_VERSION,
    presetId: effect.presetId,
    intensity: effect.intensity,
  };
  return next;
}

function refuseGuard(
  media: SceneMedia,
  options?: MediaVisualEffectCommandOptions,
): MediaVisualEffectCommandResult | null {
  if (options?.keyframedVisualEffectsEnabled !== true) {
    return {
      status: "terminal",
      media: cloneMedia(media),
      effect: normalizeSceneMediaVisualEffect(media.visualEffect),
      warnings: [],
      message: MEDIA_VISUAL_EFFECT_CAPABILITY_OFF_MESSAGE,
    };
  }
  if (options?.requiresMediaItemSelection === true) {
    return {
      status: "terminal",
      media: cloneMedia(media),
      effect: normalizeSceneMediaVisualEffect(media.visualEffect),
      warnings: [],
      message: MEDIA_VISUAL_EFFECT_SELECTION_REQUIRED_MESSAGE,
    };
  }
  return null;
}

function ok(
  media: SceneMedia,
  effect: SceneMediaVisualEffect | undefined,
  warnings: string[] = [],
): MediaVisualEffectCommandResult {
  return {
    status: warnings.length > 0 ? "recoverable" : "ok",
    media: withEffect(media, effect),
    effect,
    warnings,
  };
}

/** Apply a closed preset. "none" clears the effect. */
export function applyMediaVisualEffectPreset(
  media: SceneMedia,
  presetId: unknown,
  options?: MediaVisualEffectCommandOptions,
): MediaVisualEffectCommandResult {
  const refused = refuseGuard(media, options);
  if (refused) return refused;

  if (!isMediaVisualEffectPresetId(presetId) || presetId === "none") {
    return ok(media, undefined);
  }

  const previous = normalizeSceneMediaVisualEffect(media.visualEffect);
  const intensity =
    previous && previous.intensity > 0
      ? previous.intensity
      : 1;
  // Touch catalog so unknown-id paths stay deterministic via allowlist helper.
  getMediaVisualEffectPreset(presetId);

  return ok(media, {
    version: SCENE_MEDIA_VISUAL_EFFECT_VERSION,
    presetId,
    intensity,
  });
}

/** Set intensity 0–1 (UI may pass 0–100 and convert). Intensity 0 clears. */
export function setMediaVisualEffectIntensity(
  media: SceneMedia,
  intensityInput: unknown,
  options?: MediaVisualEffectCommandOptions,
): MediaVisualEffectCommandResult {
  const refused = refuseGuard(media, options);
  if (refused) return refused;

  const previous = normalizeSceneMediaVisualEffect(media.visualEffect);
  if (!previous) {
    return {
      status: "terminal",
      media: cloneMedia(media),
      effect: undefined,
      warnings: [],
      message: "Choose a look before changing intensity.",
    };
  }

  const warnings: string[] = [];
  let intensity =
    typeof intensityInput === "number" && Number.isFinite(intensityInput)
      ? intensityInput
      : previous.intensity;
  if (intensity > 1 && intensity <= 100) {
    // Accept UI percent and normalize.
    intensity = intensity / 100;
  }
  if (!(typeof intensityInput === "number" && Number.isFinite(intensityInput))) {
    warnings.push("Intensity was restored to the last valid value.");
  }
  intensity = Math.min(1, Math.max(0, intensity));
  if (!(intensity > 0)) {
    return ok(media, undefined, warnings);
  }

  return ok(
    media,
    {
      version: SCENE_MEDIA_VISUAL_EFFECT_VERSION,
      presetId: previous.presetId,
      intensity,
    },
    warnings,
  );
}

/** Reset to None — preserves motion, keyframes, framing, and visualAdjustments. */
export function resetMediaVisualEffect(
  media: SceneMedia,
  options?: MediaVisualEffectCommandOptions,
): MediaVisualEffectCommandResult {
  const refused = refuseGuard(media, options);
  if (refused) return refused;
  return ok(media, undefined);
}

export function resolveMediaVisualEffectCommandPresetId(
  media: SceneMedia,
): MediaVisualEffectPresetId {
  return normalizeSceneMediaVisualEffect(media.visualEffect)?.presetId ?? "none";
}
