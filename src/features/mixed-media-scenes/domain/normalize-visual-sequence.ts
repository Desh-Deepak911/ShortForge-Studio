/**
 * Normalize optional visual sequences within narration scene duration.
 * Recoverable timing problems become warnings; terminal only when no coherent items remain.
 */

import type {
  SceneMedia,
  SceneVisualSequence,
  SceneVisualSequenceItem,
} from "@/features/story/types";
import { normalizeSceneMedia } from "@/features/story/utils/scene.utils";

import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "@/features/scene-media-timeline/editor/scene-media-timeline.constants";

export type VisualSequenceWarningCode =
  | "invalid_sequence_shape"
  | "unsupported_version"
  | "empty_items"
  | "duplicate_item_id"
  | "empty_item_id"
  | "invalid_media"
  | "unsupported_media_type"
  | "invalid_timing"
  | "timing_clamped_to_scene"
  | "timing_overlap_resolved"
  | "timing_gap_closed"
  | "item_extended_beyond_scene"
  | "no_usable_items"
  | "capability_unavailable"
  | "timeline_diverged_from_sequence"
  | "boundary_clamped"
  | "first_item_start_fixed"
  | "duration_clamped";

export type VisualSequenceTerminalCode =
  | "NO_USABLE_VISUAL_ITEMS"
  | "SCENE_DURATION_INVALID";

export interface VisualSequenceWarning {
  readonly code: VisualSequenceWarningCode;
  readonly message: string;
  readonly itemId?: string;
  readonly itemIndex?: number;
}

export interface NormalizeVisualSequenceResult {
  readonly sequence: SceneVisualSequence | undefined;
  readonly warnings: readonly VisualSequenceWarning[];
  /** Set only when a coherent export interpretation is impossible for this sequence. */
  readonly terminalCode: VisualSequenceTerminalCode | null;
  readonly sceneDurationMs: number;
}

function isFiniteNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSceneDurationMs(sceneDurationMs: number): number {
  if (typeof sceneDurationMs !== "number" || !Number.isFinite(sceneDurationMs)) {
    return 0;
  }
  return Math.max(0, Math.round(sceneDurationMs));
}

function supportsSequenceMedia(media: SceneMedia): boolean {
  return media.type === "image" || media.type === "video";
}

/**
 * Normalizes a persisted visual sequence into contiguous narration-bounded windows.
 * Music is never consulted. Missing/invalid sequences return undefined (legacy path).
 */
