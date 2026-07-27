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
import {
  isExportManifestV3,
  isExportManifestV4,
  isExportSceneManifestV3,
} from "./export-manifest.types";

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

  const layerStats = estimateMediaLayerDrawStats(manifest, estimatedFrames, fps);

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
    estimatedAverageMediaLayersPerFrame: layerStats.averageLayersPerFrame,
    estimatedMediaLayerDraws: layerStats.totalLayerDraws,
  };
}

/**
 * Ordinary frames draw 1 media layer; dual-peer overlays (scene-to-scene or
 * v3 intra-scene) draw 2. Represented honestly without new codec requirements.
 */
function estimateMediaLayerDrawStats(
  manifest: ExportManifest,
  estimatedFrames: number,
  fps: number,
): { averageLayersPerFrame: number; totalLayerDraws: number } {
  const msPerFrame = 1000 / Math.max(1, fps);
  let dualPeerMs = 0;

  for (const scene of manifest.scenes) {
    if (scene.transitionOut && scene.transitionOut.durationMs > 0) {
      dualPeerMs += scene.transitionOut.durationMs;
    }
    if ((isExportManifestV3(manifest) || isExportManifestV4(manifest)) && isExportSceneManifestV3(scene)) {
      for (const boundary of scene.mediaTransitions.boundaries) {
        dualPeerMs += Math.max(0, boundary.effectiveDurationMs);
      }
    }
  }

  const dualPeerFrames = Math.min(
    estimatedFrames,
    Math.ceil(dualPeerMs / msPerFrame),
  );
  const singlePeerFrames = Math.max(0, estimatedFrames - dualPeerFrames);
  const totalLayerDraws = singlePeerFrames * 1 + dualPeerFrames * 2;
  const averageLayersPerFrame =
    estimatedFrames > 0 ? totalLayerDraws / estimatedFrames : 1;

  return {
    averageLayersPerFrame: Number(averageLayersPerFrame.toFixed(4)),
    totalLayerDraws,
  };
}

/** Counts every video timeline item — later videos cannot hide behind a first image. */
function countVideoScenes(manifest: ExportManifest): number {
  let count = 0;
  for (const scene of manifest.scenes) {
    const items = scene.mediaTimeline?.items ?? [];
    if (items.length === 0) {
      if (scene.media.type === "video") {
        count += 1;
      }
      continue;
    }
    for (const item of items) {
      if (item.media.type === "video") {
        count += 1;
      }
    }
  }
  return count;
}
