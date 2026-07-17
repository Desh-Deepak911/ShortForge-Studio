/**
 * Adaptive executable beat count — Sprint 10H.3.
 * Derives a compact, duration-compatible beat count from word budget and
 * complete-utterance reserves (Hook / escalation / setup / payoff).
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import { RETENTION_WORDS_PER_SECOND } from "./retention-story-plan.constants";
import { resolveRetentionBeatCountRange } from "./resolve-retention-beat-count-range";

/** Minimum useful words for one complete spoken utterance. */
const MIN_UTTERANCE_WORDS = 5;
/** Reserved slots that must remain after compaction. */
const REQUIRED_STRUCTURE_BEATS = 4; // hook-ish open + escalation + setup + payoff

export interface AdaptiveRetentionBeatCount {
  readonly min: number;
  readonly max: number;
  readonly target: number;
  readonly compacted: boolean;
  readonly wordBudget: number;
}

/**
 * Resolve executable beat count. For 25–35s stories, prefer 5–7 beats unless
 * the word budget safely supports more complete utterances.
 */
export function resolveAdaptiveRetentionBeatCount(
  contract: NormalizedStoryContract,
): AdaptiveRetentionBeatCount {
  const base = resolveRetentionBeatCountRange(contract);
  const wordBudget = Math.max(
    1,
    Math.round(contract.durationSec * RETENTION_WORDS_PER_SECOND),
  );
  const maxByWords = Math.max(
    REQUIRED_STRUCTURE_BEATS,
    Math.floor(wordBudget / MIN_UTTERANCE_WORDS),
  );

  let min = base.min;
  let max = Math.min(base.max, maxByWords);
  let target = base.target;
  let compacted = false;

  if (contract.durationSec <= 35) {
    const shortMax = Math.min(7, maxByWords);
    const shortMin = Math.min(5, shortMax);
    if (max > shortMax || target > shortMax) {
      compacted = true;
    }
    max = Math.min(max, shortMax);
    min = Math.min(Math.max(min, shortMin), max);
    target = Math.min(Math.max(target, min), max);
    // Prefer mid of 5–7 when abstract planner would push higher.
    if (!compacted && target > 7) {
      target = Math.min(6, max);
      compacted = true;
    }
    if (base.target > max) {
      target = max;
      compacted = true;
    }
  } else {
    max = Math.min(max, maxByWords);
    if (min > max) min = max;
    target = Math.min(Math.max(target, min), max);
    if (target < base.target) compacted = true;
  }

  return Object.freeze({ min, max, target, compacted, wordBudget });
}
