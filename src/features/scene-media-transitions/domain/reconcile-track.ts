/**
 * Keeps mediaTransitions coherent after SceneMediaTimeline mutations.
 * Does not invent Fade or other effects — new adjacency defaults to Cut/absence.
 */

import type { FootieScene } from "@/features/story/types";
import { projectSceneMediaTimeline } from "@/features/scene-media-timeline/adapters/project-scene-media-timeline";

import { cloneSceneMediaTransitionTrack } from "./clone-track";
import { normalizeSceneMediaTransitionTrack } from "./normalize-track";

/**
 * Reconcile stored transitions against the current projected media item order.
 * Preserves only exact ordered adjacent pairs that remain valid.
 */
export function reconcileSceneMediaTransitions(scene: FootieScene): FootieScene {
  const projected = projectSceneMediaTimeline(scene);
  const itemIds = projected.items.map((item) => item.id);
  const { track } = normalizeSceneMediaTransitionTrack(scene.mediaTransitions, itemIds);

  if (!track) {
    if (scene.mediaTransitions == null) {
      return scene;
    }
    const { mediaTransitions: _dropped, ...rest } = scene;
    void _dropped;
    return rest;
  }

  return {
    ...scene,
    mediaTransitions: cloneSceneMediaTransitionTrack(track),
  };
}
