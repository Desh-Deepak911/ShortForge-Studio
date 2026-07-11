export type {
  MediaPlaybackDiagnostics,
  MediaPlaybackLoopMode,
  MediaPlaybackMediaInput,
  MediaPlaybackResolveInput,
  MediaPlaybackState,
  MediaPlaybackValidationCode,
  MediaPlaybackValidationIssue,
} from "./media-playback.types";
export { MEDIA_PLAYBACK_VERSION } from "./media-playback.types";

export {
  DEFAULT_MEDIA_PLAYBACK_LOOP_MODE,
  EMPTY_MEDIA_PLAYBACK_STATE,
  IMAGE_MEDIA_PLAYBACK_BASE,
} from "./media-playback.defaults";

export {
  buildMediaPlaybackResolveInput,
  clamp01,
  clampNonNegativeMs,
  clampSceneMediaTrim,
  createEmptyMediaPlaybackState,
  getSceneMediaTrimDuration,
  hasSceneMediaEnded,
  isPositiveDurationMs,
  isSceneMediaReady,
  resolveSceneMediaClipTime,
  validateSceneMediaPlayback,
} from "./media-playback.utils";
export type { SceneMediaTrimWindow } from "./media-playback.utils";

export {
  resolveSceneMediaPlayback,
  resolveSceneMediaPlaybackDiagnostics,
} from "./media-playback.engine";

export type {
  SceneVideoTrimPatch,
  VideoTrimPatchResult,
  VideoTrimRequest,
  VideoTrimValidationResult,
  VideoTrimWindow,
} from "./media-trim.types";

export {
  buildResetVideoTrimPatch,
  buildResetVideoTrimScenePatch,
  buildVideoTrimPatch,
  buildVideoTrimScenePatch,
  clampPosterTimeToTrimWindow,
  MIN_VIDEO_TRIM_DURATION_MS,
  normalizeVideoTrim,
  validateVideoTrimWindow,
} from "./media-trim-patch.utils";

export {
  buildMediaPlaybackDebugSummary,
  logMediaPlaybackDebugSummary,
} from "./media-playback-diagnostics.dev.utils";
export type { MediaPlaybackDebugSummary } from "./media-playback-diagnostics.dev.utils";
