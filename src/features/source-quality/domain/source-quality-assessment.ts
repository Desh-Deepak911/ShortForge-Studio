/**
 * Pure source-quality assessment types.
 * Authoring guidance only — never required by ExportManifest or renderers.
 */

export type SourceQualityStatus = "unknown" | "suitable" | "warning";

export type SourceQualityTargetId = "720p" | "1080p" | "4k";

/**
 * Advisory post-framing detail class from source pixels available per output pixel.
 * Never a terminal export blocker.
 */
export type SourceQualityDetailClass =
  | "native_or_downsampled"
  | "mild_upscale"
  | "material_upscale"
  | "severe_upscale";

/**
 * Dominant cause of softness when the framed result enlarges source pixels.
 * Advisory only — pan/rotation are not claimed with false precision.
 */
export type SourceQualitySoftnessCause =
  | "none"
  | "source_dimensions"
  | "aspect_conversion"
  | "authored_zoom"
  | "combined";

export type SourceQualityWarningCode =
  | "SOURCE_DIMENSIONS_UNKNOWN"
  | "SOURCE_MAY_UPSCALE_AT_720P"
  | "SOURCE_MAY_UPSCALE_AT_1080P"
  | "SOURCE_MAY_UPSCALE_AT_4K"
  | "SOURCE_ASPECT_RATIO_MISMATCH"
  | "SOURCE_AGGRESSIVE_VERTICAL_CROP";

export type SourceQualitySummaryKey =
  | "no_media"
  | "unknown"
  | "suitable_1080p"
  | "warning";

export interface SourceQualityMetrics {
  readonly width: number | null;
  readonly height: number | null;
  readonly aspectRatio: number | null;
  readonly mimeType: string | null;
  readonly mediaType: "image" | "video" | "placeholder" | null;
}

/**
 * Approximate retained source rectangle in source pixels after centered
 * Fit/Fill + zoom (pan ignored; rotation not claimed precisely).
 */
export interface SourceQualityRetainedRegion {
  readonly width: number;
  readonly height: number;
}

export interface SourceQualityTargetReadiness {
  readonly targetId: SourceQualityTargetId;
  readonly width: number;
  readonly height: number;
  /** True when the active framing scale for this target exceeds 1.0. */
  readonly mayUpscale: boolean;
  readonly coverScale: number | null;
  readonly containScale: number | null;
  /**
   * Fit contain or Fill cover scale before authored zoom.
   * Null when dimensions are unknown.
   */
  readonly baseScale: number | null;
  /**
   * Active rendered scale for the current fit/fill mode:
   * base cover/contain scale × zoom. Null when dimensions are unknown.
   */
  readonly activeScale: number | null;
  /**
   * Source pixels available per output pixel on the scaled axis (1 / activeScale).
   * Null when dimensions are unknown.
   */
  readonly sourcePixelsPerOutputPixel: number | null;
  /**
   * Fraction of source area still visible after centered clipping (0–1).
   * Fit keeps the full source when letterboxed (typically 1). Fill crops.
   * Null when dimensions are unknown.
   */
  readonly retainedSourceAreaFraction: number | null;
  /**
   * Approximate retained source-region size in source pixels.
   * Null when dimensions are unknown.
   */
  readonly retainedSourceRegion: SourceQualityRetainedRegion | null;
  /**
   * Fraction of the output frame covered by the centered media rectangle (0–1).
   * Fill is typically 1; Fit letterboxing is &lt; 1. Null when dimensions unknown.
   */
  readonly frameCoverageFraction: number | null;
  /** Advisory density class from sourcePixelsPerOutputPixel. */
  readonly detailClass: SourceQualityDetailClass | null;
  /** Advisory softness cause when detailClass is not native_or_downsampled. */
  readonly softnessCause: SourceQualitySoftnessCause | null;
}

export interface SourceQualityAssessment {
  readonly status: SourceQualityStatus;
  readonly hasMedia: boolean;
  readonly metrics: SourceQualityMetrics;
  readonly framingFitMode: "fit" | "fill";
  /**
   * Additive Fit presentation. Absent/"none" for legacy Fit/Fill.
   * Geometry assessment always uses framingFitMode (Fit for fit-with-background).
   */
  readonly backgroundTreatment: "none" | "blurred_fill";
  /**
   * Normalized authored zoom applied to every target readiness row.
   * Null only when there is no media.
   */
  readonly authoredZoom: number | null;
  readonly targets: readonly SourceQualityTargetReadiness[];
  readonly warningCodes: readonly SourceQualityWarningCode[];
  readonly summaryKey: SourceQualitySummaryKey;
  /** True when the source can render at 1080p without upscaling under current framing. */
  readonly suitableFor1080p: boolean;
  /** True when the source can render at 4K without upscaling under current framing. */
  readonly suitableFor4k: boolean;
}