export function normalizeVisualSequence(
  value: unknown,
  sceneDurationMsInput: number,
): NormalizeVisualSequenceResult {
  const sceneDurationMs = normalizeSceneDurationMs(sceneDurationMsInput);
  const warnings: VisualSequenceWarning[] = [];

  if (value == null) {
    return {
      sequence: undefined,
      warnings: Object.freeze(warnings),
      terminalCode: null,
      sceneDurationMs,
    };
  }

  if (typeof value !== "object") {
    warnings.push({
      code: "invalid_sequence_shape",
      message: "Visual sequence must be an object.",
    });
    return {
      sequence: undefined,
      warnings: Object.freeze(warnings),
      terminalCode: null,
      sceneDurationMs,
    };
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    warnings.push({
      code: "unsupported_version",
      message: "visualSequence.version must be 1.",
    });
    return {
      sequence: undefined,
      warnings: Object.freeze(warnings),
      terminalCode: null,
      sceneDurationMs,
    };
  }

  if (!Array.isArray(record.items)) {
    warnings.push({
      code: "invalid_sequence_shape",
      message: "visualSequence.items must be an array.",
    });
    return {
      sequence: undefined,
      warnings: Object.freeze(warnings),
      terminalCode: null,
      sceneDurationMs,
    };
  }

  if (record.items.length === 0) {
    warnings.push({
      code: "empty_items",
      message: "visualSequence.items is empty.",
    });
    return {
      sequence: undefined,
      warnings: Object.freeze(warnings),
      terminalCode: null,
      sceneDurationMs,
    };
  }

  if (sceneDurationMs <= 0) {
    return {
      sequence: undefined,
      warnings: Object.freeze([
        ...warnings,
        {
          code: "invalid_timing",
          message: "Narration scene duration must be greater than zero.",
        },
      ]),
      terminalCode: "SCENE_DURATION_INVALID",
      sceneDurationMs,
    };
  }

  type Draft = {
    id: string;
    media: SceneMedia;
    startOffsetMs: number;
    durationMs: number;
    index: number;
  };
  const drafts: Draft[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < record.items.length; index += 1) {
    const raw = record.items[index];
    if (!raw || typeof raw !== "object") {
      warnings.push({
        code: "invalid_media",
        message: "Visual sequence item is not an object.",
        itemIndex: index,
      });
      continue;
    }
    const item = raw as Record<string, unknown>;
    const id = normalizeId(item.id);
    if (!id) {
      warnings.push({
        code: "empty_item_id",
        message: "Visual sequence item id is missing or empty.",
        itemIndex: index,
      });
      continue;
    }
    if (seenIds.has(id)) {
      warnings.push({
        code: "duplicate_item_id",
        message: "Duplicate visual sequence item id within the scene.",
        itemId: id,
        itemIndex: index,
      });
      continue;
    }
    const media = normalizeSceneMedia(item.media);
    if (!media) {
      warnings.push({
        code: "invalid_media",
        message: "Visual sequence item media is missing or invalid.",
        itemId: id,
        itemIndex: index,
      });
      continue;
    }
    if (!supportsSequenceMedia(media)) {
      warnings.push({
        code: "unsupported_media_type",
        message: "Visual sequence items must be image or video.",
        itemId: id,
        itemIndex: index,
      });
      continue;
    }

    let startOffsetMs = isFiniteNonNegInt(item.startOffsetMs)
      ? Math.round(item.startOffsetMs)
      : 0;
    let durationMs = isFiniteNonNegInt(item.durationMs)
      ? Math.round(item.durationMs)
      : SCENE_MEDIA_MIN_ITEM_DURATION_MS;

    if (
      !isFiniteNonNegInt(item.startOffsetMs) ||
      !isFiniteNonNegInt(item.durationMs) ||
      (typeof item.durationMs === "number" && item.durationMs <= 0)
    ) {
      warnings.push({
        code: "invalid_timing",
        message: "Item timing was repaired to valid non-negative integers.",
        itemId: id,
        itemIndex: index,
      });
      if (!(durationMs > 0)) {
        durationMs = SCENE_MEDIA_MIN_ITEM_DURATION_MS;
      }
    }

    if (startOffsetMs >= sceneDurationMs) {
      warnings.push({
        code: "item_extended_beyond_scene",
        message: "Item started at or beyond narration end and was clamped.",
        itemId: id,
        itemIndex: index,
      });
      startOffsetMs = Math.max(0, sceneDurationMs - SCENE_MEDIA_MIN_ITEM_DURATION_MS);
      durationMs = Math.min(durationMs, sceneDurationMs - startOffsetMs);
    }

    if (startOffsetMs + durationMs > sceneDurationMs) {
      warnings.push({
        code: "timing_clamped_to_scene",
        message: "Item duration was clamped to the narration scene end.",
        itemId: id,
        itemIndex: index,
      });
      durationMs = Math.max(0, sceneDurationMs - startOffsetMs);
    }

    if (durationMs < SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
      const room = sceneDurationMs - startOffsetMs;
      if (room >= SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
        durationMs = SCENE_MEDIA_MIN_ITEM_DURATION_MS;
        warnings.push({
          code: "invalid_timing",
          message: `Item duration raised to the ${SCENE_MEDIA_MIN_ITEM_DURATION_MS}ms minimum.`,
          itemId: id,
          itemIndex: index,
        });
      }
    }

    if (durationMs <= 0) {
      warnings.push({
        code: "invalid_timing",
        message: "Item had no remaining duration inside the narration scene.",
        itemId: id,
        itemIndex: index,
      });
      continue;
    }

    seenIds.add(id);
    drafts.push({ id, media, startOffsetMs, durationMs, index });
  }

  if (drafts.length === 0) {
    warnings.push({
      code: "no_usable_items",
      message: "Visual sequence contained no usable items after normalization.",
    });
    return {
      sequence: undefined,
      warnings: Object.freeze(warnings),
      terminalCode: "NO_USABLE_VISUAL_ITEMS",
      sceneDurationMs,
    };
  }

  drafts.sort((a, b) => {
    if (a.startOffsetMs !== b.startOffsetMs) {
      return a.startOffsetMs - b.startOffsetMs;
    }
    return a.index - b.index;
  });

  // Contiguous sequential fill inside narration duration (authoritative span).
  const normalizedItems: SceneVisualSequenceItem[] = [];
  let cursor = 0;
  for (let i = 0; i < drafts.length; i += 1) {
    const draft = drafts[i]!;
    const remainingSlots = drafts.length - i;
    const maxStart = Math.max(
      0,
      sceneDurationMs - remainingSlots * SCENE_MEDIA_MIN_ITEM_DURATION_MS,
    );

    let start = draft.startOffsetMs;
    if (start < cursor) {
      warnings.push({
        code: "timing_overlap_resolved",
        message: "Overlapping item start was moved to follow the previous item.",
        itemId: draft.id,
        itemIndex: draft.index,
      });
      start = cursor;
    } else if (start > cursor) {
      warnings.push({
        code: "timing_gap_closed",
        message: "Gap before item was closed so visuals stay sequential.",
        itemId: draft.id,
        itemIndex: draft.index,
      });
      start = cursor;
    }

    start = Math.min(start, maxStart);
    let duration = draft.durationMs;
    const remainingAfterStart = sceneDurationMs - start;
    const reservedForFollowing = (remainingSlots - 1) * SCENE_MEDIA_MIN_ITEM_DURATION_MS;
    const maxDuration = Math.max(
      SCENE_MEDIA_MIN_ITEM_DURATION_MS,
      remainingAfterStart - reservedForFollowing,
    );
    if (duration > maxDuration) {
      warnings.push({
        code: "timing_clamped_to_scene",
        message: "Item duration was reduced to leave room for following items.",
        itemId: draft.id,
        itemIndex: draft.index,
      });
      duration = maxDuration;
    }
    if (duration < SCENE_MEDIA_MIN_ITEM_DURATION_MS) {
      duration = Math.min(SCENE_MEDIA_MIN_ITEM_DURATION_MS, remainingAfterStart);
    }
    if (duration <= 0) {
      warnings.push({
        code: "item_extended_beyond_scene",
        message: "Item could not fit inside the narration scene duration.",
        itemId: draft.id,
        itemIndex: draft.index,
      });
      continue;
    }

    normalizedItems.push({
      id: draft.id,
      media: draft.media,
      startOffsetMs: start,
      durationMs: duration,
    });
    cursor = start + duration;
  }

  if (normalizedItems.length === 0) {
    warnings.push({
      code: "no_usable_items",
      message: "Visual sequence could not form a coherent sequential plan.",
    });
    return {
      sequence: undefined,
      warnings: Object.freeze(warnings),
      terminalCode: "NO_USABLE_VISUAL_ITEMS",
      sceneDurationMs,
    };
  }

  // Stretch/trim the last item so the sequence occupies the narration duration.
  const last = normalizedItems[normalizedItems.length - 1]!;
  const occupied = last.startOffsetMs + last.durationMs;
  if (occupied !== sceneDurationMs) {
    const nextDuration = Math.max(
      SCENE_MEDIA_MIN_ITEM_DURATION_MS,
      sceneDurationMs - last.startOffsetMs,
    );
    if (nextDuration !== last.durationMs) {
      warnings.push({
        code: "timing_gap_closed",
        message: "Final item duration was adjusted to match narration scene length.",
        itemId: last.id,
      });
      normalizedItems[normalizedItems.length - 1] = {
        ...last,
        durationMs: nextDuration,
      };
    }
  }

  return {
    sequence: {
      version: 1,
      items: normalizedItems,
    },
    warnings: Object.freeze(warnings),
    terminalCode: null,
    sceneDurationMs,
  };
}

export function cloneVisualSequence(sequence: SceneVisualSequence): SceneVisualSequence {
  return {
    version: 1,
    items: sequence.items.map((item) => ({
      id: item.id,
      startOffsetMs: item.startOffsetMs,
      durationMs: item.durationMs,
      media: normalizeSceneMedia(item.media) ?? item.media,
    })),
  };
}
