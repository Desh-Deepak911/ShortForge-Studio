/**
 * Sprint 12B editor commands for mixed image/video visual sequences.
 * Always dual-writes mediaTimeline so Preview/Export share one window plan.
 */

import {
  applyBuiltMediaTimelineToScene,
  createDefaultMediaItemIdGenerator,
  projectSceneMediaTimeline,
  resolveSceneMediaWindows,
  SCENE_MEDIA_MIN_ITEM_DURATION_MS,
  type GenerateMediaItemId,
} from "@/features/scene-media-timeline";
import { reconcileSceneMediaTransitionsAfterTimelineWrite } from "@/features/scene-media-transitions";
import type {
  FootieScene,
  SceneMedia,
  SceneVisualSequence,
  SceneVisualSequenceItem,
} from "@/features/story/types";
import {
  getSceneDurationMs,
  normalizeSceneMedia,
} from "@/features/story/utils/scene.utils";
import { buildRemoveSceneMediaPatch } from "@/features/story/utils/scene-media-upload.utils";

import { visualSequenceToMediaTimeline } from "../adapters/visual-sequence-to-media-timeline";
import {
  cloneVisualSequence,
  normalizeVisualSequence,
  type VisualSequenceWarning,
} from "../domain/normalize-visual-sequence";

export interface MixedMediaSceneCommandResult {
  readonly scene: FootieScene;
  readonly selectedMediaItemId: string | null;
  readonly warnings: readonly VisualSequenceWarning[];
  readonly convertedFromLegacy: boolean;
}

function assertMixedMediaEnabled(enabled: boolean): void {
  if (!enabled) {
    throw new Error(
      "Mixed-media scenes are unavailable while mixed-media-scenes-v1 is disabled.",
    );
  }
}

function assertImageOrVideo(media: SceneMedia): SceneMedia {
  const normalized = normalizeSceneMedia(media);
  if (!normalized || (normalized.type !== "image" && normalized.type !== "video")) {
    throw new Error("Mixed-media sequence items must be image or video.");
  }
  return normalized;
}

function sequenceFromScene(scene: FootieScene): {
  items: SceneVisualSequenceItem[];
  convertedFromLegacy: boolean;
} {
  const sceneDurationMs = getSceneDurationMs(scene);
  const normalized = normalizeVisualSequence(scene.visualSequence, sceneDurationMs);
  if (normalized.sequence && normalized.sequence.items.length > 0) {
    return {
      items: normalized.sequence.items.map((item) => ({ ...item })),
      convertedFromLegacy: false,
    };
  }

  const projected = projectSceneMediaTimeline(scene);
  if (projected.items.length === 0) {
    return { items: [], convertedFromLegacy: false };
  }
  const windows = resolveSceneMediaWindows({
    items: projected.items,
    sceneDurationMs: projected.sceneDurationMs,
  });
  return {
    items: windows.map((window) => ({
      id: window.itemId,
      media: window.media,
      startOffsetMs: window.startMs,
      durationMs: Math.max(SCENE_MEDIA_MIN_ITEM_DURATION_MS, window.durationMs),
    })),
    convertedFromLegacy: !projected.fromStoredTimeline,
  };
}

function applySequenceToScene(
  scene: FootieScene,
  items: readonly SceneVisualSequenceItem[],
): { scene: FootieScene; warnings: readonly VisualSequenceWarning[] } {
  const sceneDurationMs = getSceneDurationMs(scene);
  if (items.length === 0) {
    const emptyScene: FootieScene = {
      ...scene,
      ...buildRemoveSceneMediaPatch(),
      mediaTimeline: undefined,
      visualSequence: undefined,
      mediaTransitions: undefined,
    };
    return { scene: emptyScene, warnings: [] };
  }

  const normalized = normalizeVisualSequence(
    { version: 1, items },
    sceneDurationMs,
  );
  if (!normalized.sequence) {
    throw new Error(
      normalized.terminalCode === "SCENE_DURATION_INVALID"
        ? "Narration scene duration is invalid for a visual sequence."
        : "Visual sequence could not be normalized into a coherent plan.",
    );
  }

  const timeline = visualSequenceToMediaTimeline(normalized.sequence);
  let next = applyBuiltMediaTimelineToScene(scene, { items: timeline.items });
  next = {
    ...next,
    visualSequence: cloneVisualSequence(normalized.sequence),
  };
  next = reconcileSceneMediaTransitionsAfterTimelineWrite(next);
  return { scene: next, warnings: normalized.warnings };
}

