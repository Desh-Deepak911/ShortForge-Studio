/**
 * Total, non-throwing semantic signatures for media-patch classification.
 * Structured JSON — never delimiter-joins boundary fields.
 */

import type { FootieScene } from "@/features/story/types";
import { projectSceneMediaTimeline } from "@/features/scene-media-timeline/adapters/project-scene-media-timeline";

import { normalizeSceneMediaTransitionTrack } from "./normalize-track";

function asSceneLike(input: unknown): FootieScene | null {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  return {
    id: typeof record.id === "string" && record.id.length > 0 ? record.id : "__signature__",
    start: 0,
    end: 0,
    duration: typeof record.duration === "number" ? record.duration : 0,
    durationMs: typeof record.durationMs === "number" ? record.durationMs : undefined,
    subtitle: "",
    image: record.image as FootieScene["image"],
    uploadedImage: record.uploadedImage as FootieScene["uploadedImage"],
    media: record.media as FootieScene["media"],
    mediaTimeline: record.mediaTimeline as FootieScene["mediaTimeline"],
    mediaTransitions: record.mediaTransitions as FootieScene["mediaTransitions"],
  };
}

/**
 * Semantic signature of the scene's valid intra-scene transition track.
 * - Accepts malformed runtime input without throwing.
 * - Normalizes against projected media-item order.
 * - Ignores invalid/stale records.
 * - Canonical adjacency order (equivalent tracks with different array order match).
 * - Does not mutate input.
 */
export function sceneMediaTransitionTrackSignature(input: unknown): string {
  try {
    const scene = asSceneLike(input);
    if (!scene) {
      return "";
    }

    const projected = projectSceneMediaTimeline(scene);
    const itemIds = projected.items.map((item) => item.id);
    const { track } = normalizeSceneMediaTransitionTrack(scene.mediaTransitions, itemIds);
    if (!track || track.boundaries.length === 0) {
      return "";
    }

    return JSON.stringify({
      version: 1 as const,
      boundaries: track.boundaries.map((boundary) => ({
        fromItemId: boundary.fromItemId,
        toItemId: boundary.toItemId,
        effect: boundary.effect,
        durationMs: boundary.durationMs,
      })),
    });
  } catch {
    return "";
  }
}

export function sceneMediaTransitionsChanged(prev: unknown, next: unknown): boolean {
  return (
    sceneMediaTransitionTrackSignature(prev) !== sceneMediaTransitionTrackSignature(next)
  );
}
