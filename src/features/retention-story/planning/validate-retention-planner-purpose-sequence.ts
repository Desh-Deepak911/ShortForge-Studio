/**
 * Validate planner-proposed RetentionBeat purpose sequences — Sprint 10D.1.
 * Accept complete valid structures; never silently substitute the deterministic sequence.
 */

import type {
  EndingStrategy,
  NormalizedStoryContract,
} from "../domain/retention-story-contract.types";
import { mapEndingStrategyToTerminalPurpose } from "./retention-beat-strategy.registry";
import type { RetentionBeatPurpose } from "./retention-story-plan.types";

const VALID_PURPOSES: ReadonlySet<RetentionBeatPurpose> = new Set([
  "hook_handoff",
  "curiosity",
  "reframe",
  "proof",
  "escalation",
  "conflict",
  "twist",
  "reveal",
  "payoff",
  "challenge",
  "resolution",
]);

const PROGRESSION_PURPOSES: ReadonlySet<RetentionBeatPurpose> = new Set([
  "curiosity",
  "reframe",
  "escalation",
]);

export function isRetentionBeatPurpose(
  value: unknown,
): value is RetentionBeatPurpose {
  return typeof value === "string" && VALID_PURPOSES.has(value as RetentionBeatPurpose);
}

/**
 * True when the ordered purposes form a complete, Retention-valid planner structure.
 */
export function isValidRetentionPlannerPurposeSequence(
  purposes: readonly RetentionBeatPurpose[],
  endingStrategy: EndingStrategy,
  range: { readonly min: number; readonly max: number },
): boolean {
  if (purposes.length < range.min || purposes.length > range.max) return false;
  if (purposes.length < 2) return false;
  if (purposes[0] !== "hook_handoff") return false;
  if (purposes.slice(1).some((p) => p === "hook_handoff")) return false;

  const terminal = mapEndingStrategyToTerminalPurpose(endingStrategy);
  if (purposes[purposes.length - 1] !== terminal) return false;

  for (const purpose of purposes) {
    if (!VALID_PURPOSES.has(purpose)) return false;
  }

  const middle = purposes.slice(1, -1);
  if (middle.length === 0) return false;
  if (!middle.some((p) => PROGRESSION_PURPOSES.has(p))) return false;

  // Avoid immediate duplicate runs of the same middle purpose longer than 2.
  let run = 1;
  for (let i = 1; i < middle.length; i++) {
    if (middle[i] === middle[i - 1]) {
      run += 1;
      if (run > 2) return false;
    } else {
      run = 1;
    }
  }

  return true;
}

export function assertValidRetentionPlannerPurposeSequence(
  purposes: readonly RetentionBeatPurpose[],
  contract: NormalizedStoryContract,
  range: { readonly min: number; readonly max: number },
): boolean {
  return isValidRetentionPlannerPurposeSequence(
    purposes,
    contract.endingStrategy,
    range,
  );
}
