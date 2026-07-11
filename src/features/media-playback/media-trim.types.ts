/**
 * Video trim window / patch result types — renderer-independent.
 */
import type { FootieScene, SceneMedia } from "@/features/story/types";

import type { MediaPlaybackValidationIssue } from "./media-playback.types";

/** Normalized trim window against a source clip. */
export interface VideoTrimWindow {
  trimStartMs: number;
  trimEndMs: number;
  /** trimEndMs − trimStartMs (always > 0 when sourceDurationMs > 0). */
  trimDurationMs: number;
  sourceDurationMs: number;
  /** True when the requested start/end differed from the normalized window. */
  wasClamped: boolean;
}

/** Requested trim bounds for normalize / patch builders. */
export interface VideoTrimRequest {
  trimStartMs: number;
  trimEndMs: number;
}

/** Result of validating a trim window (or media carrying trim). */
export interface VideoTrimValidationResult {
  ok: boolean;
  issues: MediaPlaybackValidationIssue[];
  window: VideoTrimWindow | null;
}

/** Scene patch that updates media trim (and poster clamp) only. */
export type SceneVideoTrimPatch = Pick<FootieScene, "media">;

export interface VideoTrimPatchResult {
  patch: SceneVideoTrimPatch;
  window: VideoTrimWindow;
  /** Absolute poster time after clamp into the trim window. */
  posterTimeMs: number;
  /** True when posterTimeMs was adjusted to fit the trim window. */
  posterWasClamped: boolean;
  /** True when posterUrl was cleared because poster time changed. */
  posterUrlCleared: boolean;
  media: SceneMedia;
}
