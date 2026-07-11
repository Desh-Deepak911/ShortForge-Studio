/**
 * StoryDocument patches for persistent media framing.
 * One logical history op per commit (drag release / inspector change / reset).
 * Never writes scene.media.motion. Never touches trim / playback timing.
 */
import type { FootieScene, SceneMedia } from "@/features/story/types";
import {
  DEFAULT_IMAGE_FIT_MODE,
  DEFAULT_IMAGE_SCALE,
  getSceneImage,
  getSceneMedia,
  normalizeSceneImageFitMode,
  normalizeSceneImageMotion,
} from "@/features/story/utils";

import type { SceneMediaFraming, SceneMediaFramingPatch } from "./media-framing.types";
import {
  framingToMediaTransform,
  framingToSceneImageFields,
  mapImageFitToMediaFit,
  mergeSceneMediaFraming,
  resolveSceneMediaFraming,
} from "./resolve-scene-media-framing";

export type SceneMediaFramingScenePatch = Pick<FootieScene, "image" | "media">;

export interface MediaFramingPatchResult {
  patch: SceneMediaFramingScenePatch;
  framing: SceneMediaFraming;
  media: SceneMedia | undefined;
}

function cloneMediaPreservingPlayback(media: SceneMedia): SceneMedia {
  return { ...media };
}

/**
 * Builds an undoable scene patch for framing changes.
 * Images: dual-write scene.image + scene.media.transform/fitMode.
 * Videos: write scene.media.transform/fitMode only (trim/poster/url untouched).
 */
export function buildMediaFramingPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  framingPatch: SceneMediaFramingPatch,
): MediaFramingPatchResult | null {
  const media = getSceneMedia(scene);
  const image = getSceneImage(scene);
  const current = resolveSceneMediaFraming(scene);
  const nextFraming = mergeSceneMediaFraming(current, framingPatch);

  if (media?.type === "video") {
    if (!media.url?.trim()) {
      return null;
    }
    const nextMedia: SceneMedia = {
      ...cloneMediaPreservingPlayback(media),
      fitMode: mapImageFitToMediaFit(nextFraming.fitMode) ?? "cover",
      transform: framingToMediaTransform(nextFraming),
    };
    return {
      patch: { media: nextMedia },
      framing: nextFraming,
      media: nextMedia,
    };
  }

  if (!image?.url?.trim() && media?.type !== "image") {
    return null;
  }

  const nextImage = image
    ? {
        ...image,
        ...framingToSceneImageFields(nextFraming),
        imageMotion: normalizeSceneImageMotion(image.imageMotion),
      }
    : media?.type === "image" && media.url
      ? {
          url: media.url,
          ...framingToSceneImageFields(nextFraming),
          imageMotion: normalizeSceneImageMotion(media.imageMotion),
        }
      : undefined;

  if (!nextImage) {
    return null;
  }

  const baseMedia =
    media?.type === "image"
      ? cloneMediaPreservingPlayback(media)
      : {
          type: "image" as const,
          url: nextImage.url,
          source: "legacy" as const,
          transform: framingToMediaTransform(nextFraming),
          fitMode: mapImageFitToMediaFit(nextFraming.fitMode),
          imageMotion: nextImage.imageMotion,
        };

  const nextMedia: SceneMedia = {
    ...baseMedia,
    type: "image",
    url: nextImage.url,
    fitMode: mapImageFitToMediaFit(nextFraming.fitMode),
    transform: framingToMediaTransform(nextFraming),
    imageMotion: nextImage.imageMotion,
  };

  return {
    patch: { image: nextImage, media: nextMedia },
    framing: nextFraming,
    media: nextMedia,
  };
}

/** Reset pan/zoom/rotation; preserve fit mode unless caller overrides. */
export function buildResetMediaFramingPatch(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  options: { resetFitMode?: boolean } = {},
): MediaFramingPatchResult | null {
  const current = resolveSceneMediaFraming(scene);
  return buildMediaFramingPatch(scene, {
    fitMode: options.resetFitMode
      ? DEFAULT_IMAGE_FIT_MODE
      : normalizeSceneImageFitMode(current.fitMode),
    positionX: 0,
    positionY: 0,
    zoom: DEFAULT_IMAGE_SCALE,
    rotationDeg: 0,
  });
}

/**
 * Keeps scene.media.transform/fitMode aligned with scene.image after an image-only write.
 * Safe no-op for videos and scenes without image media.
 */
export function syncSceneMediaFramingFromImage(
  scene: FootieScene,
): FootieScene {
  const image = getSceneImage(scene);
  if (!image) {
    return scene;
  }

  const media = scene.media;
  if (media != null && media.type !== "image") {
    return scene;
  }

  const framing = resolveSceneMediaFraming({ ...scene, image });
  const nextMedia: SceneMedia = {
    ...(media?.type === "image" ? media : { type: "image", source: "legacy" as const }),
    type: "image",
    url: image.url,
    fitMode: mapImageFitToMediaFit(framing.fitMode),
    transform: framingToMediaTransform(framing),
    imageMotion: image.imageMotion,
  };

  return {
    ...scene,
    image,
    media: nextMedia,
  };
}
