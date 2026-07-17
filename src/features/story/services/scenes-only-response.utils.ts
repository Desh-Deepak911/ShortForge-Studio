/**
 * Scenes-only API response adapter — Sprint 7E.3.
 * Reviewed title/narration are authoritative byte-for-byte.
 * Scenes/timeline still pass through normalizeFootieStory.
 */
import type { FootieScript } from "@/features/story/types";
import { normalizeFootieStory } from "./story-parse.service";

/**
 * Preserve exact reviewed title and narration while normalizing scenes/timeline.
 * Do not use for script-only / model-generated narration paths.
 */
export function buildScenesOnlyStoryResponse(story: FootieScript): FootieScript {
  const normalized = normalizeFootieStory(story);
  return {
    ...normalized,
    title: story.title,
    narration: story.narration,
  };
}
