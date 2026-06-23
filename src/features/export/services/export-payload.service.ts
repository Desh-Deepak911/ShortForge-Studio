import { getCanonicalVoiceover } from "@/features/audio";
import {
  getDisplayCaption,
  getSceneDurationMs,
  getSceneStartMs,
  getSceneEndMs,
  getStoryTotalDuration,
  isAudioFirstStory,
  recalculateSceneTimings,
  resolveStoryDurationSec,
  scenesHaveMsTiming,
  syncScenesSubtitlesNarration,
} from "@/features/story/utils";
import { normalizeSceneSettings } from "@/features/story/utils";
import {
  getSubtitleDisplayChunks,
  getSubtitlesCaptionSource,
} from "@/features/story/utils";
import {
  isSceneTimelineItem,
  isTransitionTimelineItem,
  normalizeSceneIds,
  TRANSITION_CARD_TITLE,
} from "@/features/story/utils";
import type {
  CaptionMode,
  FootieScene,
  FootieScript,
  SubtitleEffect,
  TimelineItem,
  TransitionEffect,
} from "@/features/story/types";
import {
  normalizeCaptionMode,
  normalizeSubtitleEffect,
} from "@/features/story/utils";
import { resolveTimelineItems } from "@/features/preview/utils";

/**
 * Scene entry for export/render payloads.
 * Preserves original `subtitle`, `subtitleText`, and `narration` while exposing
 * resolved display settings for renderers.
 */
export interface ExportScene extends FootieScene {
  captionMode: CaptionMode;
  subtitleText: string;
  subtitleEffect: SubtitleEffect;
  /** Timed subtitle segments — populated in subtitles mode, empty in generated mode. */
  subtitleChunks: string[];
  durationMs: number;
  startMs: number;
  endMs: number;
  /**
   * Resolved on-screen caption for renderers.
   * Generated mode: full generated caption. Subtitles mode: first chunk only (not full source text).
   */
  displayCaption: string;
}

function resolveExportSceneTiming(scene: FootieScene): Pick<
  ExportScene,
  "durationMs" | "startMs" | "endMs"
> {
  const durationMs = scene.durationMs ?? getSceneDurationMs(scene);
  const startMs = scene.startMs ?? 0;
  const endMs = scene.endMs ?? startMs + durationMs;

  return { durationMs, startMs, endMs };
}

/** Maps an app scene to the export shape without dropping source caption fields. */
export function mapSceneToExport(scene: FootieScene): ExportScene {
  const normalized = normalizeSceneSettings(scene);
  const captionMode = normalizeCaptionMode(normalized.captionMode);
  const subtitleEffect = normalizeSubtitleEffect(normalized.subtitleEffect);
  const timing = resolveExportSceneTiming(normalized);

  if (captionMode === "subtitles") {
    const subtitleText = getSubtitlesCaptionSource(normalized);
    const subtitleChunks = getSubtitleDisplayChunks(normalized);

    return {
      ...normalized,
      ...timing,
      captionMode,
      subtitleEffect,
      subtitleText,
      subtitleChunks,
      displayCaption: subtitleChunks[0] ?? "",
    };
  }

  return {
    ...normalized,
    ...timing,
    captionMode,
    subtitleEffect,
    subtitleText: normalized.subtitleText?.trim() ?? "",
    subtitleChunks: [],
    displayCaption: getDisplayCaption(normalized),
  };
}

