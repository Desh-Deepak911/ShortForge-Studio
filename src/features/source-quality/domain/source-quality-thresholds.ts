/**
 * Fixed vertical export targets and framing-quality thresholds.
 *
 * Frame geometry uses ShortForge’s 9:16 reference (width × height).
 * Upscale is detected when the cover/contain scale required to place the
 * source into a target exceeds 1.0 (source pixels are stretched).
 *
 * Upscale uses renderer-parity activeScale on original (unrotated) dimensions:
 *   activeScale = cover|contain(sourceW, sourceH, target) × zoom
 *
 * Aggressive fill crop uses a conservative retained-area upper bound:
 *   scaledSourceArea = sourceW × sourceH × activeScale²
 *   retainedFraction = clamp01(targetW × targetH / scaledSourceArea)
 * Rotation preserves source area; additional rotational clipping is not claimed
 * precisely. Pan/position is excluded. Fit letterboxing is never terminal.
 *
 * Aspect mismatch may use effective rotated AABB aspect for orientation guidance.
 */

export const SOURCE_QUALITY_TARGET_720P = Object.freeze({
  id: "720p" as const,
  width: 720,
  height: 1280,
});

export const SOURCE_QUALITY_TARGET_1080P = Object.freeze({
  id: "1080p" as const,
  width: 1080,
  height: 1920,
});

export const SOURCE_QUALITY_TARGET_4K = Object.freeze({
  id: "4k" as const,
  width: 2160,
  height: 3840,
});

export const SOURCE_QUALITY_VERTICAL_TARGETS = Object.freeze([
  SOURCE_QUALITY_TARGET_720P,
  SOURCE_QUALITY_TARGET_1080P,
  SOURCE_QUALITY_TARGET_4K,
]);

/** Target aspect ratio (width / height) for 9:16 vertical shorts. */
export const SOURCE_QUALITY_TARGET_ASPECT_RATIO =
  SOURCE_QUALITY_TARGET_1080P.width / SOURCE_QUALITY_TARGET_1080P.height;

/**
 * Relative aspect tolerance. A source is mismatched when
 * |sourceAspect / targetAspect - 1| exceeds this value.
 */
export const SOURCE_QUALITY_ASPECT_MISMATCH_RELATIVE_TOLERANCE = 0.12;

/**
 * Cover-mode retained source-area fraction below which we warn about aggressive
 * vertical crop. 0.5 means less than half of the source area remains visible.
 */
export const SOURCE_QUALITY_AGGRESSIVE_CROP_RETAINED_AREA_THRESHOLD = 0.5;

/**
 * Advisory detail-class thresholds on source pixels per output pixel
 * (`1 / activeScale`). Inclusive lower bound for each band; never terminal.
 *
 * - native_or_downsampled: ≥ 1
 * - mild_upscale: ≥ 0.8 and &lt; 1
 * - material_upscale: ≥ 0.5 and &lt; 0.8
 * - severe_upscale: &lt; 0.5
 */
export const SOURCE_QUALITY_DETAIL_NATIVE_MIN_SOURCE_PIXELS_PER_OUTPUT = 1;
export const SOURCE_QUALITY_DETAIL_MILD_UPSCALE_MIN_SOURCE_PIXELS_PER_OUTPUT = 0.8;
export const SOURCE_QUALITY_DETAIL_MATERIAL_UPSCALE_MIN_SOURCE_PIXELS_PER_OUTPUT = 0.5;
