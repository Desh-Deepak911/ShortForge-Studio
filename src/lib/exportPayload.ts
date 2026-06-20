import { resolveTimelineItems } from "@/lib/previewTimeline";
import { getStoryTotalDuration } from "@/lib/sceneTiming";
import { isSceneTimelineItem, normalizeSceneIds } from "@/lib/timelineItems";
import type {
  FootieScene,
  FootieScript,
  TimelineItem,
  TransitionEffect,
} from "@/types/footiebitz";

/** Scene entry in the ordered export/render timeline. */
export interface ExportSceneTimelineItem {
  id: string;
  type: "scene";
  scene: FootieScene;
}

/** Transition entry in the ordered export/render timeline. */
export interface ExportTransitionTimelineItem {
  id: string;
  type: "transition";
  fromSceneId: string;
  toSceneId: string;
  effect: TransitionEffect;
  durationMs: number;
}

export type ExportTimelineItem = ExportSceneTimelineItem | ExportTransitionTimelineItem;

/**
 * Full export/render payload for FootieBitz shorts.
 * Includes ordered timeline items (scenes + transitions) for future render pipelines.
 */
export interface FootieExportPayload {
  version: 1;
  title: string;
  narration: string;
  totalDuration: number;
  /** Ordered scene and transition items — primary timeline for renderers. */
  timelineItems: ExportTimelineItem[];
  /** Canonical scene list for backward-compatible scene-only render paths. */
  scenes: FootieScene[];
  voiceoverUrl?: string;
  /**
   * When false, renderers should ignore transition items and render scenes only.
   * Set to false until canvas transition rendering is implemented.
   */
  renderTransitions: boolean;
}

export function isExportSceneTimelineItem(
  item: ExportTimelineItem,
): item is ExportSceneTimelineItem {
  return item.type === "scene";
}

export function isExportTransitionTimelineItem(
  item: ExportTimelineItem,
): item is ExportTransitionTimelineItem {
  return item.type === "transition";
}

/** Maps app timeline items to the export payload shape. */
export function mapTimelineItemsToExport(items: TimelineItem[]): ExportTimelineItem[] {
  return items.map((item) => {
    if (isSceneTimelineItem(item)) {
      return {
        id: item.id,
        type: "scene",
        scene: item.scene,
      };
    }

    return {
      id: item.id,
      type: "transition",
      fromSceneId: item.fromSceneId,
      toSceneId: item.toSceneId,
      effect: item.effect,
      durationMs: item.durationMs,
    };
  });
}

/** Builds the ordered export payload from a synced FootieScript. */
export function buildFootieExportPayload(script: FootieScript): FootieExportPayload {
  const scenes = normalizeSceneIds(script.scenes ?? []);
  const timelineItems = resolveTimelineItems(script.timelineItems, scenes);

  return {
    version: 1,
    title: script.title,
    narration: script.narration,
    totalDuration: getStoryTotalDuration(scenes),
    timelineItems: mapTimelineItemsToExport(timelineItems),
    scenes,
    ...(script.voiceoverUrl ? { voiceoverUrl: script.voiceoverUrl } : {}),
    renderTransitions: false,
  };
}

/** Scene items from the export timeline in playback order. */
export function getExportScenesFromPayload(payload: FootieExportPayload): FootieScene[] {
  return payload.timelineItems
    .filter(isExportSceneTimelineItem)
    .map((item) => item.scene);
}

/** Transition items from the export timeline. Safe to ignore when renderTransitions is false. */
export function getExportTransitionsFromPayload(
  payload: FootieExportPayload,
): ExportTransitionTimelineItem[] {
  return payload.timelineItems.filter(isExportTransitionTimelineItem);
}

/**
 * Returns scenes for the current scene-only export renderer.
 * Ignores transition items until renderTransitions is enabled.
 */
export function getRenderableScenesFromPayload(payload: FootieExportPayload): FootieScene[] {
  if (payload.renderTransitions) {
    return getExportScenesFromPayload(payload);
  }

  return payload.scenes;
}

/** Counts transition items included in the payload (for UI/logging). */
export function countExportTransitions(payload: FootieExportPayload): number {
  return getExportTransitionsFromPayload(payload).length;
}

/** Validates the export payload before rendering. */
export function assertExportPayload(payload: FootieExportPayload): void {
  if (payload.scenes.length === 0) {
    throw new Error("No scenes to export");
  }

  if (payload.timelineItems.length === 0) {
    throw new Error("Export timeline is empty");
  }

  if (!payload.timelineItems.some(isExportSceneTimelineItem)) {
    throw new Error("Export timeline has no scene items");
  }
}
