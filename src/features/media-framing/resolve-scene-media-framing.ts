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
} from "@/features/story/utils/scene.utils";

import type {
  SceneMediaFraming,
  SceneMediaFramingFitMode,
  SceneMediaBackgroundTreatment,
} from "./media-framing.types";
import {
  MEDIA_FRAMING_POSITION_UI_MAX,
  MEDIA_FRAMING_POSITION_UI_MIN,
  normalizeSceneMediaBackgroundTreatment,
} from "./media-framing.types";

export const DEFAULT_SCENE_MEDIA_FRAMING: SceneMediaFraming = {
  fitMode: DEFAULT_IMAGE_FIT_MODE,
  positionX: 0,
  positionY: 0,
  zoom: DEFAULT_IMAGE_SCALE,
  rotationDeg: 0,
  backgroundTreatment: "none",
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
): Pick<
  SceneImage,
  "fitMode" | "x" | "y" | "scale" | "rotation" | "backgroundTreatment"
> {
  const treatment = normalizeSceneMediaBackgroundTreatment(
    framing.backgroundTreatment,
  );
  return {
    fitMode: framing.fitMode,
    x: framing.positionX,
    y: framing.positionY,
    scale: clampSceneImageScale(framing.zoom),
    rotation: framing.rotationDeg,
    ...(treatment === "blurred_fill" ? { backgroundTreatment: "blurred_fill" } : {}),
  };
}

function readBackgroundTreatment(input: {
  readonly imageTreatment?: unknown;
  readonly mediaTreatment?: unknown;
  readonly fitMode: SceneImageFitMode;
}): SceneMediaBackgroundTreatment {
  // Fill never carries Fit-with-background; clear silently for safety.
  if (input.fitMode === "fill") {
    return "none";
  }
  const fromImage = normalizeSceneMediaBackgroundTreatment(input.imageTreatment);
  if (fromImage === "blurred_fill") {
    return "blurred_fill";
  }
  return normalizeSceneMediaBackgroundTreatment(input.mediaTreatment);
}

function normalizeFraming(partial: Partial<SceneMediaFraming>): SceneMediaFraming {
  const fitMode = normalizeSceneImageFitMode(partial.fitMode);
  const treatment = normalizeSceneMediaBackgroundTreatment(
    partial.backgroundTreatment,
  );
  return {
    fitMode,
    positionX: finiteOr(partial.positionX, 0),
    positionY: finiteOr(partial.positionY, 0),
    zoom: clampSceneImageScale(finiteOr(partial.zoom, DEFAULT_IMAGE_SCALE)),
    rotationDeg: finiteOr(partial.rotationDeg, 0),
    // Treatment only applies with Fit geometry.
    backgroundTreatment: fitMode === "fit" ? treatment : "none",
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
    const fitMode = normalizeSceneImageFitMode(image.fitMode);
    return normalizeFraming({
      fitMode,
      positionX: image.x,
      positionY: image.y,
      zoom: image.scale,
      rotationDeg: image.rotation ?? 0,
      backgroundTreatment: readBackgroundTreatment({
        imageTreatment: image.backgroundTreatment,
        mediaTreatment: media?.backgroundTreatment,
        fitMode,
      }),
    });
  }

  if (media && (media.type === "video" || media.type === "image")) {
    const transform = media.transform;
    const fitMode = mapMediaFitToImageFit(
      media.fitMode,
      media.type === "video" ? "fill" : DEFAULT_IMAGE_FIT_MODE,
    );
    return normalizeFraming({
      fitMode,
      positionX: transform?.x,
      positionY: transform?.y,
      zoom: transform?.scale,
      rotationDeg: transform?.rotation,
      backgroundTreatment: readBackgroundTreatment({
        mediaTreatment: media.backgroundTreatment,
        fitMode,
      }),
    });
  }

  if (image) {
    const fitMode = normalizeSceneImageFitMode(image.fitMode);
    return normalizeFraming({
      fitMode,
      positionX: image.x,
      positionY: image.y,
      zoom: image.scale,
      rotationDeg: image.rotation ?? 0,
      backgroundTreatment: readBackgroundTreatment({
        imageTreatment: image.backgroundTreatment,
        fitMode,
      }),
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
    backgroundTreatment:
      patch.backgroundTreatment ?? current.backgroundTreatment,
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
