/**
 * Atomic editor commands for intra-scene media transitions (Sprint 9A).
 * Rejects invalid proposed state rather than partially committing.
 * Does not mutate the input scene or nested arrays.
 */

import type { FootieScene, TransitionEffect } from "@/features/story/types";
import { projectSceneMediaTimeline } from "@/features/scene-media-timeline";

import { cloneSceneMediaTransitionTrack } from "../domain/clone-track";
import {
  isSupportedIntraSceneTransitionDuration,
  isSupportedIntraSceneTransitionEffect,
  pairKey,
} from "../domain/effect-support";
import { normalizeSceneMediaTransitionTrack } from "../domain/normalize-track";
import { reconcileSceneMediaTransitions } from "../domain/reconcile-track";

export class SceneMediaTransitionCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SceneMediaTransitionCommandError";
  }
}

export interface SceneMediaTransitionCommandResult {
  readonly scene: FootieScene;
}

function assertAdjacentPair(scene: FootieScene, fromItemId: string, toItemId: string): void {
  const projected = projectSceneMediaTimeline(scene);
  const ids = projected.items.map((item) => item.id);
  const fromIndex = ids.indexOf(fromItemId);
  const toIndex = ids.indexOf(toItemId);
  if (fromIndex < 0 || toIndex < 0) {
    throw new SceneMediaTransitionCommandError(
      "Transition boundary references an unknown media item.",
    );
  }
  if (toIndex !== fromIndex + 1) {
    throw new SceneMediaTransitionCommandError(
      "Transition boundary must reference currently adjacent media items in order.",
    );
  }
}

/**
 * Rebuild a track in media-timeline adjacency order from a pair map.
 * Empty map → undefined (Cut everywhere).
 */
function trackFromPairMap(
  itemIds: readonly string[],
  byPair: Map<
    string,
    { fromItemId: string; toItemId: string; effect: TransitionEffect; durationMs: number }
  >,
): FootieScene["mediaTransitions"] {
  const boundaries: NonNullable<FootieScene["mediaTransitions"]>["boundaries"] = [];
  for (let i = 0; i < itemIds.length - 1; i += 1) {
    const fromItemId = itemIds[i]!;
    const toItemId = itemIds[i + 1]!;
    const entry = byPair.get(pairKey(fromItemId, toItemId));
    if (entry) {
      boundaries.push({
        fromItemId: entry.fromItemId,
        toItemId: entry.toItemId,
        effect: entry.effect,
        durationMs: entry.durationMs,
      });
    }
  }
  if (boundaries.length === 0) {
    return undefined;
  }
  return { version: 1, boundaries };
}

/**
 * Sets a non-Cut effect for an adjacent pair, or removes the record when effect is Cut.
 */
export function setSceneMediaTransitionBoundary(
  scene: FootieScene,
  fromItemId: string,
  toItemId: string,
  effect: TransitionEffect,
  durationMs: number,
): SceneMediaTransitionCommandResult {
  assertAdjacentPair(scene, fromItemId, toItemId);

  const projected = projectSceneMediaTimeline(scene);
  const itemIds = projected.items.map((item) => item.id);
  const normalized = normalizeSceneMediaTransitionTrack(scene.mediaTransitions, itemIds);
  const byPair = new Map<
    string,
    { fromItemId: string; toItemId: string; effect: TransitionEffect; durationMs: number }
  >();
  for (const boundary of normalized.track?.boundaries ?? []) {
    byPair.set(pairKey(boundary.fromItemId, boundary.toItemId), {
      fromItemId: boundary.fromItemId,
      toItemId: boundary.toItemId,
      effect: boundary.effect,
      durationMs: boundary.durationMs,
    });
  }

  const key = pairKey(fromItemId, toItemId);

  if (effect === "cut") {
    byPair.delete(key);
    const nextTrack = trackFromPairMap(itemIds, byPair);
    if (!nextTrack) {
      if (scene.mediaTransitions == null) {
        return { scene };
      }
      const { mediaTransitions: _dropped, ...rest } = scene;
      void _dropped;
      return { scene: rest };
    }
    return {
      scene: {
        ...scene,
        mediaTransitions: cloneSceneMediaTransitionTrack(nextTrack),
      },
    };
  }

  if (!isSupportedIntraSceneTransitionEffect(effect)) {
    throw new SceneMediaTransitionCommandError(
      "Unsupported intra-scene transition effect.",
    );
  }
  if (!isSupportedIntraSceneTransitionDuration(durationMs)) {
    throw new SceneMediaTransitionCommandError(
      "Unsupported transition duration. Use 300, 500, 800, or 1000 ms.",
    );
  }

  byPair.set(key, { fromItemId, toItemId, effect, durationMs });
  const nextTrack = trackFromPairMap(itemIds, byPair)!;

  return {
    scene: {
      ...scene,
      mediaTransitions: cloneSceneMediaTransitionTrack(nextTrack),
    },
  };
}

export function resetSceneMediaTransitionBoundary(
  scene: FootieScene,
  fromItemId: string,
  toItemId: string,
): SceneMediaTransitionCommandResult {
  return setSceneMediaTransitionBoundary(scene, fromItemId, toItemId, "cut", 500);
}

/** Public reconcile used by Scene Media Timeline command writes. */
export function reconcileSceneMediaTransitionsAfterTimelineWrite(
  scene: FootieScene,
): FootieScene {
  return reconcileSceneMediaTransitions(scene);
}
