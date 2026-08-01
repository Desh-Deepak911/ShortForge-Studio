/**
 * Shared active-media render view for Preview (Sprint 8D).
 * Pure adapter over projectSceneMediaTimeline + accepted window resolution.
 * Does not invent a second timing algorithm.
 */

import { projectSceneVisualPlan } from "@/features/mixed-media-scenes/adapters/project-visual-sequence";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import type {
  ResolvedMediaWindowProvenance,
  ResolvedSceneMediaWindow,
} from "../resolution/resolve-media-windows";
import { resolveActiveSceneMediaAtElapsed } from "../resolution/resolve-media-windows";
import { sceneMediaToCompatibilityImage } from "./scene-media-to-compatibility-image";

export interface ActiveSceneMediaRenderView {
  readonly mediaItemId: string | null;
  readonly itemIndex: number;
  readonly media: SceneMedia | null;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly windowDurationMs: number;
  readonly itemElapsedMs: number;
  readonly sceneElapsedMs: number;
  readonly sceneDurationMs: number;
  readonly provenance: ResolvedMediaWindowProvenance | "none";
  /** True when scene elapsed is at/beyond scene end (final-frame hold). */
  readonly holdingFinalFrame: boolean;
  /**
   * Narrow scene-shaped input for existing framing/motion adapters.
   * Uses the active item's SceneMedia as `media` (never the wrong item).
   */
  readonly renderScene: Pick<
    FootieScene,
    "id" | "image" | "uploadedImage" | "media" | "duration" | "durationMs"
  >;
}

export interface ResolveActiveSceneMediaRenderViewOptions {
  /**
   * When false, first-item-only windows (deterministic regression / migration tests).
   * Default true — production Preview uses the complete projected timeline.
   * Never read environment variables here.
   */
  readonly multiImageScenesEnabled?: boolean;
  /**
   * Explicit `mixed-media-scenes-v1` decision.
   * Default false (fail-closed). Caller supplies the resolved capability —
   * this module never reads environment variables.
   */
  readonly mixedMediaScenesEnabled?: boolean;
}

function emptyView(
  scene: Pick<FootieScene, "id" | "duration" | "durationMs">,
  sceneElapsedMs: number,
  sceneDurationMs: number,
): ActiveSceneMediaRenderView {
  return {
    mediaItemId: null,
    itemIndex: -1,
    media: null,
    windowStartMs: 0,
    windowEndMs: 0,
    windowDurationMs: 0,
    itemElapsedMs: 0,
    sceneElapsedMs,
    sceneDurationMs,
    provenance: "none",
    holdingFinalFrame: sceneDurationMs > 0 && sceneElapsedMs >= sceneDurationMs,
    renderScene: {
      id: scene.id,
      media: undefined,
      image: undefined,
      uploadedImage: undefined,
      duration: scene.duration,
      durationMs: scene.durationMs,
    },
  };
}

/**
 * Shared construction authority for ordinary active rendering and transition peers.
 * Does not select which item is active — callers supply the exact window + item-local time.
 */
export function buildActiveSceneMediaRenderViewFromWindow(
  scene: Pick<FootieScene, "id" | "duration" | "durationMs">,
  window: ResolvedSceneMediaWindow,
  itemElapsedMs: number,
  sceneElapsedMs: number,
  sceneDurationMs: number,
  provenance: ResolvedMediaWindowProvenance | "none" = window.provenance,
): ActiveSceneMediaRenderView {
  const media = window.media;
  const image = sceneMediaToCompatibilityImage(media);
  const safeItemElapsed =
    typeof itemElapsedMs === "number" && Number.isFinite(itemElapsedMs)
      ? Math.max(0, itemElapsedMs)
      : 0;
  return {
    mediaItemId: window.itemId,
    itemIndex: window.itemIndex,
    media,
    windowStartMs: window.startMs,
    windowEndMs: window.endMs,
    windowDurationMs: window.durationMs,
    itemElapsedMs: safeItemElapsed,
    sceneElapsedMs,
    sceneDurationMs,
    provenance,
    holdingFinalFrame: sceneDurationMs > 0 && sceneElapsedMs >= sceneDurationMs,
    renderScene: {
      id: scene.id,
      media,
      image,
      uploadedImage: undefined,
      duration: scene.duration,
      durationMs: scene.durationMs,
    },
  };
}

/**
 * Resolves the active timeline item for Preview at a scene-local elapsed time.
 * Default → complete projected timeline with accepted boundary semantics.
 * `multiImageScenesEnabled: false` → one first-item compatibility window (tests only).
 */
