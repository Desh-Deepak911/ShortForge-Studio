/**
 * Safe Retention response envelope for JSON/NDJSON — Sprint 10F.3.
 * Never includes terminal Hook authority, candidates, claim maps, or prompts.
 */

import type {
  RetentionApprovedNarrationResult,
  RetentionProductionNarrationResult,
  RetentionProductionSafeDiagnostics,
} from "./retention-production.types";
import type {
  RetentionStoryPlanSnapshot,
  RetentionValidationSummary,
} from "./retention-persistence.types";

export interface RetentionSafeResponseEnvelope {
  readonly retentionPlan?: RetentionStoryPlanSnapshot;
  readonly retentionValidation?: RetentionValidationSummary;
  readonly retentionDiagnostics?: RetentionProductionSafeDiagnostics;
  readonly generationDisposition?: import("./retention-generation-disposition.types").RetentionGenerationDispositionSummary;
}

export function buildRetentionSafeResponseEnvelope(
  result: RetentionProductionNarrationResult,
): RetentionSafeResponseEnvelope {
  if (result.ok) {
    const approved = result.approved;
    return Object.freeze({
      retentionPlan: approved.planSnapshot,
      retentionValidation: approved.validationSummary,
      retentionDiagnostics: approved.safeDiagnostics,
      ...(approved.generationDisposition
        ? { generationDisposition: approved.generationDisposition }
        : {}),
    });
  }
  return Object.freeze({
    retentionDiagnostics: result.retentionDiagnostics,
  });
}

export function buildRetentionSafeResponseEnvelopeFromApproved(
  approved: RetentionApprovedNarrationResult,
): RetentionSafeResponseEnvelope {
  return Object.freeze({
    retentionPlan: approved.planSnapshot,
    retentionValidation: approved.validationSummary,
    retentionDiagnostics: approved.safeDiagnostics,
    ...(approved.generationDisposition
      ? { generationDisposition: approved.generationDisposition }
      : {}),
  });
}

/** Strip any accidental private keys from a serialized response object. */
export function assertNoPrivateRetentionFieldsSerialized(
  payload: unknown,
): void {
  const json = JSON.stringify(payload);
  const forbidden = [
    "terminalHookAuthority",
    "postRewriteHookEvidence",
    "terminalEvidence",
    "assembledNarration",
    "eligibleClaims",
    "avoidanceClaims",
    "contentAuthority",
    "orderedEssentialUnits",
    "orderedOptionalUnits",
    "compositionBrief",
    "orderedEssentialUnitIds",
    "usedContentIds",
    "hookDirectiveBlock",
    "promptBlock",
    "OPENAI_API_KEY",
  ];
  for (const key of forbidden) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`private_retention_field_serialized:${key}`);
    }
  }
}
