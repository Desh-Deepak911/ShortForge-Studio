import type {
  SceneMediaTransitionBoundary,
  SceneMediaTransitionTrack,
} from "@/features/story/types";

export function cloneSceneMediaTransitionBoundary(
  boundary: SceneMediaTransitionBoundary,
): SceneMediaTransitionBoundary {
  return {
    fromItemId: boundary.fromItemId,
    toItemId: boundary.toItemId,
    effect: boundary.effect,
    durationMs: boundary.durationMs,
  };
}

export function cloneSceneMediaTransitionTrack(
  track: SceneMediaTransitionTrack,
): SceneMediaTransitionTrack {
  return {
    version: 1,
    boundaries: track.boundaries.map(cloneSceneMediaTransitionBoundary),
  };
}
