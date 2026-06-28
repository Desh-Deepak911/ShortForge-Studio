import { normalizeSceneCaptionSettings } from "./caption.utils";
import type {
  FootieScene,
  SceneImage,
  SceneImageFitMode,
  SceneImageMotion,
  SceneImageMotionIntensity,
  SceneImageMotionPreset,
  SceneImageMotionType,
} from "@/features/story/types";

export const DEFAULT_IMAGE_SCALE = 1;
export const MIN_SCENE_IMAGE_SCALE = 0.5;
export const MAX_SCENE_IMAGE_SCALE = 3;
export const DEFAULT_IMAGE_FIT_MODE: SceneImageFitMode = "fit";
export const DEFAULT_IMAGE_MOTION_TYPE: SceneImageMotionType = "none";
export const DEFAULT_IMAGE_MOTION_INTENSITY: SceneImageMotionIntensity = "subtle";

export const SCENE_IMAGE_MOTION_TYPE_OPTIONS: {
  value: SceneImageMotionType;
  label: string;
}[] = [
  { value: "none", label: "None" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
];

export const SCENE_IMAGE_MOTION_INTENSITY_OPTIONS: {
  value: SceneImageMotionIntensity;
  label: string;
}[] = [
  { value: "subtle", label: "Subtle" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

const SCENE_IMAGE_MOTION_PRESET_TYPES: readonly SceneImageMotionPreset[] = [
  "static",
  "slow-zoom-in",
  "slow-zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "pan-left-zoom-in",
  "pan-right-zoom-in",
  "pan-up-zoom-in",
  "pan-down-zoom-in",
];

const SCENE_IMAGE_MOTION_PRESET_TYPE_SET = new Set<string>(SCENE_IMAGE_MOTION_PRESET_TYPES);

/** Canonical 9:16 frame used to store pan offsets independent of preview/export size. */
export const SCENE_IMAGE_REFERENCE_WIDTH = 1080;
export const SCENE_IMAGE_REFERENCE_HEIGHT = 1920;

export type SceneImageTransformPatch = Partial<
  Pick<SceneImage, "scale" | "x" | "y" | "rotation" | "fitMode">
> & {
  imageMotion?: Partial<SceneImageMotion>;
};

/** Default image motion values for newly attached scene images. */
export function getDefaultImageMotion(): SceneImageMotion {
  return {
    type: DEFAULT_IMAGE_MOTION_TYPE,
    intensity: DEFAULT_IMAGE_MOTION_INTENSITY,
  };
}

export function normalizeSceneImageMotionType(value: unknown): SceneImageMotionType {
  if (value === "zoom-in" || value === "zoom-out" || value === "none") {
    return value;
  }

  if (typeof value === "string" && SCENE_IMAGE_MOTION_PRESET_TYPE_SET.has(value)) {
    return value as SceneImageMotionPreset;
  }

  return DEFAULT_IMAGE_MOTION_TYPE;
}

export function normalizeSceneImageMotionIntensity(
  value: unknown,
): SceneImageMotionIntensity {
  if (value === "medium" || value === "strong" || value === "subtle") {
    return value;
  }

  return DEFAULT_IMAGE_MOTION_INTENSITY;
}

export function normalizeSceneImageMotion(value: unknown): SceneImageMotion {
  if (!value || typeof value !== "object") {
    return getDefaultImageMotion();
  }

  const record = value as Record<string, unknown>;

  return {
    type: normalizeSceneImageMotionType(record.type),
    intensity: normalizeSceneImageMotionIntensity(record.intensity),
  };
}

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
  if (value === "fit") {
    return "fit";
  }

  if (value === "fill") {
    return "fill";
  }

  return DEFAULT_IMAGE_FIT_MODE;
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

/** Resets pan, zoom, and rotation while preserving URL, fit mode, and motion settings. */
export function resetSceneImageTransform(image: SceneImage): SceneImage {
  return {
    ...image,
    scale: DEFAULT_IMAGE_SCALE,
    x: 0,
    y: 0,
    rotation: 0,
    fitMode: normalizeSceneImageFitMode(image.fitMode),
    imageMotion: normalizeSceneImageMotion(image.imageMotion),
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
      imageMotion: getDefaultImageMotion(),
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
      imageMotion: normalizeSceneImageMotion(record.imageMotion),
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
      normalizeSceneImageFitMode(normalizedRight.fitMode) &&
    normalizeSceneImageMotion(normalizedLeft.imageMotion).type ===
      normalizeSceneImageMotion(normalizedRight.imageMotion).type &&
    normalizeSceneImageMotion(normalizedLeft.imageMotion).intensity ===
      normalizeSceneImageMotion(normalizedRight.imageMotion).intensity
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

  const { imageMotion: imageMotionPatch, ...transformPatch } = patch;

  return {
    ...current,
    ...transformPatch,
    ...(transformPatch.scale !== undefined
      ? { scale: clampSceneImageScale(transformPatch.scale) }
      : {}),
    ...(transformPatch.fitMode !== undefined
      ? { fitMode: normalizeSceneImageFitMode(transformPatch.fitMode) }
      : {}),
    ...(imageMotionPatch !== undefined
      ? {
          imageMotion: normalizeSceneImageMotion({
            ...normalizeSceneImageMotion(current.imageMotion),
            ...imageMotionPatch,
          }),
        }
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
export function updateSceneImageSettings(
  scenes: FootieScene[],
  sceneId: string,
  updates: SceneImageTransformPatch | SceneImage,
): FootieScene[] {
  return scenes.map((scene) => {
    if (scene.id !== sceneId) {
      return normalizeSceneSettings(scene);
    }

    const current = getSceneImage(scene);
    if (!current) {
      return normalizeSceneSettings(scene);
    }

    const nextImage =
      typeof updates === "object" && "url" in updates && typeof updates.url === "string"
        ? normalizeSceneImage(updates)
        : patchSceneImageTransform(scene, updates);

    if (!nextImage) {
      return normalizeSceneSettings(scene);
    }

    return normalizeSceneSettings({
      ...scene,
      image: nextImage,
    });
  });
}

/** Resets pan, zoom, and rotation for one scene image by id. */
export function resetSceneImageSettings(scenes: FootieScene[], sceneId: string): FootieScene[] {
  return scenes.map((scene) => {
    if (scene.id !== sceneId) {
      return normalizeSceneSettings(scene);
    }

    const current = getSceneImage(scene);
    if (!current) {
      return normalizeSceneSettings(scene);
    }

    return normalizeSceneSettings({
      ...scene,
      image: resetSceneImageTransform(current),
    });
  });
}

/** Patches transform metadata on a scene image without changing the URL. */
export function updateSceneImageTransform(
  scenes: FootieScene[],
  sceneId: string,
  transformPatch: SceneImageTransformPatch,
): FootieScene[] {
  return updateSceneImageSettings(scenes, sceneId, transformPatch);
}

/** CSS object-fit mode from normalized scene image data. */
export function getSceneImageObjectFit(image: SceneImage): "cover" | "contain" {
  return image.fitMode === "fit" ? "contain" : "cover";
}

/** Builds the CSS transform string: translate → scale → rotate. */
export function getSceneImageTransformCss(image: SceneImage, motionScale = 1): string {
  const rotation = image.rotation ?? 0;
  const scale = clampSceneImageScale(image.scale) * motionScale;
  return `translate(${image.x}px, ${image.y}px) scale(${scale}) rotate(${rotation}deg)`;
}

/** Inline styles for a transformed scene image inside a clipped frame. */
export function getSceneImageTransformStyle(
  image: SceneImage,
  frameWidth?: number,
  frameHeight?: number,
  motionScale = 1,
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
    transform: getSceneImageTransformCss(resolved, motionScale),
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

/** Draw transform override for timeline-driven image motion. */
export interface SceneImageDrawTransform {
  scale: number;
  translateX: number;
  translateY: number;
  rotation?: number;
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
  motionScale = 1,
  drawTransformOverride?: SceneImageDrawTransform,
): void {
  const resolved = resolveSceneImageTransformForFrame(image, frameWidth, frameHeight);
  const { drawWidth, drawHeight } = getSceneImageDrawDimensions(
    resolved,
    sourceWidth,
    sourceHeight,
    frameWidth,
    frameHeight,
  );
  const combinedScale = drawTransformOverride?.scale ?? resolved.scale * motionScale;
  const translateX = drawTransformOverride?.translateX ?? resolved.x;
  const translateY = drawTransformOverride?.translateY ?? resolved.y;
  const rotation = drawTransformOverride?.rotation ?? resolved.rotation ?? 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, frameWidth, frameHeight);
  ctx.clip();

  ctx.translate(frameWidth / 2 + translateX, frameHeight / 2 + translateY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(combinedScale, combinedScale);

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

/** Returns an independent copy of scene image settings (same URL, new object). */
export function cloneSceneImage(image: SceneImage): SceneImage {
  const normalized = normalizeSceneImage(image);
  if (!normalized) {
    throw new Error("Scene image URL is required");
  }
  return normalized;
}

export function normalizeSceneTiming(scenes: FootieScene[]): FootieScene[] {
  let cursor = 0;

  return scenes.map((scene) => {
    const duration = Math.max(1, scene.duration);
    const start = cursor;
    const end = start + duration;
    cursor = end;

    return {
      ...scene,
      start,
      end,
      duration,
    };
  });
}

const DEFAULT_SCENE_DURATION_MS = 1000;

export interface SceneTimingSlot {
  sceneId: string;
  index: number;
  startMs: number;
  endMs: number;
  durationMs: number;
}

/** Resolves one scene's playback duration from editor timing fields. */
export function resolveSceneDurationMsForTiming(scene: FootieScene): number {
  if (scene.durationMs != null && scene.durationMs > 0) {
    return scene.durationMs;
  }

  if (scene.duration != null && scene.duration > 0) {
    return Math.max(DEFAULT_SCENE_DURATION_MS, Math.round(scene.duration * 1000));
  }

  return DEFAULT_SCENE_DURATION_MS;
}

/** Builds sequential scene windows from current per-scene durations. */
export function getSceneTimingMap(scenes: FootieScene[]): SceneTimingSlot[] {
  let cursorMs = 0;

  return scenes.map((scene, index) => {
    const durationMs = resolveSceneDurationMsForTiming(scene);
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs;

    return {
      sceneId: scene.id,
      index,
      startMs,
      endMs,
      durationMs,
    };
  });
}

/** Returns the scene active at a timeline position based on accumulated durations. */
export function getActiveSceneAtTime(
  scenes: FootieScene[],
  currentTimeMs: number,
): SceneTimingSlot | null {
  const timingMap = getSceneTimingMap(scenes);
  if (timingMap.length === 0) {
    return null;
  }

  const clampedTimeMs = Math.max(0, currentTimeMs);

  for (let index = timingMap.length - 1; index >= 0; index--) {
    const slot = timingMap[index]!;
    if (clampedTimeMs >= slot.startMs) {
      return slot;
    }
  }

  return timingMap[0] ?? null;
}

/** Resolves active scene timing at a global playback position (preview + export). */
export function getSceneTimingAtGlobalTime(
  scenes: FootieScene[],
  currentTimeMs: number,
): {
  slot: SceneTimingSlot;
  sceneElapsedMs: number;
  sceneDurationMs: number;
} | null {
  const slot = getActiveSceneAtTime(scenes, currentTimeMs);
  if (!slot) {
    return null;
  }

  const clampedTimeMs = Math.max(0, currentTimeMs);
  const sceneElapsedMs = Math.min(
    slot.durationMs,
    Math.max(0, clampedTimeMs - slot.startMs),
  );

  return {
    slot,
    sceneElapsedMs,
    sceneDurationMs: slot.durationMs,
  };
}

export function getStoryTotalDuration(scenes: FootieScene[]): number {
  if (scenes.length === 0) {
    return 0;
  }

  const timingMap = getSceneTimingMap(scenes);
  const lastSlot = timingMap[timingMap.length - 1];
  if (lastSlot) {
    return lastSlot.endMs / 1000;
  }

  const lastScene = scenes[scenes.length - 1];
  if (lastScene.endMs != null && lastScene.endMs > 0) {
    return lastScene.endMs / 1000;
  }

  return lastScene.end;
}

export function getSceneDurationMs(scene: FootieScene | null | undefined): number {
  if (!scene) {
    return 1000;
  }

  if (scene.durationMs != null && scene.durationMs > 0) {
    return scene.durationMs;
  }

  return Math.max(1000, Math.round(Math.max(1, scene.duration ?? 1) * 1000));
}

export function getSceneStartMs(scene: FootieScene | null | undefined): number {
  if (!scene) {
    return 0;
  }

  if (scene.startMs != null && scene.startMs >= 0) {
    return scene.startMs;
  }

  return Math.round((scene.start ?? 0) * 1000);
}

export function getSceneEndMs(scene: FootieScene | null | undefined): number {
  if (!scene) {
    return 0;
  }

  if (scene.endMs != null && scene.endMs > 0) {
    return scene.endMs;
  }

  return getSceneStartMs(scene) + getSceneDurationMs(scene);
}

/** Elapsed milliseconds within a scene at a global timeline position. */
export function getSceneElapsedMs(currentTimeSec: number, scene: FootieScene): number {
  const sceneDurationMs = getSceneDurationMs(scene);
  const globalMs = currentTimeSec * 1000;

  return Math.min(sceneDurationMs, Math.max(0, globalMs - getSceneStartMs(scene)));
}

export function scenesHaveMsTiming(scenes: FootieScene[]): boolean {
  return (
    scenes.length > 0 &&
    scenes.every(
      (scene) =>
        scene.durationMs != null &&
        scene.durationMs > 0 &&
        scene.startMs != null &&
        scene.startMs >= 0 &&
        scene.endMs != null &&
        scene.endMs > 0,
    )
  );
}

export function getSceneIndexForTime(currentTimeSec: number, scenes: FootieScene[]): number {
  if (scenesHaveMsTiming(scenes)) {
    const currentTimeMs = currentTimeSec * 1000;

    for (let i = scenes.length - 1; i >= 0; i--) {
      if (currentTimeMs >= scenes[i].startMs!) {
        return i;
      }
    }

    return 0;
  }

  for (let i = scenes.length - 1; i >= 0; i--) {
    if (currentTimeSec >= scenes[i].start) {
      return i;
    }
  }

  return 0;
}
