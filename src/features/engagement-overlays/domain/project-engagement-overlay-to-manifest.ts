/**
 * Project a scene engagement overlay into ExportManifest-safe frozen fields.
 * Clamps to prepared scene duration; omits unusable overlays with warnings.
 */

import type { ExportEngagementOverlayManifest } from "@/features/export/domain/export-manifest.types";

import { resolveEngagementOverlayWindow } from "./resolve-engagement-overlay-window";

export interface ProjectEngagementOverlayToManifestResult {
  readonly overlay: ExportEngagementOverlayManifest | undefined;
  readonly warnings: readonly string[];
}

export function projectEngagementOverlayToManifest(
  overlay: unknown,
  sceneDurationMs: number,
  engagementOverlaysEnabled: boolean,
): ProjectEngagementOverlayToManifestResult {
  if (engagementOverlaysEnabled !== true) {
    return { overlay: undefined, warnings: [] };
  }
  const resolved = resolveEngagementOverlayWindow({
    overlay,
    sceneDurationMs,
  });
  if (!resolved.available || !resolved.overlay) {
    return { overlay: undefined, warnings: resolved.warnings };
  }
  return {
    overlay: {
      version: 1,
      id: resolved.overlay.id,
      kind: resolved.overlay.kind,
      startOffsetMs: resolved.startOffsetMs,
      durationMs: resolved.durationMs,
      position: resolved.overlay.position,
      size: resolved.overlay.size,
      scale: resolved.overlay.scale,
      presetId: resolved.overlay.presetId,
    },
    warnings: resolved.warnings,
  };
}
