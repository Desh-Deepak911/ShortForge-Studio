/**
 * Safe Retention rewrite/terminal diagnostics — Sprint 10F.2.
 * Never includes narration, prompts, claim text, research dumps, or secrets.
 */

import type { RetentionModelCallLedgerSnapshot } from "../budget/retention-model-call-budget.types";
import type {
  RetentionRewriteDiagnostics,
  RetentionRewriteTerminalState,
} from "./retention-rewrite.types";
import { RETENTION_REWRITE_VERSION } from "./retention-rewrite.constants";

function deepFreezeDiagnostics(
  value: RetentionRewriteDiagnostics,
): RetentionRewriteDiagnostics {
  Object.freeze(value.safeReasonIds);
  if (value.budget) Object.freeze(value.budget);
  if (value.validationFailureSummary) {
    Object.freeze(value.validationFailureSummary.failedHardGateIds);
    Object.freeze(value.validationFailureSummary.editorialScores);
    Object.freeze(value.validationFailureSummary.qualityDiagnosticIds);
    Object.freeze(value.validationFailureSummary);
  }
  return Object.freeze(value);
}

export function buildRetentionRewriteDiagnostics(input: {
  readonly terminalState: RetentionRewriteTerminalState;
  readonly qualityMode: string;
  readonly contractFingerprint: string;
  readonly planFingerprint?: string | null;
  readonly initialCandidateFingerprint?: string | null;
  readonly finalCandidateFingerprint?: string | null;
  readonly initialValidationFingerprint?: string | null;
  readonly finalValidationFingerprint?: string | null;
  readonly rewriteUsed?: boolean;
  readonly lengthCompressionUsed?: boolean;
  readonly deterministicTruncateUsed?: boolean;
  readonly budget?: RetentionModelCallLedgerSnapshot | null;
  readonly safeReasonIds?: readonly string[];
  readonly validationFailureSummary?: RetentionRewriteDiagnostics["validationFailureSummary"];
}): RetentionRewriteDiagnostics {
  return deepFreezeDiagnostics({
    version: RETENTION_REWRITE_VERSION,
    terminalState: input.terminalState,
    qualityMode: input.qualityMode,
    contractFingerprint: input.contractFingerprint,
    planFingerprint: input.planFingerprint ?? null,
    initialCandidateFingerprint: input.initialCandidateFingerprint ?? null,
    finalCandidateFingerprint: input.finalCandidateFingerprint ?? null,
    initialValidationFingerprint: input.initialValidationFingerprint ?? null,
    finalValidationFingerprint: input.finalValidationFingerprint ?? null,
    rewriteUsed: input.rewriteUsed === true,
    lengthCompressionUsed: input.lengthCompressionUsed === true,
    deterministicTruncateUsed: input.deterministicTruncateUsed === true,
    budget: input.budget ?? null,
    safeReasonIds: Object.freeze([...(input.safeReasonIds ?? [])]),
    ...(input.validationFailureSummary
      ? { validationFailureSummary: input.validationFailureSummary }
      : {}),
  });
}
