import type { CaptionAnchor, CaptionLayout, CaptionSafeAreaInsets } from "./caption-layout.types";
import { CAPTION_LAYOUT_VERSION } from "./caption-layout.types";

/** Reference frame shared by preview and export (1080×1920 vertical). */
export const CAPTION_LAYOUT_REFERENCE_WIDTH = 1080;
export const CAPTION_LAYOUT_REFERENCE_HEIGHT = 1920;

/** Matches export `height - 320 * scale` on the reference frame. */
export const LEGACY_EXPORT_BOTTOM_MARGIN_PX = 320;

/** Matches legacy percent anchor for bottom-center preset. */
export const LEGACY_BOTTOM_CENTER_Y_PERCENT = 83.33;

export const DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY = 65;
export const DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY = 45;

/** Default safe margins — fractions of canvas width/height. */
export const DEFAULT_CAPTION_SAFE_AREA: CaptionSafeAreaInsets = {
  top: 0.05,
  bottom: 0.08,
  left: 0.06,
  right: 0.06,
};

/** Slider ranges for caption layout offsets (reference-frame pixels). */
export const CAPTION_OFFSET_X_MIN_PX = -300;
export const CAPTION_OFFSET_X_MAX_PX = 300;
export const CAPTION_OFFSET_Y_MIN_PX = -500;
export const CAPTION_OFFSET_Y_MAX_PX = 500;

export const DEFAULT_CAPTION_LAYOUT: CaptionLayout = {
  version: CAPTION_LAYOUT_VERSION,
  anchor: "bottom_center",
  textAlign: "center",
  offsetX: 0,
  offsetY: 0,
  maxWidthPercent: 90,
  safeAreaEnabled: true,
};

export const CAPTION_ANCHORS: readonly CaptionAnchor[] = [
  "bottom_center",
  "center",
  "top_center",
  "top_left",
  "top_right",
  "center_left",
  "center_right",
  "bottom_left",
  "bottom_right",
] as const;

export const CAPTION_ANCHOR_TEXT_ALIGN: Record<CaptionAnchor, "left" | "center" | "right"> = {
  bottom_center: "center",
  center: "center",
  top_center: "center",
  top_left: "left",
  top_right: "right",
  center_left: "left",
  center_right: "right",
  bottom_left: "left",
  bottom_right: "right",
};
