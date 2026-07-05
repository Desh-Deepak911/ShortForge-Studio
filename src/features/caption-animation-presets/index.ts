export type {
  CaptionMotionPresetAnimationConfig,
  CaptionMotionPresetCategory,
  CaptionMotionPresetConfig,
  CaptionMotionPresetDefinition,
  CaptionMotionPresetId,
} from "./caption-animation-presets";
export {
  CAPTION_MOTION_PRESET_CATEGORY_LABELS,
  CAPTION_MOTION_PRESET_CATEGORY_ORDER,
  CAPTION_MOTION_PRESETS,
} from "./caption-animation-presets";

export type {
  CaptionMotionPresetSource,
  ResolvedMotionPresetDiagnostics,
} from "./caption-animation-presets.utils";
export {
  applyMotionPresetToAllScenes,
  buildApplyMotionPresetPatch,
  buildCaptionAnimationFromMotionPreset,
  buildMotionPresetPastePatch,
  buildProjectDefaultMotionPresetPatch,
  buildResetMotionPresetPatch,
  clearMotionPresetClipboard,
  copyMotionPresetToClipboard,
  getCaptionMotionPreset,
  getCaptionMotionPresetRegistry,
  getCaptionMotionPresetsByCategory,
  getMotionPresetClipboard,
  isKnownCaptionMotionPresetId,
  resolveMotionPresetAnimationConfig,
  resolveMotionPresetDiagnostics,
  resolveMotionPresetSource,
  resolveMotionPresetWorkflowContext,
  resolveStoredMotionPresetId,
} from "./caption-animation-presets.utils";
