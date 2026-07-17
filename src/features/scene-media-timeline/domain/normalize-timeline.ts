/**
 * Pure normalization for persisted SceneMediaTimeline values.
 * Does not invent timelines from legacy media and never generates random IDs.
 *
 * Read path may salvage usable items with diagnostics.
 * Write/build path must use the atomic builder (never this salvage path alone).
 */

import type {
  SceneMedia,
  SceneMediaTimeline,
  SceneMediaTimelineItem,
} from "@/features/story/types";
import { normalizeSceneMedia } from "@/features/story/utils/scene.utils";

export type SceneMediaTimelineDiagnosticCode =
  | "invalid_timeline_shape"
  | "unsupported_version"
  | "empty_items"
  | "duplicate_item_id"
  | "empty_item_id"
  | "invalid_duration_weight"
  | "invalid_media"
  | "no_usable_items"
  | "empty_build_input";

export interface SceneMediaTimelineDiagnostic {
  code: SceneMediaTimelineDiagnosticCode;
  message: string;
  itemId?: string;
  itemIndex?: number;
}

export interface NormalizeSceneMediaTimelineResult {
  timeline: SceneMediaTimeline | undefined;
  diagnostics: SceneMediaTimelineDiagnostic[];
}

function isFinitePositiveWeight(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeItemId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalizes one persisted timeline item. Returns undefined when unusable.
 * Preserves the provided id when non-empty (never invents a new id).
 */
export function normalizeSceneMediaTimelineItem(
  value: unknown,
  index: number,
  diagnostics: SceneMediaTimelineDiagnostic[],
): SceneMediaTimelineItem | undefined {
  if (!value || typeof value !== "object") {
    diagnostics.push({
      code: "invalid_media",
      message: "Timeline item is not an object.",
      itemIndex: index,
    });
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = normalizeItemId(record.id);
  if (!id) {
    diagnostics.push({
      code: "empty_item_id",
      message: "Timeline item id is missing or empty.",
      itemIndex: index,
    });
    return undefined;
  }

  if (!isFinitePositiveWeight(record.durationWeight)) {
    diagnostics.push({
      code: "invalid_duration_weight",
      message: "Timeline item durationWeight must be finite and greater than zero.",
      itemId: id,
      itemIndex: index,
    });
    return undefined;
  }

  const media = normalizeSceneMedia(record.media);
  if (!media) {
    diagnostics.push({
      code: "invalid_media",
      message: "Timeline item media is missing or invalid.",
      itemId: id,
      itemIndex: index,
    });
    return undefined;
  }

  return {
    id,
    media,
    durationWeight: record.durationWeight,
  };
}

/**
 * True when the value is a normal absent timeline (undefined / null / missing).
 * Not a malformed-state condition — no diagnostics.
 */
export function isAbsentSceneMediaTimeline(value: unknown): boolean {
  return value == null;
}

/**
 * Normalizes a persisted timeline. Drops unusable items; omits the field when
 * nothing usable remains. Does not invent items from legacy scene media.
 *
 * Absent/null timelines return `{ timeline: undefined, diagnostics: [] }`.
 */
export function normalizeSceneMediaTimeline(
  value: unknown,
): NormalizeSceneMediaTimelineResult {
  if (isAbsentSceneMediaTimeline(value)) {
    return {
      timeline: undefined,
      diagnostics: [],
    };
  }

  if (typeof value !== "object") {
    return {
      timeline: undefined,
      diagnostics: [
        {
          code: "invalid_timeline_shape",
          message: "mediaTimeline must be an object.",
        },
      ],
    };
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return {
      timeline: undefined,
      diagnostics: [
        {
          code: "unsupported_version",
          message: "mediaTimeline.version must be 1.",
        },
      ],
    };
  }

  if (!Array.isArray(record.items)) {
    return {
      timeline: undefined,
      diagnostics: [
        {
          code: "invalid_timeline_shape",
          message: "mediaTimeline.items must be an array.",
        },
      ],
    };
  }

  if (record.items.length === 0) {
    return {
      timeline: undefined,
      diagnostics: [
        {
          code: "empty_items",
          message: "mediaTimeline.items is empty.",
        },
      ],
    };
  }

  const diagnostics: SceneMediaTimelineDiagnostic[] = [];
  const seenIds = new Set<string>();
  const items: SceneMediaTimelineItem[] = [];

  for (let index = 0; index < record.items.length; index += 1) {
    const item = normalizeSceneMediaTimelineItem(record.items[index], index, diagnostics);
    if (!item) {
      continue;
    }
    if (seenIds.has(item.id)) {
      diagnostics.push({
        code: "duplicate_item_id",
        message: "Duplicate timeline item id within the scene.",
        itemId: item.id,
        itemIndex: index,
      });
      continue;
    }
    seenIds.add(item.id);
    items.push(item);
  }

  if (items.length === 0) {
    diagnostics.push({
      code: "no_usable_items",
      message: "mediaTimeline contained no usable items after normalization.",
    });
    return { timeline: undefined, diagnostics };
  }

  return {
    timeline: { version: 1, items },
    diagnostics,
  };
}

/** Deep-clones a normalized SceneMedia record into an independent object graph. */
export function cloneSceneMedia(media: SceneMedia): SceneMedia {
  const normalized = normalizeSceneMedia(media);
  if (!normalized) {
    throw new Error("Scene media is required for clone");
  }
  return normalized;
}

/** Deep-clones a timeline into independent nested objects/arrays. */
export function cloneSceneMediaTimeline(timeline: SceneMediaTimeline): SceneMediaTimeline {
  const { timeline: normalized } = normalizeSceneMediaTimeline(timeline);
  if (!normalized) {
    throw new Error("Scene media timeline is required for clone");
  }
  return {
    version: 1,
    items: normalized.items.map((item) => ({
      id: item.id,
      durationWeight: item.durationWeight,
      media: cloneSceneMedia(item.media),
    })),
  };
}

/**
 * Applies timeline normalization onto a scene without inventing a timeline.
 * Malformed/empty timelines are omitted (legacy media fields are left intact).
 */
export function applyNormalizedMediaTimelineToScene<T extends { mediaTimeline?: unknown }>(
  scene: T,
): T {
  if (!("mediaTimeline" in scene) || scene.mediaTimeline == null) {
    if (!("mediaTimeline" in scene)) {
      return scene;
    }
    const { mediaTimeline: _dropped, ...rest } = scene;
    void _dropped;
    return rest as T;
  }

  const { timeline } = normalizeSceneMediaTimeline(scene.mediaTimeline);
  if (!timeline) {
    const { mediaTimeline: _dropped, ...rest } = scene;
    void _dropped;
    return rest as T;
  }

  return {
    ...scene,
    mediaTimeline: cloneSceneMediaTimeline(timeline),
  };
}
