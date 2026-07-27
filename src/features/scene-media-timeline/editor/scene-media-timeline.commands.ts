/**
 * Pure editor commands for Scene Media Timeline (Sprint 8B / 8B.1).
 * All writes go through the atomic builder. No Preview/Export/MasterTimeline imports.
 */

import {
  framingToSceneImageFields,
  resolveSceneMediaFraming,
} from "@/features/media-framing";
import type {
  FootieScene,
  SceneImage,
  SceneMedia,
  SceneMediaTimelineItem,
} from "@/features/story/types";
import {
  getSceneDurationMs,
  normalizeSceneMedia,
} from "@/features/story/utils/scene.utils";
import { buildRemoveSceneMediaPatch } from "@/features/story/utils/scene-media-upload.utils";

import { applyBuiltMediaTimelineToScene } from "../adapters/build-scene-media-timeline";
import { buildLegacyVirtualMediaItemId } from "../domain/legacy-virtual-id";
import { projectSceneMediaTimeline } from "../adapters/project-scene-media-timeline";
import { sceneMediaToCompatibilityImage } from "../adapters/scene-media-to-compatibility-image";
import { resolveSceneMediaWindows } from "../resolution/resolve-media-windows";

import { reconcileSceneMediaTransitionsAfterTimelineWrite } from "@/features/scene-media-transitions";

import {
  createDefaultMediaItemIdGenerator,
  type GenerateMediaItemId,
} from "./generate-media-item-id";
import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "./scene-media-timeline.constants";

export interface SceneMediaTimelineCommandResult {
  scene: FootieScene;
  /** Selected media item after the mutation (stable id). */
  selectedMediaItemId: string | null;
  /** True when this mutation created the first stored timeline from a legacy projection. */
  convertedFromLegacy: boolean;
}

function cloneItems(
  items: readonly SceneMediaTimelineItem[],
): Array<{ id: string; media: SceneMedia; durationWeight: number }> {
  return items.map((item) => ({
    id: item.id,
    media: item.media,
    durationWeight: item.durationWeight,
  }));
}

function applyItemsToScene(
  scene: FootieScene,
  items: ReadonlyArray<{
    id: string;
    media: SceneMedia;
    durationWeight: number;
  }>,
): FootieScene {
  if (items.length === 0) {
    const emptyScene = {
      ...scene,
      ...buildRemoveSceneMediaPatch(),
      mediaTimeline: undefined,
      mediaTransitions: undefined,
    };
    return emptyScene;
  }
  const next = applyBuiltMediaTimelineToScene(scene, { items });
  return reconcileSceneMediaTransitionsAfterTimelineWrite(next);
}

/**
 * Overflow-safe average weight.
 * Finite positive inputs always produce a finite positive average.
 */
export function resolveAverageDurationWeight(
  items: ReadonlyArray<{ durationWeight: number }>,
): number {
  if (items.length === 0) {
    return 1;
  }

  const weights: number[] = [];
  for (const item of items) {
    if (
      typeof item.durationWeight === "number" &&
      Number.isFinite(item.durationWeight) &&
      item.durationWeight > 0
    ) {
      weights.push(item.durationWeight);
    }
  }
  if (weights.length === 0) {
    return 1;
  }

  let maxWeight = 0;
  for (const weight of weights) {
    if (weight > maxWeight) {
      maxWeight = weight;
    }
  }
  if (!(maxWeight > 0) || !Number.isFinite(maxWeight)) {
    return 1;
  }

  let normalizedSum = 0;
  for (const weight of weights) {
    normalizedSum += weight / maxWeight;
  }
  const average = (normalizedSum / weights.length) * maxWeight;
  if (!Number.isFinite(average) || !(average > 0)) {
    return 1;
  }
  return average;
}

function windowsMeetMinimumDuration(
  items: ReadonlyArray<{
    id: string;
    media: SceneMedia;
    durationWeight: number;
  }>,
  sceneDurationMs: number,
): boolean {
  if (items.length === 0) {
    return false;
  }
  if (sceneDurationMs < items.length * SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
    return false;
  }
  const windows = resolveSceneMediaWindows({ items, sceneDurationMs });
  if (windows.length !== items.length) {
    return false;
  }
  return windows.every(
    (window) => window.durationMs >= SCENE_MEDIA_MIN_ITEM_DURATION_MS,
  );
}

/**
 * Predicts whether an append would keep every window ≥ min duration.
 * Empty scenes may add a first image when duration ≥ min item duration.
 * Does not mutate the scene. Preserves existing item proportions (no silent rebalance).
 */
