import type { SceneMedia, SceneMediaType } from "@/features/story/types";

/** Schema version for media playback engine contracts. */
export const MEDIA_PLAYBACK_VERSION = 1;

/** How scene-local playback should loop relative to the trimmed clip. */
export type MediaPlaybackLoopMode = "none" | "scene" | "clip";

/** Minimal media input — SceneMedia or a compatible subset. */
export type MediaPlaybackMediaInput = Pick<
  SceneMedia,
  | "type"
  | "url"
  | "durationMs"
  | "trimStartMs"
  | "trimEndMs"
  | "muted"
  | "fitMode"
  | "transform"
  | "posterUrl"
  | "mimeType"
>;

export interface MediaPlaybackResolveInput {
  sceneMedia: MediaPlaybackMediaInput | null | undefined;
  /** Elapsed time within the active scene window (ms). */
  sceneElapsedMs: number;
  /** Active scene duration (ms). */
  sceneDurationMs: number;
  /** Whether the host timeline is currently playing. */
  playing?: boolean;
  /** Loop policy — preview scene loop may use `"scene"`. */
  loopMode?: MediaPlaybackLoopMode;
}

/** Renderer-agnostic media playback state at a point in scene time. */
export interface MediaPlaybackState {
  mediaType: SceneMediaType | "none";
  /** Absolute media time within the source clip (ms). */
  clipTimeMs: number;
  /** Host should advance playback (video only). */
  play: boolean;
  /** Clip has reached trim end — hold the last frame. */
  holdLastFrame: boolean;
  /** Clip playback window has ended for this scene pass. */
  ended: boolean;
  /** Progress through the scene duration (0–1). */
  progress: number;
  /** Progress through the trimmed clip window (0–1). */
  trimProgress: number;
  /** Milliseconds remaining in the scene window. */
  remainingMs: number;
  /** Effective trimmed clip duration (trimEnd − trimStart). */
  effectiveDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  sourceDurationMs: number;
}

export type MediaPlaybackValidationCode =
  | "missing_media"
  | "missing_url"
  | "missing_duration"
  | "invalid_duration"
  | "invalid_trim"
  | "trim_exceeds_duration"
  | "unsupported_type";

export interface MediaPlaybackValidationIssue {
  code: MediaPlaybackValidationCode;
  message: string;
  sceneId?: string;
}

export interface MediaPlaybackDiagnostics {
  mediaType: SceneMediaType | "none";
  trimStartMs: number;
  trimEndMs: number;
  clipDurationMs: number;
  clipTimeMs: number;
  progress: number;
  trimProgress: number;
  ended: boolean;
  holdLastFrame: boolean;
  play: boolean;
  remainingMs: number;
  sourceDurationMs: number;
  ready: boolean;
}
