/**
 * Capability preflight types (Sprint 6B).
 */

import type { ExportManifest } from "./export-manifest.types";

export type ExportRendererKind = "browser" | "server" | "blocked";

export type ExportBlockerCode =
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_RESOLUTION"
  | "UNSUPPORTED_FPS"
  | "MISSING_MEDIA"
  | "MISSING_VOICEOVER"
  | "INVALID_TIMELINE"
  | "INVALID_VIDEO_TRIM"
  | "UNSUPPORTED_TRANSITION"
  | "UNSUPPORTED_CAPTION_EFFECT"
  | "FONT_UNAVAILABLE"
  | "BROWSER_EXPORT_UNSUPPORTED"
  | "MANUAL_CAPTURE_UNSUPPORTED"
  | "FFMPEG_UNAVAILABLE"
  | "UNSAFE_MEMORY_ESTIMATE"
  | "SERVER_RENDERER_REQUIRED"
  | "POISONED_EXPORT_RUNTIME"
  | "INVALID_MANIFEST"
  | "MISSING_MUSIC"
  | "UNSUPPORTED_AUDIO_MODE";

export type ExportWarningCode =
  | "BORDERLINE_MEMORY"
  | "LONG_EXPORT"
  | "PARTIAL_CAPTION_FIDELITY"
  | "BROWSER_SPECIFIC_RISK"
  | "SERVER_RENDERER_RECOMMENDED"
  | "TIMELINE_WARNING"
  | "RESOLUTION_PERFORMANCE_WARNING"
  | "DEV_1080P_OVERRIDE";

export interface ExportWarning {
  readonly code: ExportWarningCode;
  readonly message: string;
}

export interface ExportBlocker {
  readonly code: ExportBlockerCode;
  readonly message: string;
  readonly capability?: string;
}

export interface ExportCostEstimate {
  readonly estimatedFrames: number;
  readonly estimatedRawFrameBytes: number;
  /** Full-sequence JPEG estimate (diagnostic). Peak uses chunked residency. */
  readonly estimatedIntermediateBytes: number;
  readonly estimatedPeakMemoryBytes: number;
  readonly durationClass: "short" | "medium" | "long";
  readonly risk: "safe" | "borderline" | "unsafe";
  /** Sprint 6D chunked renderer version when estimated under chunked model. */
  readonly rendererVersion?: string;
  readonly chunkSizeFrames?: number;
  readonly estimatedChunkFrameBytes?: number;
  readonly estimatedRetainedSegmentBytes?: number;
}

export interface ExportCapabilityResult {
  readonly supported: boolean;
  readonly renderer: ExportRendererKind;
  readonly warnings: readonly ExportWarning[];
  readonly blockers: readonly ExportBlocker[];
  readonly estimatedCost: ExportCostEstimate;
  readonly manifestFingerprint: string;
}

export class ExportPreflightError extends Error {
  readonly code = "EXPORT_PREFLIGHT_BLOCKED" as const;

  constructor(
    readonly result: ExportCapabilityResult,
    readonly manifestFingerprint: string,
  ) {
    const first = result.blockers[0]?.message ?? "Export capability preflight blocked this export.";
    super(first);
    this.name = "ExportPreflightError";
  }
}

export interface PreparedExportRequest {
  readonly manifest: ExportManifest;
  readonly preflight: ExportCapabilityResult;
  readonly renderer: ExportRendererKind;
}