export function canAddSceneMediaItem(scene: FootieScene): boolean {
  const projected = projectSceneMediaTimeline(scene);
  const sceneDurationMs = getSceneDurationMs(scene);

  if (projected.items.length === 0) {
    return sceneDurationMs >= SCENE_MEDIA_MIN_ITEM_DURATION_MS;
  }

  const currentItems = cloneItems(projected.items);
  const nextCount = currentItems.length + 1;
  if (sceneDurationMs < nextCount * SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
    return false;
  }

  const averageWeight = resolveAverageDurationWeight(currentItems);
  if (!Number.isFinite(averageWeight) || !(averageWeight > 0)) {
    return false;
  }

  const probeMedia = currentItems[0]!.media;
  const proposed = [
    ...currentItems,
    {
      id: "__append_probe__",
      media: probeMedia,
      durationWeight: averageWeight,
    },
  ];
  return windowsMeetMinimumDuration(proposed, sceneDurationMs);
}

/**
 * Ensures the scene has a stored mediaTimeline using the complete normalized projection.
 * On every explicit edit, rebuilds through the atomic builder (no superficial equality shortcut).
 * Legacy virtual projections → convertedFromLegacy true; stored projections → false.
 */
export function ensureStoredSceneMediaTimeline(scene: FootieScene): {
  scene: FootieScene;
  items: SceneMediaTimelineItem[];
  convertedFromLegacy: boolean;
} {
  const projected = projectSceneMediaTimeline(scene);

  if (projected.items.length === 0) {
    return { scene, items: [], convertedFromLegacy: false };
  }

  const items = projected.items.map((item) => ({
    id: item.id || buildLegacyVirtualMediaItemId(scene.id),
    media: item.media,
    durationWeight:
      typeof item.durationWeight === "number" &&
      Number.isFinite(item.durationWeight) &&
      item.durationWeight > 0
        ? item.durationWeight
        : 1,
  }));

  const nextScene = applyItemsToScene(scene, items);
  return {
    scene: nextScene,
    items: nextScene.mediaTimeline?.items ?? [],
    convertedFromLegacy: !projected.fromStoredTimeline,
  };
}

/** True when mediaItemId exists on the scene's projected timeline (including legacy virtual ids). */
export function isSelectableSceneMediaItemId(
  scene: FootieScene,
  mediaItemId: string,
): boolean {
  const trimmed = typeof mediaItemId === "string" ? mediaItemId.trim() : "";
  if (!trimmed) {
    return false;
  }
  return projectSceneMediaTimeline(scene).items.some(
    (item) => item.id === trimmed,
  );
}

/**
 * Appends an image media item. Converts legacy → stored on first edit.
 * Independently validates min durations after average-weight prediction.
 */
export function appendSceneMediaImageItem(
  scene: FootieScene,
  media: SceneMedia,
  options: { generateId?: GenerateMediaItemId } = {},
): SceneMediaTimelineCommandResult {
  if (media.type !== "image") {
    throw new Error("Sprint 8B only supports appending image media items.");
  }

  const generateId = options.generateId ?? createDefaultMediaItemIdGenerator();
  const sceneDurationMs = getSceneDurationMs(scene);
  const projected = projectSceneMediaTimeline(scene);

  // First image on an empty / unusable-projection scene (no legacy media).
  if (projected.items.length === 0) {
    if (sceneDurationMs < SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
      throw new Error(
        `Cannot add media item: scene is shorter than ${SCENE_MEDIA_MIN_ITEM_DURATION_MS}ms per item.`,
      );
    }
    const newId = generateId();
    const nextItems = [{ id: newId, media, durationWeight: 1 }];
    return {
      scene: applyItemsToScene(scene, nextItems),
      selectedMediaItemId: newId,
      convertedFromLegacy: false,
    };
  }

  const ensured = ensureStoredSceneMediaTimeline(scene);
  const currentItems = cloneItems(ensured.items);

  const averageWeight = resolveAverageDurationWeight(currentItems);
  if (!Number.isFinite(averageWeight) || !(averageWeight > 0)) {
    throw new Error(
      `Cannot add media item: scene is shorter than ${SCENE_MEDIA_MIN_ITEM_DURATION_MS}ms per item.`,
    );
  }

  const newId = generateId();
  const nextItems = [
    ...currentItems,
    { id: newId, media, durationWeight: averageWeight },
  ];

  if (
    !windowsMeetMinimumDuration(nextItems, getSceneDurationMs(ensured.scene))
  ) {
    throw new Error(
      `Cannot add media item: scene is shorter than ${SCENE_MEDIA_MIN_ITEM_DURATION_MS}ms per item.`,
    );
  }

  return {
    scene: applyItemsToScene(ensured.scene, nextItems),
    selectedMediaItemId: newId,
    convertedFromLegacy: ensured.convertedFromLegacy,
  };
}

