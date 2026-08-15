/**
 * Deterministic source-quality assessment from available SceneMedia metrics
 * and current framing. No I/O, clocks, randomness, or mutation.
 *
 * Renderer-parity scale (matches drawSceneImageInFrame):
 *   cover/contain use original unrotated source dimensions;
 *   rotation is applied after sizing; therefore rotation must not change
 *   baseScale / activeScale / mayUpscale.
 *   baseScale = fill ? cover(w,h,target) : contain(w,h,target)
 *   activeScale = baseScale × normalizedZoom
 *   mayUpscale = activeScale > 1
 *   sourcePixelsPerOutputPixel = 1 / activeScale
 *
 * Retained region / coverage use centered Fit/Fill rectangles (pan ignored).
 * Rotation preserves area; extra rotational clipping is not claimed precisely.
 * Fit letterboxing is non-terminal and never blocks export.
 */

import type { SceneMediaFraming } from "@/features/media-framing/media-framing.types";
import type { SceneMedia } from "@/features/story/types";

import type {
  SourceQualityAssessment,
  SourceQualityDetailClass,
  SourceQualityMetrics,
  SourceQualitySoftnessCause,
  SourceQualitySummaryKey,
  SourceQualityTargetId,
  SourceQualityTargetReadiness,
  SourceQualityWarningCode,
} from "./source-quality-assessment";
import {
  normalizeSourceQualityZoom,
  resolveSourceQualityEffectiveDimensions,
} from "./source-quality-effective-geometry";
import {
  SOURCE_QUALITY_AGGRESSIVE_CROP_RETAINED_AREA_THRESHOLD,
  SOURCE_QUALITY_ASPECT_MISMATCH_RELATIVE_TOLERANCE,
  SOURCE_QUALITY_DETAIL_MATERIAL_UPSCALE_MIN_SOURCE_PIXELS_PER_OUTPUT,
  SOURCE_QUALITY_DETAIL_MILD_UPSCALE_MIN_SOURCE_PIXELS_PER_OUTPUT,
  SOURCE_QUALITY_DETAIL_NATIVE_MIN_SOURCE_PIXELS_PER_OUTPUT,
  SOURCE_QUALITY_TARGET_ASPECT_RATIO,
  SOURCE_QUALITY_VERTICAL_TARGETS,
} from "./source-quality-thresholds";
import { normalizeSceneMediaBackgroundTreatment } from "@/features/media-framing/media-framing.types";

