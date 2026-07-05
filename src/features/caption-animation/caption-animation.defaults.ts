import { FADE_UP_DURATION_MS } from "@/features/story/utils/subtitle-effect.utils";

import type { CaptionAnimation, CaptionAnimationPreset } from "./caption-animation.types";
import { CAPTION_ANIMATION_VERSION } from "./caption-animation.types";

export const DEFAULT_CAPTION_ANIMATION_PRESET: CaptionAnimationPreset = "fade";

export const CAPTION_ANIMATION_DURATION_MIN_MS = 200;
export const CAPTION_ANIMATION_DURATION_MAX_MS = 2000;
export const CAPTION_ANIMATION_DURATION_DEFAULT_MS = FADE_UP_DURATION_MS;

export const CAPTION_ANIMATION_DELAY_MIN_MS = 0;
export const CAPTION_ANIMATION_DELAY_MAX_MS = 1000;
export const CAPTION_ANIMATION_DELAY_DEFAULT_MS = 0;

export const CAPTION_ANIMATION_INTENSITY_MIN = 0;
export const CAPTION_ANIMATION_INTENSITY_MAX = 100;
export const CAPTION_ANIMATION_INTENSITY_DEFAULT = 100;

export const DEFAULT_CAPTION_ANIMATION: CaptionAnimation = {
  version: CAPTION_ANIMATION_VERSION,
  preset: DEFAULT_CAPTION_ANIMATION_PRESET,
  delayMs: CAPTION_ANIMATION_DELAY_DEFAULT_MS,
  direction: "normal",
  intensity: CAPTION_ANIMATION_INTENSITY_DEFAULT,
};
