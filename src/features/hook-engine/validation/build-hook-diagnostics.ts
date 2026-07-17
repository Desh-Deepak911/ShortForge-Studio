/**
 * HookDiagnostics builder — Sprint 7C.2.
 * Rejects candidate/validation/plan mismatches; must not include narration/prompts.
 */

import type {
  HookCandidate,
  HookDiagnostics,
  HookPlan,
  HookValidationGroundingStatus,
  HookValidationOutcome,
  HookValidationResult,
  NormalizedHookRequest,
} from "../domain/hook-contract.types";

export class HookDiagnosticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HookDiagnosticsError";
  }
}

export function buildHookDiagnostics(input: {
  readonly request: NormalizedHookRequest;
  readonly plan: HookPlan;
  readonly candidate?: HookCandidate;
  readonly validation?: HookValidationResult;
  readonly validationOutcome: HookValidationOutcome;
  readonly repairAttempts: number;
  readonly fallbackReason?: string;
  readonly compressionRevalidated?: boolean;
  readonly adapterRan: boolean;
  readonly groundingStatusOverride?: HookValidationGroundingStatus;
}): HookDiagnostics {
  const { plan, candidate, validation } = input;

  if (candidate) {
    if (candidate.planFingerprint !== plan.planFingerprint) {
      throw new HookDiagnosticsError(
        "HookDiagnostics rejected: candidate.planFingerprint does not match plan.",
      );
    }
    if (
      candidate.strategyId !== plan.strategyId ||
      candidate.strategyVersion !== plan.strategyVersion
    ) {
      throw new HookDiagnosticsError(
        "HookDiagnostics rejected: candidate strategy does not match plan.",
      );
    }
    if (candidate.requestFingerprint !== plan.requestFingerprint) {
      throw new HookDiagnosticsError(
        "HookDiagnostics rejected: candidate.requestFingerprint does not match plan.",
      );
    }
  }

  if (validation) {
    if (validation.planFingerprint !== plan.planFingerprint) {
      throw new HookDiagnosticsError(
        "HookDiagnostics rejected: validation.planFingerprint does not match plan.",
      );
    }
    if (candidate && validation.candidateId !== candidate.candidateId) {
      throw new HookDiagnosticsError(
        "HookDiagnostics rejected: validation.candidateId does not match candidate.",
      );
    }
  }

  const repairAttempts = input.repairAttempts === 1 ? 1 : 0;
  const groundingStatus =
    input.groundingStatusOverride ??
    input.validation?.groundingStatus ??
    input.request.grounding.normalizedGroundingStatus;

  return Object.freeze({
    contractVersion: input.request.contractVersion,
    strategyId: plan.strategyId,
    strategyVersion: plan.strategyVersion,
    strategySource: plan.strategySource,
    ...(candidate ? { candidateOrigin: candidate.origin } : {}),
    generationPath: input.request.generationPath,
    requestFingerprint: input.request.requestFingerprint,
    planFingerprint: plan.planFingerprint,
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
    groundingStatus,
    validationOutcome: input.validationOutcome,
    repairAttempts,
    ...(input.compressionRevalidated
      ? { compressionRevalidated: true }
      : {}),
    templateInfluenced: Boolean(input.request.templateId),
    promptIntelligenceInfluenced:
      plan.strategySource === "prompt_intelligence" ||
      Boolean(input.request.openingIntent),
    adapterRan: input.adapterRan,
  });
}
