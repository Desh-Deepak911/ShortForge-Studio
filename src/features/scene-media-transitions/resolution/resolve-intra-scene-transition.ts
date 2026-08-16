/**
 * Pure semantic resolver for intra-scene media transitions (Sprint 9A).
 * Centered continuous overlay. Does not import Preview or Export.
 */

import type { FootieScene, TransitionEffect } from "@/features/story/types";
import {
  projectSceneMediaTimeline,
  resolveProjectedSceneMediaWindows,
} from "@/features/scene-media-timeline/adapters/project-scene-media-timeline";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import { resolveCanonicalIntraSceneTransitionProgress } from "@/features/timeline-intelligence/resolve-canonical-transition-frame.utils";

import { normalizeSceneMediaTransitionTrack } from "../domain/normalize-track";
import { resolveEffectiveIntraSceneTransitionDurationMs } from "./resolve-effective-duration";
import {
  resolveContinuousIntraSceneTransitionTiming,
  resolveContinuousTransitionFootageAvailability,
} from "./resolve-continuous-intra-scene-transition-timing";

export interface ResolvedIntraSceneTransition {
  readonly sceneId: string;
  readonly fromItemId: string;
  readonly toItemId: string;
  readonly fromItemIndex: number;
  readonly toItemIndex: number;
  readonly effect: TransitionEffect;
  readonly requestedDurationMs: number;
  readonly effectiveDurationMs: number;
  readonly overlayStartMs: number;
  readonly overlayEndMs: number;
  /** Progress in [0, 1) while active; 0 when inactive/at start. */
  readonly progress: number;
  /** Outgoing item-local time advancing through the overlap. */
  readonly outgoingItemLocalMs: number;
  /** Incoming item-local elapsed advancing from 0. */
  readonly incomingItemLocalMs: number;
  readonly active: boolean;
}

function inactiveResult(
  sceneId: string,
  extras: Partial<ResolvedIntraSceneTransition> = {},
): ResolvedIntraSceneTransition {
  return {
    sceneId,
    fromItemId: "",
    toItemId: "",
    fromItemIndex: -1,
    toItemIndex: -1,
    effect: "cut",
    requestedDurationMs: 0,
    effectiveDurationMs: 0,
    overlayStartMs: 0,
    overlayEndMs: 0,
    progress: 0,
    outgoingItemLocalMs: 0,
    incomingItemLocalMs: 0,
    active: false,
    ...extras,
  };
}

/**
 * Resolves the active intra-scene transition overlay at scene-local elapsed ms.
 * Uses [startMs, endMs) overlay semantics. Scene end → inactive.
 */
export function resolveIntraSceneTransitionAtElapsed(
  scene: FootieScene,
  sceneElapsedMs: number,
  fps = 30,
): ResolvedIntraSceneTransition {
  const sceneId = scene.id;
  const sceneDurationMs = getSceneDurationMs(scene);
  const elapsed =
    typeof sceneElapsedMs === "number" && Number.isFinite(sceneElapsedMs)
      ? Math.max(0, sceneElapsedMs)
      : 0;

  if (sceneDurationMs <= 0 || elapsed >= sceneDurationMs) {
    return inactiveResult(sceneId);
  }

  const projected = projectSceneMediaTimeline(scene);
  if (projected.items.length < 2) {
    return inactiveResult(sceneId);
  }

  const windows = resolveProjectedSceneMediaWindows(scene);
  const itemIds = projected.items.map((item) => item.id);
  const { track } = normalizeSceneMediaTransitionTrack(scene.mediaTransitions, itemIds);
  if (!track || track.boundaries.length === 0) {
    return inactiveResult(sceneId);
  }

  for (const boundary of track.boundaries) {
    const fromIndex = windows.findIndex((w) => w.itemId === boundary.fromItemId);
    const toIndex = windows.findIndex((w) => w.itemId === boundary.toItemId);
    if (fromIndex < 0 || toIndex !== fromIndex + 1) {
      continue;
    }
    const fromWindow = windows[fromIndex]!;
    const toWindow = windows[toIndex]!;

    const effectiveDurationMs = resolveEffectiveIntraSceneTransitionDurationMs({
      requestedDurationMs: boundary.durationMs,
      fromWindowDurationMs: fromWindow.durationMs,
      toWindowDurationMs: toWindow.durationMs,
    });

    if (effectiveDurationMs <= 0 || boundary.effect === "cut") {
      continue;
    }

    const footage = resolveContinuousTransitionFootageAvailability({
      fromMedia: projected.items[fromIndex]?.media,
      toMedia: projected.items[toIndex]?.media,
      fromWindowDurationMs: fromWindow.durationMs,
      effectiveDurationMs,
    });
    if (!footage.allowed) {
      continue;
    }

    const continuousTiming = resolveContinuousIntraSceneTransitionTiming({
      boundaryMs: toWindow.startMs,
      effectiveDurationMs,
      fromWindowDurationMs: fromWindow.durationMs,
      toWindowDurationMs: toWindow.durationMs,
      sceneElapsedMs: elapsed,
    });
    if (!continuousTiming) {
      continue;
    }

    const overlayStartMs = continuousTiming.overlayStartMs;
    const overlayEndMs = continuousTiming.overlayEndMs;

    const progress = resolveCanonicalIntraSceneTransitionProgress({
      sceneElapsedMs: elapsed,
      overlayStartOffsetMs: overlayStartMs,
      overlayEndOffsetMs: overlayEndMs,
      effectiveDurationMs,
      fps,
    });
    if (progress === null) {
      continue;
    }

    return {
      sceneId,
      fromItemId: boundary.fromItemId,
      toItemId: boundary.toItemId,
      fromItemIndex: fromIndex,
      toItemIndex: toIndex,
      effect: boundary.effect,
      requestedDurationMs: boundary.durationMs,
      effectiveDurationMs,
      overlayStartMs,
      overlayEndMs,
      progress,
      outgoingItemLocalMs: continuousTiming.outgoingItemLocalMs,
      incomingItemLocalMs: continuousTiming.incomingItemLocalMs,
      active: true,
    };
  }

  return inactiveResult(sceneId);
}

/** Preview seam — implemented in preview/compose-intra-scene-transition-preview.ts (Sprint 9B). */
export const INTRA_SCENE_TRANSITION_PREVIEW_SEAM =
  "Sprint 9B: Preview consumes resolveIntraSceneTransitionAtElapsed + resolveTransitionEffectLayers via composeIntraSceneTransitionPreview";

/** Export seam — ExportManifest v3 / renderer "9C" (Sprint 9C). */
export const INTRA_SCENE_TRANSITION_EXPORT_SEAM =
  "Sprint 9C: Production ExportManifest is v3 / 9C with frozen mediaTransitions; v2 / 8D remains frozen hard-cut backward-compatible";
