/**
 * Path-global length enforcement after Studio body rewrite — Sprint 10F.2 / 10F.2A / 10H.2B.
 * Final enforced limit is plan.compressionGoals.targetWordBudget.
 * One optional length_compression consume; never retry; then sentence-safe deterministic.
 */

import { RetentionStoryError, isRetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import { buildRetentionComposerRequest } from "../composition/build-retention-composer-request";
import type {
  RetentionComposerCallback,
  RetentionNarrationCandidate,
} from "../composition/retention-narration-candidate.types";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { countRetentionNarrationWords } from "../validation/count-retention-narration-words";
import type { RetentionApprovedOpeningAuthority } from "./retention-rewrite.types";
import {
  assertExactApprovedOpeningPreserved,
  rebuildRetentionCandidateFromEnforcedNarration,
  reconcileRetentionCandidateAfterBodyRewrite,
} from "./reconcile-retention-candidate-after-body-rewrite";

export interface EnforceRetentionRewriteLengthResult {
  readonly candidate: RetentionNarrationCandidate;
  readonly lengthCompressionUsed: boolean;
  readonly deterministicTruncateUsed: boolean;
}

function fitsWordBudget(
  narration: string,
  plan: RetentionStoryPlan,
): boolean {
  return (
    countRetentionNarrationWords(narration) <=
    plan.compressionGoals.targetWordBudget
  );
}

function assertFinalWordBudget(
  narration: string,
  plan: RetentionStoryPlan,
): void {
  if (!fitsWordBudget(narration, plan)) {
    throw new RetentionStoryError(
      "candidate_reconciliation_failed",
      "Final narration exceeds Retention plan targetWordBudget.",
    );
  }
}

function runStructuredDeterministic(input: {
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly approvedOpening: RetentionApprovedOpeningAuthority;
  readonly previousCandidate: RetentionNarrationCandidate;
  readonly contract?: NormalizedStoryContract;
}): RetentionNarrationCandidate {
  const targetWordBudget = input.plan.compressionGoals.targetWordBudget;
  // Sentence-safe only — never flat-truncate narration before rebuild.
  return rebuildRetentionCandidateFromEnforcedNarration({
    narration: input.previousCandidate.assembledNarration,
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    approvedOpening: input.approvedOpening,
    previousCandidate: input.previousCandidate,
    origin: "after_length_enforcement",
    targetWordBudget,
    ...(input.contract ? { contract: input.contract } : {}),
  });
}

export async function enforceRetentionRewriteLength(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly strategySeed: RetentionStrategySeed;
  readonly grounding: RetentionGroundingContext;
  readonly ledger: RetentionModelCallLedger;
  readonly candidate: RetentionNarrationCandidate;
  readonly approvedOpening: RetentionApprovedOpeningAuthority;
  readonly composer: RetentionComposerCallback | null | undefined;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
  readonly permittedHookClaimIds?: readonly string[];
}): Promise<EnforceRetentionRewriteLengthResult> {
  const {
    contract,
    plan,
    strategySeed,
    grounding,
    ledger,
    approvedOpening,
  } = input;
  const targetWordBudget = plan.compressionGoals.targetWordBudget;

  if (fitsWordBudget(input.candidate.assembledNarration, plan)) {
    assertExactApprovedOpeningPreserved(
      input.candidate.assembledNarration,
      approvedOpening,
    );
    assertFinalWordBudget(input.candidate.assembledNarration, plan);
    return {
      candidate: input.candidate,
      lengthCompressionUsed: false,
      deterministicTruncateUsed: false,
    };
  }

  if (ledger.canConsume("length_compression") && input.composer != null) {
    ledger.consume("length_compression");
    try {
      const request = buildRetentionComposerRequest({
        contract,
        plan,
        strategySeed,
        grounding,
        manualContext: input.manualContext,
        userInstructions: input.userInstructions,
        hookDirectiveBlock: "",
        modelCallKind: "length_compress",
        previousCandidate: input.candidate,
      });
      const proposal = await input.composer(request);
      if (proposal == null || typeof proposal !== "object") {
        ledger.recordOutcome("length_compression", "empty");
        // One conversion only — fall through to structured deterministic.
      } else {
        const rebuilt = reconcileRetentionCandidateAfterBodyRewrite({
          proposal,
          plan,
          grounding,
          strategySeed,
          approvedOpening,
          permittedHookClaimIds: input.permittedHookClaimIds,
          origin: "after_length_enforcement",
          contract,
        });

        if (fitsWordBudget(rebuilt.candidate.assembledNarration, plan)) {
          ledger.recordOutcome("length_compression", "succeeded");
          assertFinalWordBudget(rebuilt.candidate.assembledNarration, plan);
          return {
            candidate: rebuilt.candidate,
            lengthCompressionUsed: true,
            deterministicTruncateUsed: false,
          };
        }

        // Compression returned over target — record terminal outcome, no retry.
        ledger.recordOutcome("length_compression", "rejected");
        const finalCandidate = runStructuredDeterministic({
          plan,
          grounding,
          strategySeed,
          approvedOpening,
          previousCandidate: rebuilt.candidate,
          contract,
        });
        assertFinalWordBudget(finalCandidate.assembledNarration, plan);
        return {
          candidate: finalCandidate,
          lengthCompressionUsed: true,
          deterministicTruncateUsed: true,
        };
      }
    } catch (error) {
      const outcome =
        isRetentionStoryError(error) &&
        (error.reason === "composer_proposal_invalid" ||
          error.reason === "composer_segment_mismatch" ||
          error.reason === "composer_grounding_invalid" ||
          error.reason === "candidate_reconciliation_failed")
          ? "malformed"
          : "failed";
      ledger.recordOutcome("length_compression", outcome);
      // No retry — continue to structured deterministic where safe.
    }

    try {
      const finalCandidate = runStructuredDeterministic({
        plan,
        grounding,
        strategySeed,
        approvedOpening,
        previousCandidate: input.candidate,
        contract,
      });
      assertFinalWordBudget(finalCandidate.assembledNarration, plan);
      return {
        candidate: finalCandidate,
        lengthCompressionUsed: true,
        deterministicTruncateUsed: true,
      };
    } catch {
      throw new RetentionStoryError(
        "candidate_reconciliation_failed",
        "Retention rewrite length enforcement failed after compression.",
      );
    }
  }

  // Compression unavailable — sole structured deterministic owner.
  try {
    const finalCandidate = runStructuredDeterministic({
      plan,
      grounding,
      strategySeed,
      approvedOpening,
      previousCandidate: input.candidate,
      contract,
    });
    assertFinalWordBudget(finalCandidate.assembledNarration, plan);
    const truncated =
      countRetentionNarrationWords(input.candidate.assembledNarration) >
      targetWordBudget;
    return {
      candidate: finalCandidate,
      lengthCompressionUsed: false,
      deterministicTruncateUsed: truncated,
    };
  } catch {
    throw new RetentionStoryError(
      "candidate_reconciliation_failed",
      "Retention rewrite deterministic length enforcement failed.",
    );
  }
}
