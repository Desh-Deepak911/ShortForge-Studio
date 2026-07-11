/**
 * Preview motion adapter (4.2C-4).
 * Converts shared MediaMotionState numerics into CSS for the editor preview.
 * Does not ease, interpolate, or own motion math — that stays in media-motion.
 */
import {
  MEDIA_MOTION_IDENTITY_TRANSFORM,
  resolveMediaMotionStateForSceneTiming,
  resolveSceneMediaMotion,
  type MediaMotionState,
  type SceneMediaMotion,
  type SceneMediaTransform,
} from "@/features/media-motion";
import type { FootieScene, SceneImage, SceneMedia } from "@/features/story/types";
import { resolveSceneMediaFramingTransform } from "@/features/media-framing";
import {
  SCENE_IMAGE_REFERENCE_HEIGHT,
  SCENE_IMAGE_REFERENCE_WIDTH,
  withScreenDragOffset,
} from "@/features/story/utils";

/** CSS style produced from a resolved media motion state. */
export interface PreviewMotionStyle {
  transform: string;
  opacity: number;
  transformOrigin: "center center";
}

const NEUTRAL_PREVIEW_MOTION_STYLE: PreviewMotionStyle = {
  transform: "translate(0px, 0px) scale(1) rotate(0deg)",
  opacity: 1,
  transformOrigin: "center center",
};

/** Clamp scene-local elapsed time into [0, duration]. */
export function clampPreviewSceneLocalTimeMs(
  sceneLocalTimeMs: number,
  sceneDurationMs: number,
): number {
  const duration =
    Number.isFinite(sceneDurationMs) && sceneDurationMs > 0 ? sceneDurationMs : 0;
  if (!Number.isFinite(sceneLocalTimeMs)) {
    return 0;
  }
  return Math.min(duration, Math.max(0, sceneLocalTimeMs));
}

/**
 * Scene-local playback time from absolute timeline time.
 * Does not change scene or transition timing authority.
 */
export function resolvePreviewSceneLocalTimeMs(input: {
  timelineTimeMs: number;
  sceneStartMs: number;
  sceneDurationMs: number;
}): number {
  const start = Number.isFinite(input.sceneStartMs) ? input.sceneStartMs : 0;
  const timeline = Number.isFinite(input.timelineTimeMs) ? input.timelineTimeMs : 0;
  return clampPreviewSceneLocalTimeMs(timeline - start, input.sceneDurationMs);
}

/** Reference-frame base framing for preview motion (crop / pan / zoom / rotation). */
export function resolvePreviewMediaBaseTransform(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  options: {
    transformOffset?: { x: number; y: number };
    frameWidth?: number;
    frameHeight?: number;
    /** Prefer this media record when resolving video framing. */
    media?: SceneMedia | null;
  } = {},
): SceneMediaTransform {
  const frameWidth = options.frameWidth ?? 0;
  const frameHeight = options.frameHeight ?? 0;

  // Shared framing resolver — images prefer scene.image; videos use media.transform.
  const base = normalizeBaseTransform(
    resolveSceneMediaFramingTransform(scene, { media: options.media }),
  );

  if (!options.transformOffset || frameWidth <= 0 || frameHeight <= 0) {
    return base;
  }

  // Apply live drag offset in reference space (same as withScreenDragOffset).
  const asImage: SceneImage = {
    url: "",
    x: base.x,
    y: base.y,
    scale: base.scale,
    rotation: base.rotation ?? 0,
  };
  const framed = withScreenDragOffset(
    asImage,
    options.transformOffset,
    frameWidth,
    frameHeight,
  );
  return sceneImageToBaseTransform(framed);
}

function sceneImageToBaseTransform(image: SceneImage): SceneMediaTransform {
  return normalizeBaseTransform({
    x: image.x,
    y: image.y,
    scale: image.scale,
    rotation: image.rotation ?? 0,
  });
}

