/**
 * Scene resolution from ExportManifest scenes (Sprint 6C).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import type { ResolvedExportSceneFrame } from "./export-timing.types";
import { resolveExportVisualTimeMs } from "./resolve-export-render-end";

export function resolveExportSceneFrame(
  manifest: ExportManifest,
  timestampMs: number,
): ResolvedExportSceneFrame {
  const visualTimeMs = resolveExportVisualTimeMs(manifest, timestampMs);
  const scenes = manifest.scenes;

  if (scenes.length === 0) {
    throw new Error("ExportManifest has no scenes.");
  }

  let activeIndex = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    if (visualTimeMs >= scene.startMs && visualTimeMs < scene.endMs) {
      activeIndex = i;
      break;
    }
    if (visualTimeMs >= scene.endMs) {
      activeIndex = i;
    }
  }

  // Hold last scene through end buffer when past final endMs.
  const last = scenes[scenes.length - 1]!;
  if (visualTimeMs >= last.endMs) {
    activeIndex = scenes.length - 1;
  }

  const scene = scenes[activeIndex]!;
  const sceneElapsedMs = Math.max(
    0,
    Math.min(visualTimeMs - scene.startMs, scene.durationMs),
  );

  return {
    scene,
    sceneIndex: activeIndex,
    sceneStartMs: scene.startMs,
    sceneEndMs: scene.endMs,
    sceneElapsedMs,
    sceneDurationMs: scene.durationMs,
  };
}
