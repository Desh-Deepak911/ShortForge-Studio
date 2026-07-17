/**
 * Manifest-only active media frame resolver (Sprint 8D).
 * Uses frozen ExportSceneManifest.mediaTimeline windows only.
 * Does not read StoryDocument, feature flags, or live editor state.
 */

import type {
  ExportSceneManifest,
  ExportSceneMediaTimelineItemManifest,
} from "./export-manifest.types";

export interface ExportActiveSceneMediaFrame {
  readonly item: ExportSceneMediaTimelineItemManifest;
  readonly itemIndex: number;
  readonly itemElapsedMs: number;
  readonly itemDurationMs: number;
  readonly sceneElapsedMs: number;
  readonly sceneDurationMs: number;
  /** True when scene elapsed is at/beyond scene end (final-frame hold). */
  readonly holdingFinalFrame: boolean;
}

/**
 * Resolves the active frozen timeline item for a scene-local elapsed time.
 * Boundary semantics match domain: [start, end); exact boundary → following item;
 * negative → first frame; at/beyond scene end → final item/final frame.
 */
export function resolveExportActiveSceneMediaFrame(
  sceneManifest: Pick<ExportSceneManifest, "durationMs" | "mediaTimeline">,
  sceneElapsedMs: number,
): ExportActiveSceneMediaFrame | null {
  const items = sceneManifest.mediaTimeline?.items ?? [];
  if (items.length === 0) {
    return null;
  }

  const sceneDurationMs =
    typeof sceneManifest.durationMs === "number" && Number.isFinite(sceneManifest.durationMs)
      ? Math.max(0, Math.round(sceneManifest.durationMs))
      : 0;
  const rawElapsed =
    typeof sceneElapsedMs === "number" && Number.isFinite(sceneElapsedMs)
      ? sceneElapsedMs
      : 0;

  if (rawElapsed < 0) {
    const first = items[0]!;
    return {
      item: first,
      itemIndex: first.index,
      itemElapsedMs: 0,
      itemDurationMs: first.durationMs,
      sceneElapsedMs: rawElapsed,
      sceneDurationMs,
      holdingFinalFrame: false,
    };
  }

  if (rawElapsed >= sceneDurationMs) {
    const last = items[items.length - 1]!;
    return {
      item: last,
      itemIndex: last.index,
      itemElapsedMs: last.durationMs,
      itemDurationMs: last.durationMs,
      sceneElapsedMs: rawElapsed,
      sceneDurationMs,
      holdingFinalFrame: true,
    };
  }

  for (const item of items) {
    if (rawElapsed >= item.startOffsetMs && rawElapsed < item.endOffsetMs) {
      return {
        item,
        itemIndex: item.index,
        itemElapsedMs: rawElapsed - item.startOffsetMs,
        itemDurationMs: item.durationMs,
        sceneElapsedMs: rawElapsed,
        sceneDurationMs,
        holdingFinalFrame: false,
      };
    }
  }

  const following =
    items.find((item) => rawElapsed < item.endOffsetMs) ?? items[items.length - 1]!;
  return {
    item: following,
    itemIndex: following.index,
    itemElapsedMs: Math.max(
      0,
      Math.min(following.durationMs, rawElapsed - following.startOffsetMs),
    ),
    itemDurationMs: following.durationMs,
    sceneElapsedMs: rawElapsed,
    sceneDurationMs,
    holdingFinalFrame: false,
  };
}
