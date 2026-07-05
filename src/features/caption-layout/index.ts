export type {
  CaptionAnchor,
  CaptionLayout,
  CaptionLayoutCanvas,
  CaptionLayoutDiagnostics,
  CaptionLayoutResolveInput,
  CaptionResolvedLayout,
  CaptionSafeAreaInsets,
  CaptionTextAlign,
} from "./caption-layout.types";
export { CAPTION_LAYOUT_VERSION } from "./caption-layout.types";

export {
  CAPTION_ANCHORS,
  CAPTION_ANCHOR_TEXT_ALIGN,
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  CAPTION_OFFSET_X_MAX_PX,
  CAPTION_OFFSET_X_MIN_PX,
  CAPTION_OFFSET_Y_MAX_PX,
  CAPTION_OFFSET_Y_MIN_PX,
  DEFAULT_CAPTION_LAYOUT,
  DEFAULT_CAPTION_SAFE_AREA,
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY,
  LEGACY_BOTTOM_CENTER_Y_PERCENT,
  LEGACY_EXPORT_BOTTOM_MARGIN_PX,
} from "./caption-layout.defaults";

export {
  resolveCaptionLayout,
  resolveCaptionLayoutDiagnostics,
  resolveCaptionBackgroundAlpha,
} from "./caption-layout.engine";

export {
  buildResetCaptionLayout,
  buildResetCaptionLayoutPatch,
  buildSceneCaptionLayoutPatch,
  clampCaptionBackgroundOpacity,
  clampCaptionMaxWidthPercent,
  clampCaptionOffsetPercent,
  clampCaptionOffsetXPx,
  clampCaptionOffsetYPx,
  isDefaultCaptionLayoutStorage,
  mergeCaptionLayoutSettings,
  normalizeCaptionAnchor,
  normalizeCaptionTextAlign,
  resolveCaptionBackgroundOpacityPercent,
  resolveSafeAreaInsets,
} from "./caption-layout.utils";
