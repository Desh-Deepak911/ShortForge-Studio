/**
 * Post-freeze hotfix — safe creator-facing Hook failure copy.
 * No narration, prompts, claims, research, credentials, or fingerprints.
 */

import type { HookDiagnostics } from "../domain/hook-contract.types";
import {
  hookStyleLabel,
  isHookStyleSelection,
  type HookStyleSelection,
} from "../presentation/hook-style-selection";

const QUALITY_FALLBACK_SUFFIX =
  "could not produce a valid opening after one repair and a safe fallback. Try again or switch Hook Style to Auto.";

const HARD_GATE_MESSAGE =
  "This topic could not clear Hook safety or grounding checks. Try Auto, Write My Own, or adjust the topic — no unsafe opening was approved.";

function styleLabelForRequestedStrategy(
  strategyId: string | undefined,
): string {
  if (strategyId && isHookStyleSelection(strategyId)) {
    const label = hookStyleLabel(strategyId as HookStyleSelection);
    if (strategyId === "auto") {
      return "Auto";
    }
    return label;
  }
  if (strategyId === "contrarian_claim") {
    return "Contrarian Take";
  }
  return "This Hook Style";
}

function isHardGateFallbackReason(reason: string | undefined): boolean {
  if (!reason) return false;
  return reason.includes("failed_hard_gate");
}

function isQualityOrFallbackValidationFailure(reason: string | undefined): boolean {
  if (!reason) return false;
  return (
    reason.includes("failed_validation") ||
    reason.includes("fallback_empty") ||
    reason.includes("fallback_unavailable") ||
    reason.includes("callback_rejected") ||
    reason.includes("candidate_construction_failed") ||
    reason.includes("candidate_failed")
  );
}

/**
 * Build a safe actionable message for terminal Hook approval failure.
 * `requestedStyleStrategyId` is the originally requested style (not terminal fallback id).
 */
export function buildCreatorFacingHookFailureMessage(input: {
  readonly diagnostics: Pick<
    HookDiagnostics,
    "fallbackReason" | "validationOutcome" | "repairAttempts" | "groundingStatus"
  >;
  readonly requestedStyleStrategyId?: string;
}): string {
  const reason = input.diagnostics.fallbackReason;
  if (isHardGateFallbackReason(reason)) {
    return HARD_GATE_MESSAGE;
  }
  if (
    isQualityOrFallbackValidationFailure(reason) ||
    input.diagnostics.validationOutcome === "generation_failed"
  ) {
    const label = styleLabelForRequestedStrategy(input.requestedStyleStrategyId);
    return `${label} ${QUALITY_FALLBACK_SUFFIX}`;
  }
  return HARD_GATE_MESSAGE;
}
