/**
 * Device / project capability estimate inputs (Sprint 6F.1 / 8D.1).
 *
 * Counts prefer canonical mediaTimeline items. Legacy videoSceneCount /
 * imageSceneCount mirror videoMediaItemCount / imageMediaItemCount so
 * resolution approval and performance policy see every media item.
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import type { ExportCostEstimate } from "@/features/export/domain/export-capability.types";

export interface ExportDeviceCapabilityEstimate {
  readonly resolution: "720p" | "1080p";
  readonly projectDurationMs: number;
  readonly estimatedFrames: number;
  readonly sceneCount: number;
  /** Total canonical timeline media items across all scenes. */
  readonly mediaItemCount: number;
  readonly videoMediaItemCount: number;
  readonly imageMediaItemCount: number;
  /**
   * @deprecated Prefer videoMediaItemCount. Kept as an alias of item counts
   * for Sprint 6F consumers (not scene-first compatibility media).
   */
  readonly videoSceneCount: number;
  /**
   * @deprecated Prefer imageMediaItemCount. Kept as an alias of item counts
   * for Sprint 6F consumers (not scene-first compatibility media).
   */
  readonly imageSceneCount: number;
  readonly estimatedPeakMemoryBytes: number;
  readonly estimatedChunkCount: number;
  readonly chunkSizeFrames: number;
  readonly durationClass: ExportCostEstimate["durationClass"];
  readonly rendererVersion: string;
  readonly browserName: string;
  readonly browserApisReady: boolean;
}

function countCanonicalMediaItems(manifest: ExportManifest): {
  mediaItemCount: number;
  videoMediaItemCount: number;
  imageMediaItemCount: number;
} {
  let mediaItemCount = 0;
  let videoMediaItemCount = 0;
  let imageMediaItemCount = 0;

  for (const scene of manifest.scenes) {
    const items = scene.mediaTimeline?.items;
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        mediaItemCount += 1;
        if (item.media.type === "video") {
          videoMediaItemCount += 1;
        } else if (item.media.type === "image") {
          imageMediaItemCount += 1;
        }
      }
      continue;
    }

    // Legacy fallback when a timeline is absent (should not happen on v2).
    mediaItemCount += 1;
    if (scene.media.type === "video") {
      videoMediaItemCount += 1;
    } else if (scene.media.type === "image") {
      imageMediaItemCount += 1;
    }
  }

  return { mediaItemCount, videoMediaItemCount, imageMediaItemCount };
}

export function buildExportDeviceCapabilityEstimate(
  manifest: ExportManifest,
  estimatedCost: ExportCostEstimate,
): ExportDeviceCapabilityEstimate {
  const { mediaItemCount, videoMediaItemCount, imageMediaItemCount } =
    countCanonicalMediaItems(manifest);
  const chunkSizeFrames = Math.max(1, estimatedCost.chunkSizeFrames ?? 120);
  const estimatedChunkCount = Math.max(
    1,
    Math.ceil(estimatedCost.estimatedFrames / chunkSizeFrames),
  );

  return {
    resolution: manifest.output.resolution,
    projectDurationMs: manifest.project.renderDurationMs,
    estimatedFrames: estimatedCost.estimatedFrames,
    sceneCount: manifest.scenes.length,
    mediaItemCount,
    videoMediaItemCount,
    imageMediaItemCount,
    // Derived from canonical item counts (not first-item compatibility media).
    videoSceneCount: videoMediaItemCount,
    imageSceneCount: imageMediaItemCount,
    estimatedPeakMemoryBytes: estimatedCost.estimatedPeakMemoryBytes,
    estimatedChunkCount,
    chunkSizeFrames,
    durationClass: estimatedCost.durationClass,
    rendererVersion: estimatedCost.rendererVersion ?? "unknown",
    browserName: manifest.capabilities.environment.browserName,
    browserApisReady: manifest.capabilities.browserRendererAvailable,
  };
}

export function isImageHeavyProject(estimate: ExportDeviceCapabilityEstimate): boolean {
  return (
    estimate.videoMediaItemCount === 0 &&
    estimate.imageMediaItemCount > 0
  );
}

export function isMixedMediaProject(estimate: ExportDeviceCapabilityEstimate): boolean {
  return estimate.videoMediaItemCount > 0 && estimate.imageMediaItemCount > 0;
}

export function isVideoHeavyProject(estimate: ExportDeviceCapabilityEstimate): boolean {
  const {
    videoMediaItemCount,
    imageMediaItemCount,
    mediaItemCount,
  } = estimate;
  return (
    videoMediaItemCount >= 3 ||
    (videoMediaItemCount >= 2 &&
      videoMediaItemCount >= Math.max(1, imageMediaItemCount)) ||
    (videoMediaItemCount > 0 &&
      videoMediaItemCount / Math.max(1, mediaItemCount) >= 0.5)
  );
}
