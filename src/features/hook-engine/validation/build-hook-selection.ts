/**
 * HookSelection builder — Sprint 7C.1.
 * Public API recomputes validation; does not trust caller validation results.
 */

import type {
  HookCandidate,
  HookPlan,
  HookSelection,
  HookValidationResult,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";
import { assertHookCandidateId } from "./build-hook-candidate";
import { validateHookCandidate } from "./validate-hook-candidate";

export class HookSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HookSelectionError";
  }
}

/** Private assembly after a passing recomputed validation. */
function assembleHookSelection(input: {
  readonly plan: HookPlan;
  readonly candidate: HookCandidate;
  readonly validation: HookValidationResult;
}): HookSelection {
  const { plan, candidate, validation } = input;

  if (!validation.ok) {
    throw new HookSelectionError(
      "HookSelection rejected: validation did not pass.",
    );
  }

  assertHookCandidateId(candidate);

  if (validation.candidateId !== candidate.candidateId) {
    throw new HookSelectionError(
      "HookSelection rejected: validation candidateId mismatch.",
    );
  }

  if (
    validation.planFingerprint !== plan.planFingerprint ||
    candidate.planFingerprint !== plan.planFingerprint
  ) {
    throw new HookSelectionError(
      "HookSelection rejected: stale or mismatched planFingerprint.",
    );
  }

  if (candidate.requestFingerprint !== plan.requestFingerprint) {
    throw new HookSelectionError(
      "HookSelection rejected: requestFingerprint mismatch.",
    );
  }

  if (
    candidate.strategyId !== plan.strategyId ||
    candidate.strategyVersion !== plan.strategyVersion
  ) {
    throw new HookSelectionError(
      "HookSelection rejected: candidate strategy does not match plan.",
    );
  }

  return Object.freeze({
    candidateId: candidate.candidateId,
    strategyId: plan.strategyId,
    strategySource: plan.strategySource,
    candidateOrigin: candidate.origin,
    openingText: candidate.openingText,
    planFingerprint: plan.planFingerprint,
    narrationCommitRule: "opening_span_of_narration",
  });
}

/**
 * Canonical public selection builder — recomputes validation internally.
 * A forged ok:true validation cannot produce selection.
 */
export function buildHookSelection(input: {
  readonly request: NormalizedHookRequest;
  readonly plan: HookPlan;
  readonly candidate: HookCandidate;
  readonly repairBoundExceeded?: boolean;
}): HookSelection {
  const validation = validateHookCandidate({
    request: input.request,
    plan: input.plan,
    candidate: input.candidate,
    repairBoundExceeded: input.repairBoundExceeded,
  });
  return assembleHookSelection({
    plan: input.plan,
    candidate: input.candidate,
    validation,
  });
}

/**
 * Selection from a freshly computed validation (same process). Still verifies identity.
 * Prefer buildHookSelection for public callers.
 */
export function buildHookSelectionFromValidation(input: {
  readonly request: NormalizedHookRequest;
  readonly plan: HookPlan;
  readonly candidate: HookCandidate;
  readonly validation: HookValidationResult;
}): HookSelection {
  const recomputed = validateHookCandidate({
    request: input.request,
    plan: input.plan,
    candidate: input.candidate,
    repairBoundExceeded: input.validation.repairBoundExceeded,
  });
  if (
    recomputed.ok !== input.validation.ok ||
    recomputed.candidateId !== input.validation.candidateId ||
    recomputed.planFingerprint !== input.validation.planFingerprint
  ) {
    // Trust only recomputed — forged caller validation is ignored.
  }
  return assembleHookSelection({
    plan: input.plan,
    candidate: input.candidate,
    validation: recomputed,
  });
}
