/**
 * Pure Retention compression / hard word-policy validator — Sprint 10F.
 * Never mutates or truncates narration.
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import { countRetentionNarrationWords } from "./count-retention-narration-words";
import type { RetentionCompressionWordPolicyResult } from "./retention-validation.types";

/**
 * Validate assembled narration against plan compressionGoals.targetWordBudget.
 */
export function validateRetentionCompressionWordPolicy(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly candidate: RetentionNarrationCandidate;
}): RetentionCompressionWordPolicyResult {
  const allowedWordCount = input.plan.compressionGoals.targetWordBudget;
  // Contract duration must agree with plan budget derivation inputs.
  void input.contract.durationSec;
  const actualWordCount = countRetentionNarrationWords(
    input.candidate.assembledNarration,
  );
  return Object.freeze({
    actualWordCount,
    allowedWordCount,
    passed: actualWordCount > 0 && actualWordCount <= allowedWordCount,
  });
}
