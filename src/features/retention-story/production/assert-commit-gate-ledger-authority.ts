/**
 * Commit-gate live ledger authority — Sprint 10F.3A.
 * Requires full semantic equality across live ledger, terminal budget, and
 * Hook bridge budget — not merely equal totals.
 */

import { RetentionStoryError } from "../domain/retention-story-errors";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import { assertRetentionModelCallLedgerSnapshotCoherence } from "../budget/assert-retention-model-call-ledger-snapshot-coherence";
import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import type { RetentionModelCallLedgerSnapshot } from "../budget/retention-model-call-budget.types";
import type { QualityMode } from "@/types/footiebitz";

function throwLedger(reasonId: string): never {
  throw new RetentionStoryError(
    "model_call_ledger_invalid",
    reasonId,
  );
}

function assertRewriteChronology(
  snap: RetentionModelCallLedgerSnapshot,
): void {
  let sawSuccessfulInitial = false;
  let rewriteSucceeded = 0;
  for (const event of snap.events) {
    if (
      event.category === "initial_narration" &&
      event.outcome === "succeeded"
    ) {
      sawSuccessfulInitial = true;
    }
    if (event.category === "retention_body_rewrite") {
      if (!sawSuccessfulInitial) {
        throwLedger("rewrite_before_initial_narration");
      }
      if (event.outcome === "succeeded") {
        rewriteSucceeded += 1;
      }
    }
  }
  if (rewriteSucceeded !== 1) {
    throwLedger("rewrite_success_count_mismatch");
  }
}

/**
 * Canonically validate the live path-global ledger for a Pass terminal.
 * Returns the canonical closed snapshot after semantic equality checks.
 */
export function assertCommitGateLedgerAuthority(input: {
  readonly liveLedger: RetentionModelCallLedger;
  readonly terminalBudget: RetentionModelCallLedgerSnapshot | null | undefined;
  readonly bridgeBudget: RetentionModelCallLedgerSnapshot;
  readonly qualityMode: QualityMode;
  readonly terminalState: "pass_without_rewrite" | "pass_after_rewrite";
}): RetentionModelCallLedgerSnapshot {
  const isRewritePass = input.terminalState === "pass_after_rewrite";

  const live = assertRetentionModelCallLedgerSnapshotCoherence(
    input.liveLedger.snapshot(),
    input.qualityMode,
    {
      requireClosed: true,
      requireSuccessfulInitialNarration: true,
      ...(isRewritePass
        ? { requireSuccessfulRetentionBodyRewrite: true }
        : { requireZeroRetentionBodyRewrite: true }),
    },
  );

  if (input.terminalBudget == null) {
    throwLedger("terminal_budget_missing");
  }

  const terminal = assertRetentionModelCallLedgerSnapshotCoherence(
    input.terminalBudget,
    input.qualityMode,
    {
      requireClosed: true,
      requireSuccessfulInitialNarration: true,
      ...(isRewritePass
        ? { requireSuccessfulRetentionBodyRewrite: true }
        : { requireZeroRetentionBodyRewrite: true }),
    },
  );

  const bridge = assertRetentionModelCallLedgerSnapshotCoherence(
    input.bridgeBudget,
    input.qualityMode,
    {
      requireClosed: true,
      requireSuccessfulInitialNarration: true,
      // Bridge budget is pre-rewrite for pass_without_rewrite; for
      // pass_after_rewrite the bridge carries the post-rewrite ledger.
      ...(isRewritePass
        ? { requireSuccessfulRetentionBodyRewrite: true }
        : { requireZeroRetentionBodyRewrite: true }),
    },
  );

  const liveCanon = retentionStableStringify(live);
  if (
    liveCanon !== retentionStableStringify(terminal) ||
    liveCanon !== retentionStableStringify(bridge)
  ) {
    throwLedger("ledger_semantic_mismatch");
  }

  if (isRewritePass) {
    assertRewriteChronology(live);
  } else if (live.counts.retention_body_rewrite !== 0) {
    throwLedger("unexpected_rewrite_attempts");
  }

  return live;
}
