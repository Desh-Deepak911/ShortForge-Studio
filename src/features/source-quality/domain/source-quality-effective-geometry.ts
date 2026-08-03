/**
 * Deterministic rotation geometry for source-quality aspect guidance.
 *
 * Canvas draw (`drawSceneImageInFrame`) sizes cover/contain from unrotated
 * bitmap dimensions, then builds CTM as translate × rotate × scale. Upscale
 * readiness therefore uses original dimensions in assess-source-quality.
 *
 * This module only computes the axis-aligned bounding box after rotation for
 * effective displayed aspect-ratio guidance (orientation mismatch). It must
 * not drive renderer baseScale / mayUpscale.
 *
 * Effective width/height:
 *   w' = |w·cosθ| + |h·sinθ|
 *   h' = |w·sinθ| + |h·cosθ|
 */

export interface SourceQualityEffectiveDimensions {
  /** Original intrinsic width (unchanged). */
  readonly sourceWidth: number;
  /** Original intrinsic height (unchanged). */
  readonly sourceHeight: number;
  /** Axis-aligned width after rotation. */
  readonly effectiveWidth: number;
  /** Axis-aligned height after rotation. */
  readonly effectiveHeight: number;
  /** Normalized rotation degrees in (-180, 180]. */
  readonly normalizedRotationDeg: number;
}

/**
 * Normalize rotation into (-180, 180].
 * Non-finite values (NaN / ±Infinity) become 0.
 */
export function normalizeSourceQualityRotationDeg(rotationDeg: unknown): number {
  if (typeof rotationDeg !== "number" || !Number.isFinite(rotationDeg)) {
    return 0;
  }
  const mod = ((rotationDeg % 360) + 360) % 360;
  return mod > 180 ? mod - 360 : mod;
}

/**
 * Zoom multiplier for rendered scale. Non-finite or non-positive → 1.
 */
export function normalizeSourceQualityZoom(zoom: unknown): number {
  if (typeof zoom !== "number" || !Number.isFinite(zoom) || zoom <= 0) {
    return 1;
  }
  return zoom;
}

/**
 * Axis-aligned dimensions of a source rectangle after rotation about its center.
 */
export function resolveSourceQualityEffectiveDimensions(
  sourceWidth: number,
  sourceHeight: number,
  rotationDeg: unknown,
): SourceQualityEffectiveDimensions {
  const normalizedRotationDeg = normalizeSourceQualityRotationDeg(rotationDeg);
  const radians = (normalizedRotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const effectiveWidth = sourceWidth * cos + sourceHeight * sin;
  const effectiveHeight = sourceWidth * sin + sourceHeight * cos;
  return {
    sourceWidth,
    sourceHeight,
    effectiveWidth,
    effectiveHeight,
    normalizedRotationDeg,
  };
}
