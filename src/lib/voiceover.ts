import { revokeBlobUrl } from "@/lib/blobUrl";
import { getStoryTotalDuration } from "@/lib/sceneTiming";
import { recalculateSceneTimings } from "@/lib/timeline";
import {
  ensureTimelineItems,
  normalizeSceneIds,
  scenesStructurallyEqual,
  syncTimelineItemsWithScenes,
  syncTimelineSceneRefs,
  updateSceneInScenes,
  updateTransitionInTimeline,
  type SceneTimelineUpdates,
  type TransitionTimelineUpdates,
} from "@/lib/timelineItems";
import type { FootieScene, FootieScript } from "@/types/footiebitz";

/**
 * Narration only needs to be recreated when the narration TEXT changes.
 * Scene additions, removals, reorderings, and duration edits do not affect
 * the audio — the FFmpeg mux trims/pads to match the final video duration.
 */
function narrationNeedsRefresh(prev: FootieScript, next: FootieScript): boolean {
  return prev.narration !== next.narration;
}

/**
 * Applies a story update, revoking and clearing any stale narration blob URL
 * when the narration text has changed.
 */
export function applyStoryUpdate(prev: FootieScript, next: FootieScript): FootieScript {
  const synced = syncFootieScript(next, prev);

  if (!prev.voiceoverUrl || !narrationNeedsRefresh(prev, synced)) {
    return synced;
  }

  revokeBlobUrl(prev.voiceoverUrl);
  return { ...synced, voiceoverUrl: undefined };
}

/**
 * Patches a scene in the story and keeps the timeline in sync.
 * Does not modify narration text or trigger AI generation.
 */
export function applySceneUpdate(
  script: FootieScript,
  sceneId: string,
  updates: SceneTimelineUpdates,
): FootieScript {
  return syncFootieScript(
    {
      ...script,
      scenes: recalculateSceneTimings(updateSceneInScenes(script.scenes, sceneId, updates)),
    },
    script,
  );
}

/**
 * Replaces the full scene list and rebuilds timeline items.
 * Does not modify narration text or trigger AI generation.
 */
export function applyScenesUpdate(script: FootieScript, scenes: FootieScene[]): FootieScript {
  return syncFootieScript(
    {
      ...script,
      scenes: recalculateSceneTimings(scenes),
    },
    script,
  );
}

/**
 * Patches a transition item in the timeline. Does not modify scenes, narration,
 * captions, or voiceover — and never triggers AI generation.
 */
export function applyTransitionUpdate(
  script: FootieScript,
  transitionId: string,
  updates: TransitionTimelineUpdates,
): FootieScript {
  const timelineItems = updateTransitionInTimeline(
    ensureTimelineItems(script.scenes, script.timelineItems),
    transitionId,
    updates,
  );

  return syncFootieScript({ ...script, timelineItems }, script);
}

/**
 * Normalizes scenes and timeline items for legacy stories missing timelineItems.
 * Recomputes totalDuration and keeps timeline items in sync with scenes.
 */
export function syncFootieScript(script: FootieScript, previous?: FootieScript): FootieScript {
  const scenes = normalizeSceneIds(script.scenes ?? []);
  const totalDuration = getStoryTotalDuration(scenes);
  const scenesChanged = !previous || !scenesStructurallyEqual(previous.scenes, scenes);

  const sourceTimeline = script.timelineItems?.length
    ? script.timelineItems
    : previous?.timelineItems;

  let timelineItems;

  if (scenesChanged) {
    timelineItems = syncTimelineItemsWithScenes(scenes, sourceTimeline);
  } else if (script.timelineItems?.length) {
    // Transition-only edits — preserve the provided timeline, refresh scene refs.
    timelineItems = syncTimelineSceneRefs(scenes, script.timelineItems);
  } else {
    timelineItems = syncTimelineSceneRefs(scenes, ensureTimelineItems(scenes, sourceTimeline));
  }

  return { ...script, scenes, totalDuration, timelineItems };
}
