/**
 * Normalize and resolve capability-gated visual effects into filter params.
 *
 * Composition with SceneMedia.visualAdjustments (applied exactly once):
 * - Identity basis per channel = 100
 * - composed = clamp((adjustment/100) * (effect/100) * 100, MIN_PERCENT, MAX_PERCENT)
 * - Shadow remains visualAdjustments-owned and is never multiplied by effects
 * - Preview resolves effect params from the authoring catalog
 * - Export/Browser/Headless consume frozen manifest BCS and never re-lookup the catalog
 */

import { buildMediaVisualFilter } from "@/features/media-visual-adjustments/build-media-visual-filter";
import {
  MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
  MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT,
} from "@/features/media-visual-adjustments/media-visual-adjustments.defaults";
import type { ResolvedSceneMediaVisualAdjustments } from "@/features/media-visual-adjustments/media-visual-adjustments.types";
import { normalizeMediaVisualAdjustments } from "@/features/media-visual-adjustments/normalize-media-visual-adjustments";
import type { SceneMediaVisualEffect } from "@/features/story/types/story.types";

import {
  getMediaVisualEffectPreset,
  isMediaVisualEffectPresetId,
  MEDIA_VISUAL_EFFECT_IDENTITY_PARAMS,
  MEDIA_VISUAL_EFFECT_VERSION,
  type MediaVisualEffectFilterParams,
  type MediaVisualEffectPresetId,
} from "./media-visual-effect-presets";

export type MediaVisualEffectSource = "catalog" | "frozen";

export interface ResolveMediaVisualEffectInput {
  readonly visualEffect: unknown;
  /** Explicit capability. False/omitted ignores dormant effect metadata. */
  readonly keyframedVisualEffectsEnabled?: boolean;
  /**
   * catalog = preview/authoring (may look up current preset full targets).
   * frozen = export runtime (uses brightness/contrast/saturation on the payload).
   */
  readonly effectSource?: MediaVisualEffectSource;
}

export interface ResolvedMediaVisualEffect {
  readonly available: boolean;
  readonly presetId: MediaVisualEffectPresetId;
  readonly intensity: number;
  readonly params: MediaVisualEffectFilterParams;
  readonly stored: SceneMediaVisualEffect | undefined;
}

function clampChannel(value: number): number {
  return Math.min(
    MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
    Math.max(MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT, value),
  );
}

function clampIntensity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function lerpChannel(identity: number, target: number, intensity: number): number {
  return clampChannel(identity + (target - identity) * intensity);
}

function isFiniteInAdjustmentRange(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT &&
    value <= MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT
  );
}

/** Read frozen BCS from a manifest/hydrate payload. Fail-closed when incomplete. */
export function readFrozenMediaVisualEffectParams(
  value: unknown,
): MediaVisualEffectFilterParams | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    !isFiniteInAdjustmentRange(record.brightness) ||
    !isFiniteInAdjustmentRange(record.contrast) ||
    !isFiniteInAdjustmentRange(record.saturation)
  ) {
    return null;
  }
  return {
    brightness: record.brightness,
    contrast: record.contrast,
    saturation: record.saturation,
  };
}

/**
 * Fail-closed normalize for story persistence.
 * Unknown preset / non-finite intensity → absent.
 * "none" or intensity 0 → absent (identity).
 * Frozen BCS channels are stripped so authoring JSON stays catalog-backed.
 */
export function normalizeSceneMediaVisualEffect(
  value: unknown,
): SceneMediaVisualEffect | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!isMediaVisualEffectPresetId(record.presetId) || record.presetId === "none") {
    return undefined;
  }
  const intensity = clampIntensity(record.intensity);
  if (!(intensity > 0)) return undefined;
  return {
    version: MEDIA_VISUAL_EFFECT_VERSION,
    presetId: record.presetId,
    intensity,
  };
}

/** Whether the stored effect is render-authoritative under the capability gate. */
export function isActiveMediaVisualEffect(
  value: unknown,
  keyframedVisualEffectsEnabled?: boolean,
): boolean {
  if (keyframedVisualEffectsEnabled !== true) return false;
  const stored = normalizeSceneMediaVisualEffect(value);
  return stored != null && stored.intensity > 0;
}

function resolveCatalogParams(
  stored: SceneMediaVisualEffect,
): MediaVisualEffectFilterParams {
  const preset = getMediaVisualEffectPreset(stored.presetId);
  return {
    brightness: lerpChannel(100, preset.full.brightness, stored.intensity),
    contrast: lerpChannel(100, preset.full.contrast, stored.intensity),
    saturation: lerpChannel(100, preset.full.saturation, stored.intensity),
  };
}

/**
 * Resolve effect parameters for preview/canvas.
 * Capability off → identity params even when dormant metadata exists.
 * Frozen source never consults the authoring catalog.
 */
