/**
 * Total, non-throwing normalization for SceneMediaTransitionTrack.
 * Malformed / stale / unsupported records resolve to Cut (dropped).
 * Unknown effects are never remapped to Fade.
 */

import type {
  FootieScene,
  SceneMediaTransitionBoundary,
  SceneMediaTransitionTrack,
  TransitionEffect,
} from "@/features/story/types";
import { projectSceneMediaTimeline } from "@/features/scene-media-timeline";

import {
  type IntraSceneTransitionDiagnostic,
} from "./constants";
import { cloneSceneMediaTransitionTrack } from "./clone-track";
import {
  isSupportedIntraSceneTransitionDuration,
  isSupportedIntraSceneTransitionEffect,
  pairKey,
} from "./effect-support";

export interface NormalizeSceneMediaTransitionTrackResult {
  readonly track: SceneMediaTransitionTrack | undefined;
  readonly diagnostics: readonly IntraSceneTransitionDiagnostic[];
}

function adjacentOrderedPairs(
  itemIds: readonly string[],
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (let i = 0; i < itemIds.length - 1; i += 1) {
    keys.add(pairKey(itemIds[i]!, itemIds[i + 1]!));
  }
  return keys;
}

/**
 * Read-path salvage: keep independent valid non-Cut boundaries; drop the rest.
 * Empty/single-item scenes → no track. Never invents Cut records.
 */
export function normalizeSceneMediaTransitionTrack(
  raw: unknown,
  itemIds: readonly string[],
): NormalizeSceneMediaTransitionTrackResult {
  const diagnostics: IntraSceneTransitionDiagnostic[] = [];

  if (itemIds.length < 2) {
    if (raw != null) {
      diagnostics.push({
        code: "invalid_track_shape",
        message: "Intra-scene transitions require at least two media items.",
      });
    }
    return { track: undefined, diagnostics };
  }

  if (raw == null) {
    return { track: undefined, diagnostics };
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    diagnostics.push({
      code: "invalid_track_shape",
      message: "mediaTransitions must be an object when present.",
    });
    return { track: undefined, diagnostics };
  }

  const candidate = raw as { version?: unknown; boundaries?: unknown };
  if (candidate.version !== 1) {
    diagnostics.push({
      code: "unsupported_version",
      message: "mediaTransitions.version must be exactly 1.",
    });
    return { track: undefined, diagnostics };
  }

  if (!Array.isArray(candidate.boundaries)) {
    diagnostics.push({
      code: "invalid_boundaries_array",
      message: "mediaTransitions.boundaries must be an array.",
    });
    return { track: undefined, diagnostics };
  }

  const idSet = new Set(itemIds);
  const adjacent = adjacentOrderedPairs(itemIds);
  const seen = new Set<string>();
  /** First-wins valid boundaries keyed by collision-safe pair identity. */
  const byPair = new Map<string, SceneMediaTransitionBoundary>();

  for (let index = 0; index < candidate.boundaries.length; index += 1) {
    const entry = candidate.boundaries[index];
    if (typeof entry !== "object" || entry == null || Array.isArray(entry)) {
      diagnostics.push({
        code: "invalid_track_shape",
        message: "Boundary entry is not an object.",
        boundaryIndex: index,
      });
      continue;
    }

    const fromItemId =
      typeof (entry as { fromItemId?: unknown }).fromItemId === "string"
        ? (entry as { fromItemId: string }).fromItemId.trim()
        : "";
    const toItemId =
      typeof (entry as { toItemId?: unknown }).toItemId === "string"
        ? (entry as { toItemId: string }).toItemId.trim()
        : "";
    const effect = (entry as { effect?: unknown }).effect;
    const durationMs = (entry as { durationMs?: unknown }).durationMs;

    if (!fromItemId || !toItemId) {
      diagnostics.push({
        code: "empty_item_id",
        message: "Boundary item ids must be non-empty.",
        boundaryIndex: index,
      });
      continue;
    }

    if (fromItemId === toItemId) {
      diagnostics.push({
        code: "same_from_to",
        message: "Boundary from and to ids must differ.",
        fromItemId,
        toItemId,
        boundaryIndex: index,
      });
      continue;
    }

    if (!idSet.has(fromItemId) || !idSet.has(toItemId)) {
      diagnostics.push({
        code: "unknown_item_id",
        message: "Boundary references a media item that is not on the scene timeline.",
        fromItemId,
        toItemId,
        boundaryIndex: index,
      });
      continue;
    }

    const key = pairKey(fromItemId, toItemId);
    if (!adjacent.has(key)) {
      const reversed = adjacent.has(pairKey(toItemId, fromItemId));
      diagnostics.push({
        code: reversed ? "reversed_or_unordered_pair" : "non_adjacent_pair",
        message: reversed
          ? "Boundary pair is reversed relative to media order."
          : "Boundary pair is not currently adjacent.",
        fromItemId,
        toItemId,
        boundaryIndex: index,
      });
      continue;
    }

    if (effect === "cut") {
      diagnostics.push({
        code: "cut_not_persisted",
        message: "Cut boundaries are not persisted.",
        fromItemId,
        toItemId,
        boundaryIndex: index,
      });
      continue;
    }

    if (!isSupportedIntraSceneTransitionEffect(effect)) {
      diagnostics.push({
        code: "unsupported_effect",
        message: "Unsupported intra-scene transition effect was dropped (not remapped).",
        fromItemId,
        toItemId,
        boundaryIndex: index,
      });
      continue;
    }

    if (!isSupportedIntraSceneTransitionDuration(durationMs)) {
      diagnostics.push({
        code: "unsupported_duration",
        message: "Unsupported transition duration was dropped.",
        fromItemId,
        toItemId,
        boundaryIndex: index,
      });
      continue;
    }

    if (seen.has(key)) {
      diagnostics.push({
        code: "duplicate_pair",
        message: "Duplicate adjacent pair was dropped.",
        fromItemId,
        toItemId,
        boundaryIndex: index,
      });
      continue;
    }

    seen.add(key);
    byPair.set(key, {
      fromItemId,
      toItemId,
      effect: effect as TransitionEffect,
      durationMs,
    });
  }

  // Canonical persistence: media-timeline adjacency order (not input array order).
  const boundaries: SceneMediaTransitionBoundary[] = [];
  for (let i = 0; i < itemIds.length - 1; i += 1) {
    const key = pairKey(itemIds[i]!, itemIds[i + 1]!);
    const boundary = byPair.get(key);
    if (boundary) {
      boundaries.push(boundary);
    }
  }

  if (boundaries.length === 0) {
    return { track: undefined, diagnostics };
  }

  return {
    track: { version: 1, boundaries },
    diagnostics,
  };
}

