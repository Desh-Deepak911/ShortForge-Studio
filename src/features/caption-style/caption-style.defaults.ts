import type { CaptionStyle, CaptionResolvedStyle } from "./caption-style.types";
import { CAPTION_STYLE_VERSION } from "./caption-style.types";

/** Reference frame shared by preview and export (1080×1920 vertical). */
export const CAPTION_STYLE_REFERENCE_WIDTH = 1080;

/** Export canvas base font size at reference scale — matches legacy export renderer. */
export const LEGACY_EXPORT_CAPTION_FONT_SIZE = 64;

/** Preview CSS base font size — matches globals.css `.preview-narration-subtitle-text`. */
export const LEGACY_PREVIEW_CAPTION_FONT_SIZE_PX = 13;

/** Legacy export subtitle box styling. */
export const LEGACY_EXPORT_CAPTION_BOX_PAD_X = 18;
export const LEGACY_EXPORT_CAPTION_BOX_PAD_Y = 10;
export const LEGACY_EXPORT_CAPTION_BOX_RADIUS = 12;
export const LEGACY_EXPORT_CAPTION_BOX_BORDER = "rgba(255, 255, 255, 0.1)";
export const LEGACY_EXPORT_CAPTION_BACKGROUND_OPACITY = 0.45;

/** Legacy preview pill background — matches globals.css when layout engine is not active. */
export const LEGACY_PREVIEW_CAPTION_BACKGROUND_OPACITY = 0.65;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  version: CAPTION_STYLE_VERSION,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: "700",
  fontSize: LEGACY_EXPORT_CAPTION_FONT_SIZE,
  textColor: "#ffffff",
  backgroundColor: "#000000",
  backgroundOpacity: LEGACY_EXPORT_CAPTION_BACKGROUND_OPACITY * 100,
  outlineColor: "#000000",
  outlineWidth: 2,
  shadowColor: "#000000",
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  glowColor: "#ffffff",
  glowBlur: 12,
  cornerRadius: LEGACY_EXPORT_CAPTION_BOX_RADIUS,
  paddingX: LEGACY_EXPORT_CAPTION_BOX_PAD_X,
  paddingY: LEGACY_EXPORT_CAPTION_BOX_PAD_Y,
  lineHeight: 1.3,
  letterSpacing: 0,
  textTransform: "none",
  maxLines: 3,
  overflowBehavior: "wrap",
  backgroundEnabled: true,
  outlineEnabled: false,
  shadowEnabled: false,
  glowEnabled: false,
  gradientEnabled: false,
  gradientStartColor: "#000000",
  gradientEndColor: "#000000",
  gradientDirection: 180,
};

/** Engine output shape with all fields materialized. */
export const DEFAULT_CAPTION_RESOLVED_STYLE: CaptionResolvedStyle = {
  version: CAPTION_STYLE_VERSION,
  fontFamily: DEFAULT_CAPTION_STYLE.fontFamily!,
  fontWeight: DEFAULT_CAPTION_STYLE.fontWeight!,
  fontSize: DEFAULT_CAPTION_STYLE.fontSize!,
  textColor: DEFAULT_CAPTION_STYLE.textColor!,
  backgroundColor: DEFAULT_CAPTION_STYLE.backgroundColor!,
  backgroundOpacity: DEFAULT_CAPTION_STYLE.backgroundOpacity!,
  outlineColor: DEFAULT_CAPTION_STYLE.outlineColor!,
  outlineWidth: DEFAULT_CAPTION_STYLE.outlineWidth!,
  shadowColor: DEFAULT_CAPTION_STYLE.shadowColor!,
  shadowBlur: DEFAULT_CAPTION_STYLE.shadowBlur!,
  shadowOffsetX: DEFAULT_CAPTION_STYLE.shadowOffsetX!,
  shadowOffsetY: DEFAULT_CAPTION_STYLE.shadowOffsetY!,
  cornerRadius: DEFAULT_CAPTION_STYLE.cornerRadius!,
  paddingX: DEFAULT_CAPTION_STYLE.paddingX!,
  paddingY: DEFAULT_CAPTION_STYLE.paddingY!,
  lineHeight: DEFAULT_CAPTION_STYLE.lineHeight!,
  letterSpacing: DEFAULT_CAPTION_STYLE.letterSpacing!,
  textTransform: DEFAULT_CAPTION_STYLE.textTransform!,
  maxLines: DEFAULT_CAPTION_STYLE.maxLines!,
  overflowBehavior: DEFAULT_CAPTION_STYLE.overflowBehavior!,
  backgroundEnabled: DEFAULT_CAPTION_STYLE.backgroundEnabled!,
  outlineEnabled: DEFAULT_CAPTION_STYLE.outlineEnabled!,
  shadowEnabled: DEFAULT_CAPTION_STYLE.shadowEnabled!,
  glowEnabled: DEFAULT_CAPTION_STYLE.glowEnabled!,
  glowColor: DEFAULT_CAPTION_STYLE.glowColor!,
  glowBlur: DEFAULT_CAPTION_STYLE.glowBlur!,
  gradientEnabled: DEFAULT_CAPTION_STYLE.gradientEnabled!,
  gradientStartColor: DEFAULT_CAPTION_STYLE.gradientStartColor!,
  gradientEndColor: DEFAULT_CAPTION_STYLE.gradientEndColor!,
  gradientDirection: DEFAULT_CAPTION_STYLE.gradientDirection!,
};
