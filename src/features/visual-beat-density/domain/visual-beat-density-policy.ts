/**
 * Named density policy constants for narration-driven visual-beat planning.
 * Densities describe visual change pacing — not export/render speed.
 */

import { SCENE_MEDIA_MIN_ITEM_DURATION_MS } from "@/features/scene-media-timeline/editor/scene-media-timeline.constants";

import type { VisualBeatDensity } from "./visual-beat-plan";

/** Preferred average dwell used to compute preferred beat count. */
export const VISUAL_BEAT_DENSITY_PREFERRED_DWELL_MS = {
  fast: 1400,
  balanced: 2200,
  studio: 3400,
} as const satisfies Record<VisualBeatDensity, number>;

/**
 * Soft ceiling on preferred dwell when deriving placement tolerance.
 * Keeps Fast energetic and Studio from collapsing into micro-cuts.
 */
export const VISUAL_BEAT_DENSITY_MAX_PREFERRED_DWELL_MS = {
  fast: 1800,
  balanced: 2800,
  studio: 4000,
} as const satisfies Record<VisualBeatDensity, number>;

/**
 * Soft floor on effective dwell for placement bias.
 * Studio protects against micro-cuts more strongly than Fast/Balanced.
 */
export const VISUAL_BEAT_DENSITY_MIN_EFFECTIVE_DWELL_MS = {
  fast: SCENE_MEDIA_MIN_ITEM_DURATION_MS,
  balanced: SCENE_MEDIA_MIN_ITEM_DURATION_MS,
  studio: 800,
} as const satisfies Record<VisualBeatDensity, number>;

/** Max distance from equal-split start, as a fraction of preferred dwell, for anchor snap. */
export const VISUAL_BEAT_DENSITY_ANCHOR_SNAP_RATIO = {
  fast: 0,
  balanced: 0.1,
  studio: 0.2,
} as const satisfies Record<VisualBeatDensity, number>;

export interface VisualBeatDensityPolicy {
  readonly density: VisualBeatDensity;
  readonly preferredDwellMs: number;
  readonly maxPreferredDwellMs: number;
  readonly minEffectiveDwellMs: number;
  readonly anchorSnapRatio: number;
}

export function resolveVisualBeatDensityPolicy(
  density: VisualBeatDensity,
): VisualBeatDensityPolicy {
  return {
    density,
    preferredDwellMs: VISUAL_BEAT_DENSITY_PREFERRED_DWELL_MS[density],
    maxPreferredDwellMs: VISUAL_BEAT_DENSITY_MAX_PREFERRED_DWELL_MS[density],
    minEffectiveDwellMs: VISUAL_BEAT_DENSITY_MIN_EFFECTIVE_DWELL_MS[density],
    anchorSnapRatio: VISUAL_BEAT_DENSITY_ANCHOR_SNAP_RATIO[density],
  };
}

/**
 * Preferred beat count from narration duration and density dwell.
 * Independent of media inventory — inventory warnings compare against this target.
 */
export function computePreferredBeatCount(
  sceneDurationMs: number,
  density: VisualBeatDensity,
): number {
  const policy = resolveVisualBeatDensityPolicy(density);
  if (!(sceneDurationMs > 0) || !Number.isFinite(sceneDurationMs)) {
    return 1;
  }
  const raw = Math.round(sceneDurationMs / policy.preferredDwellMs);
  return Math.max(1, raw);
}