/** Applies read normalization onto a scene using its projected media timeline item ids. */
export function applyNormalizedSceneMediaTransitionsToScene(
  scene: FootieScene,
): FootieScene {
  const projected = projectSceneMediaTimeline(scene);
  const itemIds = projected.items.map((item) => item.id);
  const { track } = normalizeSceneMediaTransitionTrack(scene.mediaTransitions, itemIds);

  if (!track) {
    if (scene.mediaTransitions == null) {
      return scene;
    }
    const { mediaTransitions: _dropped, ...rest } = scene;
    void _dropped;
    return rest;
  }

  return {
    ...scene,
    mediaTransitions: cloneSceneMediaTransitionTrack(track),
  };
}

/** Resolved effect for an adjacent pair — Cut when absent/invalid. */
export function resolveStoredBoundaryEffect(
  scene: FootieScene,
  fromItemId: string,
  toItemId: string,
): { effect: TransitionEffect; durationMs: number | null } {
  const projected = projectSceneMediaTimeline(scene);
  const itemIds = projected.items.map((item) => item.id);
  const { track } = normalizeSceneMediaTransitionTrack(scene.mediaTransitions, itemIds);
  const match = track?.boundaries.find(
    (b) => b.fromItemId === fromItemId && b.toItemId === toItemId,
  );
  if (!match) {
    return { effect: "cut", durationMs: null };
  }
  return { effect: match.effect, durationMs: match.durationMs };
}
