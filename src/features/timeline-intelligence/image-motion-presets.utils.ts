import type { SceneImageMotion, SceneImageMotionIntensity } from "@/features/story/types";
import { SCENE_IMAGE_MOTION_INTENSITY_MAX_SCALE } from "@/features/story/utils/scene-image-motion.utils";
import { normalizeSceneImageMotion } from "@/features/story/utils/scene.utils";

/** Timeline-driven image motion presets (Phase 3B — renderer not wired yet). */
export type ImageMotionPreset =
  | "static"
  | "slow-zoom-in"
  | "slow-zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "pan-left-zoom-in"
  | "pan-right-zoom-in"
  | "pan-up-zoom-in"
  | "pan-down-zoom-in";

export const IMAGE_MOTION_PRESETS: readonly ImageMotionPreset[] = [
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
] as const;

export type ImageMotionProgressCurve = "linear";

export interface ImageMotionBaseTransform {
  scale: number;
  translateXPct: number;
  translateYPct: number;
}

export const IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT = 6;

export const IMAGE_MOTION_PRESET_LABELS: Record<ImageMotionPreset, string> = {
  static: "Static",
  "slow-zoom-in": "Slow Zoom In",
  "slow-zoom-out": "Slow Zoom Out",
  "pan-left": "Pan Left",
  "pan-right": "Pan Right",
  "pan-up": "Pan Up",
  "pan-down": "Pan Down",
  "pan-left-zoom-in": "Pan Left + Zoom",
  "pan-right-zoom-in": "Pan Right + Zoom",
  "pan-up-zoom-in": "Pan Up + Zoom",
  "pan-down-zoom-in": "Pan Down + Zoom",
};

const IMAGE_MOTION_PRESET_SET = new Set<string>(IMAGE_MOTION_PRESETS);

const IDENTITY_TRANSFORM: ImageMotionBaseTransform = {
  scale: 1,
  translateXPct: 0,
  translateYPct: 0,
};

function resolvePeakScale(intensity: SceneImageMotionIntensity): number {
  return SCENE_IMAGE_MOTION_INTENSITY_MAX_SCALE[intensity];
}

/** Maps editor image motion to a timeline preset (null = no motion event). */
export function resolveImageMotionPreset(imageMotion: SceneImageMotion): ImageMotionPreset | null {
  const normalized = normalizeSceneImageMotion(imageMotion);

  switch (normalized.type) {
    case "zoom-in":
      return "slow-zoom-in";
    case "zoom-out":
      return "slow-zoom-out";
    case "none":
      return null;
    default:
      if (IMAGE_MOTION_PRESET_SET.has(normalized.type)) {
        return normalized.type as ImageMotionPreset;
      }
      return null;
  }
}

/** Resolves base transform at motion progress 0 for a preset. */
export function resolveImageMotionBaseTransform(
  motionType: ImageMotionPreset,
  peakScale: number,
): ImageMotionBaseTransform {
  switch (motionType) {
    case "slow-zoom-out":
      return { scale: peakScale, translateXPct: 0, translateYPct: 0 };
    case "static":
    case "slow-zoom-in":
    case "pan-left":
    case "pan-right":
    case "pan-up":
    case "pan-down":
    case "pan-left-zoom-in":
    case "pan-right-zoom-in":
    case "pan-up-zoom-in":
    case "pan-down-zoom-in":
    default:
      return IDENTITY_TRANSFORM;
  }
}

export function isPanImageMotionPreset(motionType: ImageMotionPreset): boolean {
  return motionType.includes("pan-");
}

export function isZoomImageMotionPreset(motionType: ImageMotionPreset): boolean {
  return motionType === "slow-zoom-in" || motionType === "slow-zoom-out" || motionType.includes("-zoom-in");
}

export interface ResolveImageMotionScheduleInput {
  motionType: ImageMotionPreset;
  imageMotion: SceneImageMotion;
  panTravelPct?: number;
}

export interface ImageMotionSchedule {
  motionType: ImageMotionPreset;
  progressCurve: ImageMotionProgressCurve;
  baseTransform: ImageMotionBaseTransform;
  peakScale: number;
  panTravelPct: number;
}

/** Builds scheduling fields for one image motion preset. */
export function resolveImageMotionSchedule(
  input: ResolveImageMotionScheduleInput,
): ImageMotionSchedule {
  const imageMotion = normalizeSceneImageMotion(input.imageMotion);
  const peakScale = resolvePeakScale(imageMotion.intensity);
  const panTravelPct = input.panTravelPct ?? IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT;

  return {
    motionType: input.motionType,
    progressCurve: "linear",
    baseTransform: resolveImageMotionBaseTransform(input.motionType, peakScale),
    peakScale,
    panTravelPct,
  };
}
