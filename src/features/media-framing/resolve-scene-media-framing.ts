/**
 * Shared framing resolver — Preview and Export both consume this result.
 * Does not mutate the scene. Does not read motion (framing ≠ motion).
 */
import type {
  FootieScene,
  SceneImage,
  SceneImageFitMode,
  SceneMedia,
  SceneMediaFitMode,
  SceneMediaTransform,
} from "@/features/story/types";
import {
  DEFAULT_IMAGE_FIT_MODE,
  DEFAULT_IMAGE_SCALE,
  SCENE_IMAGE_REFERENCE_HEIGHT,
  SCENE_IMAGE_REFERENCE_WIDTH,
  clampSceneImageScale,
  getSceneImage,
  getSceneMedia,
  normalizeSceneImageFitMode,
} from "@/features/story/utils";

import type {
  SceneMediaFraming,
  SceneMediaFramingFitMode,
} from "./media-framing.types";
import {
  MEDIA_FRAMING_POSITION_UI_MAX,
  MEDIA_FRAMING_POSITION_UI_MIN,
} from "./media-framing.types";

export const DEFAULT_SCENE_MEDIA_FRAMING: SceneMediaFraming = {
  fitMode: DEFAULT_IMAGE_FIT_MODE,
  positionX: 0,
  positionY: 0,
  zoom: DEFAULT_IMAGE_SCALE,
  rotationDeg: 0,
};

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function mapImageFitToMediaFit(
  fitMode: SceneImageFitMode | SceneMediaFramingFitMode | undefined,
): SceneMediaFitMode | undefined {
  if (fitMode === "fill") return "cover";
  if (fitMode === "fit") return "contain";
  return undefined;
}

export function mapMediaFitToImageFit(
  fitMode: SceneMediaFitMode | undefined,
  fallback: SceneImageFitMode = DEFAULT_IMAGE_FIT_MODE,
): SceneImageFitMode {
  if (fitMode === "contain") return "fit";
  if (fitMode === "cover") return "fill";
  return normalizeSceneImageFitMode(fallback);
}

export function framingToMediaTransform(
  framing: SceneMediaFraming,
): SceneMediaTransform {
  return {
    x: framing.positionX,
    y: framing.positionY,
    scale: clampSceneImageScale(framing.zoom),
    rotation: framing.rotationDeg,
  };
}

export function framingToSceneImageFields(
  framing: SceneMediaFraming,
): Pick<SceneImage, "fitMode" | "x" | "y" | "scale" | "rotation"> {
  return {
    fitMode: framing.fitMode,
    x: framing.positionX,
    y: framing.positionY,
    scale: clampSceneImageScale(framing.zoom),
    rotation: framing.rotationDeg,
  };
}

function normalizeFraming(partial: Partial<SceneMediaFraming>): SceneMediaFraming {
  return {
    fitMode: normalizeSceneImageFitMode(partial.fitMode),
    positionX: finiteOr(partial.positionX, 0),
    positionY: finiteOr(partial.positionY, 0),
    zoom: clampSceneImageScale(finiteOr(partial.zoom, DEFAULT_IMAGE_SCALE)),
    rotationDeg: finiteOr(partial.rotationDeg, 0),
  };
}

/**
 * Resolve canonical framing for a scene.
 *
 * Precedence:
 * 1. Image scenes with scene.image → scene.image is write authority (after dual-sync).
 * 2. Otherwise scene.media.transform + media.fitMode (videos + legacy media-only).
 * 3. Neutral defaults.
 */
