/**
 * Safe generation acceptance / rejection provenance — provider-free.
 * Enums and counts only: no prompts, narration, claim text, or provider bodies.
 */

import type { RetentionSafeProviderFailure } from "../domain/retention-provider-failure.types";

export const RETENTION_GENERATION_ACCEPTANCE_TRACE_VERSION = 1 as const;

/** Bounded stages explaining why an initial model candidate did not reach the user. */
export type RetentionGenerationRejectionStage =
  | "model_call_unavailable"
  | "model_call_failed"
  | "malformed_composer_proposal"
  | "beat_segment_identity_mismatch"
  | "unsupported_claim_or_claim_reference_rejection"
  | "hook_validation_rejection"
  | "accepted_narration_mapping_failed"
  | "hook_body_relationship_rejection"
  | "duration_or_compression_rejection"
  | "narration_hard_gate_rejection"
  | "acceptance_quality_rejection"
  | "deterministic_rescue_entered"
  | "deterministic_rescue_accepted"
  | "model_narration_accepted"
  | "rewrite_accepted";

/** Who authored the final spoken narration the creator receives. */
export type RetentionGenerationFinalNarrationAuthority =
  | "model_direct"
  | "model_after_rewrite"
  | "deterministic_rescue"
  | "unavailable";

export interface RetentionGenerationAcceptanceTraceEvent {
  readonly stage: RetentionGenerationRejectionStage;
  readonly order: number;
  readonly providerFailure?: RetentionSafeProviderFailure;
}

export interface RetentionGenerationAcceptanceTrace {
  readonly version: typeof RETENTION_GENERATION_ACCEPTANCE_TRACE_VERSION;
  /** Chronological safe stage markers (bounded enums only). */
  readonly events: readonly RetentionGenerationAcceptanceTraceEvent[];
  /** Earliest decisive rejection before rescue/accept, when applicable. */
  readonly earliestDecisiveRejection: RetentionGenerationRejectionStage | null;
  readonly finalNarrationAuthority: RetentionGenerationFinalNarrationAuthority;
  readonly deterministicRescueEntered: boolean;
  readonly deterministicRescueAccepted: boolean;
  readonly modelNarrationAccepted: boolean;
  readonly rewriteAccepted: boolean;
  /** Internal bounded rewrite type. Does not add a top-level authority. */
  readonly boundedRewriteType?:
    | "opening_repair"
    | "ranking_payoff_repair"
    | "grounding_payoff_repair"
    | "duplicate_payoff_repair"
    | "supported_opening_promotion"
    | "duration_compression";
  /** First classified provider failure, when the model path failed. */
  readonly providerFailure?: RetentionSafeProviderFailure;
}

export function freezeRetentionGenerationAcceptanceTrace(
  trace: RetentionGenerationAcceptanceTrace,
): RetentionGenerationAcceptanceTrace {
  return Object.freeze({
    ...trace,
    events: Object.freeze(
      trace.events.map((event) => Object.freeze({ ...event })),
    ),
  });
}
