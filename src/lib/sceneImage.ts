import { normalizeSceneCaptionSettings } from "@/lib/captionMode";
import type { FootieScene, SceneImage, SceneImageFitMode } from "@/types/footiebitz";

export const DEFAULT_IMAGE_SCALE = 1;
export const MIN_SCENE_IMAGE_SCALE = 0.5;
export const MAX_SCENE_IMAGE_SCALE = 3;
export const DEFAULT_IMAGE_FIT_MODE: SceneImageFitMode = "fill";

/** Canonical 9:16 frame used to store pan offsets independent of preview/export size. */
export const SCENE_IMAGE_REFERENCE_WIDTH = 1080;
export const SCENE_IMAGE_REFERENCE_HEIGHT = 1920;

export type SceneImageTransformPatch = Partial<
  Pick<SceneImage, "scale" | "x" | "y" | "rotation" | "fitMode">
>;

/** Default pan/zoom values for a newly attached scene image. */
export function getDefaultImageTransform(): Pick<
  SceneImage,
  "scale" | "x" | "y" | "rotation" | "fitMode"
> {
  return {
    scale: DEFAULT_IMAGE_SCALE,
    x: 0,
    y: 0,
    rotation: 0,
    fitMode: DEFAULT_IMAGE_FIT_MODE,
  };
}

export function clampSceneImageScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return DEFAULT_IMAGE_SCALE;
  }

  return Math.min(MAX_SCENE_IMAGE_SCALE, Math.max(MIN_SCENE_IMAGE_SCALE, scale));
}

/** Maps a pan/zoom axis from reference space into a target frame size. */
export function scaleSceneImageAxisForFrame(
  value: number,
  frameSize: number,
  referenceSize: number,
): number {
  if (!Number.isFinite(value) || frameSize <= 0 || referenceSize <= 0) {
    return 0;
  }

  return value * (frameSize / referenceSize);
}

/** Maps screen-space pan from a UI frame into reference-space storage. */
export function sceneImagePanToReferenceSpace(
  panX: number,
  panY: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number } {
  return {
    x: scaleSceneImageAxisForFrame(panX, SCENE_IMAGE_REFERENCE_WIDTH, frameWidth),
    y: scaleSceneImageAxisForFrame(panY, SCENE_IMAGE_REFERENCE_HEIGHT, frameHeight),
  };
}

/** Resolves stored transform metadata for a specific render frame. */
export function resolveSceneImageTransformForFrame(
  image: SceneImage,
  frameWidth: number,
  frameHeight: number,
): SceneImage {
  return {
    ...image,
    scale: clampSceneImageScale(image.scale),
    x: scaleSceneImageAxisForFrame(image.x, frameWidth, SCENE_IMAGE_REFERENCE_WIDTH),
    y: scaleSceneImageAxisForFrame(image.y, frameHeight, SCENE_IMAGE_REFERENCE_HEIGHT),
    rotation: image.rotation ?? 0,
    fitMode: normalizeSceneImageFitMode(image.fitMode),
  };
}

export function normalizeSceneImageFitMode(value: unknown): SceneImageFitMode {
  return value === "fit" ? "fit" : DEFAULT_IMAGE_FIT_MODE;
}

/** Switches fit mode and clears pan offset so the new framing starts centered. */
export function applySceneImageFitMode(
  image: SceneImage,
  fitMode: SceneImageFitMode,
): SceneImage {
  return {
    ...image,
    fitMode: normalizeSceneImageFitMode(fitMode),
    x: 0,
    y: 0,
  };
}

