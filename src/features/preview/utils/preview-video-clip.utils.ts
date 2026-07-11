import type { SceneMedia } from "@/features/story/types";

export interface PreviewVideoClipWindow {
  trimStartMs: number;
  trimEndMs: number;
  durationMs: number;
}

export interface PreviewVideoClipTimeInput {
  sceneElapsedMs: number;
  trimStartMs?: number;
  trimEndMs?: number;
  durationMs?: number;
}

export interface PreviewVideoClipTimeResult {
  /** Absolute media time in seconds for `HTMLVideoElement.currentTime`. */
  currentTimeSec: number;
  /** Absolute media time in milliseconds. */
  clipTimeMs: number;
  /** True when scene time has reached or passed the clip end (hold last frame). */
  holdingLastFrame: boolean;
  trimStartMs: number;
  trimEndMs: number;
}

/** Resolves trim window for a video SceneMedia record. */
export function resolvePreviewVideoClipWindow(
  media: Pick<SceneMedia, "durationMs" | "trimStartMs" | "trimEndMs">,
): PreviewVideoClipWindow {
  const durationMs =
    typeof media.durationMs === "number" && Number.isFinite(media.durationMs) && media.durationMs > 0
      ? media.durationMs
      : 0;
  const trimStartMs =
    typeof media.trimStartMs === "number" && Number.isFinite(media.trimStartMs) && media.trimStartMs >= 0
      ? media.trimStartMs
      : 0;
  const rawTrimEnd =
    typeof media.trimEndMs === "number" && Number.isFinite(media.trimEndMs) && media.trimEndMs > trimStartMs
      ? media.trimEndMs
      : durationMs > 0
        ? durationMs
        : trimStartMs;
  const trimEndMs = durationMs > 0 ? Math.min(rawTrimEnd, durationMs) : rawTrimEnd;

  return {
    trimStartMs,
    trimEndMs: Math.max(trimStartMs, trimEndMs),
    durationMs,
  };
}

/**
 * Maps scene-local preview elapsed time into muted clip playback time.
 * Clips shorter than the scene hold the last frame after trimEnd.
 */
export function resolvePreviewVideoClipTime(
  input: PreviewVideoClipTimeInput,
): PreviewVideoClipTimeResult {
  const window = resolvePreviewVideoClipWindow({
    durationMs: input.durationMs,
    trimStartMs: input.trimStartMs,
    trimEndMs: input.trimEndMs,
  });

  const sceneElapsedMs = Math.max(0, Number.isFinite(input.sceneElapsedMs) ? input.sceneElapsedMs : 0);
  const unclampedClipTimeMs = window.trimStartMs + sceneElapsedMs;
  const clipTimeMs = Math.min(window.trimEndMs, Math.max(window.trimStartMs, unclampedClipTimeMs));
  const holdingLastFrame = unclampedClipTimeMs >= window.trimEndMs;

  return {
    currentTimeSec: clipTimeMs / 1000,
    clipTimeMs,
    holdingLastFrame,
    trimStartMs: window.trimStartMs,
    trimEndMs: window.trimEndMs,
  };
}

/** True when preview should drive an active (playing) video element. */
export function shouldPlayPreviewVideoClip(input: {
  isActive: boolean;
  isPlaying: boolean;
  holdingLastFrame: boolean;
}): boolean {
  return input.isActive && input.isPlaying && !input.holdingLastFrame;
}
