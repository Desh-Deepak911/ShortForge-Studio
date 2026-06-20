import { normalizeSceneSettings } from "@/lib/sceneImage";
import type { FootieScene, SceneType } from "@/types/footiebitz";

const DEFAULT_SCENE_DURATION = 3;
const DEFAULT_SCENE_SUBTITLE = "Add subtitle...";

/**
 * Recomputes start/end for every scene based on sequential durations.
 * The first scene starts at 0; each subsequent scene starts where the previous ends.
 * Duration is clamped to a minimum of 1 second.
 */
export function recalculateSceneTimings(scenes: FootieScene[]): FootieScene[] {
  let cursor = 0;

  return scenes.map((scene) => {
    const duration = Math.max(1, scene.duration);
    const start = cursor;
    const end = start + duration;
    cursor = end;

    return { ...scene, start, end, duration };
  });
}

/**
 * Returns the sum of all scene durations (ignores start/end, so it stays
 * correct even before timings are recalculated).
 */
export function getTotalDuration(scenes: FootieScene[]): number {
  return scenes.reduce((sum, scene) => sum + Math.max(1, scene.duration), 0);
}

/**
 * Creates a new blank scene with a unique id and temporary start/end values of 0.
 * Call recalculateSceneTimings on the full list after inserting to get correct timings.
 */
export function createEmptyScene(type: SceneType = "transition"): FootieScene {
  return normalizeSceneSettings({
    id: generateSceneId(),
    start: 0,
    end: DEFAULT_SCENE_DURATION,
    duration: DEFAULT_SCENE_DURATION,
    subtitle: DEFAULT_SCENE_SUBTITLE,
    sceneType: type,
  });
}

/**
 * Returns a deep copy of a scene with a fresh unique id.
 * Preserves all fields including sceneType and image metadata.
 */
export function duplicateScene(scene: FootieScene): FootieScene {
  return normalizeSceneSettings({ ...scene, id: generateSceneId() });
}

function generateSceneId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `scene-${timestamp}-${random}`;
}
