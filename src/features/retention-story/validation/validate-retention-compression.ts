/**
 * Pure Retention compression / hard word-policy validator — Sprint 10F.
 * Never mutates or truncates narration.
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { RETENTION_WORDS_PER_SECOND } from "../planning/retention-story-plan.constants";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import { evaluateRetentionDurationFit } from "../composition/evaluate-retention-duration-fit";
import { countRetentionNarrationWords } from "./count-retention-narration-words";
import type { RetentionCompressionWordPolicyResult } from "./retention-validation.types";

/**
 * Validate assembled narration against the spoken-duration target.
 * A small miss is acceptable; the hard budget remains the composition target.
 */
export function validateRetentionCompressionWordPolicy(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly candidate: RetentionNarrationCandidate;
}): RetentionCompressionWordPolicyResult {
  // The plan target is an editorial aim, not a terminal hard ceiling. Using
  // it as both values recreated the old ~68% duration cap and rejected
  // complete grounded narration that still fit the selected duration.
  const allowedWordCount = Math.round(
    input.contract.durationSec * RETENTION_WORDS_PER_SECOND,
  );
  const actualWordCount = countRetentionNarrationWords(
    input.candidate.assembledNarration,
  );
  const fit = evaluateRetentionDurationFit({
    narration: input.candidate.assembledNarration,
    hardWordBudget: allowedWordCount,
    targetWordBudget: input.plan.compressionGoals.targetWordBudget,
    minimumUsefulWords: Math.max(12, Math.floor(allowedWordCount * 0.66)),
    durationSec: input.contract.durationSec,
    preserveCompleteRanking:
      /\b(?:number one|no\.?\s*1|stands last|decisive name|#1)\b/iu.test(
        input.candidate.assembledNarration,
      ),
  });
  return Object.freeze({
    actualWordCount,
    allowedWordCount,
    passed: fit.acceptable,
  });
}