export function resolveMediaVisualEffect(
  input: ResolveMediaVisualEffectInput,
): ResolvedMediaVisualEffect {
  const effectSource = input.effectSource ?? "catalog";
  const stored = normalizeSceneMediaVisualEffect(input.visualEffect);

  if (input.keyframedVisualEffectsEnabled !== true) {
    return {
      available: false,
      presetId: "none",
      intensity: 0,
      params: { ...MEDIA_VISUAL_EFFECT_IDENTITY_PARAMS },
      stored,
    };
  }

  if (effectSource === "frozen") {
    const frozen = readFrozenMediaVisualEffectParams(input.visualEffect);
    if (!frozen || !stored) {
      return {
        available: false,
        presetId: "none",
        intensity: 0,
        params: { ...MEDIA_VISUAL_EFFECT_IDENTITY_PARAMS },
        stored,
      };
    }
    const identity =
      frozen.brightness === 100 &&
      frozen.contrast === 100 &&
      frozen.saturation === 100;
    return {
      available: !identity,
      presetId: stored.presetId,
      intensity: stored.intensity,
      params: frozen,
      stored,
    };
  }

  if (!stored) {
    return {
      available: false,
      presetId: "none",
      intensity: 0,
      params: { ...MEDIA_VISUAL_EFFECT_IDENTITY_PARAMS },
      stored: undefined,
    };
  }

  const params = resolveCatalogParams(stored);
  const identity =
    params.brightness === 100 &&
    params.contrast === 100 &&
    params.saturation === 100;

  return {
    available: !identity,
    presetId: stored.presetId,
    intensity: stored.intensity,
    params,
    stored,
  };
}

/**
 * Multiply adjustment and effect channels once.
 * composed = clamp((A/100)*(E/100)*100, MIN, MAX) with identity basis 100.
 */
export function multiplyVisualAdjustmentChannel(
  adjustmentPercent: number,
  effectPercent: number,
): number {
  return clampChannel((adjustmentPercent / 100) * (effectPercent / 100) * 100);
}

/**
 * Compose freeform visualAdjustments with a resolved effect into one BCS record.
 * Effect multiplies adjustment channels exactly once; shadow remains adjustment-owned.
 */
export function composeMediaVisualAdjustmentsWithEffect(
  visualAdjustments: unknown,
  visualEffect: unknown,
  keyframedVisualEffectsEnabled?: boolean,
  effectSource: MediaVisualEffectSource = "catalog",
): ResolvedSceneMediaVisualAdjustments {
  const adjustments = normalizeMediaVisualAdjustments(visualAdjustments);
  const effect = resolveMediaVisualEffect({
    visualEffect,
    keyframedVisualEffectsEnabled,
    effectSource,
  });
  if (!effect.available) {
    return adjustments;
  }
  return {
    ...adjustments,
    brightness: multiplyVisualAdjustmentChannel(
      adjustments.brightness,
      effect.params.brightness,
    ),
    contrast: multiplyVisualAdjustmentChannel(
      adjustments.contrast,
      effect.params.contrast,
    ),
    saturation: multiplyVisualAdjustmentChannel(
      adjustments.saturation,
      effect.params.saturation,
    ),
  };
}

/**
 * One shared CSS/Canvas filter string for preview and export.
 * Preview: effectSource "catalog". Export: effectSource "frozen".
 */
export function buildComposedMediaVisualFilter(
  visualAdjustments: unknown,
  visualEffect: unknown,
  options: {
    readonly keyframedVisualEffectsEnabled?: boolean;
    readonly targetWidth?: number;
    readonly effectSource?: MediaVisualEffectSource;
  } = {},
): string {
  const composed = composeMediaVisualAdjustmentsWithEffect(
    visualAdjustments,
    visualEffect,
    options.keyframedVisualEffectsEnabled,
    options.effectSource ?? "catalog",
  );
  return buildMediaVisualFilter(composed, options.targetWidth);
}

/** Manifest freeze: active effect only when capability on. Embeds resolved BCS. */
export function projectMediaVisualEffectToManifest(
  visualEffect: unknown,
  keyframedVisualEffectsEnabled: boolean,
): {
  readonly version: 1;
  readonly presetId: Exclude<MediaVisualEffectPresetId, "none">;
  readonly intensity: number;
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
} | undefined {
  const resolved = resolveMediaVisualEffect({
    visualEffect,
    keyframedVisualEffectsEnabled,
    effectSource: "catalog",
  });
  if (!resolved.available || !resolved.stored || resolved.presetId === "none") {
    return undefined;
  }
  return {
    version: 1,
    presetId: resolved.presetId,
    intensity: resolved.intensity,
    brightness: resolved.params.brightness,
    contrast: resolved.params.contrast,
    saturation: resolved.params.saturation,
  };
}
