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
 *
 * Fill retained-area upper bound (conservative; rotation preserves area):
 *   scaledSourceArea = sourceW × sourceH × activeScale²
 *   retainedAreaUpperBound = clamp01(targetW × targetH / scaledSourceArea)
 * Arbitrary rotation may clip more than this bound; the assessment avoids
 * false precision. Pan/position is excluded. Fit letterboxing is non-terminal.
 *
 * Rotation AABB remains only for effective displayed aspect-ratio guidance.
 */

import type { SceneMediaFraming } from "@/features/media-framing/media-framing.types";
import type { SceneMedia } from "@/features/story/types";

import type {
  SourceQualityAssessment,
  SourceQualityMetrics,
  SourceQualitySummaryKey,
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
  SOURCE_QUALITY_TARGET_ASPECT_RATIO,
  SOURCE_QUALITY_VERTICAL_TARGETS,
} from "./source-quality-thresholds";

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

/**
 * Conservative retained-area upper bound using original source area and the
 * renderer-parity active scale. Rotation preserves area; extra rotational
 * clipping is not claimed precisely.
 */
function retainedAreaUpperBound(
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
  activeScale: number,
): number {
  if (!(activeScale > 0) || !(sourceW > 0) || !(sourceH > 0)) {
    return 1;
  }
  const scaledSourceArea = sourceW * sourceH * activeScale * activeScale;
  if (!(scaledSourceArea > 0)) {
    return 1;
  }
  return clamp01((targetW * targetH) / scaledSourceArea);
}

function aspectMismatched(aspectRatio: number): boolean {
  const relative = Math.abs(aspectRatio / SOURCE_QUALITY_TARGET_ASPECT_RATIO - 1);
  return relative > SOURCE_QUALITY_ASPECT_MISMATCH_RELATIVE_TOLERANCE;
}

export type SourceQualityFramingInput = Pick<
  SceneMediaFraming,
  "fitMode" | "zoom" | "rotationDeg"
>;

/**
 * Assess source readiness for vertical export targets under the current framing.
 * Missing dimensions yield `unknown` — never a render blocker.
 */
export function assessSourceQuality(input: {
  readonly media: SceneMedia | null | undefined;
  readonly framing: SourceQualityFramingInput;
}): SourceQualityAssessment {
  const framingFitMode = input.framing.fitMode === "fit" ? "fit" : "fill";
  const zoom = normalizeSourceQualityZoom(input.framing.zoom);
  const hasMedia = mediaHasRenderableSource(input.media);
  const metrics = readMetrics(hasMedia ? input.media : null);

  if (!hasMedia) {
    return Object.freeze({
      status: "unknown",
      hasMedia: false,
      metrics,
      framingFitMode,
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
      targets: Object.freeze(
        SOURCE_QUALITY_VERTICAL_TARGETS.map((target) =>
          Object.freeze({
            targetId: target.id,
            width: target.width,
            height: target.height,
            mayUpscale: false,
            coverScale: null,
            containScale: null,
            activeScale: null,
            retainedSourceAreaFraction: null,
          } satisfies SourceQualityTargetReadiness),
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

  const targets = SOURCE_QUALITY_VERTICAL_TARGETS.map((target) => {
    const cover = coverScale(width, height, target.width, target.height);
    const contain = containScale(width, height, target.width, target.height);
    const baseScale = framingFitMode === "fit" ? contain : cover;
    const activeScale = baseScale * zoom;
    const retained =
      framingFitMode === "fill"
        ? retainedAreaUpperBound(
            width,
            height,
            target.width,
            target.height,
            activeScale,
          )
        : null;
    return Object.freeze({
      targetId: target.id,
      width: target.width,
      height: target.height,
      mayUpscale: activeScale > 1,
      coverScale: cover,
      containScale: contain,
      activeScale,
      retainedSourceAreaFraction: retained,
    } satisfies SourceQualityTargetReadiness);
  });

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
    targets: Object.freeze(targets),
    warningCodes: Object.freeze(warningCodes),
    summaryKey,
    suitableFor1080p,
    suitableFor4k,
  });
}
