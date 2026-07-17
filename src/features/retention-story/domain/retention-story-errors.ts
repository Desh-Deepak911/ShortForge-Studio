/**
 * Typed Retention Story Contract errors — Sprint 10B.
 * Messages never echo raw context, claim text, prompts, or secrets.
 */

export type RetentionStoryErrorReason =
  | "unsupported_contract_version"
  | "invalid_topic"
  | "invalid_generation_path"
  | "generation_path_mismatch"
  | "unknown_format_strategy"
  | "incompatible_format_strategy"
  | "long_form_not_supported"
  | "invalid_hook_style"
  | "incompatible_hook_style"
  | "missing_user_authored_hook"
  | "invalid_user_authored_hook"
  | "invalid_tone"
  | "invalid_quality_mode"
  | "invalid_audience_intent"
  | "invalid_desired_reaction"
  | "invalid_template_id"
  | "invalid_duration"
  | "invalid_grounding_claim"
  | "invalid_grounding_context"
  | "grounding_claim_conflict"
  | "grounding_identity_mismatch"
  | "invalid_research_identity"
  | "strategy_input_mismatch"
  | "grounding_summary_mismatch"
  | "creator_context_identity_mismatch"
  | "strategy_not_applicable"
  | "invalid_strategy_proposal"
  | "invalid_controlling_idea"
  | "no_valid_controlling_idea"
  | "invalid_emotional_arc_blueprint"
  | "controlling_idea_candidate_mismatch"
  | "strategy_seed_mismatch"
  | "retention_story_plan_mismatch"
  | "planner_unavailable"
  | "planner_call_failed"
  | "planner_proposal_invalid"
  | "composer_unavailable"
  | "composer_call_failed"
  | "composer_proposal_invalid"
  | "composer_segment_mismatch"
  | "composer_grounding_invalid"
  | "candidate_fingerprint_mismatch"
  | "candidate_reconciliation_failed"
  | "length_enforcement_failed"
  | "model_call_budget_exhausted"
  | "model_call_ledger_invalid"
  | "hook_terminal_failure";

export class RetentionStoryError extends Error {
  readonly reason: RetentionStoryErrorReason;
  readonly code = "RETENTION_STORY_ERROR" as const;
  /** Bounded machine seam for diagnostics (never creator-facing; never raw text). */
  readonly normalizeSeam?: string;

  constructor(
    reason: RetentionStoryErrorReason,
    message: string,
    options?: { readonly normalizeSeam?: string },
  ) {
    super(message);
    this.name = "RetentionStoryError";
    this.reason = reason;
    if (
      typeof options?.normalizeSeam === "string" &&
      /^[a-z][a-z0-9_]{0,63}$/.test(options.normalizeSeam)
    ) {
      this.normalizeSeam = options.normalizeSeam;
    }
  }
}

export function isRetentionStoryError(value: unknown): value is RetentionStoryError {
  return value instanceof RetentionStoryError;
}
