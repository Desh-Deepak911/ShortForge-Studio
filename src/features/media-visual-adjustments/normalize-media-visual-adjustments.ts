import {
  DEFAULT_MEDIA_VISUAL_ADJUSTMENTS,
  MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
  MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT,
  MEDIA_VISUAL_SHADOW_MAX_BLUR,
  MEDIA_VISUAL_SHADOW_MAX_OFFSET,
} from "./media-visual-adjustments.defaults";
import type {
  ResolvedSceneMediaVisualAdjustments,
} from "./media-visual-adjustments.types";

const SAFE_HEX_COLOR = /^#[0-9a-f]{6}$/i;

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function normalizeMediaVisualAdjustments(
  value: unknown,
): ResolvedSceneMediaVisualAdjustments {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    version: 1,
    brightness: boundedNumber(
      record.brightness,
      DEFAULT_MEDIA_VISUAL_ADJUSTMENTS.brightness,
      MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT,
      MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
    ),
    contrast: boundedNumber(
      record.contrast,
      DEFAULT_MEDIA_VISUAL_ADJUSTMENTS.contrast,
      MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT,
      MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
    ),
    saturation: boundedNumber(
      record.saturation,
      DEFAULT_MEDIA_VISUAL_ADJUSTMENTS.saturation,
      MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT,
      MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT,
    ),
    shadowEnabled: record.shadowEnabled === true,
    shadowColor:
      typeof record.shadowColor === "string" && SAFE_HEX_COLOR.test(record.shadowColor)
        ? record.shadowColor.toLowerCase()
        : DEFAULT_MEDIA_VISUAL_ADJUSTMENTS.shadowColor,
    shadowOpacity: boundedNumber(
      record.shadowOpacity,
      DEFAULT_MEDIA_VISUAL_ADJUSTMENTS.shadowOpacity,
      0,
      1,
    ),
    shadowBlur: boundedNumber(
      record.shadowBlur,
      DEFAULT_MEDIA_VISUAL_ADJUSTMENTS.shadowBlur,
      0,
      MEDIA_VISUAL_SHADOW_MAX_BLUR,
    ),
    shadowOffsetX: boundedNumber(
      record.shadowOffsetX,
      DEFAULT_MEDIA_VISUAL_ADJUSTMENTS.shadowOffsetX,
      -MEDIA_VISUAL_SHADOW_MAX_OFFSET,
      MEDIA_VISUAL_SHADOW_MAX_OFFSET,
    ),
    shadowOffsetY: boundedNumber(
      record.shadowOffsetY,
      DEFAULT_MEDIA_VISUAL_ADJUSTMENTS.shadowOffsetY,
      -MEDIA_VISUAL_SHADOW_MAX_OFFSET,
      MEDIA_VISUAL_SHADOW_MAX_OFFSET,
    ),
  };
}

export function isIdentityMediaVisualAdjustments(
  value: unknown,
): boolean {
  const resolved = normalizeMediaVisualAdjustments(value);
  return (
    resolved.brightness === 100 &&
    resolved.contrast === 100 &&
    resolved.saturation === 100 &&
    !resolved.shadowEnabled
  );
}

export function freezeMediaVisualAdjustments(
  value: unknown,
): ResolvedSceneMediaVisualAdjustments | null {
  if (isIdentityMediaVisualAdjustments(value)) {
    return null;
  }
  return normalizeMediaVisualAdjustments(value);
}
