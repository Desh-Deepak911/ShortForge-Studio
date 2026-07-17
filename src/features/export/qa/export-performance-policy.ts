/**
 * 720p / 1080p performance policy helpers (Sprint 6F / 6F.1).
 * Prefer `approveExportResolution` from `@/features/export/capabilities` for preflight.
 */

import type { ExportPerformancePolicy, ExportBrowserSupportRow } from "./export-device-qa.types";
import {
  EXPORT_720P_RESOLUTION_POLICY,
  EXPORT_1080P_RESOLUTION_POLICY,
  approveExportResolution,
  type ExportDeviceCapabilityEstimate,
} from "@/features/export/capabilities";

/** Conservative 720p Chromium-first production thresholds. */
export const EXPORT_720P_PERFORMANCE_POLICY: ExportPerformancePolicy = {
  resolution: "720p",
  maxProjectDurationMs: EXPORT_720P_RESOLUTION_POLICY.maxProjectDurationMs,
  maxEstimatedFrames: EXPORT_720P_RESOLUTION_POLICY.maxEstimatedFrames,
  maxVideoScenes: EXPORT_720P_RESOLUTION_POLICY.maxVideoScenes,
  maxEstimatedPeakMemoryBytes:
    EXPORT_720P_RESOLUTION_POLICY.maxEstimatedPeakMemoryBytes,
  classification: "approved",
  rationale: EXPORT_720P_RESOLUTION_POLICY.rationale,
};

/** 1080p is capability-gated (Approved / Warning / Blocked) — not blanket-blocked. */
export const EXPORT_1080P_PERFORMANCE_POLICY: ExportPerformancePolicy = {
  resolution: "1080p",
  maxProjectDurationMs: EXPORT_1080P_RESOLUTION_POLICY.maxProjectDurationMs,
  maxEstimatedFrames: EXPORT_1080P_RESOLUTION_POLICY.maxEstimatedFrames,
  maxVideoScenes: EXPORT_1080P_RESOLUTION_POLICY.maxVideoScenes,
  maxEstimatedPeakMemoryBytes:
    EXPORT_1080P_RESOLUTION_POLICY.maxEstimatedPeakMemoryBytes,
  classification: "approved-with-warning",
  rationale: EXPORT_1080P_RESOLUTION_POLICY.rationale,
};

export function classifyExportCostAgainstPolicy(input: {
  readonly resolution: "720p" | "1080p";
  readonly projectDurationMs: number;
  readonly estimatedFrames: number;
  readonly videoSceneCount: number;
  readonly estimatedPeakMemoryBytes: number;
  readonly imageSceneCount?: number;
  readonly sceneCount?: number;
  readonly durationClass?: "short" | "medium" | "long";
  readonly allow1080Override?: boolean;
}): "approved" | "approved-with-warning" | "blocked" {
  const sceneCount =
    input.sceneCount ??
    Math.max(input.videoSceneCount + (input.imageSceneCount ?? 0), 1);
  const imageSceneCount =
    input.imageSceneCount ?? Math.max(0, sceneCount - input.videoSceneCount);
  const durationClass =
    input.durationClass ??
    (input.projectDurationMs / 1000 <= 12
      ? "short"
      : input.projectDurationMs / 1000 <= 28
        ? "medium"
        : "long");

  const videoMediaItemCount = input.videoSceneCount;
  const imageMediaItemCount = imageSceneCount;
  const mediaItemCount = videoMediaItemCount + imageMediaItemCount;
  const estimate: ExportDeviceCapabilityEstimate = {
    resolution: input.resolution,
    projectDurationMs: input.projectDurationMs,
    estimatedFrames: input.estimatedFrames,
    sceneCount,
    mediaItemCount,
    videoMediaItemCount,
    imageMediaItemCount,
    videoSceneCount: videoMediaItemCount,
    imageSceneCount: imageMediaItemCount,
    estimatedPeakMemoryBytes: input.estimatedPeakMemoryBytes,
    estimatedChunkCount: Math.max(1, Math.ceil(input.estimatedFrames / 120)),
    chunkSizeFrames: 120,
    durationClass,
    rendererVersion: "chunked-browser-v1",
    browserName: "chrome",
    browserApisReady: true,
  };

  return approveExportResolution({
    estimate,
    allow1080Override: input.allow1080Override,
  }).classification;
}

/** Documented browser matrix — honest evidence classes (do not fabricate). */
export const EXPORT_BROWSER_SUPPORT_MATRIX: readonly ExportBrowserSupportRow[] = [
  {
    browser: "Chromium / Chrome (desktop)",
    classification: "Supported",
    notes:
      "Primary production target for 720p; 1080p capability-gated (Sprint 6F.1).",
    evidenceClass: "automated-semantic",
  },
  {
    browser: "Safari (desktop/iOS)",
    classification: "Supported with warnings",
    notes: "WebM playback limited; MP4 preferred where probe passes. Manual device matrix incomplete.",
    evidenceClass: "not-tested",
  },
  {
    browser: "Firefox (desktop)",
    classification: "Supported with warnings",
    notes: "FFmpeg.wasm + canvas path expected; full golden playback matrix not completed.",
    evidenceClass: "not-tested",
  },
];
