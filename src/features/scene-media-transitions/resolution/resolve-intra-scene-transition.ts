/**
 * Pure semantic resolver for intra-scene media transitions (Sprint 9A).
 * Head-of-incoming overlay. Does not import Preview or Export.
 */

import type { FootieScene, TransitionEffect } from "@/features/story/types";
import {
  projectSceneMediaTimeline,
  resolveProjectedSceneMediaWindows,
} from "@/features/scene-media-timeline";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import { normalizeSceneMediaTransitionTrack } from "../domain/normalize-track";
import { resolveEffectiveIntraSceneTransitionDurationMs } from "./resolve-effective-duration";

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
  /** Outgoing item-local time fixed at its final visual frame. */
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

    // Head-of-incoming: overlay begins at the existing internal media boundary.
    const overlayStartMs = toWindow.startMs;
    const overlayEndMs = overlayStartMs + effectiveDurationMs;

    if (elapsed < overlayStartMs || elapsed >= overlayEndMs) {
      continue;
    }

    // elapsed ∈ [overlayStart, overlayEnd) ⇒ progress ∈ [0, 1)
    const progress = Math.max(
      0,
      Math.min(
        0.999999999999,
        (elapsed - overlayStartMs) / effectiveDurationMs,
      ),
    );

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
      outgoingItemLocalMs: Math.max(0, fromWindow.durationMs - 1),
      incomingItemLocalMs: Math.max(0, elapsed - toWindow.startMs),
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
