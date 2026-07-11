/**
 * Canonical project / frame timing from ExportManifest (Sprint 6C).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";

/** Project render end — always `manifest.project.renderDurationMs`. */
export function resolveExportRenderEndMs(manifest: ExportManifest): number {
  return Math.max(1, Math.round(manifest.project.renderDurationMs));
}

/** Visual freeze time during end buffer — `contentDurationMs`. */
export function resolveExportContentEndMs(manifest: ExportManifest): number {
  return Math.max(0, Math.round(manifest.project.contentDurationMs));
}

/**
 * Clamp timeline time for visual sampling (motion / captions freeze in end buffer).
 * Equivalent to resolveTimelineVisualTimeMs without MasterTimeline.
 */
export function resolveExportVisualTimeMs(
  manifest: ExportManifest,
  timestampMs: number,
): number {
  const contentEndMs = resolveExportContentEndMs(manifest);
  if (!Number.isFinite(timestampMs)) {
    return 0;
  }
  return Math.min(Math.max(0, timestampMs), contentEndMs);
}

/**
 * Frame-center sample time — sole export frame clock.
 * Matches resolveTimelineFrameSampleTimeMs.
 */
export function resolveExportFrameTimestampMs(
  frameIndex: number,
  fps: number,
): number {
  const safeFps = fps > 0 ? fps : 30;
  const index = Number.isFinite(frameIndex) ? Math.max(0, frameIndex) : 0;
  return Math.round(((index + 0.5) * 1000) / safeFps);
}

/** Total discrete frames for capture — includes end buffer. */
export function resolveExportTotalFrames(manifest: ExportManifest): number {
  const durationMs = resolveExportRenderEndMs(manifest);
  const fps = manifest.output.fps > 0 ? manifest.output.fps : 30;
  return Math.max(1, Math.ceil((durationMs * fps) / 1000));
}
