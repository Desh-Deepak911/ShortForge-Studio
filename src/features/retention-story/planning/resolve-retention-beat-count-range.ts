/**
 * Resolve the beat-count range and target from the immutable density registry — Sprint 10D.
 * long_form_* strategies are absent from the registry → rejected.
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import {
  RETENTION_BEAT_DENSITY_PROFILES,
  type RetentionBeatDensityProfile,
} from "./retention-story-plan.constants";

export interface RetentionBeatCountResolution {
  readonly min: number;
  readonly max: number;
  readonly target: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getRetentionBeatDensityProfile(
  contract: NormalizedStoryContract,
): RetentionBeatDensityProfile {
  const profile = RETENTION_BEAT_DENSITY_PROFILES[contract.formatStrategyId];
  if (!profile) {
    throw new RetentionStoryError(
      "long_form_not_supported",
      "Beat density is not defined for this format strategy.",
    );
  }
  return profile;
}

/**
 * Resolve {min, max, target} beat counts.
 *   minCount = clamp(ceil(duration / maxBeatDur), [safeMin, safeMax])
 *   maxCount = clamp(floor(duration / minBeatDur), [safeMin, safeMax])
 *   if inverted after clamping, collapse to a single valid count
 *   target   = clamp(round(duration / targetBeatDur), [min, max])
 */
export function resolveRetentionBeatCountRange(
  contract: NormalizedStoryContract,
): RetentionBeatCountResolution {
  const profile = getRetentionBeatDensityProfile(contract);
  const durationSec = contract.durationSec;

  const min = clamp(
    Math.ceil(durationSec / profile.maxBeatDurationSec),
    profile.safeMinBeats,
    profile.safeMaxBeats,
  );
  let max = clamp(
    Math.floor(durationSec / profile.minBeatDurationSec),
    profile.safeMinBeats,
    profile.safeMaxBeats,
  );

  if (min > max) {
    // Collapse inverted ranges to a single valid count.
    max = min;
  }

  const target = clamp(
    Math.round(durationSec / profile.targetBeatDurationSec),
    min,
    max,
  );

  return Object.freeze({ min, max, target });
}