export function appendMixedMediaSequenceItem(
  scene: FootieScene,
  media: SceneMedia,
  options: {
    readonly mixedMediaScenesEnabled: boolean;
    readonly generateId?: GenerateMediaItemId;
  },
): MixedMediaSceneCommandResult {
  assertMixedMediaEnabled(options.mixedMediaScenesEnabled);
  const nextMedia = assertImageOrVideo(media);
  const generateId = options.generateId ?? createDefaultMediaItemIdGenerator();
  const sceneDurationMs = getSceneDurationMs(scene);
  const current = sequenceFromScene(scene);
  const nextCount = current.items.length + 1;
  if (sceneDurationMs < nextCount * SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
    throw new Error(
      `Cannot add media item: scene is shorter than ${SCENE_MEDIA_MIN_ITEM_DURATION_MS}ms per item.`,
    );
  }

  const equalShare = Math.floor(sceneDurationMs / nextCount);
  const newId = generateId();
  const rebuilt: SceneVisualSequenceItem[] = [
    ...current.items.map((item, index) => ({
      ...item,
      startOffsetMs: index * equalShare,
      durationMs: equalShare,
    })),
    {
      id: newId,
      media: nextMedia,
      startOffsetMs: current.items.length * equalShare,
      durationMs: sceneDurationMs - current.items.length * equalShare,
    },
  ];

  const applied = applySequenceToScene(scene, rebuilt);
  return {
    scene: applied.scene,
    selectedMediaItemId: newId,
    warnings: applied.warnings,
    convertedFromLegacy: current.convertedFromLegacy,
  };
}

export function removeMixedMediaSequenceItem(
  scene: FootieScene,
  mediaItemId: string,
  options: { readonly mixedMediaScenesEnabled: boolean },
): MixedMediaSceneCommandResult {
  assertMixedMediaEnabled(options.mixedMediaScenesEnabled);
  const current = sequenceFromScene(scene);
  const index = current.items.findIndex((item) => item.id === mediaItemId);
  if (index < 0) {
    throw new Error("Media item not found for removal.");
  }
  const remaining = current.items.filter((item) => item.id !== mediaItemId);
  const nextSelection =
    remaining[Math.min(index, Math.max(0, remaining.length - 1))]?.id ?? null;
  const sceneDurationMs = getSceneDurationMs(scene);
  const equalShare =
    remaining.length > 0 ? Math.floor(sceneDurationMs / remaining.length) : 0;
  const rebuilt = remaining.map((item, itemIndex) => ({
    ...item,
    startOffsetMs: itemIndex * equalShare,
    durationMs:
      itemIndex === remaining.length - 1
        ? sceneDurationMs - itemIndex * equalShare
        : equalShare,
  }));
  const applied = applySequenceToScene(scene, rebuilt);
  return {
    scene: applied.scene,
    selectedMediaItemId: nextSelection,
    warnings: applied.warnings,
    convertedFromLegacy: current.convertedFromLegacy,
  };
}

export function reorderMixedMediaSequenceItem(
  scene: FootieScene,
  mediaItemId: string,
  toIndex: number,
  options: { readonly mixedMediaScenesEnabled: boolean },
): MixedMediaSceneCommandResult {
  assertMixedMediaEnabled(options.mixedMediaScenesEnabled);
  if (typeof toIndex !== "number" || !Number.isFinite(toIndex)) {
    throw new Error("Reorder index must be a finite number.");
  }
  const current = sequenceFromScene(scene);
  const fromIndex = current.items.findIndex((item) => item.id === mediaItemId);
  if (fromIndex < 0) {
    throw new Error("Media item not found for reorder.");
  }
  const items = [...current.items];
  const clamped = Math.max(0, Math.min(items.length - 1, Math.floor(toIndex)));
  const [moved] = items.splice(fromIndex, 1);
  items.splice(clamped, 0, moved!);
  const sceneDurationMs = getSceneDurationMs(scene);
  const equalShare = Math.floor(sceneDurationMs / items.length);
  const rebuilt = items.map((item, index) => ({
    ...item,
    startOffsetMs: index * equalShare,
    durationMs:
      index === items.length - 1
        ? sceneDurationMs - index * equalShare
        : equalShare,
  }));
  const applied = applySequenceToScene(scene, rebuilt);
  return {
    scene: applied.scene,
    selectedMediaItemId: mediaItemId,
    warnings: applied.warnings,
    convertedFromLegacy: current.convertedFromLegacy,
  };
}

