export type {
  CaptionOverflowBehavior,
  CaptionResolvedGlow,
  CaptionResolvedOutline,
  CaptionResolvedShadow,
  CaptionResolvedStyle,
  CaptionStyle,
  CaptionStyleDiagnostics,
  CaptionStyleResolveInput,
  CaptionStyleSource,
  CaptionTextTransform,
} from "./caption-style.types";
export { CAPTION_STYLE_VERSION } from "./caption-style.types";

export {
  CAPTION_STYLE_REFERENCE_WIDTH,
  DEFAULT_CAPTION_RESOLVED_STYLE,
  DEFAULT_CAPTION_STYLE,
  LEGACY_EXPORT_CAPTION_BACKGROUND_OPACITY,
  LEGACY_EXPORT_CAPTION_BOX_BORDER,
  LEGACY_EXPORT_CAPTION_BOX_PAD_X,
  LEGACY_EXPORT_CAPTION_BOX_PAD_Y,
  LEGACY_EXPORT_CAPTION_BOX_RADIUS,
  LEGACY_EXPORT_CAPTION_FONT_SIZE,
  LEGACY_PREVIEW_CAPTION_BACKGROUND_OPACITY,
  LEGACY_PREVIEW_CAPTION_FONT_SIZE_PX,
} from "./caption-style.defaults";

export {
  CAPTION_STYLE_CORNER_RADIUS_MAX,
  CAPTION_STYLE_CORNER_RADIUS_MIN,
  CAPTION_STYLE_FONT_FAMILY_OPTIONS,
  CAPTION_STYLE_FONT_SIZE_MAX,
  CAPTION_STYLE_FONT_SIZE_MIN,
  CAPTION_STYLE_FONT_WEIGHT_OPTIONS,
  CAPTION_STYLE_LETTER_SPACING_MAX,
  CAPTION_STYLE_LETTER_SPACING_MIN,
  CAPTION_STYLE_LINE_HEIGHT_MAX,
  CAPTION_STYLE_LINE_HEIGHT_MIN,
  CAPTION_STYLE_MAX_LINES_MAX,
  CAPTION_STYLE_MAX_LINES_MIN,
  CAPTION_STYLE_PADDING_MAX,
  CAPTION_STYLE_PADDING_MIN,
  CAPTION_STYLE_TEXT_TRANSFORM_OPTIONS,
  applyCaptionTextTransform,
  buildSceneCaptionStylePatch,
  clampCaptionStyleBackgroundOpacity,
  clampCaptionStyleCornerRadius,
  clampCaptionStyleFontSize,
  clampCaptionStyleFontWeight,
  clampCaptionStyleLetterSpacing,
  clampCaptionStyleLineHeight,
  clampCaptionStyleMaxLines,
  clampCaptionStylePadding,
  isDefaultCaptionStyleStorage,
  mergeCaptionStyleSettings,
  normalizeCaptionStyleBackgroundColor,
  normalizeCaptionStyleFontFamily,
  normalizeCaptionStyleTextColor,
  CAPTION_STYLE_GLOW_BLUR_MAX,
  CAPTION_STYLE_GLOW_BLUR_MIN,
  CAPTION_STYLE_OUTLINE_WIDTH_MAX,
  CAPTION_STYLE_OUTLINE_WIDTH_MIN,
  CAPTION_STYLE_SHADOW_BLUR_MAX,
  CAPTION_STYLE_SHADOW_BLUR_MIN,
  CAPTION_STYLE_SHADOW_OFFSET_MAX,
  CAPTION_STYLE_SHADOW_OFFSET_MIN,
  clampCaptionStyleGlowBlur,
  clampCaptionStyleOutlineWidth,
  clampCaptionStyleShadowBlur,
  clampCaptionStyleShadowOffset,
  normalizeCaptionStyleEffectColor,
} from "./caption-style.utils";

export {
  resolveCaptionGlow,
  resolveCaptionGlowSource,
  resolveCaptionOutline,
  resolveCaptionOutlineSource,
  resolveCaptionShadow,
  resolveCaptionShadowSource,
} from "./caption-style.effects";

export {
  resolveCaptionStyle,
  resolveCaptionStyleDiagnostics,
} from "./caption-style.engine";

export {
  applyCaptionBackgroundAuthorityToStyle,
  resolveCaptionBackgroundAuthority,
} from "./resolve-caption-background-authority";
export type {
  CaptionBackgroundAuthority,
  CaptionBackgroundEnabledSource,
  CaptionBackgroundIntent,
  CaptionBackgroundOpacitySource,
  ResolveCaptionBackgroundAuthorityInput,
} from "./resolve-caption-background-authority";

export {
  PREVIEW_CAPTION_STYLE_UI_SCALE,
  PREVIEW_FADE_SAFE_CAPTION_PRESET_IDS,
  LEGACY_EXPORT_CAPTION_STYLE_TOKENS,
  applyExportCaptionOutline,
  applyExportCaptionShadow,
  applyExportCaptionGlow,
  drawExportCaptionStyledLine,
  applyExportCaptionTextDrawState,
  applyPreviewCaptionLineClassName,
  applyPreviewCaptionStyleClassName,
  getFadeSafeCaptionStyleTokensForPreset,
  resetExportCaptionTextDrawState,
  resolveCaptionStyleMaxLines,
  resolveExportCaptionBackgroundFill,
  resolveExportCaptionStyle,
  resolveExportCaptionStyleFromSceneDisplay,
  resolveExportCaptionStyleForDisplay,
  resolveExportCaptionStyleMetrics,
  resolvePreviewCaptionContainerStyle,
  resolvePreviewCaptionFontSizePx,
  resolvePreviewCaptionPillCombinedStyle,
  resolvePreviewCaptionStyle,
  resolvePreviewCaptionTextEffectStyle,
  resolvePreviewCaptionTypographyStyle,
  formatExportCaptionLineText,
  resolvePreviewCaptionTypographyStyleForScene,
} from "./caption-style.adapters";
export type {
  CaptionStyleSceneInput,
  CaptionStyleScriptInput,
  ExportCaptionStyleMetadata,
  ExportCaptionStyleMetrics,
  PreviewCaptionStyleMetadata,
  PreviewFadeSafeCaptionPresetId,
} from "./caption-style.adapters";

export {
  buildCaptionStyleDebugSummary,
  logCaptionStyleDebugSummary,
} from "./caption-style-diagnostics.dev.utils";
export type { CaptionStyleDebugSummary } from "./caption-style-diagnostics.dev.utils";
