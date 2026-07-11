/**
 * Inspector category grouping — IDs only; labels come from MEDIA_MOTION_PRESETS.
 */
export interface MediaMotionInspectorCategory {
  id: string;
  label: string;
  presetIds: readonly string[];
}

/** UI categories for the shared Motion inspector (driven by registry IDs). */
export const MEDIA_MOTION_INSPECTOR_CATEGORIES: readonly MediaMotionInspectorCategory[] = [
  {
    id: "minimal",
    label: "Minimal",
    presetIds: ["static", "slow-zoom-in", "slow-zoom-out", "gentle-drift"],
  },
  {
    id: "directional",
    label: "Directional",
    presetIds: ["pan-left", "pan-right", "pan-up", "pan-down"],
  },
  {
    id: "sports",
    label: "Sports",
    presetIds: ["sports-punch", "impact-zoom"],
  },
  {
    id: "cinematic",
    label: "Cinematic",
    presetIds: ["push-in", "pull-out", "camera-drift", "handheld-drift"],
  },
  {
    id: "custom",
    label: "Custom",
    presetIds: ["custom"],
  },
] as const;

export const MEDIA_MOTION_EASING_OPTIONS = [
  { value: "linear", label: "Linear" },
  { value: "ease-in", label: "Ease In" },
  { value: "ease-out", label: "Ease Out" },
  { value: "ease-in-out", label: "Ease In Out" },
] as const;

export const MEDIA_MOTION_HELPER_COPY =
  "Motion affects Preview and Export equally. Story timing is unchanged.";

export const MEDIA_MOTION_INTENSITY_MIN = 0;
export const MEDIA_MOTION_INTENSITY_MAX = 2;
export const MEDIA_MOTION_INTENSITY_STEP = 0.05;
