import {
  normalizeCaptionMode,
  normalizeSubtitleEffect,
} from "@/lib/captionMode";
import { resolveTimelineItems } from "@/lib/previewTimeline";
import { getDisplayCaption, syncScenesSubtitlesNarration } from "@/lib/displayCaption";
import { normalizeSceneSettings } from "@/lib/sceneImage";
import { getStoryTotalDuration } from "@/lib/sceneTiming";
import { isSceneTimelineItem, normalizeSceneIds } from "@/lib/timelineItems";
import type {
  CaptionMode,
  FootieScene,
  FootieScript,
  SubtitleEffect,
  TimelineItem,
  TransitionEffect,
} from "@/types/footiebitz";

/**
 * Scene entry for export/render payloads.
 * Preserves original `subtitle` (generated caption) and `narration` while exposing
 * resolved display settings for renderers.
 */
export interface ExportScene extends FootieScene {
  captionMode: CaptionMode;
  subtitleEffect: SubtitleEffect;
  /** Resolved on-screen caption at export time (`getDisplayCaption(scene)`). */
  displayCaption: string;
}

/** Maps an app scene to the export shape without dropping source caption fields. */
export function mapSceneToExport(scene: FootieScene): ExportScene {
  const normalized = normalizeSceneSettings(scene);

  return {
    ...normalized,
    captionMode: normalizeCaptionMode(normalized.captionMode),
    subtitleEffect: normalizeSubtitleEffect(normalized.subtitleEffect),
    displayCaption: getDisplayCaption(normalized),
  };
}

/** Normalizes and enriches all scenes for export, syncing subtitles narration excerpts. */
export function mapScenesToExport(scenes: FootieScene[], narration: string): ExportScene[] {
  const normalizedIds = normalizeSceneIds(scenes);
  const synced = syncScenesSubtitlesNarration(normalizedIds, narration);
  return synced.map(mapSceneToExport);
}

/** Scene entry in the ordered export/render timeline. */
export interface ExportSceneTimelineItem {
  id: string;
  type: "scene";
  scene: ExportScene;
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
  scenes: ExportScene[];
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
export function mapTimelineItemsToExport(
  items: TimelineItem[],
  exportScenes: ExportScene[],
): ExportTimelineItem[] {
  const sceneById = new Map(exportScenes.map((scene) => [scene.id, scene]));

  return items.map((item) => {
    if (isSceneTimelineItem(item)) {
      const scene = sceneById.get(item.scene.id) ?? mapSceneToExport(item.scene);
      return {
        id: item.id,
        type: "scene",
        scene,
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
  const scenes = mapScenesToExport(script.scenes ?? [], script.narration ?? "");
  const timelineItems = resolveTimelineItems(script.timelineItems, scenes);

  return {
    version: 1,
    title: script.title,
    narration: script.narration,
    totalDuration: getStoryTotalDuration(scenes),
    timelineItems: mapTimelineItemsToExport(timelineItems, scenes),
    scenes,
    ...(script.voiceoverUrl ? { voiceoverUrl: script.voiceoverUrl } : {}),
    renderTransitions: false,
  };
}

/** Scene items from the export timeline in playback order. */
export function getExportScenesFromPayload(payload: FootieExportPayload): ExportScene[] {
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
export function getRenderableScenesFromPayload(payload: FootieExportPayload): ExportScene[] {
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
