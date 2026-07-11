import type {
  FootieScene,
  SceneTimelineItem,
  SceneType,
  TimelineItem,
  TransitionEffect,
  TransitionTimelineItem,
} from "@/features/story/types";

import { cloneSceneImage, getSceneImage, normalizeSceneSettings, resolveSceneDurationMsForTiming } from "./scene.utils";

const DEFAULT_SCENE_DURATION = 3;
/** Default placeholder copy for newly inserted scenes. */
export const DEFAULT_SCENE_SUBTITLE = "Add subtitle...";

/**
 * Recomputes cumulative start/end timing for every scene from each scene's durationMs.
 * Preserves scene order. Falls back to duration (seconds) when durationMs is absent.
 */
export function recalculateSceneTimings(scenes: FootieScene[]): FootieScene[] {
  let cursorMs = 0;

  return scenes.map((scene) => {
    const durationMs = resolveSceneDurationMsForTiming(scene);
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs;

    const start = startMs / 1000;
    const duration = durationMs / 1000;
    const end = endMs / 1000;

    return {
      ...scene,
      startMs,
      endMs,
      durationMs,
      start,
      end,
      duration,
    };
  });
}

/** Applies manual duration edit fields before recalculating scene timings. */
export function applyManualDurationPatch(
  durationSec: number,
): Pick<FootieScene, "duration" | "durationMs" | "durationSource"> {
  const duration = Math.max(1, Math.round(durationSec));
  return {
    duration,
    durationMs: duration * 1000,
    durationSource: "manual",
  };
}

/** Merges manual durationMs/durationSource when a scene duration edit is present. */
export function mergeManualDurationUpdates(updates: SceneTimelineUpdates): SceneTimelineUpdates {
  if (updates.duration === undefined) {
    return updates;
  }

  return {
    ...updates,
    ...applyManualDurationPatch(updates.duration),
  };
}

/**
 * Returns the sum of all scene durations (ignores start/end, so it stays
 * correct even before timings are recalculated).
 */
export function getTotalDuration(scenes: FootieScene[]): number {
  return scenes.reduce((sum, scene) => sum + Math.max(1, scene.duration), 0);
}

/**
 * Resizes scene durations so their sum matches a target total (seconds).
 * Uses proportional weights — defaults to each scene's current duration.
 * Every scene keeps at least 1 second; rounding uses largest-remainder allocation.
 */
export function fitScenesToTargetDuration(
  scenes: FootieScene[],
  targetDurationSec: number,
  weights?: number[],
): FootieScene[] {
  if (scenes.length === 0) {
    return scenes;
  }

  const resolvedWeights =
    weights?.length === scenes.length
      ? weights.map((weight) => Math.max(1, weight))
      : scenes.map((scene) => Math.max(1, scene.duration));

  const minTotal = scenes.length;
  const targetTotal = Math.max(minTotal, Math.round(targetDurationSec));
  const totalWeight = resolvedWeights.reduce((sum, weight) => sum + weight, 0);

  const exactDurations = resolvedWeights.map(
    (weight) => (targetTotal * weight) / totalWeight,
  );
  const durations = exactDurations.map((value) => Math.max(1, Math.floor(value)));

  let remaining = targetTotal - durations.reduce((sum, duration) => sum + duration, 0);
  const fractionalOrder = exactDurations
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const { index } of fractionalOrder) {
    if (remaining <= 0) {
      break;
    }
    durations[index]! += 1;
    remaining -= 1;
  }

  return recalculateSceneTimings(
    scenes.map((scene, index) => ({
      ...scene,
      duration: durations[index] ?? 1,
      durationMs: (durations[index] ?? 1) * 1000,
    })),
  );
}

/**
 * Allocates milliseconds across scenes by weight (largest-remainder).
 * Sum of returned slots always equals the clamped voiceover total.
 */
export function allocateVoiceoverDurationMs(
  voiceoverDurationMs: number,
  weights: number[],
): number[] {
  if (weights.length === 0) {
    return [];
  }

  const resolvedWeights = weights.map((weight) => Math.max(1, weight));
  const totalMs = Math.max(weights.length, Math.round(voiceoverDurationMs));
  const totalWeight = resolvedWeights.reduce((sum, weight) => sum + weight, 0);

  const exactDurations = resolvedWeights.map(
    (weight) => (totalMs * weight) / totalWeight,
  );
  const durations = exactDurations.map((value) => Math.max(1, Math.floor(value)));

  let remaining = totalMs - durations.reduce((sum, duration) => sum + duration, 0);
  const fractionalOrder = exactDurations
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const { index } of fractionalOrder) {
    if (remaining <= 0) {
      break;
    }
    durations[index]! += 1;
    remaining -= 1;
  }

  return durations;
}

