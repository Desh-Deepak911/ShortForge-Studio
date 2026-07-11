/**
 * Media thumbnail / poster engine — pure metadata only.
 * No bitmap drawing, DOM, preview, or export side effects.
 */
import type { SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils";

import type {
  GenerateFilmstripOptions,
  MediaFilmstripState,
  MediaPosterState,
  MediaThumbnailMediaInput,
} from "./media-thumbnail.types";
import {
  generateThumbnailTimes,
  resolveFilmstripCount,
  resolvePosterSampleWindow,
  resolvePosterTime,
} from "./media-thumbnail.utils";

function asThumbnailInput(
  media: MediaThumbnailMediaInput | SceneMedia | null | undefined,
): MediaThumbnailMediaInput | null {
  if (!media) {
    return null;
  }

  return media;
}

/**
 * Resolves poster state for a SceneMedia (or compatible input).
 * Image → poster is the image URL at time 0.
 * Video → posterTimeMs defaults to trim/window start; posterUrl when present.
 * Placeholder / missing → empty poster.
 */
export function generateSceneMediaPoster(
  media: MediaThumbnailMediaInput | SceneMedia | null | undefined,
): MediaPosterState {
  const input = asThumbnailInput(media);

  if (!input || input.type === "placeholder") {
    return {
      mediaType: input?.type === "placeholder" ? "placeholder" : "none",
      posterTimeMs: 0,
      hasCustomPosterTime: false,
      hasPosterUrl: false,
    };
  }

  if (input.type === "image") {
    const url = typeof input.url === "string" ? input.url.trim() : "";
    return {
      mediaType: "image",
      posterTimeMs: 0,
      ...(url ? { posterUrl: url } : {}),
      hasCustomPosterTime: false,
      hasPosterUrl: Boolean(url),
    };
  }

  const posterTimeMs = resolvePosterTime(input);
  const hasCustomPosterTime =
    typeof input.posterTimeMs === "number" && Number.isFinite(input.posterTimeMs);
  const posterUrl =
    typeof input.posterUrl === "string" && input.posterUrl.trim()
      ? input.posterUrl.trim()
      : undefined;

  return {
    mediaType: "video",
    posterTimeMs,
    ...(posterUrl ? { posterUrl } : {}),
    hasCustomPosterTime,
    hasPosterUrl: Boolean(posterUrl),
  };
}

/**
 * Generates evenly spaced filmstrip sample metadata (no bitmap generation).
 * Image → single sample at 0.
 * Video → N samples across the trim/duration window.
 * Placeholder / missing → empty samples.
 */
export function generateSceneMediaFilmstrip(
  media: MediaThumbnailMediaInput | SceneMedia | null | undefined,
  options: GenerateFilmstripOptions = {},
): MediaFilmstripState {
  const input = asThumbnailInput(media);

  if (!input || input.type === "placeholder") {
    return {
      mediaType: input?.type === "placeholder" ? "placeholder" : "none",
      count: 0,
      samples: [],
      windowStartMs: 0,
      windowEndMs: 0,
      windowDurationMs: 0,
    };
  }

  if (input.type === "image") {
    return {
      mediaType: "image",
      count: 1,
      samples: [{ timeMs: 0, percentage: 0, index: 0 }],
      windowStartMs: 0,
      windowEndMs: 0,
      windowDurationMs: 0,
    };
  }

  const sampleWindow = resolvePosterSampleWindow(input);
  const count = resolveFilmstripCount(input, options.count);
  const samples = generateThumbnailTimes(
    sampleWindow.startMs,
    sampleWindow.endMs,
    count,
  );

  return {
    mediaType: "video",
    count: samples.length,
    samples,
    windowStartMs: sampleWindow.startMs,
    windowEndMs: sampleWindow.endMs,
    windowDurationMs: sampleWindow.durationMs,
  };
}

/**
 * Resolves poster for a scene via getSceneMedia() (legacy image fallback included).
 */
export function resolveScenePoster(
  scene: Parameters<typeof getSceneMedia>[0],
): MediaPosterState {
  return generateSceneMediaPoster(getSceneMedia(scene));
}

/**
 * Resolves filmstrip metadata for a scene via getSceneMedia().
 */
export function resolveSceneThumbnail(
  scene: Parameters<typeof getSceneMedia>[0],
  options: GenerateFilmstripOptions = {},
): MediaFilmstripState {
  return generateSceneMediaFilmstrip(getSceneMedia(scene), options);
}
