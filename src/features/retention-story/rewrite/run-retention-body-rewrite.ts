/**
 * Studio body-rewrite runner — Sprint 10F.2 / 10F.2A.
 * At most one retention_body_rewrite call on the shared path-global ledger.
 */

import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import { RetentionStoryError, isRetentionStoryError } from "../domain/retention-story-errors";
import {
  assertRetentionLedgerMatchesContract,
  type RetentionModelCallLedger,
} from "../budget/create-retention-model-call-ledger";
import { assertRetentionModelCallLedgerSnapshotCoherence } from "../budget/assert-retention-model-call-ledger-snapshot-coherence";
import type { RetentionModelCallLedgerSnapshot } from "../budget/retention-model-call-budget.types";
import type {
  RetentionComposerCallback,
  RetentionNarrationCandidate,
} from "../composition/retention-narration-candidate.types";
import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionHookBridgeReadyResult } from "../integration/assert-retention-hook-bridge-ready-coherence";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionValidationResult } from "../validation/retention-validation.types";
import { buildRetentionBodyRewriteRequest } from "./build-retention-body-rewrite-request";
import { enforceRetentionRewriteLength } from "./enforce-retention-rewrite-length";
import {
  assertExactApprovedOpeningPreserved,
  reconcileRetentionCandidateAfterBodyRewrite,
} from "./reconcile-retention-candidate-after-body-rewrite";
import { revalidateRetentionHookAfterRewrite } from "./revalidate-retention-hook-after-rewrite";
import type {
  RetentionApprovedOpeningAuthority,
  RetentionBodyRewriteCallback,
} from "./retention-rewrite.types";
import type {
  RetentionPostRewriteHookEvidence,
  RetentionTerminalHookAuthority,
} from "./retention-terminal-hook-authority.types";

export type RetentionBodyRewriteRunStatus =
  | "rewritten"
  | "rewrite_unavailable"
  | "rewrite_call_failed"
  | "rewrite_proposal_invalid"
  | "opening_preservation_failed"
  | "length_enforcement_failed"
  | "post_rewrite_hook_failed"
  | "ledger_invalid";

export type RetentionBodyRewriteRunResult =
  | {
      readonly status: "rewritten";
      readonly candidate: RetentionNarrationCandidate;
      readonly title: string;
      readonly lengthCompressionUsed: boolean;
      readonly deterministicTruncateUsed: boolean;
      readonly budget: RetentionModelCallLedgerSnapshot;
      readonly postRewriteHookEvidence: RetentionPostRewriteHookEvidence;
      readonly terminalHookAuthority: RetentionTerminalHookAuthority;
    }
  | {
      readonly status: Exclude<RetentionBodyRewriteRunStatus, "rewritten">;
      readonly budget: RetentionModelCallLedgerSnapshot | null;
    };

function captureApprovedOpening(
  bridge: RetentionHookBridgeReadyResult,
  authority: RetentionTerminalHookAuthority,
): RetentionApprovedOpeningAuthority {
  const openingText = authority.approvedCandidate.openingText;
  const openingStartOffset = authority.approvedCandidate.openingStartOffset;
  const openingEndOffset = authority.approvedCandidate.openingEndOffset;
  if (
    bridge.approvedNarration.slice(openingStartOffset, openingEndOffset) !==
    openingText
  ) {
    throw new RetentionStoryError(
      "hook_terminal_failure",
      "Approved Hook opening does not match ready bridge narration.",
    );
  }
  return Object.freeze({
    openingText,
    openingStartOffset,
    openingEndOffset,
  });
}

/**
 * Assert shared ledger identity before rewrite consume.
 */
export function assertRewriteLedgerAuthority(input: {
  readonly ledger: RetentionModelCallLedger;
  readonly contract: NormalizedStoryContract;
  readonly preRewriteBridgeBudget: RetentionModelCallLedgerSnapshot;
}): RetentionModelCallLedgerSnapshot {
  assertRetentionLedgerMatchesContract(input.ledger, input.contract);
  const current = assertRetentionModelCallLedgerSnapshotCoherence(
    input.ledger.snapshot(),
    "best",
    {
      requireClosed: true,
      requireSuccessfulInitialNarration: true,
      requireZeroRetentionBodyRewrite: true,
    },
  );
  const expected = assertRetentionModelCallLedgerSnapshotCoherence(
    input.preRewriteBridgeBudget,
    "best",
    {
      requireClosed: true,
      requireSuccessfulInitialNarration: true,
      requireZeroRetentionBodyRewrite: true,
    },
  );
  if (retentionStableStringify(current) !== retentionStableStringify(expected)) {
    throw new RetentionStoryError(
      "model_call_ledger_invalid",
      "Rewrite ledger snapshot does not match the pre-rewrite Hook bridge budget.",
    );
  }
  if (!input.ledger.canConsume("retention_body_rewrite")) {
    throw new RetentionStoryError(
      "model_call_budget_exhausted",
      "Retention body rewrite budget is unavailable.",
    );
  }
  return current;
}

/**
 * Run at most one Studio body rewrite + length enforcement + Hook revalidation.
 * Terminal Hook authority must come from the ready bridge (not a caller forge).
 */
