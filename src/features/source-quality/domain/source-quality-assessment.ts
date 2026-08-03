/**
 * Pure source-quality assessment types.
 * Authoring guidance only — never required by ExportManifest or renderers.
 */

export type SourceQualityStatus = "unknown" | "suitable" | "warning";

export type SourceQualityTargetId = "720p" | "1080p" | "4k";

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

export interface SourceQualityTargetReadiness {
  readonly targetId: SourceQualityTargetId;
  readonly width: number;
  readonly height: number;
  /** True when the active framing scale for this target exceeds 1.0. */
  readonly mayUpscale: boolean;
  readonly coverScale: number | null;
  readonly containScale: number | null;
  /**
   * Active rendered scale for the current fit/fill mode:
   * base cover/contain scale × zoom. Null when dimensions are unknown.
   */
  readonly activeScale: number | null;
  /** Cover-only: fraction of source area still visible (0–1), zoom-adjusted. */
  readonly retainedSourceAreaFraction: number | null;
}

export interface SourceQualityAssessment {
  readonly status: SourceQualityStatus;
  readonly hasMedia: boolean;
  readonly metrics: SourceQualityMetrics;
  readonly framingFitMode: "fit" | "fill";
  readonly targets: readonly SourceQualityTargetReadiness[];
  readonly warningCodes: readonly SourceQualityWarningCode[];
  readonly summaryKey: SourceQualitySummaryKey;
  /** True when the source can render at 1080p without upscaling under current framing. */
  readonly suitableFor1080p: boolean;
  /** True when the source can render at 4K without upscaling under current framing. */
  readonly suitableFor4k: boolean;
}
