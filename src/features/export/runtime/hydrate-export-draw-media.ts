/**
 * Hydrate frozen ExportManifest media into Preview/Export SceneMedia draw DTOs.
 * Shared by prepare-export-from-manifest and active-export-draw-scene.
 */

import type {
  ExportMediaManifest,
  ExportMediaMotionManifest,
} from "@/features/export/domain/export-manifest.types";
import type { MediaMotionEasing } from "@/features/media-motion";
import type { SceneImage, SceneMedia, SceneMediaMotion } from "@/features/story/types";

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
    ...(motion.keyframes
      ? {
          keyframes: motion.keyframes.map((frame) => ({
            ...frame,
            easing: normalizeEasing(frame.easing),
          })),
        }
      : {}),
  };
}

/** Capability-gated Fit-with-background hydration for draw DTOs. */
export function hydrateExportDrawSceneMedia(
  media: ExportMediaManifest,
  fitWithBlurredBackgroundEnabled: boolean,
): SceneMedia {
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
  const includeBackgroundTreatment =
    fitWithBlurredBackgroundEnabled &&
    media.backgroundTreatment === "blurred_fill" &&
    media.fitMode === "fit";

  if (media.type === "image") {
    return {
      type: "image",
      url: media.source,
      source: "upload",
      fitMode,
      transform,
      ...(motion ? { motion } : {}),
      ...(media.visualAdjustments
        ? { visualAdjustments: media.visualAdjustments }
        : {}),
      ...(media.visualEffect ? { visualEffect: media.visualEffect } : {}),
      ...(includeBackgroundTreatment
        ? { backgroundTreatment: "blurred_fill" as const }
        : {}),
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
    ...(media.visualAdjustments
      ? { visualAdjustments: media.visualAdjustments }
      : {}),
    ...(media.visualEffect ? { visualEffect: media.visualEffect } : {}),
    ...(includeBackgroundTreatment
      ? { backgroundTreatment: "blurred_fill" as const }
      : {}),
  };
}

export function hydrateExportDrawSceneImage(
  media: ExportMediaManifest,
  fitWithBlurredBackgroundEnabled: boolean,
): SceneImage | undefined {
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
    ...(fitWithBlurredBackgroundEnabled &&
    media.backgroundTreatment === "blurred_fill" &&
    media.fitMode === "fit"
      ? { backgroundTreatment: "blurred_fill" as const }
      : {}),
  };
}
