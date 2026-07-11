/**
 * Media thumbnail / poster engine contracts — pure, framework-free.
 */
import type { SceneMedia, SceneMediaType } from "@/features/story/types";

/** Schema version for thumbnail engine contracts. */
export const MEDIA_THUMBNAIL_VERSION = 1;

/** Default number of evenly spaced filmstrip samples. */
export const DEFAULT_FILMSTRIP_THUMBNAIL_COUNT = 8;

/** Minimal media input for poster / filmstrip resolution. */
export type MediaThumbnailMediaInput = Pick<
  SceneMedia,
  | "type"
  | "url"
  | "durationMs"
  | "trimStartMs"
  | "trimEndMs"
  | "posterUrl"
  | "posterTimeMs"
  | "thumbnailCount"
>;

export interface MediaFilmstripSample {
  /** Absolute media time for this sample (ms). */
  timeMs: number;
  /** Position along the sample window (0–1). */
  percentage: number;
  /** Zero-based index in the filmstrip. */
  index: number;
}

export interface MediaPosterState {
  mediaType: SceneMediaType | "none";
  /** Absolute media time used for the poster frame (ms). Images always 0. */
  posterTimeMs: number;
  /** Optional still URL — image URL, explicit posterUrl, or undefined until generated. */
  posterUrl?: string;
  /** True when posterTimeMs came from an explicit media.posterTimeMs. */
  hasCustomPosterTime: boolean;
  /** True when posterUrl is present on the media (or image URL). */
  hasPosterUrl: boolean;
}

export interface MediaFilmstripState {
  mediaType: SceneMediaType | "none";
  count: number;
  samples: MediaFilmstripSample[];
  /** Window used for sampling (trim window for video, 0 for image). */
  windowStartMs: number;
  windowEndMs: number;
  windowDurationMs: number;
}

export interface GenerateFilmstripOptions {
  /** Override sample count (defaults to media.thumbnailCount or DEFAULT). */
  count?: number;
}
