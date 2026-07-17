/**
 * Deterministic media identities for Sprint 9D goldens.
 * Solid SVG data URLs for images; local:// video IDs for semantic QA only.
 */

import type { SceneMedia } from "@/features/story/types";
import {
  SCENE_MEDIA_GOLDEN_SOLID,
  SCENE_MEDIA_GOLDEN_VIDEO,
  goldenImageMedia,
  goldenVideoMedia,
} from "@/verification/scene-media-timeline/goldens/scene-media-golden-media";

export const IST_GOLDEN_SOLID = SCENE_MEDIA_GOLDEN_SOLID;
export const IST_GOLDEN_VIDEO = SCENE_MEDIA_GOLDEN_VIDEO;

export function istImageA(extras?: Partial<SceneMedia>): SceneMedia {
  return goldenImageMedia(IST_GOLDEN_SOLID.itemA, extras);
}

export function istImageB(extras?: Partial<SceneMedia>): SceneMedia {
  return goldenImageMedia(IST_GOLDEN_SOLID.itemB, extras);
}

export function istImageC(extras?: Partial<SceneMedia>): SceneMedia {
  return goldenImageMedia(IST_GOLDEN_SOLID.itemC, extras);
}

export function istVideoA(trim?: {
  trimStartMs?: number;
  trimEndMs?: number;
}): SceneMedia {
  return goldenVideoMedia(IST_GOLDEN_VIDEO.clipA, {
    durationMs: 10_000,
    trimStartMs: trim?.trimStartMs ?? 1000,
    trimEndMs: trim?.trimEndMs ?? 7000,
  });
}

export function istVideoB(trim?: {
  trimStartMs?: number;
  trimEndMs?: number;
}): SceneMedia {
  return goldenVideoMedia(IST_GOLDEN_VIDEO.clipB, {
    durationMs: 10_000,
    trimStartMs: trim?.trimStartMs ?? 500,
    trimEndMs: trim?.trimEndMs ?? 5500,
  });
}
