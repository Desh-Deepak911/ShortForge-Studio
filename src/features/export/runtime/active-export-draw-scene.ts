/**
 * Builds a draw DTO whose media/image mirror the active frozen timeline item.
 */

import type { ExportActiveSceneMediaFrame } from "@/features/export/domain/resolve-export-active-scene-media-frame";
import type {
  ExportMediaManifest,
  ExportMediaMotionManifest,
} from "@/features/export/domain/export-manifest.types";
import type { SceneImage, SceneMedia, SceneMediaMotion } from "@/features/story/types";
import type { MediaMotionEasing } from "@/features/media-motion";

import type { ExportDrawScene } from "./prepare-export-from-manifest";

export function buildActiveExportDrawScene(
  drawScene: ExportDrawScene,
  active: ExportActiveSceneMediaFrame | null,
): ExportDrawScene {
  if (!active) {
    return drawScene;
  }
  const media = toSceneMedia(active.item.media);
  const image = toSceneImage(active.item.media);
  return {
    ...drawScene,
    media,
    ...(image ? { image } : { image: undefined }),
  };
}

function toSceneMedia(media: ExportMediaManifest): SceneMedia {
  if (media.type === "placeholder") {
    return { type: "placeholder" };
  }

  const motion = toSceneMediaMotion(media.motion);
  const transform = {
    x: media.positionX,
    y: media.positionY,
    scale: media.zoom,
    rotation: media.rotationDeg,
  };
  const fitMode = media.fitMode === "fit" ? ("contain" as const) : ("cover" as const);

  if (media.type === "image") {
    return {
      type: "image",
      url: media.source,
      source: "upload",
      fitMode,
      transform,
      ...(motion ? { motion } : {}),
    };
  }

  return {
    type: "video",
    url: media.source,
    source: "upload",
    durationMs: media.sourceDurationMs,
    trimStartMs: media.trimStartMs,
    trimEndMs: media.trimEndMs,
    fitMode,
    transform,
    muted: true,
    ...(motion ? { motion } : {}),
  };
}

function toSceneImage(media: ExportMediaManifest): SceneImage | undefined {
  if (media.type === "placeholder") {
    return undefined;
  }
  return {
    url: media.source,
    scale: media.zoom,
    x: media.positionX,
    y: media.positionY,
    rotation: media.rotationDeg,
    fitMode: media.fitMode,
  };
}

function toSceneMediaMotion(
  motion: ExportMediaMotionManifest | null,
): SceneMediaMotion | undefined {
  if (!motion) {
    return undefined;
  }
  return {
    version: 1,
    enabled: motion.enabled,
    presetId: motion.presetId,
    easing: normalizeEasing(motion.easing),
    intensity: motion.intensity,
  };
}

function normalizeEasing(value: string): MediaMotionEasing {
  const allowed: MediaMotionEasing[] = [
    "linear",
    "ease-in",
    "ease-out",
    "ease-in-out",
  ];
  const normalized = value.replace(/_/g, "-");
  return (allowed.includes(normalized as MediaMotionEasing)
    ? normalized
    : "linear") as MediaMotionEasing;
}
