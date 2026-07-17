/**
 * Deterministic local media identities for Sprint 8E goldens.
 * No remote fetches, credentials, research providers, or binary blobs in fixtures.
 */

import type { SceneMedia } from "@/features/story/types";

/** Visually unmistakable solid-colour SVG data URLs for local harness + goldens. */
export const SCENE_MEDIA_GOLDEN_SOLID = {
  itemA: solidColorDataUrl("#E11D48", "ITEM A"),
  itemB: solidColorDataUrl("#2563EB", "ITEM B"),
  itemC: solidColorDataUrl("#CA8A04", "ITEM C"),
} as const;

/** Stable non-fetching video identity strings for semantic QA only. */
export const SCENE_MEDIA_GOLDEN_VIDEO = {
  clipA: "local://scene-media-golden/video-a.mp4",
  clipB: "local://scene-media-golden/video-b.mp4",
  clipC: "local://scene-media-golden/video-c.mp4",
} as const;

export function solidColorDataUrl(hex: string, label: string): string {
  const safe = label.replace(/[^\w\s-]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280"><rect width="720" height="1280" fill="${hex}"/><text x="360" y="640" fill="#ffffff" font-family="Arial,sans-serif" font-size="72" font-weight="700" text-anchor="middle">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function goldenImageMedia(
  url: string,
  extras: Partial<SceneMedia> = {},
): SceneMedia {
  return {
    type: "image",
    url,
    source: "upload",
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    ...extras,
  };
}

export function goldenVideoMedia(
  url: string,
  options: {
    durationMs?: number;
    trimStartMs?: number;
    trimEndMs?: number;
  } = {},
): SceneMedia {
  const durationMs = options.durationMs ?? 5000;
  return {
    type: "video",
    url,
    source: "upload",
    durationMs,
    trimStartMs: options.trimStartMs ?? 0,
    trimEndMs: options.trimEndMs ?? durationMs,
    muted: true,
    fitMode: "cover",
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
}
