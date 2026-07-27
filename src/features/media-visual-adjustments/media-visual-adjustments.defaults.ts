import type { ResolvedSceneMediaVisualAdjustments } from "./media-visual-adjustments.types";

export const MEDIA_VISUAL_ADJUSTMENT_MIN_PERCENT = 0;
export const MEDIA_VISUAL_ADJUSTMENT_MAX_PERCENT = 200;
export const MEDIA_VISUAL_SHADOW_MAX_BLUR = 48;
export const MEDIA_VISUAL_SHADOW_MAX_OFFSET = 48;
export const MEDIA_VISUAL_REFERENCE_WIDTH = 1080;

export const DEFAULT_MEDIA_VISUAL_ADJUSTMENTS: ResolvedSceneMediaVisualAdjustments = {
  version: 1,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  shadowEnabled: false,
  shadowColor: "#000000",
  shadowOpacity: 0.35,
  shadowBlur: 16,
  shadowOffsetX: 0,
  shadowOffsetY: 8,
};