export async function runRetentionBodyRewrite(input: {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly plan: RetentionStoryPlan;
  readonly hookBridge: RetentionHookBridgeReadyResult;
  readonly candidate: RetentionNarrationCandidate;
  readonly initialValidation: RetentionValidationResult;
  readonly ledger: RetentionModelCallLedger;
  readonly rewriteComposer: RetentionBodyRewriteCallback | null | undefined;
  readonly lengthComposer?: RetentionComposerCallback | null;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
}): Promise<RetentionBodyRewriteRunResult> {
  const terminalHookAuthority = input.hookBridge.terminalHookAuthority;

  try {
    assertRewriteLedgerAuthority({
      ledger: input.ledger,
      contract: input.contract,
      preRewriteBridgeBudget: input.hookBridge.diagnostics.budget,
    });
  } catch {
    return { status: "ledger_invalid", budget: null };
  }

  if (input.rewriteComposer == null) {
    return {
      status: "rewrite_unavailable",
      budget: input.ledger.snapshot(),
    };
  }

  let approvedOpening: RetentionApprovedOpeningAuthority;
  try {
    approvedOpening = captureApprovedOpening(
      input.hookBridge,
      terminalHookAuthority,
    );
  } catch {
    return { status: "opening_preservation_failed", budget: input.ledger.snapshot() };
  }

  let request;
  try {
    request = buildRetentionBodyRewriteRequest({
      contract: input.contract,
      plan: input.plan,
      strategySeed: input.strategySeed,
      grounding: input.grounding,
      manualContext: input.manualContext,
      userInstructions: input.userInstructions,
      currentCandidate: input.candidate,
      immutableApprovedOpening: approvedOpening,
      initialValidation: input.initialValidation,
    });
  } catch {
    return { status: "rewrite_proposal_invalid", budget: input.ledger.snapshot() };
  }

  try {
    input.ledger.consume("retention_body_rewrite");
  } catch {
    return { status: "ledger_invalid", budget: input.ledger.snapshot() };
  }

  let proposal: unknown;
  try {
    proposal = await input.rewriteComposer(request);
  } catch {
    input.ledger.recordOutcome("retention_body_rewrite", "failed");
    return { status: "rewrite_call_failed", budget: input.ledger.snapshot() };
  }

  if (proposal == null || typeof proposal !== "object") {
    input.ledger.recordOutcome("retention_body_rewrite", "empty");
    return { status: "rewrite_proposal_invalid", budget: input.ledger.snapshot() };
  }

  let rewritten: {
    candidate: RetentionNarrationCandidate;
    title: string;
    hookClaimRefs: readonly string[];
  };
  try {
    rewritten = reconcileRetentionCandidateAfterBodyRewrite({
      proposal,
      plan: input.plan,
      grounding: input.grounding,
      strategySeed: input.strategySeed,
      approvedOpening,
      permittedHookClaimIds: terminalHookAuthority.openingClaimRefs,
      origin: "after_body_rewrite",
      contract: input.contract,
    });
    assertExactApprovedOpeningPreserved(
      rewritten.candidate.assembledNarration,
      approvedOpening,
    );
    input.ledger.recordOutcome("retention_body_rewrite", "succeeded");
  } catch (error) {
    const outcome =
      isRetentionStoryError(error) &&
      error.reason === "candidate_reconciliation_failed"
        ? "rejected"
        : "malformed";
    input.ledger.recordOutcome("retention_body_rewrite", outcome);
    if (
      isRetentionStoryError(error) &&
      error.reason === "candidate_reconciliation_failed"
    ) {
      return {
        status: "opening_preservation_failed",
        budget: input.ledger.snapshot(),
      };
    }
    return {
      status: "rewrite_proposal_invalid",
      budget: input.ledger.snapshot(),
    };
  }

  let enforced;
  try {
    enforced = await enforceRetentionRewriteLength({
      contract: input.contract,
      plan: input.plan,
      strategySeed: input.strategySeed,
      grounding: input.grounding,
      ledger: input.ledger,
      candidate: rewritten.candidate,
      approvedOpening,
      composer: input.lengthComposer ?? null,
      manualContext: input.manualContext,
      userInstructions: input.userInstructions,
      permittedHookClaimIds: terminalHookAuthority.openingClaimRefs,
    });
  } catch {
    return {
      status: "length_enforcement_failed",
      budget: input.ledger.snapshot(),
    };
  }

  let hookRevalidation;
  try {
    hookRevalidation = revalidateRetentionHookAfterRewrite({
      narration: enforced.candidate.assembledNarration,
      terminalHookAuthority,
      approvedOpening,
      candidate: enforced.candidate,
    });
  } catch {
    return {
      status: "post_rewrite_hook_failed",
      budget: input.ledger.snapshot(),
    };
  }

  return {
    status: "rewritten",
    candidate: enforced.candidate,
    title: rewritten.title,
    lengthCompressionUsed: enforced.lengthCompressionUsed,
    deterministicTruncateUsed: enforced.deterministicTruncateUsed,
    budget: input.ledger.snapshot(),
    postRewriteHookEvidence: hookRevalidation.evidence,
    terminalHookAuthority,
  };
}