/** Resets pan, zoom, and rotation while preserving URL and fit mode. */
export function resetSceneImageTransform(image: SceneImage): SceneImage {
  return {
    ...image,
    scale: DEFAULT_IMAGE_SCALE,
    x: 0,
    y: 0,
    rotation: 0,
    fitMode: normalizeSceneImageFitMode(image.fitMode),
  };
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Normalizes legacy string URLs and partial image objects into `SceneImage`.
 * Returns `undefined` when no usable URL is present.
 */
export function normalizeSceneImage(image: unknown, legacyUrl?: string): SceneImage | undefined {
  if (typeof image === "string") {
    const url = image.trim();
    if (!url) {
      return undefined;
    }

    return {
      url,
      ...getDefaultImageTransform(),
    };
  }

  if (image && typeof image === "object") {
    const record = image as Record<string, unknown>;
    const url =
      typeof record.url === "string"
        ? record.url.trim()
        : typeof legacyUrl === "string"
          ? legacyUrl.trim()
          : "";

    if (!url) {
      return undefined;
    }

    const defaults = getDefaultImageTransform();

    return {
      url,
      scale: clampSceneImageScale(normalizeNumber(record.scale, defaults.scale)),
      x: normalizeNumber(record.x, defaults.x),
      y: normalizeNumber(record.y, defaults.y),
      rotation: normalizeNumber(record.rotation, 0),
      fitMode: normalizeSceneImageFitMode(record.fitMode ?? defaults.fitMode),
    };
  }

  if (typeof legacyUrl === "string") {
    return normalizeSceneImage(legacyUrl);
  }

  return undefined;
}

/** Returns the image URL for display/export, supporting legacy `uploadedImage`. */
export function getSceneImageUrl(scene: Pick<FootieScene, "image" | "uploadedImage">): string | undefined {
  return normalizeSceneImage(scene.image, scene.uploadedImage)?.url;
}

/** Returns the normalized scene image, if any. */
export function getSceneImage(scene: Pick<FootieScene, "image" | "uploadedImage">): SceneImage | undefined {
  return normalizeSceneImage(scene.image, scene.uploadedImage);
}

export function sceneHasImage(scene: Pick<FootieScene, "image" | "uploadedImage">): boolean {
  return Boolean(getSceneImageUrl(scene));
}

export function sceneImagesEqual(
  left: Pick<FootieScene, "image" | "uploadedImage">,
  right: Pick<FootieScene, "image" | "uploadedImage">,
): boolean {
  const normalizedLeft = getSceneImage(left);
  const normalizedRight = getSceneImage(right);

  if (!normalizedLeft && !normalizedRight) {
    return true;
  }

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft.url === normalizedRight.url &&
    normalizedLeft.scale === normalizedRight.scale &&
    normalizedLeft.x === normalizedRight.x &&
    normalizedLeft.y === normalizedRight.y &&
    (normalizedLeft.rotation ?? 0) === (normalizedRight.rotation ?? 0) &&
    normalizeSceneImageFitMode(normalizedLeft.fitMode) ===
      normalizeSceneImageFitMode(normalizedRight.fitMode)
  );
}

/** Applies a transform patch to a scene's image, if present. */
export function patchSceneImageTransform(
  scene: Pick<FootieScene, "image" | "uploadedImage">,
  patch: SceneImageTransformPatch,
): SceneImage | undefined {
  const current = getSceneImage(scene);
  if (!current) {
    return undefined;
  }

  return {
    ...current,
    ...patch,
    ...(patch.scale !== undefined
      ? { scale: clampSceneImageScale(patch.scale) }
      : {}),
    ...(patch.fitMode !== undefined
      ? { fitMode: normalizeSceneImageFitMode(patch.fitMode) }
      : {}),
  };
}

/** Adds a screen-space drag delta to stored reference-space pan values. */
export function applyReferencePanFromScreenDelta(
  originX: number,
  originY: number,
  screenDeltaX: number,
  screenDeltaY: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number } {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return { x: originX + screenDeltaX, y: originY + screenDeltaY };
  }

  const referenceDelta = sceneImagePanToReferenceSpace(
    screenDeltaX,
    screenDeltaY,
    frameWidth,
    frameHeight,
  );

  return {
    x: originX + referenceDelta.x,
    y: originY + referenceDelta.y,
  };
}

/** Applies a live screen-space drag offset on top of stored reference-space pan. */
export function withScreenDragOffset(
  image: SceneImage,
  screenOffset: { x: number; y: number },
  frameWidth: number,
  frameHeight: number,
): SceneImage {
  if (frameWidth <= 0 || frameHeight <= 0) {
    return {
      ...image,
      x: image.x + screenOffset.x,
      y: image.y + screenOffset.y,
    };
  }

  const referenceOffset = sceneImagePanToReferenceSpace(
    screenOffset.x,
    screenOffset.y,
    frameWidth,
    frameHeight,
  );

  return {
    ...image,
    x: image.x + referenceOffset.x,
    y: image.y + referenceOffset.y,
  };
}

/** Resolves scene image metadata for export, including legacy string URLs. */
export function resolveExportSceneImage(
  scene: Pick<FootieScene, "image" | "uploadedImage">,
): SceneImage | undefined {
  return getSceneImage(scene) ?? normalizeSceneImage(getSceneImageUrl(scene));
}

/** Migrates legacy `uploadedImage` strings to `image` and applies transform defaults. */
export function normalizeSceneImageSettings(scene: FootieScene): FootieScene {
  const image = normalizeSceneImage(scene.image, scene.uploadedImage);

  if (!image) {
    const { uploadedImage: legacyUrl, image: existingImage, ...rest } = scene;
    void legacyUrl;
    void existingImage;
    return rest;
  }

  const { uploadedImage: legacyUrl, ...rest } = scene;
  void legacyUrl;
  return { ...rest, image };
}

/** Applies caption + image normalization for load/sync paths. */
export function normalizeSceneSettings(scene: FootieScene): FootieScene {
  return normalizeSceneImageSettings(normalizeSceneCaptionSettings(scene));
}