export function resolveActiveSceneMediaRenderView(
  scene: Pick<
    FootieScene,
    | "id"
    | "image"
    | "uploadedImage"
    | "media"
    | "mediaTimeline"
    | "visualSequence"
    | "duration"
    | "durationMs"
  >,
  sceneElapsedMs: number,
  options: ResolveActiveSceneMediaRenderViewOptions = {},
): ActiveSceneMediaRenderView {
  const multiImageScenesEnabled = options.multiImageScenesEnabled !== false;
  const mixedMediaScenesEnabled = options.mixedMediaScenesEnabled === true;
  const sceneDurationMs = getSceneDurationMs(scene as FootieScene);
  // Explicit capability decision — never implicit "auto" activation.
  const visualPlan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled,
  });
  const projected = visualPlan.timelineProjection;

  if (projected.items.length === 0) {
    return emptyView(scene, sceneElapsedMs, sceneDurationMs);
  }

  const items = multiImageScenesEnabled
    ? projected.items
    : [projected.items[0]!];

  const provenance: ResolvedMediaWindowProvenance = multiImageScenesEnabled
    ? projected.fromStoredTimeline
      ? "stored_timeline"
      : projected.items.length > 0
        ? "legacy_virtual"
        : "empty_fallback"
    : "legacy_virtual";

  const resolution = resolveActiveSceneMediaAtElapsed({
    items,
    sceneDurationMs: visualPlan.sceneDurationMs || sceneDurationMs,
    sceneElapsedMs,
    provenance,
  });

  if (!resolution.active) {
    return emptyView(scene, sceneElapsedMs, sceneDurationMs);
  }

  return buildActiveSceneMediaRenderViewFromWindow(
    scene,
    resolution.active,
    resolution.itemElapsedMs,
    resolution.sceneElapsedMs,
    resolution.sceneDurationMs,
    resolution.provenance,
  );
}

/**
 * Exact peer/item render view by stable media-item ID.
 * Does not use artificial scene times that could select the wrong active item.
 */
export function resolveSceneMediaItemRenderView(
  scene: Pick<
    FootieScene,
    | "id"
    | "image"
    | "uploadedImage"
    | "media"
    | "mediaTimeline"
    | "visualSequence"
    | "duration"
    | "durationMs"
  >,
  mediaItemId: string,
  itemElapsedMs: number,
  options: ResolveActiveSceneMediaRenderViewOptions = {},
): ActiveSceneMediaRenderView | null {
  const id = typeof mediaItemId === "string" ? mediaItemId.trim() : "";
  if (!id) {
    return null;
  }

  const multiImageScenesEnabled = options.multiImageScenesEnabled !== false;
  const sceneDurationMs = getSceneDurationMs(scene as FootieScene);
  const windows = resolvePreviewSceneMediaWindows(scene, { multiImageScenesEnabled });
  const window = windows.find((entry) => entry.itemId === id);
  if (!window || window.durationMs <= 0) {
    return null;
  }

  const safeItemElapsed =
    typeof itemElapsedMs === "number" && Number.isFinite(itemElapsedMs)
      ? Math.max(0, itemElapsedMs)
      : 0;
  // Keep item-local time within the window; final-frame peers use durationMs - 1.
  const clampedItemElapsed = Math.min(safeItemElapsed, Math.max(0, window.durationMs));

  return buildActiveSceneMediaRenderViewFromWindow(
    scene,
    window,
    clampedItemElapsed,
    window.startMs + clampedItemElapsed,
    sceneDurationMs,
    window.provenance,
  );
}

/**
 * Resolves contiguous windows for Preview.
 * Default → complete projected timeline; `multiImageScenesEnabled: false` → first item only.
 */
export function resolvePreviewSceneMediaWindows(
  scene: Pick<
    FootieScene,
    | "id"
    | "image"
    | "uploadedImage"
    | "media"
    | "mediaTimeline"
    | "visualSequence"
    | "duration"
    | "durationMs"
  >,
  options: ResolveActiveSceneMediaRenderViewOptions = {},
): ResolvedSceneMediaWindow[] {
  const multiImageScenesEnabled = options.multiImageScenesEnabled !== false;
  const mixedMediaScenesEnabled = options.mixedMediaScenesEnabled === true;
  const visualPlan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled,
  });
  if (visualPlan.windows.length === 0) {
    return [];
  }
  if (!multiImageScenesEnabled) {
    const first = visualPlan.windows[0]!;
    return [
      {
        ...first,
        itemIndex: 0,
        startMs: 0,
        endMs: visualPlan.sceneDurationMs,
        durationMs: visualPlan.sceneDurationMs,
        provenance: "legacy_virtual",
      },
    ];
  }
  return visualPlan.windows;
}
