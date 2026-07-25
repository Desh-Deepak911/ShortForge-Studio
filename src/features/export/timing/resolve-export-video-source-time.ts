/**
 * Video source/clip time from frozen ExportVideoMediaManifest (Sprint 6C / 8D).
 * Uses active timeline item when present; item-local elapsed for clip mapping.
 */

import { resolveSceneMediaPlayback } from "@/features/media-playback/media-playback.engine";
import { resolveExportActiveSceneMediaFrame } from "@/features/export/domain/resolve-export-active-scene-media-frame";
import type {
  ExportMediaManifest,
  ExportSceneManifest,
} from "@/features/export/domain/export-manifest.types";

export function resolveExportVideoSourceTimeMs(
  scene: ExportSceneManifest,
  sceneElapsedMs: number,
): { sourceTimeMs: number; holdLastFrame: boolean; mediaItemId: string | null } {
  const active = resolveExportActiveSceneMediaFrame(scene, sceneElapsedMs);
  const media: ExportMediaManifest = active?.item.media ?? scene.media;
  const mediaItemId = active?.item.id ?? scene.mediaTimeline?.items[0]?.id ?? null;
  const itemElapsedMs = active?.itemElapsedMs ?? sceneElapsedMs;
  const itemDurationMs = active?.itemDurationMs ?? scene.durationMs;

  if (media.type !== "video") {
    return {
      sourceTimeMs: 0,
      holdLastFrame: active?.holdingFinalFrame ?? false,
      mediaItemId,
    };
  }

  const playback = resolveSceneMediaPlayback({
    sceneMedia: {
      type: "video",
      url: media.source,
      durationMs: media.sourceDurationMs,
      trimStartMs: media.trimStartMs,
      trimEndMs: media.trimEndMs,
    },
    sceneElapsedMs: itemElapsedMs,
    sceneDurationMs: itemDurationMs,
  });

  return {
    sourceTimeMs: playback.clipTimeMs,
    holdLastFrame: playback.holdLastFrame || Boolean(active?.holdingFinalFrame),
    mediaItemId,
  };
}
