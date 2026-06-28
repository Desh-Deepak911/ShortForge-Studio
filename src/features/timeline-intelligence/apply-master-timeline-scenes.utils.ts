import type { FootieScene } from "@/features/story/types";

import type { MasterTimeline, SceneTimelineEvent } from "./timeline.types";
import { getTimelineTrackByType } from "./timeline-utils";

/**
 * Applies MasterTimeline scene windows to a story copy (timing fields only).
 * Does not mutate caption, media, or subtitle copy.
 */
export function applyMasterTimelineSceneTiming(
  scenes: FootieScene[],
  masterTimeline: MasterTimeline,
): FootieScene[] {
  const sceneTrack = getTimelineTrackByType(masterTimeline.tracks, "scene");
  if (!sceneTrack || sceneTrack.events.length === 0) {
    return scenes;
  }

  const eventBySceneId = new Map<string, SceneTimelineEvent>(
    sceneTrack.events.map((event) => {
      const sceneEvent = event as SceneTimelineEvent;
      return [sceneEvent.metadata.sceneId, sceneEvent];
    }),
  );

  return scenes.map((scene) => {
    const event = eventBySceneId.get(scene.id);
    if (!event) {
      return scene;
    }

    const startMs = event.startMs;
    const endMs = event.endMs;
    const durationMs = event.durationMs;

    return {
      ...scene,
      startMs,
      endMs,
      durationMs,
      start: startMs / 1000,
      end: endMs / 1000,
      duration: durationMs / 1000,
    };
  });
}