/**
 * Sequential boundary model (narration-authoritative, contiguous):
 * - Item 0 always starts at 0.
 * - For item i > 0, startOffsetMs is the boundary between item i-1 and item i.
 * - Moving that boundary swaps duration between the two neighbors only.
 * - Duration edits keep the sequence contiguous; the final item fills narration end.
 */
export function updateMixedMediaSequenceBoundary(
  scene: FootieScene,
  mediaItemId: string,
  boundaryStartMs: number,
  options: { readonly mixedMediaScenesEnabled: boolean },
): MixedMediaSceneCommandResult {
  assertMixedMediaEnabled(options.mixedMediaScenesEnabled);
  const current = sequenceFromScene(scene);
  const index = current.items.findIndex((item) => item.id === mediaItemId);
  if (index < 0) {
    throw new Error("Media item not found for boundary update.");
  }
  if (index === 0) {
    const applied = applySequenceToScene(scene, current.items);
    return {
      scene: applied.scene,
      selectedMediaItemId: mediaItemId,
      warnings: Object.freeze([
        {
          code: "first_item_start_fixed" as const,
          message:
            "The first visual always starts at the beginning of the narration scene.",
          itemId: mediaItemId,
          itemIndex: 0,
        },
        ...applied.warnings,
      ]),
      convertedFromLegacy: current.convertedFromLegacy,
    };
  }

  const items = current.items.map((item) => ({ ...item }));
  const left = items[index - 1]!;
  const right = items[index]!;
  const pairStart = left.startOffsetMs;
  const pairDuration = left.durationMs + right.durationMs;
  const minBoundary = pairStart + SCENE_MEDIA_MIN_ITEM_DURATION_MS;
  const maxBoundary = pairStart + pairDuration - SCENE_MEDIA_MIN_ITEM_DURATION_MS;
  const requested = Math.round(boundaryStartMs);
  const clamped = Math.min(maxBoundary, Math.max(minBoundary, requested));
  const warnings: VisualSequenceWarning[] = [];
  if (clamped !== requested) {
    warnings.push({
      code: "boundary_clamped",
      message: `Boundary clamped to keep both clips at least ${SCENE_MEDIA_MIN_ITEM_DURATION_MS}ms.`,
      itemId: mediaItemId,
      itemIndex: index,
    });
  }
  left.durationMs = clamped - pairStart;
  right.startOffsetMs = clamped;
  right.durationMs = pairDuration - left.durationMs;

  // Keep later items contiguous after the resized pair.
  let cursor = right.startOffsetMs + right.durationMs;
  for (let i = index + 1; i < items.length; i += 1) {
    const item = items[i]!;
    item.startOffsetMs = cursor;
    if (i === items.length - 1) {
      item.durationMs = Math.max(
        SCENE_MEDIA_MIN_ITEM_DURATION_MS,
        getSceneDurationMs(scene) - cursor,
      );
    }
    cursor = item.startOffsetMs + item.durationMs;
  }

  const applied = applySequenceToScene(scene, items);
  return {
    scene: applied.scene,
    selectedMediaItemId: mediaItemId,
    warnings: Object.freeze([...warnings, ...applied.warnings]),
    convertedFromLegacy: current.convertedFromLegacy,
  };
}

