/**
 * Safe v3 ExportManifest diagnostics — no media URLs or private data.
 */

import type { ExportManifest } from "./export-manifest.types";
import { isExportManifestV3, isExportSceneManifestV3 } from "./export-manifest.types";

export interface ExportManifestV3DiagnosticsSummary {
  readonly manifestVersion: number;
  readonly rendererContractVersion: string;
  readonly intraSceneTransitionCount: number;
  readonly effectCounts: Readonly<Record<string, number>>;
  readonly scenesWithTransitions: number;
  readonly emptyTransitionTracks: number;
}

export function summarizeExportManifestV3Diagnostics(
  manifest: ExportManifest,
): ExportManifestV3DiagnosticsSummary {
  const effectCounts: Record<string, number> = {};
  let intraSceneTransitionCount = 0;
  let scenesWithTransitions = 0;
  let emptyTransitionTracks = 0;

  if (isExportManifestV3(manifest)) {
    for (const scene of manifest.scenes) {
      if (!isExportSceneManifestV3(scene)) continue;
      const boundaries = scene.mediaTransitions.boundaries;
      if (boundaries.length === 0) {
        emptyTransitionTracks += 1;
        continue;
      }
      scenesWithTransitions += 1;
      for (const boundary of boundaries) {
        intraSceneTransitionCount += 1;
        effectCounts[boundary.effect] = (effectCounts[boundary.effect] ?? 0) + 1;
      }
    }
  }

  return {
    manifestVersion: manifest.version,
    rendererContractVersion: manifest.rendererContractVersion,
    intraSceneTransitionCount,
    effectCounts,
    scenesWithTransitions,
    emptyTransitionTracks,
  };
}
