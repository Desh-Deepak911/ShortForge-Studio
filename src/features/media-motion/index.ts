/**
 * Shared Media Motion Engine — foundation (4.2C-2).
 * Preview adapter: 4.2C-4. Export adapter: 4.2C-5.
 */

export type {
  MediaMotionEasing,
  MediaMotionPresetDefinition,
  MediaMotionState,
  ResolveMediaMotionInput,
  SceneMediaMotion,
  SceneMediaTransform,
} from "./media-motion.types";

export {
  MEDIA_MOTION_IDENTITY_TRANSFORM,
  MEDIA_MOTION_STATIC,
  MEDIA_MOTION_VERSION,
} from "./media-motion.types";

export {
  MEDIA_MOTION_DEFAULT_PAN_TRAVEL_PCT,
  MEDIA_MOTION_MAX_ZOOM_DELTA,
  MEDIA_MOTION_PEAK_SCALE,
  MEDIA_MOTION_PRESETS,
  getMediaMotionPreset,
  listMediaMotionPresetIds,
} from "./media-motion.presets";

export {
  applyMediaMotionEasing,
  resolveSceneMotionProgress,
} from "./media-motion.progress";

export {
  composeMediaMotionTransform,
  interpolateMediaMotionDelta,
  normalizeMediaMotionTransform,
  scaleMediaMotionDeltaByIntensity,
} from "./media-motion.compose";

export {
  legacyIntensityToUnit,
  mapLegacyImageMotionToSceneMediaMotion,
  mapLegacyImageMotionTypeToPresetId,
  normalizeSceneMediaMotionRecord,
} from "./media-motion.legacy";

export {
  normalizeSceneMediaMotion,
  resolveSceneMediaMotion,
  resolveSceneMediaMotionFromMedia,
  serializeSceneMediaMotionFingerprint,
} from "./media-motion.normalize";

export {
  resolveMediaMotionState,
  resolveMediaMotionStateForSceneTiming,
} from "./media-motion.engine";

export {
  buildDisableMediaMotionPatch,
  buildEnableMediaMotionPatch,
  buildMediaMotionPatch,
  buildResetMediaMotionPatch,
} from "./media-motion-patch.utils";
export type {
  MediaMotionPatchResult,
  SceneMediaMotionPatch,
} from "./media-motion-patch.utils";

export {
  MEDIA_MOTION_EASING_OPTIONS,
  MEDIA_MOTION_HELPER_COPY,
  MEDIA_MOTION_INSPECTOR_CATEGORIES,
  MEDIA_MOTION_INTENSITY_MAX,
  MEDIA_MOTION_INTENSITY_MIN,
  MEDIA_MOTION_INTENSITY_STEP,
} from "./media-motion-inspector.config";
export type { MediaMotionInspectorCategory } from "./media-motion-inspector.config";
