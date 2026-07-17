/**
 * Safe Retention validation diagnostics — Sprint 10F / 10F.1.
 * Never includes narration, prompts, Hook directives, claim text, URLs, or secrets.
 */

import type {
  RetentionDiagnostics,
  RetentionDiagnosticsTerminalState,
  RetentionHardGateId,
  RetentionValidationFailureClass,
  RetentionValidationResult,
} from "./retention-validation.types";

function deepFreezeDiagnostics(value: RetentionDiagnostics): RetentionDiagnostics {
  Object.freeze(value.failedHardGateIds);
  Object.freeze(value.noteIds);
  return Object.freeze(value);
}

export function buildRetentionValidationDiagnostics(input: {
  readonly contractFingerprint: string;
  readonly planFingerprint: string | null;
  readonly candidateFingerprint: string | null;
  readonly validation: RetentionValidationResult | null;
  readonly failureClass: RetentionValidationFailureClass;
  readonly safeSummary: string;
  readonly noteIds?: readonly string[];
  readonly terminalState?: RetentionDiagnosticsTerminalState;
  readonly rewriteUsed?: boolean;
}): RetentionDiagnostics {
  const failedHardGateIds: RetentionHardGateId[] = input.validation
    ? input.validation.hardGates.filter((g) => !g.passed).map((g) => g.id)
    : [];

  const terminalState =
    input.terminalState ??
    (input.validation?.ok === true ? "pass" : "fail");

  return deepFreezeDiagnostics({
    contractFingerprint: input.contractFingerprint,
    planFingerprint: input.planFingerprint,
    candidateFingerprint: input.candidateFingerprint,
    validationFingerprint: input.validation?.validationFingerprint ?? null,
    failureClass: input.failureClass,
    failedHardGateIds: Object.freeze([...failedHardGateIds]),
    rewriteUsed: input.rewriteUsed === true,
    terminalState,
    safeSummary: input.safeSummary,
    noteIds: Object.freeze([...(input.noteIds ?? [])]),
  });
}

export function buildSkippedScenesOnlyDiagnostics(input: {
  readonly contractFingerprint: string;
}): RetentionDiagnostics {
  return buildRetentionValidationDiagnostics({
    contractFingerprint: input.contractFingerprint,
    planFingerprint: null,
    candidateFingerprint: null,
    validation: null,
    failureClass: "none",
    safeSummary: "scenes_only_validation_skipped",
    noteIds: Object.freeze(["scenes_only"]),
    terminalState: "skipped",
  });
}
