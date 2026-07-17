/**
 * Deterministic scene-local media window resolution.
 * Occupies the existing scene duration; never changes scene timing.
 * Overflow-safe for very large finite weights.
 */

import type { SceneMedia, SceneMediaTimelineItem } from "@/features/story/types";

export type ResolvedMediaWindowProvenance =
  | "stored_timeline"
  | "legacy_virtual"
  | "empty_fallback";

export interface ResolvedSceneMediaWindow {
  itemId: string;
  itemIndex: number;
  media: SceneMedia;
  /** Scene-local inclusive start (ms). */
  startMs: number;
  /** Scene-local exclusive end (ms), except final resolution at scene end. */
  endMs: number;
  /** Resolved window duration in ms (endMs - startMs). */
  durationMs: number;
  durationWeight: number;
  provenance: ResolvedMediaWindowProvenance;
}

export interface ActiveSceneMediaResolution {
  windows: ResolvedSceneMediaWindow[];
  active: ResolvedSceneMediaWindow | null;
  /** Elapsed time within the active item window (not scene-global). */
  itemElapsedMs: number;
  sceneDurationMs: number;
  sceneElapsedMs: number;
  provenance: ResolvedMediaWindowProvenance | "none";
}

export interface ResolveSceneMediaWindowsInput {
  items: ReadonlyArray<Pick<SceneMediaTimelineItem, "id" | "media" | "durationWeight">>;
  sceneDurationMs: number;
  provenance?: ResolvedMediaWindowProvenance;
}

/** Max safe integer scene duration (ms) — clamps absurd inputs without changing normal projects. */
const MAX_SAFE_SCENE_DURATION_MS = Number.MAX_SAFE_INTEGER;

/**
 * Normalizes scene duration to a non-negative safe integer.
 * Non-finite / negative → 0. Values above MAX_SAFE_INTEGER clamp down.
 */
export function normalizeSceneDurationMsForWindows(sceneDurationMs: number): number {
  if (typeof sceneDurationMs !== "number" || !Number.isFinite(sceneDurationMs)) {
    return 0;
  }
  if (sceneDurationMs <= 0) {
    return 0;
  }
  const rounded = Math.round(sceneDurationMs);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    return 0;
  }
  return Math.min(rounded, MAX_SAFE_SCENE_DURATION_MS);
}

/**
 * Overflow-safe proportional shares.
 * Divides each finite positive weight by the max weight before summing so the
 * total stays finite even when raw weights are near Number.MAX_VALUE.
 */
function allocateProportionalDurations(
  weights: readonly number[],
  sceneDurationMs: number,
): number[] {
  const count = weights.length;
  if (count === 0) {
    return [];
  }
  if (sceneDurationMs === 0) {
    return weights.map(() => 0);
  }

  let maxWeight = 0;
  for (const weight of weights) {
    if (weight > maxWeight) {
      maxWeight = weight;
    }
  }
  if (!(maxWeight > 0) || !Number.isFinite(maxWeight)) {
    // Equal fallback — should not happen when callers filter positive finite weights.
    const base = Math.floor(sceneDurationMs / count);
    const durations = weights.map(() => base);
    let allocated = base * count;
    let index = 0;
    while (allocated < sceneDurationMs) {
      durations[index % count]! += 1;
      allocated += 1;
      index += 1;
    }
    return durations;
  }

  const normalized = weights.map((weight) => weight / maxWeight);
  let totalNormalized = 0;
  for (const value of normalized) {
    totalNormalized += value;
  }
  if (!(totalNormalized > 0) || !Number.isFinite(totalNormalized)) {
    const base = Math.floor(sceneDurationMs / count);
    const durations = weights.map(() => base);
    durations[count - 1] = sceneDurationMs - base * (count - 1);
    return durations;
  }

  const durations: number[] = [];
  let allocated = 0;
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    let durationMs: number;
    if (isLast) {
      durationMs = Math.max(0, sceneDurationMs - allocated);
    } else {
      const raw = (sceneDurationMs * normalized[index]!) / totalNormalized;
      durationMs = Math.floor(raw);
      if (durationMs <= 0 && sceneDurationMs - allocated > count - index) {
        durationMs = 1;
      }
      durationMs = Math.min(durationMs, Math.max(0, sceneDurationMs - allocated));
    }
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      durationMs = 0;
    }
    durationMs = Math.floor(durationMs);
    durations.push(durationMs);
    allocated += durationMs;
  }

  // Guarantee last ends exactly at scene duration with finite integers.
  const drift = sceneDurationMs - allocated;
  if (drift !== 0 && durations.length > 0) {
    const lastIndex = durations.length - 1;
    durations[lastIndex] = Math.max(0, (durations[lastIndex] ?? 0) + drift);
  }

  return durations;
}

