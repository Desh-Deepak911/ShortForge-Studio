/**
 * Manifest-derived render plan indexes (Sprint 6C).
 * Builds renderer-friendly lookups without changing semantics.
 */

import {
  type ExportCaptionManifest,
  type ExportManifest,
  type ExportSceneManifest,
  isExportManifestV5,
  EXPORT_RENDERER_CAPABILITY_ENGAGEMENT_OVERLAYS,
  EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS,
  EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
  EXPORT_RENDERER_CAPABILITY_SHORTFORGE_BRAND_STING,
} from "@/features/export/domain/export-manifest.types";
import { assertExportManifest as assertExportManifestAuthority } from "@/features/export/domain/validate-export-manifest";
import type { SceneImage, SceneMedia, SceneType } from "@/features/story/types";

import {
  hydrateExportDrawSceneImage,
  hydrateExportDrawSceneMedia,
} from "./hydrate-export-draw-media";

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
  readonly shortForgeBrandStingEnabled: boolean;
  /** Fit-with-background draw enablement — requires v5 capability. */
  readonly fitWithBlurredBackgroundEnabled: boolean;
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

  const fitWithBlurredBackgroundEnabled =
    isExportManifestV5(manifest) &&
    manifest.requiredCapabilities.includes(
      EXPORT_RENDERER_CAPABILITY_MEDIA_BACKGROUND_TREATMENT_BLURRED_FILL,
    );

  const scenes = manifest.scenes.map((scene) =>
    toExportDrawScene(scene, manifest.captions, fitWithBlurredBackgroundEnabled),
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
    shortForgeBrandStingEnabled:
      isExportManifestV5(manifest) &&
      manifest.requiredCapabilities.includes(
        EXPORT_RENDERER_CAPABILITY_SHORTFORGE_BRAND_STING,
      ),
    fitWithBlurredBackgroundEnabled,
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
  fitWithBlurredBackgroundEnabled: boolean,
): ExportDrawScene {
  const sceneCaptions = captions.filter((caption) => caption.sceneId === scene.id);
  const text = sceneCaptions.map((caption) => caption.text).join(" ").trim();
  const media = hydrateExportDrawSceneMedia(
    scene.media,
    fitWithBlurredBackgroundEnabled,
  );
  const image = hydrateExportDrawSceneImage(
    scene.media,
    fitWithBlurredBackgroundEnabled,
  );

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
