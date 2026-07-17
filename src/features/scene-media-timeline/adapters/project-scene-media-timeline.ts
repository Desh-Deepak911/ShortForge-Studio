/**
 * Pure read adapters: stored timeline → projected items, else legacy virtual item.
 * Does not mutate the input scene and does not persist migrations.
 */

import type {
  FootieScene,
  SceneMedia,
  SceneMediaTimeline,
  SceneMediaTimelineItem,
} from "@/features/story/types";
import { getSceneDurationMs, getSceneMedia } from "@/features/story/utils/scene.utils";

import { buildLegacyVirtualMediaItemId } from "../domain/legacy-virtual-id";
import {
  normalizeSceneMediaTimeline,
  type SceneMediaTimelineDiagnostic,
} from "../domain/normalize-timeline";
import {
  resolveActiveSceneMediaAtElapsed,
  resolveSceneMediaWindows,
  type ActiveSceneMediaResolution,
  type ResolvedSceneMediaWindow,
} from "../resolution/resolve-media-windows";

export interface ProjectedSceneMediaTimeline {
  items: SceneMediaTimelineItem[];
  /** True when items came from a stored mediaTimeline. */
  fromStoredTimeline: boolean;
  diagnostics: SceneMediaTimelineDiagnostic[];
  sceneDurationMs: number;
}

function buildLegacyVirtualItem(
  scene: Pick<FootieScene, "id" | "image" | "uploadedImage" | "media">,
  media: SceneMedia,
): SceneMediaTimelineItem {
  return {
    id: buildLegacyVirtualMediaItemId(scene.id),
    media,
    durationWeight: 1,
  };
}

/**
 * Projects ordered timeline items for a scene without mutating it.
 * Valid stored timeline wins; otherwise legacy media becomes one virtual full-scene item.
 */
export function projectSceneMediaTimeline(
  scene: Pick<
    FootieScene,
    "id" | "image" | "uploadedImage" | "media" | "mediaTimeline" | "duration" | "durationMs"
  >,
): ProjectedSceneMediaTimeline {
  const sceneDurationMs = getSceneDurationMs(scene as FootieScene);
  const stored = normalizeSceneMediaTimeline(scene.mediaTimeline);

  if (stored.timeline && stored.timeline.items.length > 0) {
    return {
      items: stored.timeline.items.map((item) => ({
        id: item.id,
        durationWeight: item.durationWeight,
        media: item.media,
      })),
      fromStoredTimeline: true,
      diagnostics: stored.diagnostics,
      sceneDurationMs,
    };
  }

  const diagnostics = [...stored.diagnostics];
  const legacyMedia = getSceneMedia(scene);
  if (!legacyMedia) {
    return {
      items: [],
      fromStoredTimeline: false,
      diagnostics,
      sceneDurationMs,
    };
  }

  return {
    items: [buildLegacyVirtualItem(scene, legacyMedia)],
    fromStoredTimeline: false,
    diagnostics,
    sceneDurationMs,
  };
}

/** Resolves contiguous scene-local windows for the projected timeline. */
export function resolveProjectedSceneMediaWindows(
  scene: Pick<
    FootieScene,
    "id" | "image" | "uploadedImage" | "media" | "mediaTimeline" | "duration" | "durationMs"
  >,
): ResolvedSceneMediaWindow[] {
  const projected = projectSceneMediaTimeline(scene);
  return resolveSceneMediaWindows({
    items: projected.items,
    sceneDurationMs: projected.sceneDurationMs,
    provenance: projected.fromStoredTimeline ? "stored_timeline" : "legacy_virtual",
  });
}

/** Resolves the active projected media item at a scene-local elapsed time. */
export function resolveProjectedActiveSceneMedia(
  scene: Pick<
    FootieScene,
    "id" | "image" | "uploadedImage" | "media" | "mediaTimeline" | "duration" | "durationMs"
  >,
  sceneElapsedMs: number,
): ActiveSceneMediaResolution {
  const projected = projectSceneMediaTimeline(scene);
  return resolveActiveSceneMediaAtElapsed({
    items: projected.items,
    sceneDurationMs: projected.sceneDurationMs,
    sceneElapsedMs,
    provenance: projected.fromStoredTimeline
      ? "stored_timeline"
      : projected.items.length > 0
        ? "legacy_virtual"
        : "empty_fallback",
  });
}

/**
 * Returns the stored timeline only when it normalizes to usable items.
 * Does not fall back to legacy (use projectSceneMediaTimeline for that).
 */
export function readStoredSceneMediaTimeline(
  scene: Pick<FootieScene, "mediaTimeline">,
): { timeline: SceneMediaTimeline | undefined; diagnostics: SceneMediaTimelineDiagnostic[] } {
  return normalizeSceneMediaTimeline(scene.mediaTimeline);
}
