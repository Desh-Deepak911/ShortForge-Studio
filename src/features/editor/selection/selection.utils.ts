import { isSelectableSceneMediaItemId } from "@/features/scene-media-timeline/editor";
import { isSelectableSceneMediaTransitionPair } from "@/features/scene-media-transitions";
import type { FootieScene, FootieScript } from "@/features/story/types";

import { SelectionType, type SelectedMediaTransitionPair } from "./selection.types";

/**
 * Pure reconciliation for stale media-item selection authority.
 * Clears stored ID when it no longer exists on the scene projection.
 * Does not resurrect later if an unrelated item reuses the same ID after clear.
 */
export function reconcileMediaItemSelectionAuthority(input: {
  storedMediaItemId: string | null;
  selectionFocus: SelectionType;
  scene: FootieScene | null;
  /**
   * Optional capability-aware selectability (Sprint 12B).
   * Defaults to Sprint 8 projected mediaTimeline / legacy virtual ids.
   */
  isItemSelectable?: (scene: FootieScene, mediaItemId: string) => boolean;
}): {
  storedMediaItemId: string | null;
  selectionFocus: SelectionType;
  didClear: boolean;
} {
  const { storedMediaItemId, selectionFocus, scene } = input;
  const isItemSelectable =
    input.isItemSelectable ??
    ((candidate: FootieScene, mediaItemId: string) =>
      isSelectableSceneMediaItemId(candidate, mediaItemId));
  if (!storedMediaItemId) {
    return {
      storedMediaItemId: null,
      selectionFocus,
      didClear: false,
    };
  }
  if (scene && isItemSelectable(scene, storedMediaItemId)) {
    return {
      storedMediaItemId,
      selectionFocus,
      didClear: false,
    };
  }
  return {
    storedMediaItemId: null,
    selectionFocus:
      selectionFocus === SelectionType.SceneMediaItem
        ? SelectionType.Scene
        : selectionFocus,
    didClear: true,
  };
}

export function resolveSafeSceneIndex(
  scenes: FootieScript["scenes"],
  selectedSceneIndex: number,
): number {
  if (scenes.length === 0) {
    return -1;
  }

  return Math.min(Math.max(selectedSceneIndex, 0), scenes.length - 1);
}

export function resolveSelectedScene(script: FootieScript, selectedSceneIndex: number) {
  const safeIndex = resolveSafeSceneIndex(script.scenes, selectedSceneIndex);
  return safeIndex >= 0 ? (script.scenes[safeIndex] ?? null) : null;
}

export function resolveSceneIndexById(script: FootieScript, sceneId: string): number {
  return script.scenes.findIndex((scene) => scene.id === sceneId);
}

/**
 * Clears stale media-transition selection when the pair is no longer adjacent.
 * Does not resurrect cleared IDs.
 */
export function reconcileMediaTransitionSelectionAuthority(input: {
  storedTransition: SelectedMediaTransitionPair | null;
  selectionFocus: SelectionType;
  scene: FootieScene | null;
}): {
  storedTransition: SelectedMediaTransitionPair | null;
  selectionFocus: SelectionType;
  didClear: boolean;
} {
  const { storedTransition, selectionFocus, scene } = input;
  if (!storedTransition) {
    return { storedTransition: null, selectionFocus, didClear: false };
  }
  if (
    scene &&
    isSelectableSceneMediaTransitionPair(
      scene,
      storedTransition.fromItemId,
      storedTransition.toItemId,
    )
  ) {
    return { storedTransition, selectionFocus, didClear: false };
  }
  return {
    storedTransition: null,
    selectionFocus:
      selectionFocus === SelectionType.SceneMediaTransition
        ? SelectionType.Scene
        : selectionFocus,
    didClear: true,
  };
}
