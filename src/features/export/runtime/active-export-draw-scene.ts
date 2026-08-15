/**
 * Builds a draw DTO whose media/image mirror the active frozen timeline item.
 */

import type { ExportActiveSceneMediaFrame } from "@/features/export/domain/resolve-export-active-scene-media-frame";

import {
  hydrateExportDrawSceneImage,
  hydrateExportDrawSceneMedia,
} from "./hydrate-export-draw-media";
import type { ExportDrawScene } from "./prepare-export-from-manifest";

export function buildActiveExportDrawScene(
  drawScene: ExportDrawScene,
  active: ExportActiveSceneMediaFrame | null,
  options?: {
    readonly fitWithBlurredBackgroundEnabled?: boolean;
  },
): ExportDrawScene {
  if (!active) {
    return drawScene;
  }
  const fitWithBlurredBackgroundEnabled =
    options?.fitWithBlurredBackgroundEnabled === true;
  const media = hydrateExportDrawSceneMedia(
    active.item.media,
    fitWithBlurredBackgroundEnabled,
  );
  const image = hydrateExportDrawSceneImage(
    active.item.media,
    fitWithBlurredBackgroundEnabled,
  );
  return {
    ...drawScene,
    media,
    ...(image ? { image } : { image: undefined }),
  };
}
