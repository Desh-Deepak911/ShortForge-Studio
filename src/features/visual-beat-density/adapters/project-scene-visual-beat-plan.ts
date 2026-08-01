/**
 * Project scene media inventory and timing inputs for visual-beat planning.
 * Leaf adapter — does not import visual-beat editor commands or the feature barrel.
 */

import { normalizeVisualSequence } from "@/features/mixed-media-scenes/domain/normalize-visual-sequence";
import {
  projectSceneMediaTimeline,
  resolveSceneMediaWindows,
  SCENE_MEDIA_MIN_ITEM_DURATION_MS,
} from "@/features/scene-media-timeline";
import type {
  FootieScene,
  SceneMedia,
  SceneVisualSequenceItem,
} from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import {
  normalizeVisualBeatNarrationText,
  normalizeVisualBeatUsableMedia,
} from "../domain/fingerprint-visual-beat-input";
import type {
  VisualBeatMediaKind,
  VisualBeatPlanV1,
  VisualBeatUsableMediaIdentity,
} from "../domain/visual-beat-plan";

export interface SceneVisualBeatPlanContext {
  readonly scene: FootieScene;
  readonly sceneDurationMs: number;
  readonly narrationText: string;
  readonly usableMedia: readonly VisualBeatUsableMediaIdentity[];
  readonly currentStartOffsetsMs: readonly number[];
  readonly sequenceItems: readonly SceneVisualSequenceItem[];
}

/** Stable source identity for fingerprinting — never fetches or rehydrates blobs. */
export function resolveVisualBeatSourceIdentity(media: SceneMedia): string {
  if (typeof media.url === "string" && media.url.trim().length > 0) {
    return media.url.trim();
  }
  if (typeof media.posterUrl === "string" && media.posterUrl.trim().length > 0) {
    return `poster:${media.posterUrl.trim()}`;
  }
  return `${media.source ?? "unknown"}:${media.type}`;
}

export function resolveSceneNarrationTextForVisualBeats(
  scene: Pick<FootieScene, "narration" | "subtitle">,
): string {
  if (typeof scene.narration === "string" && scene.narration.trim().length > 0) {
    return scene.narration;
  }
  if (typeof scene.subtitle === "string") {
    return scene.subtitle;
  }
  return "";
}

/**
 * Resolve ordered visual items from visualSequence, else timeline/legacy windows.
 * Mirrors mixed-media read semantics without importing editor commands.
 */
export function resolveSceneVisualSequenceItemsForBeats(
  scene: FootieScene,
): readonly SceneVisualSequenceItem[] {
  const sceneDurationMs = getSceneDurationMs(scene);
  const normalized = normalizeVisualSequence(scene.visualSequence, sceneDurationMs);
  if (normalized.sequence && normalized.sequence.items.length > 0) {
    return normalized.sequence.items.map((item) => ({ ...item }));
  }

  const projected = projectSceneMediaTimeline(scene);
  if (projected.items.length === 0) {
    return [];
  }
  const windows = resolveSceneMediaWindows({
    items: projected.items,
    sceneDurationMs: projected.sceneDurationMs,
  });
  return windows.map((window) => ({
    id: window.itemId,
    media: window.media,
    startOffsetMs: window.startMs,
    durationMs: Math.max(SCENE_MEDIA_MIN_ITEM_DURATION_MS, window.durationMs),
  }));
}

export function mapSequenceItemsToUsableMedia(
  items: readonly SceneVisualSequenceItem[],
): readonly VisualBeatUsableMediaIdentity[] {
  const mapped: VisualBeatUsableMediaIdentity[] = [];
  for (const item of items) {
    const kind = item.media.type;
    if (kind !== "image" && kind !== "video") {
      continue;
    }
    mapped.push({
      itemId: item.id,
      mediaKind: kind as VisualBeatMediaKind,
      sourceIdentity: resolveVisualBeatSourceIdentity(item.media),
    });
  }
  return normalizeVisualBeatUsableMedia(mapped);
}

export function projectSceneVisualBeatPlanContext(
  scene: FootieScene,
): SceneVisualBeatPlanContext {
  const sequenceItems = resolveSceneVisualSequenceItemsForBeats(scene);
  const usableMedia = mapSequenceItemsToUsableMedia(sequenceItems);
  return {
    scene,
    sceneDurationMs: getSceneDurationMs(scene),
    narrationText: normalizeVisualBeatNarrationText(
      resolveSceneNarrationTextForVisualBeats(scene),
    ),
    usableMedia,
    currentStartOffsetsMs: sequenceItems.map((item) => item.startOffsetMs),
    sequenceItems,
  };
}

export function readStoredVisualBeatPlan(
  scene: Pick<FootieScene, "visualBeatPlan">,
): VisualBeatPlanV1 | undefined {
  return scene.visualBeatPlan;
}
