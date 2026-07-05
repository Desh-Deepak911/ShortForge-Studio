export type {
  CaptionEmphasisBehavior,
  CaptionEntranceEffect,
  CaptionHighlightStyle,
  CaptionMotionIntensity,
  CaptionPresetConfig,
  CaptionPresetId,
  CaptionPresetScene,
  CaptionShadowStyle,
  CaptionTextWeight,
} from "./caption-engine.types";

export {
  CAPTION_PRESET_ORDER,
  getCaptionPreset,
  getCaptionPresetRegistry,
  getCaptionPresets,
} from "./caption-preset.registry";

export {
  DEFAULT_CAPTION_PRESET,
  buildSceneCaptionPresetPatch,
  buildSceneSubtitleEffectPatch,
  getCaptionPresetOptions,
  LEGACY_SUBTITLE_EFFECT_TO_CAPTION_PRESET,
  mapLegacySubtitleEffectToCaptionPreset,
  normalizeLegacySubtitleEffect,
  resolveCaptionPreset,
  resolveEffectiveSubtitleEffect,
  resolveSceneCaptionPreset,
} from "./caption-engine.utils";

export {
  buildSceneCaptionLayoutPatch,
  clampCaptionLayoutPercent,
  DEFAULT_CAPTION_LAYOUT_BOTTOM_Y_PERCENT,
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  DEFAULT_PREVIEW_CAPTION_BACKGROUND_OPACITY,
  normalizeCaptionLayoutPosition,
  resolveCaptionLayout,
  resolveExportCaptionBackgroundOpacity,
  resolvePreviewCaptionLayout,
  resolvePreviewCaptionLayoutForScene,
  resolvePreviewCaptionLayoutScene,
  resolveEngineCaptionLayout,
  resolveExportCaptionPlacement,
  resolvePreviewCaptionOverlayStyle,
  resolvePreviewCaptionPillStyle,
} from "./caption-layout.utils";
export type { ExportCaptionPlacement, ResolvedCaptionLayout } from "./caption-layout.utils";

export { default as CaptionLayoutControl } from "./CaptionLayoutControl";
export type { CaptionLayoutControlProps } from "./CaptionLayoutControl";
export { default as CaptionStyleControl } from "./CaptionStyleControl";
export type { CaptionStyleControlProps } from "./CaptionStyleControl";
export { default as CaptionAnimationControl } from "./CaptionAnimationControl";
export type { CaptionAnimationControlProps } from "./CaptionAnimationControl";

export { default as CaptionPresetPanel } from "./CaptionPresetPanel";
export type { CaptionPresetPanelProps } from "./CaptionPresetPanel";

export {
  FADE_SAFE_CAPTION_PRESET_IDS,
  FADE_SAFE_CAPTION_STYLE_TOKENS,
  resolveFadeSafeCaptionStyle,
} from "./fade-safe-caption-style.utils";
export type {
  FadeSafeCaptionPresetId,
  FadeSafeCaptionStyleResolution,
  FadeSafeCaptionStyleTokens,
} from "./fade-safe-caption-style.utils";

export {
  LEGACY_EXPORT_CAPTION_STYLE_TOKENS,
  applyExportCaptionTextDrawState,
  getFadeSafeCaptionStyleTokensForPreset,
  resetExportCaptionTextDrawState,
  resolveExportCaptionStyle,
  resolveExportCaptionStyleForDisplay,
} from "./resolve-export-caption-style.utils";
export type { ExportCaptionStyleMetadata } from "./resolve-export-caption-style.utils";

export {
  PREVIEW_FADE_SAFE_CAPTION_PRESET_IDS,
  applyPreviewCaptionLineClassName,
  applyPreviewCaptionStyleClassName,
  resolvePreviewCaptionStyle,
} from "./resolve-preview-caption-style.utils";
export type {
  PreviewCaptionStyleMetadata,
  PreviewFadeSafeCaptionPresetId,
} from "./resolve-preview-caption-style.utils";

export {
  TIKTOK_CAPTION_PRESET_ID,
  TIKTOK_MOTION_STYLE_TOKENS,
  TIKTOK_POP_DURATION_MS,
  inferCaptionTooShortForTypewriter,
  resolvePreviewTikTokMotionStyle,
  resolveTikTokMotionOverlay,
  resolveTikTokMotionVisualState,
  resolveTikTokPopScale,
} from "./tiktok-motion-caption-style.utils";
export type {
  PreviewTikTokMotionMetadata,
  TikTokMotionOverlayResolution,
  TikTokMotionStyleTokens,
  TikTokMotionVisualState,
} from "./tiktok-motion-caption-style.utils";

export {
  SPORTS_BOUNCE_DURATION_MS,
  SPORTS_BOUNCE_MIN_WINDOW_MS,
  SPORTS_CAPTION_PRESET_ID,
  SPORTS_MOTION_STYLE_TOKENS,
  inferSportsBounceDisabled,
  resolvePreviewSportsMotionStyle,
  resolveSportsBounceScale,
  resolveSportsMotionOverlay,
  resolveSportsMotionVisualState,
} from "./sports-motion-caption-style.utils";
export type {
  PreviewSportsMotionMetadata,
  SportsMotionOverlayResolution,
  SportsMotionStyleTokens,
  SportsMotionVisualState,
} from "./sports-motion-caption-style.utils";

export {
  NEWS_SLIDE_DURATION_MS,
  NEWS_SLIDE_MIN_WINDOW_MS,
  NEWS_CAPTION_PRESET_ID,
  NEWS_MOTION_STYLE_TOKENS,
  inferNewsSlideDisabled,
  resolveNewsMotionOverlay,
  resolveNewsMotionVisualState,
  resolveNewsSlideOffsetPx,
  resolvePreviewNewsMotionStyle,
} from "./news-motion-caption-style.utils";
export type {
  NewsMotionOverlayResolution,
  NewsMotionStyleTokens,
  NewsMotionVisualState,
  PreviewNewsMotionMetadata,
} from "./news-motion-caption-style.utils";
