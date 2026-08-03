/**
 * Manifest-derived render plan indexes (Sprint 6C).
 * Builds renderer-friendly lookups without changing semantics.
 */

import {
  type ExportCaptionManifest,
  type ExportManifest,
  type ExportMediaManifest,
  type ExportMediaMotionManifest,
  type ExportSceneManifest,
  isExportManifestV5,
  EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS,
  EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
} from "@/features/export/domain/export-manifest.types";
import { assertExportManifest as assertExportManifestAuthority } from "@/features/export/domain/validate-export-manifest";
import type { SceneImage, SceneMedia, SceneMediaMotion, SceneType } from "@/features/story/types";
import type { MediaMotionEasing } from "@/features/media-motion";

/**
 * Frozen draw DTO synthesized from ExportManifest only.
 * Not a StoryDocument / live editor object.
 * Compatibility `media`/`image` mirror the first timeline item; active item is
 * resolved per-frame from `manifestScene.mediaTimeline`.
 */
export interface ExportDrawScene {
  readonly id: string;
  readonly start: number;
  readonly duration: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly captionMode: string;
  readonly subtitle: string;
  readonly subtitleText: string;
  readonly sceneType?: SceneType;
  readonly media: SceneMedia;
  readonly image?: SceneImage;
  /** Back-reference to frozen manifest scene. */
  readonly manifestScene: ExportSceneManifest;
}

export interface ExportRenderPlan {
  readonly manifest: ExportManifest;
  readonly scenes: readonly ExportDrawScene[];
  readonly sceneById: ReadonlyMap<string, ExportDrawScene>;
  readonly captions: readonly ExportCaptionManifest[];
  readonly keyframedVisualEffectsEnabled: boolean;
  readonly engagementOverlaysEnabled: boolean;
}

/**
 * Prepare renderer indexes from a frozen ExportManifest.
 * Must not recalculate durations, motion, fit, captions, or audio.
 * Dispatches v2 / v3 integrity — never assumes latest version.
 */
export function prepareExportFromManifest(
  manifest: ExportManifest,
): ExportRenderPlan {
  assertExportManifest(manifest);

  const scenes = manifest.scenes.map((scene) =>
    toExportDrawScene(scene, manifest.captions),
  );
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  return {
    manifest,
    scenes,
    sceneById,
    captions: manifest.captions,
    keyframedVisualEffectsEnabled:
      isExportManifestV5(manifest) &&
      manifest.requiredCapabilities.includes(
        EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
      ),
    engagementOverlaysEnabled:
      isExportManifestV5(manifest) &&
      manifest.requiredCapabilities.includes(
        EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS,
      ),
  };
}

/** Version-dispatching authority (v2 / 8D and v3 / 9C). */
export function assertExportManifest(manifest: ExportManifest): void {
  assertExportManifestAuthority(manifest);
}

/** @deprecated Prefer assertExportManifest. */
export function assertExportManifestV2(manifest: ExportManifest): void {
  assertExportManifest(manifest);
}

function toExportDrawScene(
  scene: ExportSceneManifest,
  captions: readonly ExportCaptionManifest[],
): ExportDrawScene {
  const sceneCaptions = captions.filter((caption) => caption.sceneId === scene.id);
  const text = sceneCaptions.map((caption) => caption.text).join(" ").trim();
  const media = toSceneMedia(scene.media);
  const image = toSceneImage(scene.media);

  return {
    id: scene.id,
    start: scene.startMs / 1000,
    duration: scene.durationMs / 1000,
    startMs: scene.startMs,
    endMs: scene.endMs,
    durationMs: scene.durationMs,
    captionMode: scene.captionMode,
    subtitle: text,
    subtitleText: text,
    media,
    ...(image ? { image } : {}),
    manifestScene: scene,
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
      ...(media.visualAdjustments
        ? { visualAdjustments: media.visualAdjustments }
        : {}),
      ...(media.visualEffect ? { visualEffect: media.visualEffect } : {}),
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
