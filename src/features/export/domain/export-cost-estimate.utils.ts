/**
 * Conservative export cost / memory estimates for capability preflight.
 *
 * Sprint 6D (chunked-browser-v1):
 * Peak no longer assumes the full JPEG sequence is resident.
 * Peak ≈ current-chunk JPEG bytes + retained encoded segments + 180MB WASM overhead.
 *
 * Sprint 6F.1: 1080p is no longer blanket-unsafe — resolution approval uses this
 * cost model + project profile (image/mixed/video-heavy).
 */

import { resolveExportChunkSizeFrames } from "@/features/export/chunking/export-chunk-policy";
import { EXPORT_CHUNKED_RENDERER_VERSION } from "@/features/export/chunking/export-chunk.types";

import type { ExportCostEstimate } from "./export-capability.types";
import type { ExportManifest } from "./export-manifest.types";

const WASM_OVERHEAD_BYTES = 180 * 1024 * 1024;
/** Safe peak estimate for Chromium browser path. */
export const EXPORT_SAFE_PEAK_MEMORY_BYTES = 350 * 1024 * 1024;
/** Above this → unsafe / server-required. */
export const EXPORT_UNSAFE_PEAK_MEMORY_BYTES = 500 * 1024 * 1024;
/**
 * Full-sequence JPEG bytes above this were historically unsafe.
 * Kept for diagnostics / comparison; chunked peak uses chunkFrameBytes instead.
 */
export const EXPORT_UNSAFE_JPEG_SEQUENCE_BYTES = 220 * 1024 * 1024;

/** Dev-only 1080p override — re-exports the client-visible NEXT_PUBLIC helper. */
export { is1080pBrowserOverrideEnabled as isExport1080pBrowserOverrideEnabled } from "@/features/export/capabilities/export1080pOverride";

export function estimateExportCost(manifest: ExportManifest): ExportCostEstimate {
  const { width, height, fps } = manifest.output;
  const durationMs = manifest.project.renderDurationMs;
  const estimatedFrames = Math.max(
    1,
    Math.ceil((durationMs * fps) / 1000),
  );
  const pixels = Math.max(1, width) * Math.max(1, height);
  const estimatedRawFrameBytes = pixels * 4;
  const jpegPerFrame = Math.round(pixels * 0.18);

  const chunkSizeFrames = resolveExportChunkSizeFrames({ width, height, fps });
  const chunkFrameBytes = jpegPerFrame * chunkSizeFrames;
  /** Full-sequence intermediate (diagnostic / comparison only). */
  const estimatedIntermediateBytes = jpegPerFrame * estimatedFrames;
  /** All encoded segments retained until concat (~0.25× full JPEG model). */
  const retainedSegmentBytes = Math.round(estimatedIntermediateBytes * 0.25);
  const estimatedPeakMemoryBytes =
    chunkFrameBytes + retainedSegmentBytes + WASM_OVERHEAD_BYTES;

  const durationSec = durationMs / 1000;
  const durationClass =
    durationSec <= 12 ? "short" : durationSec <= 28 ? "medium" : "long";

  let risk: ExportCostEstimate["risk"] = "safe";
  // Risk is memory/duration based only — resolution approval is separate (6F.1).
  if (
    estimatedPeakMemoryBytes >= EXPORT_UNSAFE_PEAK_MEMORY_BYTES ||
    (retainedSegmentBytes >= EXPORT_UNSAFE_JPEG_SEQUENCE_BYTES &&
      durationClass === "long")
  ) {
    risk = "unsafe";
  } else if (
    estimatedPeakMemoryBytes >= EXPORT_SAFE_PEAK_MEMORY_BYTES ||
    durationClass === "long" ||
    (manifest.output.resolution === "720p" && countVideoScenes(manifest) >= 2) ||
    (manifest.output.resolution === "1080p" && countVideoScenes(manifest) >= 1)
  ) {
    risk = "borderline";
  }

  return {
    estimatedFrames,
    estimatedRawFrameBytes,
    estimatedIntermediateBytes,
    estimatedPeakMemoryBytes,
    durationClass,
    risk,
    rendererVersion: EXPORT_CHUNKED_RENDERER_VERSION,
    chunkSizeFrames,
    estimatedChunkFrameBytes: chunkFrameBytes,
    estimatedRetainedSegmentBytes: retainedSegmentBytes,
  };
}

function countVideoScenes(manifest: ExportManifest): number {
  return manifest.scenes.filter((scene) => scene.media.type === "video").length;
}
