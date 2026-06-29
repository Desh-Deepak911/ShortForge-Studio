import { createEmptyScene, duplicateScene, getSceneImageUrl } from "@/features/story/utils";
import { applyScenesUpdate } from "@/lib/utils/voiceover";
import type { FootieScene, FootieScript } from "@/features/story/types";

export interface TimelineSceneCommandResult {
  script: FootieScript;
  selectSceneId: string;
}

function isBlobUrl(url: string) {
  return url.startsWith("blob:");
}

function resolveSceneIndex(script: FootieScript, sceneId: string): number {
  return script.scenes.findIndex((scene) => scene.id === sceneId);
}

function commitScenes(script: FootieScript, scenes: FootieScene[]): FootieScript {
  return applyScenesUpdate(script, scenes);
}

function revokeUnsharedSceneBlob(scenes: FootieScene[], removedIndex: number) {
  const removed = scenes[removedIndex];
  if (!removed) {
    return;
  }

  const imgUrl = getSceneImageUrl(removed);
  if (!imgUrl || !isBlobUrl(imgUrl)) {
    return;
  }

  const isShared = scenes.some(
    (scene, index) => index !== removedIndex && getSceneImageUrl(scene) === imgUrl,
  );

  if (!isShared) {
    URL.revokeObjectURL(imgUrl);
  }
}

/** Inserts a duplicate of the target scene immediately after it. */
export function duplicateTimelineScene(
  script: FootieScript,
  sceneId: string,
): TimelineSceneCommandResult | null {
  const index = resolveSceneIndex(script, sceneId);
  if (index < 0) {
    return null;
  }

  const source = script.scenes[index];
  if (!source) {
    return null;
  }

  const duplicated = duplicateScene(source);
  const nextScenes = [...script.scenes];
  nextScenes.splice(index + 1, 0, duplicated);

  return {
    script: commitScenes(script, nextScenes),
    selectSceneId: duplicated.id,
  };
}

/** Removes the target scene and selects a nearby remaining scene. */
export function deleteTimelineScene(
  script: FootieScript,
  sceneId: string,
): TimelineSceneCommandResult | null {
  const index = resolveSceneIndex(script, sceneId);
  if (index < 0 || script.scenes.length <= 1) {
    return null;
  }

  revokeUnsharedSceneBlob(script.scenes, index);

  const nextScenes = script.scenes.filter((_, sceneIndex) => sceneIndex !== index);
  const nextIndex = Math.min(index, nextScenes.length - 1);
  const selectScene = nextScenes[nextIndex];

  if (!selectScene) {
    return null;
  }

  return {
    script: commitScenes(script, nextScenes),
    selectSceneId: selectScene.id,
  };
}

/** Inserts a blank scene before the target scene. */
export function insertTimelineSceneBefore(
  script: FootieScript,
  sceneId: string,
): TimelineSceneCommandResult | null {
  const index = resolveSceneIndex(script, sceneId);
  if (index < 0) {
    return null;
  }

  const inserted = createEmptyScene("transition");
  const nextScenes = [...script.scenes];
  nextScenes.splice(index, 0, inserted);

  return {
    script: commitScenes(script, nextScenes),
    selectSceneId: inserted.id,
  };
}

/** Inserts a blank scene after the target scene. */
export function insertTimelineSceneAfter(
  script: FootieScript,
  sceneId: string,
): TimelineSceneCommandResult | null {
  const index = resolveSceneIndex(script, sceneId);
  if (index < 0) {
    return null;
  }

  const inserted = createEmptyScene("transition");
  const nextScenes = [...script.scenes];
  nextScenes.splice(index + 1, 0, inserted);

  return {
    script: commitScenes(script, nextScenes),
    selectSceneId: inserted.id,
  };
}

/**
 * Moves a scene to `targetIndex` in the scene list.
 * Uses applyScenesUpdate — timelineItems/transitions resync via existing helpers.
 *
 * Note: reorder may recalculate subtitles-mode narration excerpts through applyStoryUpdate/syncFootieScript.
 * Do not alter sync behavior here.
 */
export function reorderTimelineScene(
  script: FootieScript,
  sceneId: string,
  targetIndex: number,
): TimelineSceneCommandResult | null {
  const sourceIndex = resolveSceneIndex(script, sceneId);
  if (sourceIndex < 0) {
    return null;
  }

  const clampedTarget = Math.max(0, Math.min(targetIndex, script.scenes.length - 1));
  if (sourceIndex === clampedTarget) {
    return {
      script,
      selectSceneId: sceneId,
    };
  }

  const nextScenes = [...script.scenes];
  const [moved] = nextScenes.splice(sourceIndex, 1);
  if (!moved) {
    return null;
  }

  nextScenes.splice(clampedTarget, 0, moved);

  return {
    script: commitScenes(script, nextScenes),
    selectSceneId: moved.id,
  };
}

/** Preview-order helper for drag UI — does not mutate the document. */
export function previewSceneOrder(
  sceneIds: string[],
  sourceIndex: number,
  targetIndex: number,
): string[] {
  if (sourceIndex === targetIndex) {
    return sceneIds;
  }

  const next = [...sceneIds];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) {
    return sceneIds;
  }

  const clampedTarget = Math.max(0, Math.min(targetIndex, next.length));
  next.splice(clampedTarget, 0, moved);
  return next;
}
