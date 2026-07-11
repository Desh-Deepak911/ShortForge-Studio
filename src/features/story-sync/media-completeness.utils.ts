import type { FootieScript } from "@/features/story/types";
import { sceneHasMedia } from "@/features/story/utils";

/** Per-scene media readiness derived from the current script. */
export interface MediaCompletenessState {
  totalScenes: number;
  scenesWithMedia: number;
  /** Scene ids without ready media (image URL or video URL + duration). */
  scenesMissingMedia: string[];
  isComplete: boolean;
  hasScenes: boolean;
  completionPercent: number;
}

/** Resolves media completeness from scene media readiness (`sceneHasMedia`). */
export function resolveMediaCompleteness(script: FootieScript): MediaCompletenessState {
  const scenes = script.scenes ?? [];
  const totalScenes = scenes.length;
  const scenesMissingMedia: string[] = [];
  let scenesWithMedia = 0;

  for (const scene of scenes) {
    if (sceneHasMedia(scene)) {
      scenesWithMedia += 1;
    } else {
      scenesMissingMedia.push(scene.id);
    }
  }

  const hasScenes = totalScenes > 0;
  const isComplete = hasScenes && scenesMissingMedia.length === 0;
  const completionPercent =
    totalScenes > 0 ? Math.round((scenesWithMedia / totalScenes) * 100) : 0;

  return {
    totalScenes,
    scenesWithMedia,
    scenesMissingMedia,
    isComplete,
    hasScenes,
    completionPercent,
  };
}

/** Human-readable scene numbers for missing-media UI (1-based). */
export function formatMissingSceneNumbers(
  script: FootieScript,
  missingSceneIds: string[],
): number[] {
  return missingSceneIds
    .map((sceneId) => script.scenes.findIndex((scene) => scene.id === sceneId))
    .filter((index) => index >= 0)
    .map((index) => index + 1)
    .sort((left, right) => left - right);
}

/** Compact label for missing scene numbers, e.g. "Scenes 1, 3, 5". */
export function formatMissingSceneNumbersLabel(
  script: FootieScript,
  missingSceneIds: string[],
): string {
  const numbers = formatMissingSceneNumbers(script, missingSceneIds);
  if (numbers.length === 0) {
    return "";
  }

  if (numbers.length === 1) {
    return `Scene ${numbers[0]}`;
  }

  return `Scenes ${numbers.join(", ")}`;
}
