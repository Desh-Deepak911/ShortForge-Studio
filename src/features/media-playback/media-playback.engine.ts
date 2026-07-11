import {
  DEFAULT_MEDIA_PLAYBACK_LOOP_MODE,
  EMPTY_MEDIA_PLAYBACK_STATE,
  IMAGE_MEDIA_PLAYBACK_BASE,
} from "./media-playback.defaults";
import type {
  MediaPlaybackDiagnostics,
  MediaPlaybackResolveInput,
  MediaPlaybackState,
} from "./media-playback.types";
import {
  clamp01,
  clampNonNegativeMs,
  clampSceneMediaTrim,
  createEmptyMediaPlaybackState,
  isSceneMediaReady,
  resolveSceneMediaClipTime,
} from "./media-playback.utils";

function resolveSceneProgress(sceneElapsedMs: number, sceneDurationMs: number): {
  progress: number;
  remainingMs: number;
} {
  const duration = clampNonNegativeMs(sceneDurationMs, 0);
  const elapsed = clampNonNegativeMs(sceneElapsedMs, 0);

  if (duration <= 0) {
    return { progress: 0, remainingMs: 0 };
  }

  const clampedElapsed = Math.min(elapsed, duration);
  return {
    progress: clamp01(clampedElapsed / duration),
    remainingMs: Math.max(0, duration - clampedElapsed),
  };
}

function resolveImagePlayback(input: MediaPlaybackResolveInput): MediaPlaybackState {
  const { progress, remainingMs } = resolveSceneProgress(
    input.sceneElapsedMs,
    input.sceneDurationMs,
  );

  return {
    ...IMAGE_MEDIA_PLAYBACK_BASE,
    progress,
    remainingMs,
  };
}

function resolvePlaceholderPlayback(input: MediaPlaybackResolveInput): MediaPlaybackState {
  const { progress, remainingMs } = resolveSceneProgress(
    input.sceneElapsedMs,
    input.sceneDurationMs,
  );

  return {
    ...EMPTY_MEDIA_PLAYBACK_STATE,
    mediaType: "placeholder",
    progress,
    remainingMs,
    holdLastFrame: true,
  };
}

function resolveVideoElapsedForLoop(
  sceneElapsedMs: number,
  sceneDurationMs: number,
  effectiveDurationMs: number,
  loopMode: NonNullable<MediaPlaybackResolveInput["loopMode"]>,
): number {
  const elapsed = clampNonNegativeMs(sceneElapsedMs, 0);
  const sceneDuration = clampNonNegativeMs(sceneDurationMs, 0);

  if (loopMode === "none" || effectiveDurationMs <= 0) {
    return elapsed;
  }

  if (loopMode === "clip") {
    return elapsed % effectiveDurationMs;
  }

  // "scene" — wrap within the scene window when looping the scene preview.
  if (sceneDuration <= 0) {
    return elapsed % effectiveDurationMs;
  }

  return elapsed % sceneDuration;
}

function resolveVideoPlayback(input: MediaPlaybackResolveInput): MediaPlaybackState {
  const media = input.sceneMedia!;
  const loopMode = input.loopMode ?? DEFAULT_MEDIA_PLAYBACK_LOOP_MODE;
  const window = clampSceneMediaTrim(media);
  const { progress, remainingMs } = resolveSceneProgress(
    input.sceneElapsedMs,
    input.sceneDurationMs,
  );

  const loopedElapsed = resolveVideoElapsedForLoop(
    input.sceneElapsedMs,
    input.sceneDurationMs,
    window.effectiveDurationMs,
    loopMode,
  );

  const clip = resolveSceneMediaClipTime(media, loopedElapsed);
  const trimProgress =
    window.effectiveDurationMs > 0
      ? clamp01((clip.clipTimeMs - window.trimStartMs) / window.effectiveDurationMs)
      : 0;

  const playing = input.playing === true;
  const play = playing && !clip.holdLastFrame && window.effectiveDurationMs > 0;

  return {
    mediaType: "video",
    clipTimeMs: clip.clipTimeMs,
    play,
    holdLastFrame: clip.holdLastFrame,
    ended: clip.ended,
    progress,
    trimProgress,
    remainingMs,
    effectiveDurationMs: window.effectiveDurationMs,
    trimStartMs: window.trimStartMs,
    trimEndMs: window.trimEndMs,
    sourceDurationMs: window.durationMs,
  };
}

/**
 * Resolves which media frame should be displayed for a scene at a given elapsed time.
 * Pure — no DOM, React, Preview, or Export dependencies.
 */
export function resolveSceneMediaPlayback(
  input: MediaPlaybackResolveInput,
): MediaPlaybackState {
  const media = input.sceneMedia;

  if (!media) {
    return createEmptyMediaPlaybackState(input.sceneDurationMs);
  }

  switch (media.type) {
    case "image":
      return resolveImagePlayback(input);
    case "placeholder":
      return resolvePlaceholderPlayback(input);
    case "video":
      return resolveVideoPlayback(input);
    default:
      return createEmptyMediaPlaybackState(input.sceneDurationMs);
  }
}

/** Diagnostics snapshot for dev tooling — mirrors caption engine diagnostics style. */
export function resolveSceneMediaPlaybackDiagnostics(
  input: MediaPlaybackResolveInput,
): MediaPlaybackDiagnostics {
  const state = resolveSceneMediaPlayback(input);

  return {
    mediaType: state.mediaType,
    trimStartMs: state.trimStartMs,
    trimEndMs: state.trimEndMs,
    clipDurationMs: state.effectiveDurationMs,
    clipTimeMs: state.clipTimeMs,
    progress: state.progress,
    trimProgress: state.trimProgress,
    ended: state.ended,
    holdLastFrame: state.holdLastFrame,
    play: state.play,
    remainingMs: state.remainingMs,
    sourceDurationMs: state.sourceDurationMs,
    ready: isSceneMediaReady(input.sceneMedia),
  };
}
