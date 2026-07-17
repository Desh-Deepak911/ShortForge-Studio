/**
 * Deterministic Retention compression goals — Sprint 10D.
 *
 * Uses the Retention-owned words-per-second constant (2.4). Must NOT import the
 * shared narration duration budget utils. preservePayoff mirrors contract requirePayoff.
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import {
  RETENTION_MAX_DEAD_AIR_SEC,
  RETENTION_WORDS_PER_SECOND,
} from "./retention-story-plan.constants";
import type { RetentionCompressionGoals } from "./retention-story-plan.types";

export function buildRetentionCompressionGoals(
  contract: NormalizedStoryContract,
): RetentionCompressionGoals {
  const targetWordBudget = Math.round(
    contract.durationSec * RETENTION_WORDS_PER_SECOND,
  );
  const maxDeadAirSec =
    RETENTION_MAX_DEAD_AIR_SEC[contract.formatStrategyId] ?? 1.0;

  return Object.freeze({
    targetWordBudget,
    preserveControllingIdea: true as const,
    preservePayoff: contract.constraints.requirePayoff,
    maxDeadAirSec,
  });
}
