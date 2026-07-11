/**
 * Video source/clip time from frozen ExportVideoMediaManifest (Sprint 6C).
 */

import { resolveSceneMediaPlayback } from "@/features/media-playback";
import type { ExportSceneManifest } from "@/features/export/domain/export-manifest.types";

export function resolveExportVideoSourceTimeMs(
  scene: ExportSceneManifest,
  sceneElapsedMs: number,
): { sourceTimeMs: number; holdLastFrame: boolean } {
  if (scene.media.type !== "video") {
    return { sourceTimeMs: 0, holdLastFrame: false };
  }

  const media = scene.media;
  const playback = resolveSceneMediaPlayback({
    sceneMedia: {
      type: "video",
      url: media.source,
      durationMs: media.sourceDurationMs,
      trimStartMs: media.trimStartMs,
      trimEndMs: media.trimEndMs,
    },
    sceneElapsedMs,
    sceneDurationMs: scene.durationMs,
  });

  return {
    sourceTimeMs: playback.clipTimeMs,
    holdLastFrame: playback.holdLastFrame,
  };
}
