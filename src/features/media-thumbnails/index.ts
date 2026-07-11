export type {
  GenerateFilmstripOptions,
  MediaFilmstripSample,
  MediaFilmstripState,
  MediaPosterState,
  MediaThumbnailMediaInput,
} from "./media-thumbnail.types";
export {
  DEFAULT_FILMSTRIP_THUMBNAIL_COUNT,
  MEDIA_THUMBNAIL_VERSION,
} from "./media-thumbnail.types";

export {
  clamp01,
  clampNonNegativeMs,
  clampPosterTime,
  formatPosterFrameTime,
  formatPosterTime,
  generateThumbnailTimes,
  resolveFilmstripCount,
  resolvePosterSampleWindow,
  resolvePosterTime,
} from "./media-thumbnail.utils";
export type { PosterTimeWindow } from "./media-thumbnail.utils";

export {
  generateSceneMediaFilmstrip,
  generateSceneMediaPoster,
  resolveScenePoster,
  resolveSceneThumbnail,
} from "./media-thumbnail.engine";

export {
  buildPosterTimePatch,
  buildResetPosterPatch,
  isPosterPickerAvailable,
  resolvePosterPickerRange,
} from "./media-poster-patch.utils";
export type { ScenePosterPatch } from "./media-poster-patch.utils";