/**
 * Allocates contiguous [startMs, endMs) windows proportional to durationWeight.
 * Last window ends exactly at sceneDurationMs. Deterministic for odd durations.
 * Never produces NaN/Infinity window metrics from finite positive weights.
 */
export function resolveSceneMediaWindows(
  input: ResolveSceneMediaWindowsInput,
): ResolvedSceneMediaWindow[] {
  const provenance = input.provenance ?? "stored_timeline";
  const sceneDurationMs = normalizeSceneDurationMsForWindows(input.sceneDurationMs);

  const usable = input.items.filter(
    (item) =>
      typeof item.id === "string" &&
      item.id.trim().length > 0 &&
      item.media != null &&
      typeof item.durationWeight === "number" &&
      Number.isFinite(item.durationWeight) &&
      item.durationWeight > 0,
  );

  if (usable.length === 0) {
    return [];
  }

  const weights = usable.map((item) => item.durationWeight);
  const durations = allocateProportionalDurations(weights, sceneDurationMs);
  const windows: ResolvedSceneMediaWindow[] = [];
  let cursorMs = 0;

  for (let index = 0; index < usable.length; index += 1) {
    const item = usable[index]!;
    const durationMs = durations[index] ?? 0;
    const startMs = cursorMs;
    const endMs = startMs + durationMs;
    cursorMs = endMs;

    windows.push({
      itemId: item.id.trim(),
      itemIndex: index,
      media: item.media,
      startMs,
      endMs,
      durationMs,
      durationWeight: item.durationWeight,
      provenance,
    });
  }

  const last = windows[windows.length - 1];
  if (last && last.endMs !== sceneDurationMs) {
    last.endMs = sceneDurationMs;
    last.durationMs = Math.max(0, last.endMs - last.startMs);
  }

  for (const window of windows) {
    if (
      !Number.isFinite(window.startMs) ||
      !Number.isFinite(window.endMs) ||
      !Number.isFinite(window.durationMs) ||
      window.startMs < 0 ||
      window.endMs < 0 ||
      window.durationMs < 0
    ) {
      throw new Error("resolveSceneMediaWindows produced a non-finite window");
    }
  }

  return windows;
}

/**
 * Resolves the active media item for a scene-local elapsed time.
 * Boundary semantics: [startMs, endMs) — at an internal boundary the following item wins.
 * Negative elapsed clamps to the first frame; at/beyond scene end → final item/final frame.
 */
export function resolveActiveSceneMediaAtElapsed(
  input: ResolveSceneMediaWindowsInput & { sceneElapsedMs: number },
): ActiveSceneMediaResolution {
  const windows = resolveSceneMediaWindows(input);
  const sceneDurationMs = normalizeSceneDurationMsForWindows(input.sceneDurationMs);
  const rawElapsed =
    typeof input.sceneElapsedMs === "number" && Number.isFinite(input.sceneElapsedMs)
      ? input.sceneElapsedMs
      : 0;

  if (windows.length === 0) {
    return {
      windows,
      active: null,
      itemElapsedMs: 0,
      sceneDurationMs,
      sceneElapsedMs: rawElapsed,
      provenance: "none",
    };
  }

  if (rawElapsed < 0) {
    const first = windows[0]!;
    return {
      windows,
      active: first,
      itemElapsedMs: 0,
      sceneDurationMs,
      sceneElapsedMs: rawElapsed,
      provenance: first.provenance,
    };
  }

  if (rawElapsed >= sceneDurationMs) {
    const last = windows[windows.length - 1]!;
    return {
      windows,
      active: last,
      itemElapsedMs: last.durationMs,
      sceneDurationMs,
      sceneElapsedMs: rawElapsed,
      provenance: last.provenance,
    };
  }

  for (const window of windows) {
    if (rawElapsed >= window.startMs && rawElapsed < window.endMs) {
      return {
        windows,
        active: window,
        itemElapsedMs: rawElapsed - window.startMs,
        sceneDurationMs,
        sceneElapsedMs: rawElapsed,
        provenance: window.provenance,
      };
    }
  }

  const following =
    windows.find((window) => rawElapsed < window.endMs) ?? windows[windows.length - 1]!;
  return {
    windows,
    active: following,
    itemElapsedMs: Math.max(0, Math.min(following.durationMs, rawElapsed - following.startMs)),
    sceneDurationMs,
    sceneElapsedMs: rawElapsed,
    provenance: following.provenance,
  };
}
