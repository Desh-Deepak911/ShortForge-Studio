/**
 * Device / project capability estimate inputs (Sprint 6F.1).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import type { ExportCostEstimate } from "@/features/export/domain/export-capability.types";

export interface ExportDeviceCapabilityEstimate {
  readonly resolution: "720p" | "1080p";
  readonly projectDurationMs: number;
  readonly estimatedFrames: number;
  readonly sceneCount: number;
  readonly videoSceneCount: number;
  readonly imageSceneCount: number;
  readonly estimatedPeakMemoryBytes: number;
  readonly estimatedChunkCount: number;
  readonly chunkSizeFrames: number;
  readonly durationClass: ExportCostEstimate["durationClass"];
  readonly rendererVersion: string;
  readonly browserName: string;
  readonly browserApisReady: boolean;
}

export function buildExportDeviceCapabilityEstimate(
  manifest: ExportManifest,
  estimatedCost: ExportCostEstimate,
): ExportDeviceCapabilityEstimate {
  const videoSceneCount = manifest.scenes.filter(
    (s) => s.media.type === "video",
  ).length;
  const imageSceneCount = manifest.scenes.filter(
    (s) => s.media.type === "image",
  ).length;
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
    videoSceneCount,
    imageSceneCount,
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
    estimate.videoSceneCount === 0 &&
    estimate.imageSceneCount > 0
  );
}

export function isMixedMediaProject(estimate: ExportDeviceCapabilityEstimate): boolean {
  return estimate.videoSceneCount > 0 && estimate.imageSceneCount > 0;
}

export function isVideoHeavyProject(estimate: ExportDeviceCapabilityEstimate): boolean {
  const { videoSceneCount, imageSceneCount, sceneCount } = estimate;
  return (
    videoSceneCount >= 3 ||
    (videoSceneCount >= 2 && videoSceneCount >= Math.max(1, imageSceneCount)) ||
    (videoSceneCount > 0 && videoSceneCount / Math.max(1, sceneCount) >= 0.5)
  );
}
