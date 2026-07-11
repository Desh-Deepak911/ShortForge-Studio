/**
 * Config-only media motion preset registry (4.2C-2).
 * Presets define deltas; the engine interpolates. No renderer code.
 */
import type { MediaMotionPresetDefinition } from "./media-motion.types";
import { MEDIA_MOTION_IDENTITY_TRANSFORM } from "./media-motion.types";

/** Matches legacy IMAGE_MOTION_DEFAULT_PAN_TRAVEL_PCT = 6. */
export const MEDIA_MOTION_DEFAULT_PAN_TRAVEL_PCT = 6;

/** Max zoom delta at intensity 1 — matches legacy strong peak (1.16). */
export const MEDIA_MOTION_MAX_ZOOM_DELTA = 0.16;

/** Reference frame for pan deltas — matches SCENE_IMAGE_REFERENCE_* (no scene.utils import). */
const REFERENCE_WIDTH = 1080;
const REFERENCE_HEIGHT = 1920;

const PAN_X = (MEDIA_MOTION_DEFAULT_PAN_TRAVEL_PCT / 100) * REFERENCE_WIDTH;
const PAN_Y = (MEDIA_MOTION_DEFAULT_PAN_TRAVEL_PCT / 100) * REFERENCE_HEIGHT;

/** Full-strength zoom peak scale (intensity 1). */
export const MEDIA_MOTION_PEAK_SCALE = 1 + MEDIA_MOTION_MAX_ZOOM_DELTA;

function delta(
  partial: Partial<typeof MEDIA_MOTION_IDENTITY_TRANSFORM>,
): typeof MEDIA_MOTION_IDENTITY_TRANSFORM {
  return {
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    scale: partial.scale ?? 1,
    rotation: partial.rotation ?? 0,
  };
}

/**
 * Shared preset registry — includes legacy image presets plus Sprint 5 expansions.
 * New presets are available to the engine; UI wiring comes in later phases.
 */
export const MEDIA_MOTION_PRESETS: readonly MediaMotionPresetDefinition[] = [
  {
    id: "static",
    label: "Static",
    category: "minimal",
    defaultEasing: "linear",
    defaultIntensity: 0,
    startDelta: delta({}),
    endDelta: delta({}),
  },
  {
    id: "slow-zoom-in",
    label: "Slow Zoom In",
    category: "minimal",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({ scale: 1 }),
    endDelta: delta({ scale: MEDIA_MOTION_PEAK_SCALE }),
  },
  {
    id: "slow-zoom-out",
    label: "Slow Zoom Out",
    category: "minimal",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({ scale: MEDIA_MOTION_PEAK_SCALE }),
    endDelta: delta({ scale: 1 }),
  },
  {
    id: "gentle-drift",
    label: "Gentle Drift",
    category: "minimal",
    defaultEasing: "ease-in-out",
    defaultIntensity: 0.65,
    startDelta: delta({}),
    endDelta: delta({ x: PAN_X * 0.4, y: -PAN_Y * 0.15, scale: 1.03 }),
  },
  {
    id: "pan-left",
    label: "Pan Left",
    category: "directional",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({ x: PAN_X }),
  },
  {
    id: "pan-right",
    label: "Pan Right",
    category: "directional",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({ x: -PAN_X }),
  },
  {
    id: "pan-up",
    label: "Pan Up",
    category: "directional",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({ y: PAN_Y }),
  },
  {
    id: "pan-down",
    label: "Pan Down",
    category: "directional",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({ y: -PAN_Y }),
  },
  {
    id: "pan-left-zoom-in",
    label: "Pan Left + Zoom",
    category: "directional",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({ x: PAN_X, scale: MEDIA_MOTION_PEAK_SCALE }),
  },
  {
    id: "pan-right-zoom-in",
    label: "Pan Right + Zoom",
    category: "directional",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({ x: -PAN_X, scale: MEDIA_MOTION_PEAK_SCALE }),
  },
  {
    id: "pan-up-zoom-in",
    label: "Pan Up + Zoom",
    category: "directional",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({ y: PAN_Y, scale: MEDIA_MOTION_PEAK_SCALE }),
  },
  {
    id: "pan-down-zoom-in",
    label: "Pan Down + Zoom",
    category: "directional",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({ y: -PAN_Y, scale: MEDIA_MOTION_PEAK_SCALE }),
  },
  {
    id: "push-in",
    label: "Push In",
    category: "cinematic",
    defaultEasing: "ease-in-out",
    defaultIntensity: 1,
    startDelta: delta({ scale: 1 }),
    endDelta: delta({ scale: 1.12 }),
  },
  {
    id: "pull-out",
    label: "Pull Out",
    category: "cinematic",
    defaultEasing: "ease-in-out",
    defaultIntensity: 1,
    startDelta: delta({ scale: 1.12 }),
    endDelta: delta({ scale: 1 }),
  },
  {
    id: "sports-punch",
    label: "Sports Punch",
    category: "sports",
    defaultEasing: "ease-out",
    defaultIntensity: 1,
    startDelta: delta({ scale: 1 }),
    endDelta: delta({ scale: 1.18, y: -PAN_Y * 0.35 }),
  },
  {
    id: "impact-zoom",
    label: "Impact Zoom",
    category: "sports",
    defaultEasing: "ease-out",
    defaultIntensity: 1,
    startDelta: delta({ scale: 1 }),
    endDelta: delta({ scale: 1.22 }),
  },
  {
    id: "camera-drift",
    label: "Camera Drift",
    category: "cinematic",
    defaultEasing: "ease-in-out",
    defaultIntensity: 0.7,
    startDelta: delta({}),
    endDelta: delta({ x: PAN_X * 0.55, y: -PAN_Y * 0.25, scale: 1.04 }),
  },
  {
    id: "handheld-drift",
    label: "Handheld Drift",
    category: "cinematic",
    defaultEasing: "ease-in-out",
    defaultIntensity: 0.55,
    startDelta: delta({ rotation: -0.4 }),
    endDelta: delta({ x: PAN_X * 0.35, y: PAN_Y * 0.2, scale: 1.03, rotation: 0.4 }),
  },
  {
    id: "custom",
    label: "Custom",
    category: "custom",
    defaultEasing: "linear",
    defaultIntensity: 1,
    startDelta: delta({}),
    endDelta: delta({}),
  },
] as const;

const PRESET_BY_ID = new Map(
  MEDIA_MOTION_PRESETS.map((preset) => [preset.id, preset] as const),
);

export function getMediaMotionPreset(
  presetId: string | null | undefined,
): MediaMotionPresetDefinition {
  if (presetId && PRESET_BY_ID.has(presetId)) {
    return PRESET_BY_ID.get(presetId)!;
  }
  return PRESET_BY_ID.get("static")!;
}

export function listMediaMotionPresetIds(): string[] {
  return MEDIA_MOTION_PRESETS.map((preset) => preset.id);
}