function positiveDimension(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function mediaHasRenderableSource(media: SceneMedia | null | undefined): boolean {
  if (!media) {
    return false;
  }
  if (media.type === "placeholder") {
    return false;
  }
  return typeof media.url === "string" && media.url.trim().length > 0;
}

function readMetrics(media: SceneMedia | null | undefined): SourceQualityMetrics {
  if (!media) {
    return {
      width: null,
      height: null,
      aspectRatio: null,
      mimeType: null,
      mediaType: null,
    };
  }
  const width = positiveDimension(media.width);
  const height = positiveDimension(media.height);
  return {
    width,
    height,
    aspectRatio: width != null && height != null ? width / height : null,
    mimeType:
      typeof media.mimeType === "string" && media.mimeType.trim()
        ? media.mimeType.trim()
        : null,
    mediaType:
      media.type === "image" || media.type === "video" || media.type === "placeholder"
        ? media.type
        : null,
  };
}

function coverScale(sourceW: number, sourceH: number, targetW: number, targetH: number): number {
  return Math.max(targetW / sourceW, targetH / sourceH);
}

function containScale(
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
): number {
  return Math.min(targetW / sourceW, targetH / sourceH);
}

function clamp01(value: number): number {
  if (!(value > 0)) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function aspectMismatched(aspectRatio: number): boolean {
  const relative = Math.abs(aspectRatio / SOURCE_QUALITY_TARGET_ASPECT_RATIO - 1);
  return relative > SOURCE_QUALITY_ASPECT_MISMATCH_RELATIVE_TOLERANCE;
}

export function classifySourceQualityDetail(
  sourcePixelsPerOutputPixel: number,
): SourceQualityDetailClass {
  if (
    sourcePixelsPerOutputPixel >=
    SOURCE_QUALITY_DETAIL_NATIVE_MIN_SOURCE_PIXELS_PER_OUTPUT
  ) {
    return "native_or_downsampled";
  }
  if (
    sourcePixelsPerOutputPixel >=
    SOURCE_QUALITY_DETAIL_MILD_UPSCALE_MIN_SOURCE_PIXELS_PER_OUTPUT
  ) {
    return "mild_upscale";
  }
  if (
    sourcePixelsPerOutputPixel >=
    SOURCE_QUALITY_DETAIL_MATERIAL_UPSCALE_MIN_SOURCE_PIXELS_PER_OUTPUT
  ) {
    return "material_upscale";
  }
  return "severe_upscale";
}

function resolveSoftnessCause(input: {
  readonly fitMode: "fit" | "fill";
  readonly zoom: number;
  readonly cover: number;
  readonly contain: number;
  readonly baseScale: number;
  readonly sourcePixelsPerOutputPixel: number;
  readonly sourceAspectRatio: number;
}): SourceQualitySoftnessCause {
  if (input.sourcePixelsPerOutputPixel >= 1) {
    return "none";
  }
  const zoomContributes = input.zoom > 1;
  const baseUpscales = input.baseScale > 1;
  const aspectConversion =
    input.fitMode === "fill" &&
    aspectMismatched(input.sourceAspectRatio) &&
    input.cover > input.contain &&
    baseUpscales;

  if (zoomContributes && baseUpscales) {
    return "combined";
  }
  if (zoomContributes) {
    return "authored_zoom";
  }
  if (aspectConversion) {
    return "aspect_conversion";
  }
  return "source_dimensions";
}

export type SourceQualityFramingInput = Pick<
  SceneMediaFraming,
  "fitMode" | "zoom" | "rotationDeg" | "backgroundTreatment"
>;

export interface SourceQualityTargetGeometryInput {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly fitMode: "fit" | "fill";
  readonly zoom: number;
  readonly targetId: SourceQualityTargetId;
  readonly targetWidth: number;
  readonly targetHeight: number;
}

/**
 * Single geometry authority for one source × framing × output target.
 * Used by assessment and verification so density math is not duplicated.
 */
export function measureSourceQualityTargetGeometry(
  input: SourceQualityTargetGeometryInput,
): SourceQualityTargetReadiness {
  const zoom = normalizeSourceQualityZoom(input.zoom);
  const fitMode = input.fitMode === "fit" ? "fit" : "fill";
  const cover = coverScale(
    input.sourceWidth,
    input.sourceHeight,
    input.targetWidth,
    input.targetHeight,
  );
  const contain = containScale(
    input.sourceWidth,
    input.sourceHeight,
    input.targetWidth,
    input.targetHeight,
  );
  const baseScale = fitMode === "fit" ? contain : cover;
  const activeScale = baseScale * zoom;
  const sourcePixelsPerOutputPixel = 1 / activeScale;
  const scaledWidth = input.sourceWidth * activeScale;
  const scaledHeight = input.sourceHeight * activeScale;
  const visibleWidth = Math.min(input.targetWidth, scaledWidth);
  const visibleHeight = Math.min(input.targetHeight, scaledHeight);
  const visibleArea = visibleWidth * visibleHeight;
  const scaledSourceArea = scaledWidth * scaledHeight;
  const retainedSourceAreaFraction = clamp01(visibleArea / scaledSourceArea);
  const frameCoverageFraction = clamp01(
    visibleArea / (input.targetWidth * input.targetHeight),
  );
  const retainedSourceRegion = Object.freeze({
    width: visibleWidth / activeScale,
    height: visibleHeight / activeScale,
  });
  const detailClass = classifySourceQualityDetail(sourcePixelsPerOutputPixel);
  const softnessCause = resolveSoftnessCause({
    fitMode,
    zoom,
    cover,
    contain,
    baseScale,
    sourcePixelsPerOutputPixel,
    sourceAspectRatio: input.sourceWidth / input.sourceHeight,
  });

  return Object.freeze({
    targetId: input.targetId,
    width: input.targetWidth,
    height: input.targetHeight,
    mayUpscale: activeScale > 1,
    coverScale: cover,
    containScale: contain,
    baseScale,
    activeScale,
    sourcePixelsPerOutputPixel,
    retainedSourceAreaFraction,
    retainedSourceRegion,
    frameCoverageFraction,
    detailClass,
    softnessCause,
  } satisfies SourceQualityTargetReadiness);
}

function unknownTargetReadiness(
  targetId: SourceQualityTargetId,
  width: number,
  height: number,
): SourceQualityTargetReadiness {
  return Object.freeze({
    targetId,
    width,
    height,
    mayUpscale: false,
    coverScale: null,
    containScale: null,
    baseScale: null,
    activeScale: null,
    sourcePixelsPerOutputPixel: null,
    retainedSourceAreaFraction: null,
    retainedSourceRegion: null,
    frameCoverageFraction: null,
    detailClass: null,
    softnessCause: null,
  } satisfies SourceQualityTargetReadiness);
}

/**
 * Assess source readiness for vertical export targets under the current framing.
 * Missing dimensions yield `unknown` — never a render blocker.
 */
export function assessSourceQuality(input: {
  readonly media: SceneMedia | null | undefined;
  readonly framing: SourceQualityFramingInput;
}): SourceQualityAssessment {
  const framingFitMode = input.framing.fitMode === "fit" ? "fit" : "fill";
  const backgroundTreatment = normalizeSceneMediaBackgroundTreatment(
    input.framing.backgroundTreatment,
  );
  const zoom = normalizeSourceQualityZoom(input.framing.zoom);
  const hasMedia = mediaHasRenderableSource(input.media);
  const metrics = readMetrics(hasMedia ? input.media : null);

  if (!hasMedia) {
    return Object.freeze({
      status: "unknown",
      hasMedia: false,
      metrics,
      framingFitMode,
      backgroundTreatment: "none",
      authoredZoom: null,
      targets: Object.freeze([]),
      warningCodes: Object.freeze([]),
      summaryKey: "no_media" satisfies SourceQualitySummaryKey,
      suitableFor1080p: false,
      suitableFor4k: false,
    });
  }

  const width = metrics.width;
  const height = metrics.height;
  if (width == null || height == null) {
    return Object.freeze({
      status: "unknown",
      hasMedia: true,
      metrics,
      framingFitMode,
      backgroundTreatment:
        framingFitMode === "fit" ? backgroundTreatment : "none",
      authoredZoom: zoom,
      targets: Object.freeze(
        SOURCE_QUALITY_VERTICAL_TARGETS.map((target) =>
          unknownTargetReadiness(target.id, target.width, target.height),
        ),
      ),
      warningCodes: Object.freeze([
        "SOURCE_DIMENSIONS_UNKNOWN",
      ] as const satisfies readonly SourceQualityWarningCode[]),
      summaryKey: "unknown",
      suitableFor1080p: false,
      suitableFor4k: false,
    });
  }

  // Aspect guidance only — not used for renderer baseScale / mayUpscale.
  const effective = resolveSourceQualityEffectiveDimensions(
    width,
    height,
    input.framing.rotationDeg,
  );

  const targets = SOURCE_QUALITY_VERTICAL_TARGETS.map((target) =>
    measureSourceQualityTargetGeometry({
      sourceWidth: width,
      sourceHeight: height,
      fitMode: framingFitMode,
      zoom,
      targetId: target.id,
      targetWidth: target.width,
      targetHeight: target.height,
    }),
  );

  const warningCodes: SourceQualityWarningCode[] = [];
  if (aspectMismatched(effective.effectiveWidth / effective.effectiveHeight)) {
    warningCodes.push("SOURCE_ASPECT_RATIO_MISMATCH");
  }

  const target1080 = targets.find((entry) => entry.targetId === "1080p");
  if (
    framingFitMode === "fill" &&
    target1080?.retainedSourceAreaFraction != null &&
    target1080.retainedSourceAreaFraction <
      SOURCE_QUALITY_AGGRESSIVE_CROP_RETAINED_AREA_THRESHOLD
  ) {
    warningCodes.push("SOURCE_AGGRESSIVE_VERTICAL_CROP");
  }

  for (const target of targets) {
    if (!target.mayUpscale) {
      continue;
    }
    if (target.targetId === "720p") {
      warningCodes.push("SOURCE_MAY_UPSCALE_AT_720P");
    } else if (target.targetId === "1080p") {
      warningCodes.push("SOURCE_MAY_UPSCALE_AT_1080P");
    } else if (target.targetId === "4k") {
      warningCodes.push("SOURCE_MAY_UPSCALE_AT_4K");
    }
  }

  const suitableFor1080p = !(
    targets.find((entry) => entry.targetId === "1080p")?.mayUpscale ?? true
  );
  const suitableFor4k = !(
    targets.find((entry) => entry.targetId === "4k")?.mayUpscale ?? true
  );

  // 4K-only upscale must not demote a source that is ready for 1080p Browser export.
  const demotingWarnings = warningCodes.filter(
    (code) => code !== "SOURCE_MAY_UPSCALE_AT_4K",
  );
  const status =
    demotingWarnings.length === 0 && suitableFor1080p ? "suitable" : "warning";
  const summaryKey: SourceQualitySummaryKey =
    status === "suitable" ? "suitable_1080p" : "warning";

  return Object.freeze({
    status,
    hasMedia: true,
    metrics,
    framingFitMode,
    backgroundTreatment:
      framingFitMode === "fit" ? backgroundTreatment : "none",
    authoredZoom: zoom,
    targets: Object.freeze(targets),
    warningCodes: Object.freeze(warningCodes),
    summaryKey,
    suitableFor1080p,
    suitableFor4k,
  });
}
