/**
 * Provider-free source/framing/output corpus for vertical video quality audits.
 * Geometry measurement delegates to Source Quality domain authority.
 */

import {
  measureSourceQualityTargetGeometry,
  type SourceQualityDetailClass,
} from "@/features/source-quality";

export type VideoQualityTargetId = "720p" | "1080p" | "4k";
export type VideoQualityFitMode = "fit" | "fill";

export interface VideoQualitySourceCase {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly description: string;
}

export interface VideoQualityFramingCase {
  readonly id: string;
  readonly fitMode: VideoQualityFitMode;
  readonly zoom: number;
}

export interface VideoQualityTargetCase {
  readonly id: VideoQualityTargetId;
  readonly width: number;
  readonly height: number;
}

export interface VideoQualityAuditCase {
  readonly id: string;
  readonly source: VideoQualitySourceCase;
  readonly framing: VideoQualityFramingCase;
  readonly target: VideoQualityTargetCase;
}

export type VideoQualityDetailClass = SourceQualityDetailClass;

export interface VideoQualityGeometryMeasurement {
  readonly baseScale: number;
  readonly activeScale: number;
  /** Source pixels available for each output pixel on the scaled axis. */
  readonly sourcePixelsPerOutputPixel: number;
  /** Fraction of the 9:16 output covered by the centered media rectangle. */
  readonly frameCoverageFraction: number;
  /** Fraction of source area retained after centered clipping. */
  readonly retainedSourceAreaFraction: number;
  readonly retainedSourceRegionWidth: number;
  readonly retainedSourceRegionHeight: number;
  readonly detailClass: VideoQualityDetailClass;
  readonly softnessCause: NonNullable<
    ReturnType<typeof measureSourceQualityTargetGeometry>["softnessCause"]
  >;
}

export const VIDEO_QUALITY_SOURCE_CORPUS: readonly VideoQualitySourceCase[] =
  Object.freeze([
    { id: "vertical_4k", width: 2160, height: 3840, description: "native vertical 4K" },
    { id: "vertical_1080", width: 1080, height: 1920, description: "native vertical 1080p" },
    { id: "vertical_720", width: 720, height: 1280, description: "native vertical 720p" },
    { id: "landscape_4k", width: 3840, height: 2160, description: "landscape 4K" },
    { id: "landscape_1080", width: 1920, height: 1080, description: "landscape 1080p" },
    { id: "square_1080", width: 1080, height: 1080, description: "square 1080" },
    { id: "four_three_1080", width: 1440, height: 1080, description: "4:3 landscape" },
    { id: "ultrawide_1080", width: 2560, height: 1080, description: "ultrawide landscape" },
    { id: "low_res_vertical", width: 540, height: 960, description: "low-resolution vertical" },
  ]);

export const VIDEO_QUALITY_FRAMING_CORPUS: readonly VideoQualityFramingCase[] =
  Object.freeze([
    { id: "fit_zoomed_out", fitMode: "fit", zoom: 0.75 },
    { id: "fit_native_zoom", fitMode: "fit", zoom: 1 },
    { id: "fill_native_zoom", fitMode: "fill", zoom: 1 },
    { id: "fill_moderate_zoom", fitMode: "fill", zoom: 1.25 },
    { id: "fill_aggressive_zoom", fitMode: "fill", zoom: 1.75 },
  ]);

export const VIDEO_QUALITY_TARGET_CORPUS: readonly VideoQualityTargetCase[] =
  Object.freeze([
    { id: "720p", width: 720, height: 1280 },
    { id: "1080p", width: 1080, height: 1920 },
    { id: "4k", width: 2160, height: 3840 },
  ]);

export function measureVideoQualityGeometry(
  auditCase: VideoQualityAuditCase,
): VideoQualityGeometryMeasurement {
  const readiness = measureSourceQualityTargetGeometry({
    sourceWidth: auditCase.source.width,
    sourceHeight: auditCase.source.height,
    fitMode: auditCase.framing.fitMode,
    zoom: auditCase.framing.zoom,
    targetId: auditCase.target.id,
    targetWidth: auditCase.target.width,
    targetHeight: auditCase.target.height,
  });

  return Object.freeze({
    baseScale: readiness.baseScale!,
    activeScale: readiness.activeScale!,
    sourcePixelsPerOutputPixel: readiness.sourcePixelsPerOutputPixel!,
    frameCoverageFraction: readiness.frameCoverageFraction!,
    retainedSourceAreaFraction: readiness.retainedSourceAreaFraction!,
    retainedSourceRegionWidth: readiness.retainedSourceRegion!.width,
    retainedSourceRegionHeight: readiness.retainedSourceRegion!.height,
    detailClass: readiness.detailClass!,
    softnessCause: readiness.softnessCause!,
  });
}

export function buildVideoQualityAuditCorpus(): readonly VideoQualityAuditCase[] {
  return Object.freeze(
    VIDEO_QUALITY_SOURCE_CORPUS.flatMap((source) =>
      VIDEO_QUALITY_FRAMING_CORPUS.flatMap((framing) =>
        VIDEO_QUALITY_TARGET_CORPUS.map((target) =>
          Object.freeze({
            id: `${source.id}__${framing.id}__${target.id}`,
            source,
            framing,
            target,
          }),
        ),
      ),
    ),
  );
}
