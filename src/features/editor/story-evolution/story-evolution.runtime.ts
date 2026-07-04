import { readPlanningCache, updatePlanningCacheStaleness } from "@/features/editor/creator-asset-planning/creator-asset-planning.cache";
import type { FootieScript } from "@/features/story/types";

import { isStoryEvolutionDebugEnabled } from "./story-evolution.debug";
import { detectStoryChanges } from "./story-change-detector";
import { computePlanningStaleness } from "./story-staleness.utils";
import type { PlanningStaleness, StoryChangeEvent } from "./story-evolution.types";

function logStoryEvolutionDev(input: {
  storyId: string;
  events: StoryChangeEvent[];
  staleness?: PlanningStaleness;
}): void {
  if (process.env.NODE_ENV === "production" || !isStoryEvolutionDebugEnabled) {
    return;
  }

  console.warn("[story-evolution]", {
    storyId: input.storyId,
    events: input.events.map((event) => event.type),
    staleness: input.staleness
      ? {
          isStale: input.staleness.isStale,
          score: input.staleness.score,
          reasons: input.staleness.reasons,
          affectedScopes: input.staleness.affectedScopes,
          voiceoverSyncRequired: input.staleness.voiceoverSyncRequired,
        }
      : undefined,
  });
}

/** Detects story edits and updates cached planning staleness metadata. */
export function applyStoryEvolutionOnEdit(input: {
  storyId: string;
  prevScript: FootieScript;
  nextScript: FootieScript;
}): StoryChangeEvent[] {
  const events = detectStoryChanges(input.prevScript, input.nextScript);
  if (events.length === 0) {
    return events;
  }

  const cachedEntry = readPlanningCache(input.storyId);
  if (!cachedEntry) {
    logStoryEvolutionDev({ storyId: input.storyId, events });
    return events;
  }

  const staleness = computePlanningStaleness(events, cachedEntry, input.nextScript);
  updatePlanningCacheStaleness(input.storyId, staleness);
  logStoryEvolutionDev({ storyId: input.storyId, events, staleness });

  return events;
}