export function reorderSceneMediaItem(
  scene: FootieScene,
  mediaItemId: string,
  toIndex: number,
): SceneMediaTimelineCommandResult {
  if (typeof toIndex !== "number" || !Number.isFinite(toIndex)) {
    throw new Error("Reorder index must be a finite number.");
  }

  const ensured = ensureStoredSceneMediaTimeline(scene);
  const items = cloneItems(ensured.items);
  const fromIndex = items.findIndex((item) => item.id === mediaItemId);
  if (fromIndex < 0) {
    throw new Error("Media item not found for reorder.");
  }
  const clamped = Math.max(0, Math.min(items.length - 1, Math.floor(toIndex)));
  if (fromIndex === clamped) {
    return {
      scene: ensured.scene,
      selectedMediaItemId: mediaItemId,
      convertedFromLegacy: ensured.convertedFromLegacy,
    };
  }

  const [moved] = items.splice(fromIndex, 1);
  items.splice(clamped, 0, moved!);

  return {
    scene: applyItemsToScene(ensured.scene, items),
    selectedMediaItemId: mediaItemId,
    convertedFromLegacy: ensured.convertedFromLegacy,
  };
}

export function moveSceneMediaItemLeft(
  scene: FootieScene,
  mediaItemId: string,
): SceneMediaTimelineCommandResult {
  const ensured = ensureStoredSceneMediaTimeline(scene);
  const index = ensured.items.findIndex((item) => item.id === mediaItemId);
  if (index <= 0) {
    return {
      scene: ensured.scene,
      selectedMediaItemId: mediaItemId,
      convertedFromLegacy: ensured.convertedFromLegacy,
    };
  }
  return reorderSceneMediaItem(ensured.scene, mediaItemId, index - 1);
}

export function moveSceneMediaItemRight(
  scene: FootieScene,
  mediaItemId: string,
): SceneMediaTimelineCommandResult {
  const ensured = ensureStoredSceneMediaTimeline(scene);
  const index = ensured.items.findIndex((item) => item.id === mediaItemId);
  if (index < 0 || index >= ensured.items.length - 1) {
    return {
      scene: ensured.scene,
      selectedMediaItemId: mediaItemId,
      convertedFromLegacy: ensured.convertedFromLegacy,
    };
  }
  return reorderSceneMediaItem(ensured.scene, mediaItemId, index + 1);
}

/**
 * Deterministic next selection after removal:
 * prefer the item that lands at the removed index, else the previous item, else null.
 */
export function resolveNextMediaItemSelectionAfterRemoval(
  items: ReadonlyArray<{ id: string }>,
  removedMediaItemId: string,
): string | null {
  const index = items.findIndex((item) => item.id === removedMediaItemId);
  if (index < 0) {
    return items[0]?.id ?? null;
  }
  const remaining = items.filter((item) => item.id !== removedMediaItemId);
  if (remaining.length === 0) {
    return null;
  }
  return (
    remaining[Math.min(index, remaining.length - 1)]?.id ?? remaining[0]!.id
  );
}

/**
 * Removes a media item. Removing the final item leaves an intentionally empty
 * scene so the editor can ask the user to add replacement media.
 */
export function removeSceneMediaItem(
  scene: FootieScene,
  mediaItemId: string,
): SceneMediaTimelineCommandResult {
  const ensured = ensureStoredSceneMediaTimeline(scene);
  const nextSelection = resolveNextMediaItemSelectionAfterRemoval(
    ensured.items,
    mediaItemId,
  );
  const nextItems = cloneItems(ensured.items).filter(
    (item) => item.id !== mediaItemId,
  );
  if (nextItems.length === ensured.items.length) {
    throw new Error("Media item not found for removal.");
  }

  return {
    scene: applyItemsToScene(ensured.scene, nextItems),
    selectedMediaItemId: nextSelection,
    convertedFromLegacy: ensured.convertedFromLegacy,
  };
}

