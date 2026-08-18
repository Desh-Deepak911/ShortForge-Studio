export type {
  BuildVideoTrimPreviewOverrideInput,
  ResolveTrimPreviewScrubTimeInput,
  VideoTrimPreviewActiveHandle,
  VideoTrimPreviewOverride,
  VideoTrimPreviewSurface,
} from "./video-trim-preview.types";

export {
  VIDEO_TRIM_PREVIEW_SAFE_FRAME_OFFSET_MS,
  VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS,
  buildVideoTrimPreviewOverride,
  canCreateVideoTrimPreviewOverride,
  createTrimPreviewSeekQueue,
  queueTrimPreviewSeek,
  resolveTrimPreviewScrubTimeMs,
  shouldApplyVideoTrimPreviewOverride,
  shouldClearTrimPreviewOnMediaChange,
  shouldClearTrimPreviewOnMediaItemChange,
  shouldClearTrimPreviewOnSceneChange,
  shouldSeekVideoToTimeMs,
  takePendingTrimPreviewSeek,
} from "./video-trim-preview.utils";
export type { TrimPreviewSeekQueue } from "./video-trim-preview.utils";

export {
  VideoTrimPreviewProvider,
  useActiveVideoTrimPreviewOverride,
  useVideoTrimPreview,
  useVideoTrimPreviewOptional,
} from "./VideoTrimPreviewProvider";
export type { VideoTrimPreviewContextValue } from "./VideoTrimPreviewProvider";
