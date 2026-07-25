/**
 * Export motion adapter (4.2C-5).
 * Converts shared MediaMotionState numerics into canvas draw units.
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
import { resolveSceneMediaFramingTransform } from "@/features/media-framing/resolve-scene-media-framing";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import {
  SCENE_IMAGE_REFERENCE_HEIGHT,
  SCENE_IMAGE_REFERENCE_WIDTH,
} from "@/features/story/utils/scene.utils";

/** Canvas-ready motion transform for export media draws. */
export interface ExportMotionTransform {
  translateX: number;
  translateY: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
  transformOrigin: { x: number; y: number };
  /** Composed reference-frame transform (parity / diagnostics). */
  referenceTransform: SceneMediaTransform;
  active: boolean;
  progress: number;
  easedProgress: number;
  presetId: string;
}

export interface ExportMediaMotionInput {
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  frameWidth: number;
  frameHeight: number;
  /** Optional media override (video path). */
  media?: SceneMedia | null;
  /** Optional motion override (tests). */
  motion?: SceneMediaMotion | null;
}

/** Clamp scene-local elapsed time into [0, duration]. */
export function clampExportSceneLocalTimeMs(
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
 * Scene-local export time from absolute timeline time.
 * Does not change scene or transition timing authority.
 */
export function resolveExportSceneLocalTimeMs(input: {
  timelineTimeMs: number;
  sceneStartMs: number;
  sceneDurationMs: number;
}): number {
  const start = Number.isFinite(input.sceneStartMs) ? input.sceneStartMs : 0;
  const timeline = Number.isFinite(input.timelineTimeMs) ? input.timelineTimeMs : 0;
  return clampExportSceneLocalTimeMs(timeline - start, input.sceneDurationMs);
}

/** Reference-frame base framing for export motion (crop / pan / zoom / rotation). */
export function resolveExportMediaBaseTransform(
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">,
  options: { media?: SceneMedia | null } = {},
): SceneMediaTransform {
  return normalizeBaseTransform(
    resolveSceneMediaFramingTransform(scene, { media: options.media }),
  );
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
 * Convert resolved numeric motion into export canvas units.
 * Scales reference-frame x/y into the output frame size.
 */
export function toExportMotionTransform(
  state: MediaMotionState,
  frameWidth: number,
  frameHeight: number,
): ExportMotionTransform {
  const transform = normalizeBaseTransform(
    state?.transform ?? MEDIA_MOTION_IDENTITY_TRANSFORM,
  );
  const hasFrame = frameWidth > 0 && frameHeight > 0;
  const translateX = hasFrame
    ? transform.x * (frameWidth / SCENE_IMAGE_REFERENCE_WIDTH)
    : transform.x;
  const translateY = hasFrame
    ? transform.y * (frameHeight / SCENE_IMAGE_REFERENCE_HEIGHT)
    : transform.y;

  return {
    translateX,
    translateY,
    scale: transform.scale,
    rotationDeg: transform.rotation ?? 0,
    // Shared engine has no opacity channel yet — neutral full opacity.
    opacity: 1,
    transformOrigin: { x: 0.5, y: 0.5 },
    referenceTransform: { ...transform },
    active: Boolean(state?.active),
    progress: typeof state?.progress === "number" ? state.progress : 0,
    easedProgress: typeof state?.easedProgress === "number" ? state.easedProgress : 0,
    presetId: state?.presetId ?? "static",
  };
}

/**
 * Resolve export canvas motion for one scene sample via the shared motion engine.
 * Composition (base × motion delta) happens inside resolveMediaMotionState.
 */
export function resolveExportMediaMotionTransform(
  input: ExportMediaMotionInput,
): ExportMotionTransform {
  const frameWidth = input.frameWidth > 0 ? input.frameWidth : 0;
  const frameHeight = input.frameHeight > 0 ? input.frameHeight : 0;

  const motion =
    input.motion != null ? input.motion : resolveSceneMediaMotion(input.scene);
  const baseTransform = resolveExportMediaBaseTransform(input.scene, {
    media: input.media,
  });

  const state = resolveMediaMotionStateForSceneTiming({
    motion,
    baseTransform,
    sceneElapsedMs: clampExportSceneLocalTimeMs(
      input.sceneElapsedMs,
      input.sceneDurationMs,
    ),
    sceneDurationMs: input.sceneDurationMs,
  });

  return toExportMotionTransform(state, frameWidth, frameHeight);
}

/** Draw override shape consumed by drawSceneImageInFrame / drawCanvasImageSource. */
export function toExportDrawTransformOverride(
  motion: ExportMotionTransform,
): {
  scale: number;
  translateX: number;
  translateY: number;
  rotation: number;
  opacity: number;
} {
  return {
    scale: motion.scale,
    translateX: motion.translateX,
    translateY: motion.translateY,
    rotation: motion.rotationDeg,
    opacity: motion.opacity,
  };
}