/**
 * Splits voiceover duration evenly across a fixed number of scenes (milliseconds).
 * Remainder milliseconds are distributed one-by-one to the earliest scenes.
 */
export function splitVoiceoverDurationEvenlyMs(
  voiceoverDurationMs: number,
  sceneCount: number,
): number[] {
  return allocateVoiceoverDurationMs(
    voiceoverDurationMs,
    Array.from({ length: sceneCount }, () => 1),
  );
}

/** Applies voiceover timing slots to scenes in milliseconds and derived seconds. */
export function attachVoiceoverTimingMs(
  scenes: FootieScene[],
  voiceoverDurationMs: number,
  weights?: number[],
): FootieScene[] {
  const resolvedWeights =
    weights?.length === scenes.length
      ? weights.map((weight) => Math.max(1, weight))
      : scenes.map((scene) => Math.max(1, scene.duration));

  const slots = allocateVoiceoverDurationMs(voiceoverDurationMs, resolvedWeights);
  let cursorMs = 0;

  return scenes.map((scene, index) => {
    const durationMs = slots[index] ?? 1000;
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs;

    const start = startMs / 1000;
    const duration = durationMs / 1000;
    const end = endMs / 1000;

    return {
      ...scene,
      startMs,
      endMs,
      durationMs,
      start,
      end,
      duration,
    };
  });
}

/**
 * Redistributes a new voiceover duration across existing scenes proportionally,
 * preserving scene content while updating start/end/duration fields.
 */
export function refitScenesToVoiceoverDuration(
  scenes: FootieScene[],
  voiceoverDurationMs: number,
): FootieScene[] {
  const weights = scenes.map((scene) =>
    Math.max(1, scene.durationMs ?? Math.round(scene.duration * 1000)),
  );

  return recalculateSceneTimings(
    attachVoiceoverTimingMs(scenes, voiceoverDurationMs, weights).map((scene) => ({
      ...scene,
      durationSource: "voiceover" as const,
    })),
  );
}

/** Applies even voiceover timing slots to scenes in milliseconds and seconds. */
export function attachEvenVoiceoverTiming(
  scenes: FootieScene[],
  voiceoverDurationMs: number,
): FootieScene[] {
  return attachVoiceoverTimingMs(
    scenes,
    voiceoverDurationMs,
    scenes.map(() => 1),
  );
}

/**
 * Creates a new blank scene with a unique id and temporary start/end values of 0.
 * Call recalculateSceneTimings on the full list after inserting to get correct timings.
 */
export function createEmptyScene(type: SceneType = "transition"): FootieScene {
  return normalizeSceneSettings({
    id: generateSceneId(),
    start: 0,
    end: DEFAULT_SCENE_DURATION,
    duration: DEFAULT_SCENE_DURATION,
    subtitle: DEFAULT_SCENE_SUBTITLE,
    sceneType: type,
  });
}

/**
 * Returns a deep copy of a scene with a fresh unique id.
 * Preserves all fields including sceneType and image metadata.
 */
export function duplicateScene(scene: FootieScene): FootieScene {
  const image = getSceneImage(scene);

  return normalizeSceneSettings({
    ...scene,
    id: generateSceneId(),
    ...(image ? { image: cloneSceneImage(image), uploadedImage: undefined } : {}),
  });
}

function generateSceneId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `scene-${timestamp}-${random}`;
}

const DEFAULT_TRANSITION_EFFECT = "fade" as const;
const DEFAULT_TRANSITION_DURATION_MS = 500;

export const TRANSITION_EFFECT_OPTIONS: { value: TransitionEffect; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "blur", label: "Blur" },
];

export const TRANSITION_DURATION_OPTIONS = [300, 500, 800, 1000] as const;

export type TransitionDurationMs = (typeof TRANSITION_DURATION_OPTIONS)[number];

export const TRANSITION_DURATION_LABELS: Record<TransitionDurationMs, string> = {
  300: "Fast",
  500: "Normal",
  800: "Slow",
  1000: "Cinematic",
};

/** User-facing title for transition connector cards in the editor. */
export const TRANSITION_CARD_TITLE = "Transition to next scene";

export function getTransitionEffectLabel(effect: TransitionEffect | string): string {
  const match = TRANSITION_EFFECT_OPTIONS.find((option) => option.value === effect);
  return match?.label ?? "Fade";
}

export function getTransitionDurationLabel(durationMs: number): string {
  const normalized = normalizeTransitionDurationMs(durationMs);
  return TRANSITION_DURATION_LABELS[normalized];
}

