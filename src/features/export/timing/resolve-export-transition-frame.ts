/**
 * Transition resolution from ExportManifest scene.transitionOut (Sprint 6C).
 * Overlay window sits on the outgoing scene tail — same product model as Preview.
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import { resolveCanonicalTransitionProgressForSample } from "@/features/timeline-intelligence/resolve-canonical-transition-frame.utils";

import type { ResolvedExportTransitionFrame } from "./export-timing.types";
import { resolveExportVisualTimeMs } from "./resolve-export-render-end";

export function resolveExportTransitionFrame(
  manifest: ExportManifest,
  timestampMs: number,
): ResolvedExportTransitionFrame | null {
  const visualTimeMs = resolveExportVisualTimeMs(manifest, timestampMs);
  const scenes = manifest.scenes;

  for (let i = 0; i < scenes.length; i++) {
    const fromScene = scenes[i]!;
    const transition = fromScene.transitionOut;
    if (!transition || transition.durationMs <= 0) {
      continue;
    }

    const toIndex = scenes.findIndex((scene) => scene.id === transition.toSceneId);
    if (toIndex < 0) {
      continue;
    }
    const toScene = scenes[toIndex]!;
    const endMs = fromScene.endMs;
    const startMs = Math.max(fromScene.startMs, endMs - transition.durationMs);

    const fps = manifest.output.fps > 0 ? manifest.output.fps : 30;
    const progress = resolveCanonicalTransitionProgressForSample({
      sampleTimeMs: visualTimeMs,
      windowStartMs: startMs,
      windowEndMs: endMs,
      fps,
    });

    if (progress !== null) {
      const durationMs = Math.max(1, endMs - startMs);
      const elapsedMs = Math.max(0, visualTimeMs - startMs);
      return {
        transition,
        fromScene,
        toScene,
        fromSceneIndex: i,
        toSceneIndex: toIndex,
        startMs,
        endMs,
        elapsedMs,
        durationMs,
        progress,
      };
    }
  }

  return null;
}