export function updateMixedMediaSequenceItemDuration(
  scene: FootieScene,
  mediaItemId: string,
  durationMs: number,
  options: { readonly mixedMediaScenesEnabled: boolean },
): MixedMediaSceneCommandResult {
  assertMixedMediaEnabled(options.mixedMediaScenesEnabled);
  const current = sequenceFromScene(scene);
  const index = current.items.findIndex((item) => item.id === mediaItemId);
  if (index < 0) {
    throw new Error("Media item not found for duration update.");
  }

  const sceneDurationMs = getSceneDurationMs(scene);
  const items = current.items.map((item) => ({ ...item }));
  const followingCount = items.length - index - 1;
  const start = items[index]!.startOffsetMs;
  const maxDuration = Math.max(
    SCENE_MEDIA_MIN_ITEM_DURATION_MS,
    sceneDurationMs - start - followingCount * SCENE_MEDIA_MIN_ITEM_DURATION_MS,
  );
  const requested = Math.round(durationMs);
  const clamped = Math.min(
    maxDuration,
    Math.max(SCENE_MEDIA_MIN_ITEM_DURATION_MS, requested),
  );
  const warnings: VisualSequenceWarning[] = [];
  if (clamped !== requested) {
    warnings.push({
      code: "duration_clamped",
      message:
        "Duration was clamped so every visual keeps the minimum length inside the narration scene.",
      itemId: mediaItemId,
      itemIndex: index,
    });
  }

  items[index]!.durationMs = clamped;
  let cursor = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    item.startOffsetMs = cursor;
    if (i === index) {
      item.durationMs = clamped;
    } else if (i === items.length - 1) {
      item.durationMs = Math.max(
        SCENE_MEDIA_MIN_ITEM_DURATION_MS,
        sceneDurationMs - cursor,
      );
    } else if (i > index) {
      const remainingSlots = items.length - i;
      const maxForItem = Math.max(
        SCENE_MEDIA_MIN_ITEM_DURATION_MS,
        sceneDurationMs - cursor - (remainingSlots - 1) * SCENE_MEDIA_MIN_ITEM_DURATION_MS,
      );
      item.durationMs = Math.min(
        Math.max(SCENE_MEDIA_MIN_ITEM_DURATION_MS, item.durationMs),
        maxForItem,
      );
    }
    cursor = item.startOffsetMs + item.durationMs;
  }
  // Final fill to narration end (authoritative).
  if (items.length > 0) {
    const last = items[items.length - 1]!;
    last.durationMs = Math.max(
      SCENE_MEDIA_MIN_ITEM_DURATION_MS,
      sceneDurationMs - last.startOffsetMs,
    );
  }

  const applied = applySequenceToScene(scene, items);
  return {
    scene: applied.scene,
    selectedMediaItemId: mediaItemId,
    warnings: Object.freeze([...warnings, ...applied.warnings]),
    convertedFromLegacy: current.convertedFromLegacy,
  };
}

/**
 * Convenience facade used by older callers/tests.
 * `startOffsetMs` edits the sequential boundary (not an independent free start).
 * First-item start edits are rejected with a clear warning (value stays 0).
 */
export function updateMixedMediaSequenceItemTiming(
  scene: FootieScene,
  mediaItemId: string,
  timing: { readonly startOffsetMs?: number; readonly durationMs?: number },
  options: { readonly mixedMediaScenesEnabled: boolean },
): MixedMediaSceneCommandResult {
  if (typeof timing.startOffsetMs === "number" && Number.isFinite(timing.startOffsetMs)) {
    const boundaryResult = updateMixedMediaSequenceBoundary(
      scene,
      mediaItemId,
      timing.startOffsetMs,
      options,
    );
    if (typeof timing.durationMs === "number" && Number.isFinite(timing.durationMs)) {
      const durationResult = updateMixedMediaSequenceItemDuration(
        boundaryResult.scene,
        mediaItemId,
        timing.durationMs,
        options,
      );
      return {
        ...durationResult,
        warnings: Object.freeze([
          ...boundaryResult.warnings,
          ...durationResult.warnings,
        ]),
        convertedFromLegacy:
          boundaryResult.convertedFromLegacy || durationResult.convertedFromLegacy,
      };
    }
    return boundaryResult;
  }
  if (typeof timing.durationMs === "number" && Number.isFinite(timing.durationMs)) {
    return updateMixedMediaSequenceItemDuration(
      scene,
      mediaItemId,
      timing.durationMs,
      options,
    );
  }
  const current = sequenceFromScene(scene);
  return {
    scene,
    selectedMediaItemId: mediaItemId,
    warnings: [],
    convertedFromLegacy: current.convertedFromLegacy,
  };
}

export function readMixedMediaSequenceItems(
  scene: FootieScene,
): readonly SceneVisualSequenceItem[] {
  return sequenceFromScene(scene).items;
}

export function readSceneVisualSequence(
  scene: FootieScene,
): SceneVisualSequence | undefined {
  const { items } = sequenceFromScene(scene);
  if (items.length === 0) return undefined;
  return { version: 1, items };
}