/** Normalizes and enriches all scenes for export, syncing subtitles narration excerpts. */
export function mapScenesToExport(scenes: FootieScene[], narration: string): ExportScene[] {
  const normalizedIds = normalizeSceneIds(scenes);
  const timedScenes = recalculateSceneTimings(normalizedIds);
  const synced = syncScenesSubtitlesNarration(timedScenes, narration);
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
  voiceoverDurationMs?: number;
  /** True when scenes carry measured voiceover timing (audio-first pipeline). */
  audioFirst?: boolean;
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

/** True when text is transition connector copy — must never appear in exported video. */
export function isTransitionVideoContent(text: string | undefined): boolean {
  const normalized = text?.trim() ?? "";
  if (!normalized) {
    return false;
  }

  return (
    normalized === TRANSITION_CARD_TITLE ||
    normalized.toLowerCase() === "transition to next scene"
  );
}

/** Only scene timeline items may become video segments. */
export function isVideoSegmentTimelineItem(
  item: ExportTimelineItem,
): item is ExportSceneTimelineItem {
  return item.type === "scene";
}

/** Safety guard — transition items must never be rendered as standalone video content. */
export function assertTimelineItemIsNotVideoSegment(item: TimelineItem): void {
  if (isTransitionTimelineItem(item)) {
    throw new Error("Transition timeline items cannot be rendered as video segments");
  }
}

/** Scene timeline items only, in playback order. */
export function getSceneTimelineItemsFromExport(
  payload: FootieExportPayload,
): ExportSceneTimelineItem[] {
  return payload.timelineItems.filter(isVideoSegmentTimelineItem);
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

/** Export duration in seconds — scene timeline when ms timing is present. */
export function getExportTotalDurationSec(payload: FootieExportPayload): number {
  if (payload.scenes.length > 0 && scenesHaveMsTiming(payload.scenes)) {
    const sceneTotal = getStoryTotalDuration(payload.scenes);
    if (sceneTotal > 0) {
      return sceneTotal;
    }
  }

  if (payload.voiceoverDurationMs != null && payload.voiceoverDurationMs > 0) {
    return payload.voiceoverDurationMs / 1000;
  }

  if (payload.totalDuration > 0) {
    return payload.totalDuration;
  }

  return getStoryTotalDuration(payload.scenes);
}

/** Scene timeline entries that become video segments (never transition cards). */
export function isExportSceneVideoSegment(scene: ExportScene): boolean {
  return !(
    isTransitionVideoContent(scene.subtitle) && isTransitionVideoContent(scene.displayCaption)
  );
}

/** Formats scene timing for export logs and render progress. */
export function formatExportSceneTiming(scene: ExportScene): string {
  const startMs = getSceneStartMs(scene);
  const endMs = getSceneEndMs(scene);
  const durationMs = getSceneDurationMs(scene);

  if (scene.startMs != null && scene.endMs != null && scene.durationMs != null) {
    return `${startMs}ms–${endMs}ms (${durationMs}ms)`;
  }

  return `${scene.start}s–${scene.end}s (${scene.duration}s)`;
}

/** Builds the ordered export payload from a synced FootieScript. */
export function buildFootieExportPayload(script: FootieScript): FootieExportPayload {
  const sourceScenes = script.scenes ?? [];
  const scenes = mapScenesToExport(sourceScenes, script.narration ?? "");
  const timelineItems = resolveTimelineItems(script.timelineItems, sourceScenes);
  const canonicalVoiceover = getCanonicalVoiceover(script);
  const audioFirst = isAudioFirstStory({
    ...script,
    scenes,
    voiceoverUrl: canonicalVoiceover?.url,
    voiceoverDurationMs: canonicalVoiceover?.durationMs,
  });

  const totalDuration =
    scenes.length > 0 && scenesHaveMsTiming(scenes)
      ? getStoryTotalDuration(scenes)
      : canonicalVoiceover?.durationMs != null && canonicalVoiceover.durationMs > 0
        ? canonicalVoiceover.durationMs / 1000
        : resolveStoryDurationSec({ ...script, scenes });

  return {
    version: 1,
    title: script.title,
    narration: script.narration,
    totalDuration,
    timelineItems: mapTimelineItemsToExport(timelineItems, scenes),
    scenes,
    ...(canonicalVoiceover?.url ? { voiceoverUrl: canonicalVoiceover.url } : {}),
    ...(canonicalVoiceover?.durationMs != null && canonicalVoiceover.durationMs > 0
      ? { voiceoverDurationMs: canonicalVoiceover.durationMs }
      : {}),
    ...(audioFirst ? { audioFirst: true } : {}),
    renderTransitions: false,
  };
}

/** Scene items from the export timeline in playback order. */
export function getExportScenesFromPayload(payload: FootieExportPayload): ExportScene[] {
  return getSceneTimelineItemsFromExport(payload).map((item) => item.scene);
}

/** Transition items from the export timeline. Safe to ignore when renderTransitions is false. */
export function getExportTransitionsFromPayload(
  payload: FootieExportPayload,
): ExportTransitionTimelineItem[] {
  return payload.timelineItems.filter(isExportTransitionTimelineItem);
}

/**
 * Returns scenes for video/export rendering.
 * Only timeline items with type "scene" become segments — transitions are skipped
 * until canvas transition rendering is implemented.
 */
export function getRenderableScenesFromPayload(payload: FootieExportPayload): ExportScene[] {
  return getExportScenesFromPayload(payload)
    .filter(isExportSceneVideoSegment)
    .map((scene) => {
      const displayCaption = isTransitionVideoContent(scene.displayCaption)
        ? ""
        : scene.displayCaption;
      const subtitle = isTransitionVideoContent(scene.subtitle) ? "" : scene.subtitle;
      const subtitleChunks =
        scene.captionMode === "subtitles" && isTransitionVideoContent(displayCaption)
          ? []
          : scene.subtitleChunks;

      return {
        ...scene,
        displayCaption,
        subtitle,
        subtitleChunks,
      };
    });
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

  if (!payload.timelineItems.some(isVideoSegmentTimelineItem)) {
    throw new Error("Export timeline has no scene items");
  }
}
