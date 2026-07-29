/**
 * Manifest-only intra-scene transition resolver (Sprint 9C).
 * Consumes frozen ExportManifestV3 scene fields only — no Story/Preview/editor.
 */

import { resolveCanonicalIntraSceneTransitionProgress } from "@/features/timeline-intelligence/resolve-canonical-transition-frame.utils";

import type {
  ExportSceneManifestV3,
  ExportSceneMediaTimelineItemManifest,
  ExportSceneMediaTransitionBoundaryManifest,
} from "./export-manifest.types";

export interface ResolvedExportIntraSceneTransition {
  readonly sceneId: string;
  readonly boundary: ExportSceneMediaTransitionBoundaryManifest;
  readonly fromItem: ExportSceneMediaTimelineItemManifest;
  readonly toItem: ExportSceneMediaTimelineItemManifest;
  readonly effect: ExportSceneMediaTransitionBoundaryManifest["effect"];
  readonly progress: number;
  readonly requestedDurationMs: number;
  readonly effectiveDurationMs: number;
  readonly overlayStartOffsetMs: number;
  readonly overlayEndOffsetMs: number;
  /** Outgoing item-local final visual frame. */
  readonly outgoingItemLocalMs: number;
  /** Incoming item-local elapsed (advances during overlay). */
  readonly incomingItemLocalMs: number;
}

/**
 * Resolve the active v3 intra-scene overlay at scene-local elapsed ms.
 * Uses frozen [overlayStartOffsetMs, overlayEndOffsetMs) semantics.
 * Returns null when no overlay is active (hard cut / past end).
 */
export function resolveExportIntraSceneTransitionAtElapsed(
  scene: ExportSceneManifestV3,
  sceneElapsedMs: number,
  fps = 30,
): ResolvedExportIntraSceneTransition | null {
  const sceneDurationMs =
    typeof scene.durationMs === "number" && Number.isFinite(scene.durationMs)
      ? Math.max(0, scene.durationMs)
      : 0;
  const elapsed =
    typeof sceneElapsedMs === "number" && Number.isFinite(sceneElapsedMs)
      ? Math.max(0, sceneElapsedMs)
      : 0;

  if (sceneDurationMs <= 0 || elapsed >= sceneDurationMs) {
    return null;
  }

  const track = scene.mediaTransitions;
  if (!track || track.version !== 1 || !Array.isArray(track.boundaries)) {
    return null;
  }

  const items = scene.mediaTimeline?.items ?? [];
  if (items.length < 2) {
    return null;
  }

  const byId = new Map(items.map((item) => [item.id, item]));

  for (const boundary of track.boundaries) {
    if (
      elapsed < boundary.overlayStartOffsetMs ||
      elapsed >= boundary.overlayEndOffsetMs
    ) {
      continue;
    }

    const fromItem = byId.get(boundary.fromItemId);
    const toItem = byId.get(boundary.toItemId);
    if (!fromItem || !toItem) {
      continue;
    }

    const effectiveDurationMs = boundary.effectiveDurationMs;
    if (!(effectiveDurationMs > 0)) {
      continue;
    }

    const progress = resolveCanonicalIntraSceneTransitionProgress({
      sceneElapsedMs: elapsed,
      overlayStartOffsetMs: boundary.overlayStartOffsetMs,
      overlayEndOffsetMs: boundary.overlayEndOffsetMs,
      effectiveDurationMs,
      fps,
    });
    if (progress === null) {
      continue;
    }

    return {
      sceneId: scene.id,
      boundary,
      fromItem,
      toItem,
      effect: boundary.effect,
      progress,
      requestedDurationMs: boundary.requestedDurationMs,
      effectiveDurationMs,
      overlayStartOffsetMs: boundary.overlayStartOffsetMs,
      overlayEndOffsetMs: boundary.overlayEndOffsetMs,
      outgoingItemLocalMs: Math.max(0, fromItem.durationMs - 1),
      incomingItemLocalMs: Math.max(0, elapsed - toItem.startOffsetMs),
    };
  }

  return null;
}
