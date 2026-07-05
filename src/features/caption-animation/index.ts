export type {
  CaptionAnimation,
  CaptionAnimationChunkInput,
  CaptionAnimationDiagnostics,
  CaptionAnimationDirection,
  CaptionAnimationEasing,
  CaptionAnimationFieldSource,
  CaptionAnimationPhase,
  CaptionAnimationPreset,
  CaptionAnimationResolveInput,
  CaptionAnimationSource,
  CaptionAnimationState,
  CaptionAnimationTimelineInput,
} from "./caption-animation.types";
export { CAPTION_ANIMATION_VERSION } from "./caption-animation.types";

export {
  CAPTION_ANIMATION_DELAY_DEFAULT_MS,
  CAPTION_ANIMATION_DELAY_MAX_MS,
  CAPTION_ANIMATION_DELAY_MIN_MS,
  CAPTION_ANIMATION_DURATION_DEFAULT_MS,
  CAPTION_ANIMATION_DURATION_MAX_MS,
  CAPTION_ANIMATION_DURATION_MIN_MS,
  CAPTION_ANIMATION_INTENSITY_DEFAULT,
  CAPTION_ANIMATION_INTENSITY_MAX,
  CAPTION_ANIMATION_INTENSITY_MIN,
  DEFAULT_CAPTION_ANIMATION,
  DEFAULT_CAPTION_ANIMATION_PRESET,
} from "./caption-animation.defaults";

export {
  buildResetCaptionAnimationPatch,
  buildSceneCaptionAnimationPatch,
  buildSceneCaptionAnimationPresetPatch,
  clamp01,
  clampCaptionAnimationDelayMs,
  clampCaptionAnimationDurationMs,
  clampCaptionAnimationIntensity,
  isDefaultCaptionAnimationStorage,
  mapAnimationPresetToSubtitleEffect,
  mapSubtitleEffectToAnimationPreset,
  mergeCaptionAnimationSettings,
  resolveCaptionAnimationFieldSources,
  resolveCaptionAnimationSource,
  resolveEffectiveAnimationPreset,
  resolveEffectiveCaptionAnimationDurationMs,
  usesLegacyCaptionAnimationTiming,
} from "./caption-animation.utils";

export {
  resolveCaptionAnimation,
  resolveCaptionAnimationDiagnostics,
  resolveCaptionAnimationFromChunk,
  resolveCaptionAnimationFromTimelineEvent,
  resolveCaptionAnimationState,
  resolveCaptionHighlightFrame,
} from "./caption-animation.engine";

export {
  buildCaptionAnimationResolveInput,
  resolveCaptionAnimationTranslateYPx,
  resolveExportCaptionAnimation,
  resolveExportCaptionAnimationFromChunk,
  resolveExportCaptionHighlightFrame,
  resolvePreviewCaptionAnimation,
} from "./caption-animation.adapters";
export type {
  CaptionAnimationSceneInput,
  CaptionAnimationScriptInput,
} from "./caption-animation.adapters";

export {
  buildCaptionAnimationDebugSummary,
  logCaptionAnimationDebugSummary,
} from "./caption-animation-diagnostics.dev.utils";
export type { CaptionAnimationDebugSummary } from "./caption-animation-diagnostics.dev.utils";