export function updateSceneMediaItemDurationWeight(
  scene: FootieScene,
  mediaItemId: string,
  durationWeight: number,
): SceneMediaTimelineCommandResult {
  if (!(
    typeof durationWeight === "number" &&
    Number.isFinite(durationWeight) &&
    durationWeight > 0
  )) {
    throw new Error("durationWeight must be finite and greater than zero.");
  }

  const ensured = ensureStoredSceneMediaTimeline(scene);
  const items = cloneItems(ensured.items);
  const index = items.findIndex((item) => item.id === mediaItemId);
  if (index < 0) {
    throw new Error("Media item not found for weight update.");
  }

  items[index] = { ...items[index]!, durationWeight };
  const nextScene = applyItemsToScene(ensured.scene, items);
  assertMinimumItemDurations(nextScene);

  return {
    scene: nextScene,
    selectedMediaItemId: mediaItemId,
    convertedFromLegacy: ensured.convertedFromLegacy,
  };
}

function assertMinimumItemDurations(scene: FootieScene): void {
  const projected = projectSceneMediaTimeline(scene);
  const windows = resolveSceneMediaWindows({
    items: projected.items,
    sceneDurationMs: projected.sceneDurationMs,
  });
  for (const window of windows) {
    if (window.durationMs < SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
      throw new Error(
        `Media item windows must be at least ${SCENE_MEDIA_MIN_ITEM_DURATION_MS}ms.`,
      );
    }
  }
}

/**
 * Resizes the boundary between item[leftIndex] and item[leftIndex+1].
 * Only those two weights change; combined duration is preserved.
 * deltaMs > 0 grows the left item (shrinks the right).
 */
export function resizeAdjacentSceneMediaBoundary(
  scene: FootieScene,
  leftIndex: number,
  deltaMs: number,
): SceneMediaTimelineCommandResult {
  const ensured = ensureStoredSceneMediaTimeline(scene);
  const items = cloneItems(ensured.items);
  if (leftIndex < 0 || leftIndex >= items.length - 1) {
    throw new Error("Invalid adjacent boundary index.");
  }
  if (!Number.isFinite(deltaMs) || deltaMs === 0) {
    return {
      scene: ensured.scene,
      selectedMediaItemId: items[leftIndex]?.id ?? null,
      convertedFromLegacy: ensured.convertedFromLegacy,
    };
  }

  const sceneDurationMs = getSceneDurationMs(ensured.scene);
  const windows = resolveSceneMediaWindows({
    items: items.map((item) => ({
      id: item.id,
      media: item.media,
      durationWeight: item.durationWeight,
    })),
    sceneDurationMs,
  });

  const left = windows[leftIndex]!;
  const right = windows[leftIndex + 1]!;
  const combinedMs = left.durationMs + right.durationMs;
  if (combinedMs < SCENE_MEDIA_MIN_ITEM_DURATION_MS * 2) {
    throw new Error("Adjacent items are too short to resize.");
  }

  let nextLeftMs = left.durationMs + deltaMs;
  nextLeftMs = Math.max(
    SCENE_MEDIA_MIN_ITEM_DURATION_MS,
    Math.min(combinedMs - SCENE_MEDIA_MIN_ITEM_DURATION_MS, nextLeftMs),
  );

  const leftItem = items[leftIndex]!;
  const rightItem = items[leftIndex + 1]!;
  const combinedWeight = leftItem.durationWeight + rightItem.durationWeight;
  const leftShare = nextLeftMs / combinedMs;
  const nextLeftWeight = Math.max(Number.EPSILON, combinedWeight * leftShare);
  const nextRightWeight = Math.max(
    Number.EPSILON,
    combinedWeight - nextLeftWeight,
  );

  const nextItems = items.map((item, index) => {
    if (index === leftIndex) {
      return { ...item, durationWeight: nextLeftWeight };
    }
    if (index === leftIndex + 1) {
      return { ...item, durationWeight: nextRightWeight };
    }
    return item;
  });

  const nextScene = applyItemsToScene(ensured.scene, nextItems);
  assertMinimumItemDurations(nextScene);

  return {
    scene: nextScene,
    selectedMediaItemId: items[leftIndex]?.id ?? null,
    convertedFromLegacy: ensured.convertedFromLegacy,
  };
}

/** Preview windows for UI without mutating the scene. */
export function previewAdjacentBoundaryResize(
  scene: FootieScene,
  leftIndex: number,
  deltaMs: number,
) {
  try {
    const result = resizeAdjacentSceneMediaBoundary(scene, leftIndex, deltaMs);
    return projectSceneMediaTimeline(result.scene);
  } catch {
    return projectSceneMediaTimeline(scene);
  }
}