function normalizeBaseTransform(
  value: SceneMediaTransform | null | undefined,
): SceneMediaTransform {
  if (!value) {
    return { ...MEDIA_MOTION_IDENTITY_TRANSFORM };
  }
  const scale =
    typeof value.scale === "number" && Number.isFinite(value.scale) && value.scale > 0
      ? value.scale
      : 1;
  return {
    x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : 0,
    y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : 0,
    scale,
    rotation:
      typeof value.rotation === "number" && Number.isFinite(value.rotation)
        ? value.rotation
        : 0,
  };
}

/**
 * Convert resolved numeric motion into preview CSS.
 * Scales reference-frame x/y into the live preview frame.
 */
export function toPreviewMotionStyle(
  state: MediaMotionState,
  frameWidth = 0,
  frameHeight = 0,
): PreviewMotionStyle {
  const transform = state?.transform ?? MEDIA_MOTION_IDENTITY_TRANSFORM;
  const scale =
    typeof transform.scale === "number" &&
    Number.isFinite(transform.scale) &&
    transform.scale > 0
      ? transform.scale
      : 1;
  const rotation =
    typeof transform.rotation === "number" && Number.isFinite(transform.rotation)
      ? transform.rotation
      : 0;
  const x = typeof transform.x === "number" && Number.isFinite(transform.x) ? transform.x : 0;
  const y = typeof transform.y === "number" && Number.isFinite(transform.y) ? transform.y : 0;

  const hasFrame = frameWidth > 0 && frameHeight > 0;
  const screenX = hasFrame ? x * (frameWidth / SCENE_IMAGE_REFERENCE_WIDTH) : x;
  const screenY = hasFrame ? y * (frameHeight / SCENE_IMAGE_REFERENCE_HEIGHT) : y;

  return {
    transform: `translate(${screenX}px, ${screenY}px) scale(${scale}) rotate(${rotation}deg)`,
    // Shared engine has no opacity channel yet — neutral full opacity.
    opacity: 1,
    transformOrigin: "center center",
  };
}

export interface ResolvePreviewMediaMotionStyleInput {
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  frameWidth: number;
  frameHeight: number;
  transformOffset?: { x: number; y: number };
  /** Optional media override (video path). */
  media?: SceneMedia | null;
  /** Optional motion override (tests / diagnostics). */
  motion?: SceneMediaMotion | null;
}

/**
 * Resolve preview CSS for one scene sample via the shared motion engine.
 * Composition (base × motion delta) happens inside resolveMediaMotionState.
 */
export function resolvePreviewMediaMotionStyle(
  input: ResolvePreviewMediaMotionStyleInput,
): PreviewMotionStyle {
  const frameWidth = input.frameWidth > 0 ? input.frameWidth : 0;
  const frameHeight = input.frameHeight > 0 ? input.frameHeight : 0;

  if (frameWidth <= 0 || frameHeight <= 0) {
    return { ...NEUTRAL_PREVIEW_MOTION_STYLE, transform: "none" };
  }

  const motion =
    input.motion != null
      ? input.motion
      : resolveSceneMediaMotion(input.scene);
  const baseTransform = resolvePreviewMediaBaseTransform(input.scene, {
    transformOffset: input.transformOffset,
    frameWidth,
    frameHeight,
    media: input.media,
  });

  const state = resolveMediaMotionStateForSceneTiming({
    motion,
    baseTransform,
    sceneElapsedMs: clampPreviewSceneLocalTimeMs(
      input.sceneElapsedMs,
      input.sceneDurationMs,
    ),
    sceneDurationMs: input.sceneDurationMs,
  });

  return toPreviewMotionStyle(state, frameWidth, frameHeight);
}

/** Neutral style when motion is missing or inactive — matches pre-motion framing. */
export function getNeutralPreviewMotionStyle(
  baseTransform: SceneMediaTransform = MEDIA_MOTION_IDENTITY_TRANSFORM,
  frameWidth = 0,
  frameHeight = 0,
): PreviewMotionStyle {
  return toPreviewMotionStyle(
    {
      active: false,
      progress: 0,
      easedProgress: 0,
      transform: normalizeBaseTransform(baseTransform),
      presetId: "static",
    },
    frameWidth,
    frameHeight,
  );
}
