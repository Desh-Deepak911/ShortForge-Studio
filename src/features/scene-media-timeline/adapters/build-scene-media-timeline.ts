/**
 * Atomic write/build helpers for later editor work (not wired into UI in 8A).
 * Keeps the first item available as the compatibility `scene.media` projection.
 *
 * Unlike read normalization, this path never silently drops invalid items.
 */

import type {
  FootieScene,
  SceneMedia,
  SceneMediaTimeline,
  SceneMediaTimelineItem,
} from "@/features/story/types";
import { normalizeSceneMedia } from "@/features/story/utils/scene.utils";

import { SceneMediaTimelineBuildError } from "../domain/build-timeline-error";
import {
  cloneSceneMedia,
  type SceneMediaTimelineDiagnostic,
} from "../domain/normalize-timeline";

export interface BuildSceneMediaTimelineInput {
  items: ReadonlyArray<{
    id: string;
    media: SceneMedia;
    /** Defaults to 1 only when omitted/undefined. Explicit invalid values reject the build. */
    durationWeight?: number;
  }>;
}

export interface BuildSceneMediaTimelineResult {
  mediaTimeline: SceneMediaTimeline;
  /** First item media — compatibility projection for Preview/Export during rollout. */
  compatibilityMedia: SceneMedia;
}

function normalizeBuildItemId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Atomically validates and builds a stored timeline.
 * Rejects the entire build if any item is invalid; never silently drops items.
 */
export function buildSceneMediaTimeline(
  input: BuildSceneMediaTimelineInput,
): BuildSceneMediaTimelineResult {
  const diagnostics: SceneMediaTimelineDiagnostic[] = [];

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new SceneMediaTimelineBuildError([
      {
        code: "empty_build_input",
        message: "Build requires at least one timeline item.",
      },
    ]);
  }

  const seenIds = new Set<string>();
  const items: SceneMediaTimelineItem[] = [];

  for (let index = 0; index < input.items.length; index += 1) {
    const raw = input.items[index]!;
    const id = normalizeBuildItemId(raw.id);
    if (!id) {
      diagnostics.push({
        code: "empty_item_id",
        message: "Timeline item id is missing or empty.",
        itemIndex: index,
      });
      continue;
    }

    if (seenIds.has(id)) {
      diagnostics.push({
        code: "duplicate_item_id",
        message: "Duplicate timeline item id within the scene.",
        itemId: id,
        itemIndex: index,
      });
      continue;
    }

    // Explicit weight present (including 0 / NaN / Infinity / negative) must be valid.
    // Only undefined/omitted defaults to 1.
    const hasExplicitWeight = Object.prototype.hasOwnProperty.call(raw, "durationWeight");
    let durationWeight: number;
    if (!hasExplicitWeight || raw.durationWeight === undefined) {
      durationWeight = 1;
    } else if (
      typeof raw.durationWeight === "number" &&
      Number.isFinite(raw.durationWeight) &&
      raw.durationWeight > 0
    ) {
      durationWeight = raw.durationWeight;
    } else {
      diagnostics.push({
        code: "invalid_duration_weight",
        message: "Timeline item durationWeight must be finite and greater than zero.",
        itemId: id,
        itemIndex: index,
      });
      continue;
    }

    const media = normalizeSceneMedia(raw.media);
    if (!media) {
      diagnostics.push({
        code: "invalid_media",
        message: "Timeline item media is missing or invalid.",
        itemId: id,
        itemIndex: index,
      });
      continue;
    }

    seenIds.add(id);
    items.push({ id, media, durationWeight });
  }

  // Atomic: any diagnostic means the whole write is rejected (no partial salvage).
  if (diagnostics.length > 0 || items.length !== input.items.length) {
    if (diagnostics.length === 0) {
      diagnostics.push({
        code: "no_usable_items",
        message: "Build produced fewer items than requested.",
      });
    }
    throw new SceneMediaTimelineBuildError(diagnostics);
  }

  const first = items[0]!;
  return {
    mediaTimeline: {
      version: 1,
      items: items.map((item) => ({
        id: item.id,
        durationWeight: item.durationWeight,
        media: cloneSceneMedia(item.media),
      })),
    },
    compatibilityMedia: cloneSceneMedia(first.media),
  };
}

/**
 * Applies a built timeline onto a scene while keeping first-item compatibility media.
 * Pure — returns a new scene object; leaves the original untouched when build fails.
 */
export function applyBuiltMediaTimelineToScene(
  scene: FootieScene,
  input: BuildSceneMediaTimelineInput,
): FootieScene {
  const built = buildSceneMediaTimeline(input);
  return {
    ...scene,
    media: built.compatibilityMedia,
    mediaTimeline: built.mediaTimeline,
  };
}