export function canMoveSceneMediaItemLeft(
  scene: FootieScene,
  mediaItemId: string,
): boolean {
  const projected = projectSceneMediaTimeline(scene);
  const index = projected.items.findIndex((item) => item.id === mediaItemId);
  return index > 0;
}

export function canMoveSceneMediaItemRight(
  scene: FootieScene,
  mediaItemId: string,
): boolean {
  const projected = projectSceneMediaTimeline(scene);
  const index = projected.items.findIndex((item) => item.id === mediaItemId);
  return index >= 0 && index < projected.items.length - 1;
}

export function canRemoveSceneMediaItem(scene: FootieScene): boolean {
  return projectSceneMediaTimeline(scene).items.length > 0;
}

/**
 * Narrow temporary scene-shaped input so existing framing/motion/trim/poster
 * builders can target a selected timeline item's SceneMedia without writing
 * the real scene's first-item compatibility slot.
 */
export function buildTemporarySceneForMediaItemEdit(
  scene: FootieScene,
  itemMedia: SceneMedia,
): Pick<
  FootieScene,
  "id" | "image" | "uploadedImage" | "media" | "duration" | "durationMs"
> {
  const framing = resolveSceneMediaFraming(
    { media: itemMedia },
    { media: itemMedia },
  );
  const image: SceneImage | undefined =
    itemMedia.type === "image" &&
    typeof itemMedia.url === "string" &&
    itemMedia.url.trim()
      ? {
          url: itemMedia.url.trim(),
          ...framingToSceneImageFields(framing),
          imageMotion: itemMedia.imageMotion,
        }
      : undefined;

  return {
    id: scene.id,
    media: itemMedia,
    image,
    uploadedImage: undefined,
    duration: scene.duration,
    durationMs: scene.durationMs,
  };
}

/**
 * Derives first-item legacy `scene.image` from normalized image SceneMedia.
 * Delegates to the shared pure mapper (Preview/Export must not import this module).
 */
export function deriveFirstItemCompatibilityImage(
  media: SceneMedia,
): SceneImage | undefined {
  return sceneMediaToCompatibilityImage(media);
}

/**
 * Replaces one timeline item's media by stable ID.
 * Converts legacy → stored on first explicit edit. Preserves IDs, weights, order.
 * `scene.media` mirrors the first item via the atomic builder.
 * First-item compatibility (`scene.image` / `uploadedImage`) is command-owned.
 * Non-first edits never write first-item compatibility fields.
 */
export function updateSceneMediaItemMedia(
  scene: FootieScene,
  mediaItemId: string,
  nextMedia: SceneMedia,
): SceneMediaTimelineCommandResult {
  const trimmedId = typeof mediaItemId === "string" ? mediaItemId.trim() : "";
  if (!trimmedId) {
    throw new Error("Media item id is required.");
  }

  const normalizedMedia = normalizeSceneMedia(nextMedia);
  if (
    !normalizedMedia ||
    typeof normalizedMedia.url !== "string" ||
    !normalizedMedia.url.trim()
  ) {
    throw new Error("Media item update rejected: media is missing or invalid.");
  }

  const projected = projectSceneMediaTimeline(scene);
  if (!projected.items.some((item) => item.id === trimmedId)) {
    throw new Error("Media item not found.");
  }

  const ensured = ensureStoredSceneMediaTimeline(scene);
  const items = cloneItems(ensured.items);
  const index = items.findIndex((item) => item.id === trimmedId);
  if (index < 0) {
    throw new Error("Media item not found.");
  }

  const nextItems = items.map((item, itemIndex) =>
    itemIndex === index ? { ...item, media: normalizedMedia } : item,
  );

  let nextScene = applyItemsToScene(ensured.scene, nextItems);

  if (index === 0) {
    if (normalizedMedia.type === "image") {
      nextScene = {
        ...nextScene,
        image: deriveFirstItemCompatibilityImage(normalizedMedia),
        uploadedImage: undefined,
      };
    } else {
      nextScene = {
        ...nextScene,
        image: undefined,
        uploadedImage: undefined,
      };
    }
  } else {
    // Preserve first-item legacy fields byte-for-byte; later items never own them.
    nextScene = {
      ...nextScene,
      image: ensured.scene.image,
      uploadedImage: ensured.scene.uploadedImage,
    };
  }

  return {
    scene: nextScene,
    selectedMediaItemId: trimmedId,
    convertedFromLegacy: ensured.convertedFromLegacy,
  };
}
