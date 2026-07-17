/**
 * Hard-gate recoverability — Sprint 10H.4B.1 final acceptance.
 *
 * Ordinary Flexible content/structure gates must be recoverable via zero-model
 * reconciliation or deterministic rescue. Authority/coherence gates remain terminal.
 */

import { RETENTION_HARD_GATE_IDS } from "./retention-validation.constants";

export type RetentionHardGateId = (typeof RETENTION_HARD_GATE_IDS)[number];

/** Ordinary content/structure — Flexible must attempt deterministic recovery. */
export const RETENTION_RECOVERABLE_HARD_GATE_IDS = Object.freeze([
  "one_controlling_idea_object",
  "beat_ids_unique",
  "beat_budgets_finite_ordered_within_duration",
  "no_empty_segment",
  "spoken_narration_complete",
  "setup_payoff_narration_complete",
  "required_payoff_beat_present",
  "hook_terminal_approval",
  "narration_fits_hard_duration_word_policy",
  "lexical_forbidden_intro_pattern",
  "required_participant_coverage",
] as const satisfies readonly RetentionHardGateId[]);

/** Safety / authority / identity — fail closed; never weaken. */
export const RETENTION_TERMINAL_AUTHORITY_HARD_GATE_IDS = Object.freeze([
  "plan_candidate_fingerprint_coherent",
  "factual_risk_segments_have_eligible_claim_refs",
  "no_downstream_mutation",
] as const satisfies readonly RetentionHardGateId[]);

const RECOVERABLE = new Set<string>(RETENTION_RECOVERABLE_HARD_GATE_IDS);
const TERMINAL_AUTHORITY = new Set<string>(
  RETENTION_TERMINAL_AUTHORITY_HARD_GATE_IDS,
);

export function isRecoverableRetentionHardGateId(gateId: string): boolean {
  return RECOVERABLE.has(gateId);
}

export function isTerminalAuthorityRetentionHardGateId(gateId: string): boolean {
  return TERMINAL_AUTHORITY.has(gateId);
}

/**
 * True when every failed gate is ordinary/recoverable (or there are no gate IDs
 * but length/spoken completeness reasons appear in safeReasonIds).
 */
export function retentionFailedGatesAreFlexibleRecoverable(input: {
  readonly failedHardGateIds?: readonly string[] | null;
  readonly safeReasonIds?: readonly string[] | null;
}): boolean {
  const gates = input.failedHardGateIds ?? [];
  if (gates.some((id) => isTerminalAuthorityRetentionHardGateId(id))) {
    return false;
  }
  if (gates.length > 0) {
    return gates.every((id) => isRecoverableRetentionHardGateId(id));
  }
  const reasons = input.safeReasonIds ?? [];
  if (reasons.length === 0) return false;
  // Length / completeness / Hook preference without authority markers.
  const authorityMarker = reasons.some(
    (id) =>
      id.includes("authority") ||
      id.includes("fingerprint") ||
      id.includes("mutation") ||
      id.includes("factual_risk") ||
      id === "creator_context_identity_mismatch",
  );
  if (authorityMarker) return false;
  return reasons.some((id) =>
    /length|overrun|word_budget|spoken_completeness|hard_gate|hook_terminal|payoff|participant|forbidden_intro|empty_segment/i.test(
      id,
    ),
  );
}
