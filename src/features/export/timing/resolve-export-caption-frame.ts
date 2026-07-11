/**
 * Caption resolution from ExportManifest captions (Sprint 6C).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import type { ResolvedExportCaptionFrame } from "./export-timing.types";
import { resolveExportVisualTimeMs } from "./resolve-export-render-end";

export function resolveExportCaptionFrame(
  manifest: ExportManifest,
  timestampMs: number,
): ResolvedExportCaptionFrame | null {
  const visualTimeMs = resolveExportVisualTimeMs(manifest, timestampMs);
  const captions = manifest.captions;

  for (let i = 0; i < captions.length; i++) {
    const caption = captions[i]!;
    if (visualTimeMs >= caption.startMs && visualTimeMs < caption.endMs) {
      const durationMs = Math.max(1, caption.endMs - caption.startMs);
      const elapsedMs = Math.max(0, visualTimeMs - caption.startMs);
      return {
        caption,
        captionIndex: i,
        elapsedMs,
        durationMs,
        progress: Math.min(1, elapsedMs / durationMs),
      };
    }
  }

  return null;
}

/** All captions active at timestamp (rare overlap support). */
export function resolveExportCaptionFrames(
  manifest: ExportManifest,
  timestampMs: number,
): readonly ResolvedExportCaptionFrame[] {
  const active = resolveExportCaptionFrame(manifest, timestampMs);
  return active ? [active] : [];
}