export function normalizeTransitionDurationMs(durationMs: number): TransitionDurationMs {
  if (TRANSITION_DURATION_OPTIONS.includes(durationMs as TransitionDurationMs)) {
    return durationMs as TransitionDurationMs;
  }

  return DEFAULT_TRANSITION_DURATION_MS;
}

export function normalizeTransitionEffect(effect: string): TransitionEffect {
  const trimmed = effect.trim();
  const exact = TRANSITION_EFFECT_OPTIONS.find((option) => option.value === trimmed);
  if (exact) {
    return exact.value;
  }

  const lower = trimmed.toLowerCase();
  const normalized = TRANSITION_EFFECT_OPTIONS.find((option) => option.value === lower);
  if (normalized) {
    return normalized.value;
  }

  if (lower === "cross-blur" || lower === "crossfade-blur") {
    return "blur";
  }

  return DEFAULT_TRANSITION_EFFECT;
}

export type SceneTimelineUpdates = Partial<
  Pick<
    FootieScene,
    | "start"
    | "end"
    | "duration"
    | "subtitle"
    | "sceneType"
    | "image"
    | "uploadedImage"
    | "media"
    | "captionMode"
    | "captionPreset"
    | "subtitleEffect"
    | "narration"
    | "subtitleText"
    | "startMs"
    | "endMs"
    | "durationMs"
    | "durationSource"
    | "assetAttachment"
  >
>;

export type TransitionTimelineUpdates = Partial<
  Pick<TransitionTimelineItem, "effect" | "durationMs" | "label">
>;

/** @deprecated Use TransitionTimelineUpdates */
export type TransitionTimelinePatch = TransitionTimelineUpdates;

function createSceneTimelineItem(scene: FootieScene): SceneTimelineItem {
  return {
    id: scene.id,
    type: "scene",
    scene,
  };
}

function createDefaultTransition(
  fromScene: FootieScene,
  toScene: FootieScene,
): TransitionTimelineItem {
  return {
    id: `transition-${fromScene.id}-${toScene.id}`,
    type: "transition",
    fromSceneId: fromScene.id,
    toSceneId: toScene.id,
    effect: DEFAULT_TRANSITION_EFFECT,
    durationMs: DEFAULT_TRANSITION_DURATION_MS,
    label: TRANSITION_CARD_TITLE,
  };
}

/**
 * Interleaves generated scenes with default fade transitions.
 *
 * Example output for three scenes:
 *   scene 1 → transition 1–2 → scene 2 → transition 2–3 → scene 3
 *
 * Pure app-side logic — does not call AI or modify scene content.
 */
export function insertDefaultTransitions(scenes: FootieScene[]): TimelineItem[] {
  if (scenes.length === 0) {
    return [];
  }

  const items: TimelineItem[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    items.push(createSceneTimelineItem(scene));

    const nextScene = scenes[i + 1];
    if (nextScene) {
      items.push(createDefaultTransition(scene, nextScene));
    }
  }

  return items;
}

function generateTimelineSceneId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 7);
  return `scene-${timestamp}-${random}`;
}

/**
 * Ensures every scene has a unique, non-empty id.
 * Legacy stories may omit ids or contain duplicates — both are repaired in place.
 */
export function normalizeSceneIds(scenes: FootieScene[]): FootieScene[] {
  const usedIds = new Set<string>();

  return scenes.map((scene, index) => {
    const trimmed = typeof scene.id === "string" ? scene.id.trim() : "";
    let id = trimmed;

    if (!id || usedIds.has(id)) {
      id = `scene-${index + 1}-${generateTimelineSceneId()}`;
    }

    usedIds.add(id);
    const normalized = id === scene.id ? scene : { ...scene, id };
    return normalizeSceneSettings(normalized);
  });
}

/**
 * Returns a valid timeline for the given scenes.
 * Legacy stories without timelineItems are upgraded via insertDefaultTransitions.
 *
 * Edge cases:
 * - 0 scenes → []
 * - 1 scene → single scene item, no transition
 * - missing timelineItems → built from scenes
 */
export function ensureTimelineItems(
  scenes: FootieScene[],
  timelineItems?: TimelineItem[] | null,
): TimelineItem[] {
  const normalizedScenes = normalizeSceneIds(scenes);

  if (normalizedScenes.length === 0) {
    return [];
  }

  if (!timelineItems?.length) {
    return insertDefaultTransitions(normalizedScenes);
  }

  return syncTimelineItemsWithScenes(normalizedScenes, timelineItems);
}

export function isSceneTimelineItem(item: TimelineItem): item is SceneTimelineItem {
  return item.type === "scene";
}

