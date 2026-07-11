import type { MediaPlaybackState } from "./media-playback.types";

/** Default loop mode for one-shot scene playback. */
export const DEFAULT_MEDIA_PLAYBACK_LOOP_MODE = "none" as const;

/** Empty / missing media playback state. */
export const EMPTY_MEDIA_PLAYBACK_STATE: MediaPlaybackState = {
  mediaType: "none",
  clipTimeMs: 0,
  play: false,
  holdLastFrame: true,
  ended: false,
  progress: 0,
  trimProgress: 0,
  remainingMs: 0,
  effectiveDurationMs: 0,
  trimStartMs: 0,
  trimEndMs: 0,
  sourceDurationMs: 0,
};

/** Static image playback state — always holds the first (only) frame. */
export const IMAGE_MEDIA_PLAYBACK_BASE: Pick<
  MediaPlaybackState,
  "mediaType" | "clipTimeMs" | "play" | "holdLastFrame" | "ended" | "trimProgress" | "effectiveDurationMs" | "trimStartMs" | "trimEndMs" | "sourceDurationMs"
> = {
  mediaType: "image",
  clipTimeMs: 0,
  play: false,
  holdLastFrame: true,
  ended: false,
  trimProgress: 0,
  effectiveDurationMs: 0,
  trimStartMs: 0,
  trimEndMs: 0,
  sourceDurationMs: 0,
};