/** Patches transform metadata on a scene image without changing the URL. */
export function updateSceneImageTransform(
  scenes: FootieScene[],
  sceneId: string,
  transformPatch: SceneImageTransformPatch,
): FootieScene[] {
  return scenes.map((scene) => {
    if (scene.id !== sceneId) {
      return normalizeSceneSettings(scene);
    }

    const current = getSceneImage(scene);
    if (!current) {
      return normalizeSceneSettings(scene);
    }

    const patched = patchSceneImageTransform(scene, transformPatch);
    if (!patched) {
      return normalizeSceneSettings(scene);
    }

    return normalizeSceneSettings({
      ...scene,
      image: patched,
    });
  });
}

/** CSS object-fit mode from normalized scene image data. */
export function getSceneImageObjectFit(image: SceneImage): "cover" | "contain" {
  return image.fitMode === "fit" ? "contain" : "cover";
}

/** Builds the CSS transform string: translate → scale → rotate. */
export function getSceneImageTransformCss(image: SceneImage): string {
  const rotation = image.rotation ?? 0;
  const scale = clampSceneImageScale(image.scale);
  return `translate(${image.x}px, ${image.y}px) scale(${scale}) rotate(${rotation}deg)`;
}

/** Inline styles for a transformed scene image inside a clipped frame. */
export function getSceneImageTransformStyle(
  image: SceneImage,
  frameWidth?: number,
  frameHeight?: number,
): {
  transform: string;
  transformOrigin: "center center";
} {
  const resolved =
    frameWidth && frameHeight && frameWidth > 0 && frameHeight > 0
      ? resolveSceneImageTransformForFrame(image, frameWidth, frameHeight)
      : {
          ...image,
          scale: clampSceneImageScale(image.scale),
          rotation: image.rotation ?? 0,
          fitMode: normalizeSceneImageFitMode(image.fitMode),
        };

  return {
    transform: getSceneImageTransformCss(resolved),
    transformOrigin: "center center",
  };
}

export interface SceneImageDrawDimensions {
  drawWidth: number;
  drawHeight: number;
}

/** Cover dimensions for drawing a bitmap inside a frame (default visual). */
export function getSceneImageCoverDimensions(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): SceneImageDrawDimensions {
  const imageRatio = imageWidth / imageHeight;
  const frameRatio = frameWidth / frameHeight;

  if (imageRatio > frameRatio) {
    const drawHeight = frameHeight;
    return { drawWidth: drawHeight * imageRatio, drawHeight };
  }

  const drawWidth = frameWidth;
  return { drawWidth, drawHeight: drawWidth / imageRatio };
}

/** Contain dimensions for `fitMode: "fit"`. */
export function getSceneImageContainDimensions(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): SceneImageDrawDimensions {
  const imageRatio = imageWidth / imageHeight;
  const frameRatio = frameWidth / frameHeight;

  if (imageRatio > frameRatio) {
    const drawWidth = frameWidth;
    return { drawWidth, drawHeight: drawWidth / imageRatio };
  }

  const drawHeight = frameHeight;
  return { drawWidth: drawHeight * imageRatio, drawHeight };
}

export function getSceneImageDrawDimensions(
  image: SceneImage,
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): SceneImageDrawDimensions {
  if (getSceneImageObjectFit(image) === "contain") {
    return getSceneImageContainDimensions(imageWidth, imageHeight, frameWidth, frameHeight);
  }

  return getSceneImageCoverDimensions(imageWidth, imageHeight, frameWidth, frameHeight);
}

/** Draws a scene image inside a clipped frame using normalized transform metadata. */
export function drawSceneImageInFrame(
  ctx: CanvasRenderingContext2D,
  bitmap: CanvasImageSource,
  frameWidth: number,
  frameHeight: number,
  image: SceneImage,
  sourceWidth: number,
  sourceHeight: number,
): void {
  const resolved = resolveSceneImageTransformForFrame(image, frameWidth, frameHeight);
  const { drawWidth, drawHeight } = getSceneImageDrawDimensions(
    resolved,
    sourceWidth,
    sourceHeight,
    frameWidth,
    frameHeight,
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, frameWidth, frameHeight);
  ctx.clip();

  ctx.translate(frameWidth / 2 + resolved.x, frameHeight / 2 + resolved.y);
  ctx.rotate(((resolved.rotation ?? 0) * Math.PI) / 180);
  ctx.scale(resolved.scale, resolved.scale);

  ctx.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

/** Creates a scene image from a newly uploaded URL with default transform values. */
export function createSceneImageFromUrl(url: string): SceneImage {
  const normalized = normalizeSceneImage(url);
  if (!normalized) {
    throw new Error("Scene image URL is required");
  }
  return normalized;
}