export function isTransitionTimelineItem(item: TimelineItem): item is TransitionTimelineItem {
  return item.type === "transition";
}

/** Returns scene items from the timeline in playback order. */
export function getScenesFromTimeline(timelineItems: TimelineItem[]): FootieScene[] {
  return timelineItems.filter(isSceneTimelineItem).map((item) => item.scene);
}

/** Returns all transition items from the timeline. */
export function getTransitionsFromTimeline(
  timelineItems: TimelineItem[],
): TransitionTimelineItem[] {
  return timelineItems.filter(isTransitionTimelineItem);
}

/** Looks up a scene embedded in the timeline by id. */
export function getSceneFromTimeline(
  timelineItems: TimelineItem[],
  sceneId: string,
): FootieScene | undefined {
  const item = timelineItems.find(
    (entry): entry is SceneTimelineItem => entry.type === "scene" && entry.id === sceneId,
  );
  return item?.scene;
}

/** Patches a single scene item embedded in the timeline. */
export function updateSceneInTimeline(
  timelineItems: TimelineItem[],
  sceneId: string,
  updates: SceneTimelineUpdates,
): TimelineItem[] {
  return timelineItems.map((item) => {
    if (item.type !== "scene" || item.id !== sceneId) {
      return item;
    }

    return {
      ...item,
      scene: normalizeSceneSettings({ ...item.scene, ...updates }),
    };
  });
}

/** Patches effect, duration, or label on a single transition item. */
export function updateTransitionInTimeline(
  timelineItems: TimelineItem[],
  transitionId: string,
  updates: TransitionTimelineUpdates,
): TimelineItem[] {
  return timelineItems.map((item) => {
    if (item.type !== "transition" || item.id !== transitionId) {
      return item;
    }

    return {
      ...item,
      ...(updates.effect !== undefined
        ? { effect: normalizeTransitionEffect(updates.effect) }
        : {}),
      ...(updates.durationMs !== undefined
        ? { durationMs: normalizeTransitionDurationMs(updates.durationMs) }
        : {}),
      ...(updates.label !== undefined ? { label: updates.label } : {}),
    };
  });
}

function transitionKey(fromSceneId: string, toSceneId: string): string {
  return `${fromSceneId}::${toSceneId}`;
}

/** Updates a scene in the canonical scenes array by id. */
export function updateSceneInScenes(
  scenes: FootieScene[],
  sceneId: string,
  updates: SceneTimelineUpdates,
): FootieScene[] {
  return scenes.map((scene) =>
    normalizeSceneSettings(scene.id === sceneId ? { ...scene, ...updates } : scene),
  );
}

/**
 * Returns true when scene order/timing/type is unchanged.
 * Caption, media, and motion content edits are intentionally excluded so they
 * use lightweight timeline scene-ref sync instead of a full structural rebuild.
 */
export function scenesStructurallyEqual(a: FootieScene[], b: FootieScene[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((scene, index) => {
    const other = b[index];
    if (!other || scene.id !== other.id) {
      return false;
    }

    return (
      scene.start === other.start &&
      scene.end === other.end &&
      scene.duration === other.duration &&
      scene.startMs === other.startMs &&
      scene.endMs === other.endMs &&
      scene.durationMs === other.durationMs &&
      scene.sceneType === other.sceneType
    );
  });
}

/** Refreshes embedded scene refs on timeline scene items without rebuilding transitions. */
export function syncTimelineSceneRefs(
  scenes: FootieScene[],
  timelineItems: TimelineItem[],
): TimelineItem[] {
  return scenes.reduce(
    (items, scene) => updateSceneInTimeline(items, scene.id, scene),
    timelineItems,
  );
}

/**
 * Rebuilds timeline items from the current scene list, preserving transition
 * settings (effect, duration, label) when the same scene pair still exists.
 */
export function syncTimelineItemsWithScenes(
  scenes: FootieScene[],
  previous?: TimelineItem[],
): TimelineItem[] {
  const fresh = insertDefaultTransitions(scenes);

  if (!previous?.length) {
    return fresh;
  }

  const savedTransitions = new Map<string, TransitionTimelineItem>();
  for (const item of getTransitionsFromTimeline(previous)) {
    savedTransitions.set(transitionKey(item.fromSceneId, item.toSceneId), item);
  }

  return fresh.map((item) => {
    if (item.type === "scene") {
      return item;
    }

    const saved = savedTransitions.get(transitionKey(item.fromSceneId, item.toSceneId));
    if (!saved) {
      return item;
    }

    return {
      ...saved,
      id: item.id,
      fromSceneId: item.fromSceneId,
      toSceneId: item.toSceneId,
    };
  });
}