export function resolveSceneMediaFraming(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  options: { media?: SceneMedia | null } = {},
): SceneMediaFraming {
  const media = options.media ?? getSceneMedia(scene);
  const image = getSceneImage(scene);

  // Image write authority: inspector + drag dual-write image; prefer image when present.
  if (image && media?.type !== "video") {
    return normalizeFraming({
      fitMode: image.fitMode,
      positionX: image.x,
      positionY: image.y,
      zoom: image.scale,
      rotationDeg: image.rotation ?? 0,
    });
  }

  if (media && (media.type === "video" || media.type === "image")) {
    const transform = media.transform;
    return normalizeFraming({
      fitMode: mapMediaFitToImageFit(
        media.fitMode,
        media.type === "video" ? "fill" : DEFAULT_IMAGE_FIT_MODE,
      ),
      positionX: transform?.x,
      positionY: transform?.y,
      zoom: transform?.scale,
      rotationDeg: transform?.rotation,
    });
  }

  if (image) {
    return normalizeFraming({
      fitMode: image.fitMode,
      positionX: image.x,
      positionY: image.y,
      zoom: image.scale,
      rotationDeg: image.rotation ?? 0,
    });
  }

  return { ...DEFAULT_SCENE_MEDIA_FRAMING };
}

/** Base transform for motion adapters (reference-frame x/y/scale/rotation). */
export function resolveSceneMediaFramingTransform(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  options: { media?: SceneMedia | null } = {},
): SceneMediaTransform {
  return framingToMediaTransform(resolveSceneMediaFraming(scene, options));
}

/** SceneImage-shaped draw payload for export canvas helpers. */
export function resolveSceneMediaFramingAsImage(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  options: { media?: SceneMedia | null; url?: string } = {},
): SceneImage | undefined {
  const media = options.media ?? getSceneMedia(scene);
  if (media?.type === "placeholder") {
    return undefined;
  }

  const image = getSceneImage(scene);
  const url =
    (typeof options.url === "string" && options.url.trim()) ||
    media?.url?.trim() ||
    image?.url?.trim() ||
    "";
  if (!url) {
    return undefined;
  }

  const framing = resolveSceneMediaFraming(scene, { media });
  return {
    url,
    ...framingToSceneImageFields(framing),
    imageMotion: image?.imageMotion ?? media?.imageMotion,
  };
}

export function mergeSceneMediaFraming(
  current: SceneMediaFraming,
  patch: Partial<SceneMediaFraming>,
): SceneMediaFraming {
  return normalizeFraming({
    fitMode: patch.fitMode ?? current.fitMode,
    positionX: patch.positionX ?? current.positionX,
    positionY: patch.positionY ?? current.positionY,
    zoom: patch.zoom ?? current.zoom,
    rotationDeg: patch.rotationDeg ?? current.rotationDeg,
  });
}

/** Map inspector −100…100 slider value → reference-frame pan. */
export function framingPositionUiToReference(
  uiValue: number,
  axis: "x" | "y",
): number {
  const clamped = Math.min(
    MEDIA_FRAMING_POSITION_UI_MAX,
    Math.max(MEDIA_FRAMING_POSITION_UI_MIN, finiteOr(uiValue, 0)),
  );
  const half =
    axis === "x" ? SCENE_IMAGE_REFERENCE_WIDTH / 2 : SCENE_IMAGE_REFERENCE_HEIGHT / 2;
  return (clamped / MEDIA_FRAMING_POSITION_UI_MAX) * half;
}

/** Map reference-frame pan → inspector −100…100 slider value. */
export function framingPositionReferenceToUi(
  referenceValue: number,
  axis: "x" | "y",
): number {
  const half =
    axis === "x" ? SCENE_IMAGE_REFERENCE_WIDTH / 2 : SCENE_IMAGE_REFERENCE_HEIGHT / 2;
  if (half <= 0) return 0;
  const ui = (finiteOr(referenceValue, 0) / half) * MEDIA_FRAMING_POSITION_UI_MAX;
  return Math.min(
    MEDIA_FRAMING_POSITION_UI_MAX,
    Math.max(MEDIA_FRAMING_POSITION_UI_MIN, ui),
  );
}

export function sceneHasFramableMedia(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
): boolean {
  const media = getSceneMedia(scene);
  if (media?.type === "video" && media.url?.trim()) {
    return true;
  }
  return Boolean(getSceneImage(scene)?.url?.trim());
}
