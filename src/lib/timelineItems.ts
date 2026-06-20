import type {
  FootieScene,
  SceneTimelineItem,
  TimelineItem,
  TransitionEffect,
  TransitionTimelineItem,
} from "@/types/footiebitz";

const DEFAULT_TRANSITION_EFFECT = "fade" as const;
const DEFAULT_TRANSITION_DURATION_MS = 500;

export const TRANSITION_EFFECT_OPTIONS: { value: TransitionEffect; label: string }[] = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "zoom-in", label: "Zoom In" },
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
  if (TRANSITION_EFFECT_OPTIONS.some((option) => option.value === effect)) {
    return effect as TransitionEffect;
  }

  return DEFAULT_TRANSITION_EFFECT;
}

export type SceneTimelineUpdates = Partial<
  Pick<
    FootieScene,
    "start" | "end" | "duration" | "subtitle" | "sceneType" | "uploadedImage"
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
    return id === scene.id ? scene : { ...scene, id };
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
      scene: { ...item.scene, ...updates },
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
    scene.id === sceneId ? { ...scene, ...updates } : scene,
  );
}

/** Returns true when scene content/order is unchanged (transition-only edits). */
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
      scene.subtitle === other.subtitle &&
      scene.sceneType === other.sceneType &&
      scene.uploadedImage === other.uploadedImage
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
