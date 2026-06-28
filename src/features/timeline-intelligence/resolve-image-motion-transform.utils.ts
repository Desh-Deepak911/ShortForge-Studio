import type { SceneImage } from "@/features/story/types";
import {
  resolveSceneImageTransformForFrame,
  SCENE_IMAGE_REFERENCE_HEIGHT,
  SCENE_IMAGE_REFERENCE_WIDTH,
} from "@/features/story/utils/scene.utils";

import {
  IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT,
  type ImageMotionBaseTransform,
  type ImageMotionPreset,
} from "./image-motion-presets.utils";
import type { ImageMotionTimelineEvent } from "./timeline.types";
import { getTimelineProgress } from "./timeline-playback.utils";

/** Fit/fill/crop framing base passed into the motion resolver. */
export interface ImageMotionSceneBaseTransform {
  scale: number;
  translateX: number;
  translateY: number;
  rotation?: number;
}

export interface ResolveImageMotionTransformInput {
  event: ImageMotionTimelineEvent;
  timeMs: number;
  baseTransform: ImageMotionSceneBaseTransform;
  frameWidth?: number;
  frameHeight?: number;
}

export interface ImageMotionTransformState {
  scale: number;
  translateX: number;
  translateY: number;
  transform: string;
  progress: number;
}

export interface TimelineImageMotionInput {
  event: ImageMotionTimelineEvent;
  timeMs: number;
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function resolveMotionEndTransform(
  motionType: ImageMotionPreset,
  peakScale: number,
  panTravelPct: number,
): ImageMotionBaseTransform {
  switch (motionType) {
    case "slow-zoom-in":
      return { scale: peakScale, translateXPct: 0, translateYPct: 0 };
    case "slow-zoom-out":
      return { scale: 1, translateXPct: 0, translateYPct: 0 };
    case "pan-left":
      return { scale: 1, translateXPct: panTravelPct, translateYPct: 0 };
    case "pan-right":
      return { scale: 1, translateXPct: -panTravelPct, translateYPct: 0 };
    case "pan-up":
      return { scale: 1, translateXPct: 0, translateYPct: panTravelPct };
    case "pan-down":
      return { scale: 1, translateXPct: 0, translateYPct: -panTravelPct };
    case "pan-left-zoom-in":
      return { scale: peakScale, translateXPct: panTravelPct, translateYPct: 0 };
    case "pan-right-zoom-in":
      return { scale: peakScale, translateXPct: -panTravelPct, translateYPct: 0 };
    case "pan-up-zoom-in":
      return { scale: peakScale, translateXPct: 0, translateYPct: panTravelPct };
    case "pan-down-zoom-in":
      return { scale: peakScale, translateXPct: 0, translateYPct: -panTravelPct };
    case "static":
    default:
      return { scale: 1, translateXPct: 0, translateYPct: 0 };
  }
}

function buildTransformString(
  translateX: number,
  translateY: number,
  scale: number,
  rotation = 0,
): string {
  return `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotation}deg)`;
}

/** Builds scene framing base transform from fit/fill/crop metadata for one frame size. */
export function resolveImageMotionSceneBaseTransform(
  image: SceneImage,
  frameWidth = SCENE_IMAGE_REFERENCE_WIDTH,
  frameHeight = SCENE_IMAGE_REFERENCE_HEIGHT,
): ImageMotionSceneBaseTransform {
  const resolved = resolveSceneImageTransformForFrame(image, frameWidth, frameHeight);

  return {
    scale: resolved.scale,
    translateX: resolved.x,
    translateY: resolved.y,
    rotation: resolved.rotation ?? 0,
  };
}

/** Shared preview/export image motion transform from a timeline event and absolute time. */
export function resolveImageMotionTransform(
  input: ResolveImageMotionTransformInput,
): ImageMotionTransformState {
  const { event, timeMs, baseTransform } = input;
  const frameWidth = input.frameWidth ?? SCENE_IMAGE_REFERENCE_WIDTH;
  const frameHeight = input.frameHeight ?? SCENE_IMAGE_REFERENCE_HEIGHT;
  const meta = event.metadata;
  const timelineProgress = getTimelineProgress(event, timeMs);
  const progress = timelineProgress.progress;

  const peakScale = meta.peakScale ?? meta.baseTransform.scale;
  const panTravelPct = meta.panTravelPct ?? IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT;
  const motionStart = meta.baseTransform;
  const motionEnd = resolveMotionEndTransform(meta.motionType, peakScale, panTravelPct);

  const motionScale = lerp(motionStart.scale, motionEnd.scale, progress);
  const motionTranslateXPct = lerp(motionStart.translateXPct, motionEnd.translateXPct, progress);
  const motionTranslateYPct = lerp(motionStart.translateYPct, motionEnd.translateYPct, progress);

  const motionTranslateX = (motionTranslateXPct / 100) * frameWidth;
  const motionTranslateY = (motionTranslateYPct / 100) * frameHeight;

  const scale = baseTransform.scale * motionScale;
  const translateX = baseTransform.translateX + motionTranslateX;
  const translateY = baseTransform.translateY + motionTranslateY;
  const rotation = baseTransform.rotation ?? 0;

  return {
    scale,
    translateX,
    translateY,
    transform: buildTransformString(translateX, translateY, scale, rotation),
    progress,
  };
}

/** Resolves preview/export image motion for one scene image and timeline event. */
export function resolveSceneImageMotionTransformState(
  sceneImage: SceneImage,
  imageMotion: TimelineImageMotionInput | null | undefined,
  frameWidth: number,
  frameHeight: number,
): ImageMotionTransformState | null {
  if (!imageMotion) {
    return null;
  }

  const baseTransform = resolveImageMotionSceneBaseTransform(sceneImage, frameWidth, frameHeight);

  return resolveImageMotionTransform({
    event: imageMotion.event,
    timeMs: imageMotion.timeMs,
    baseTransform,
    frameWidth,
    frameHeight,
  });
}
