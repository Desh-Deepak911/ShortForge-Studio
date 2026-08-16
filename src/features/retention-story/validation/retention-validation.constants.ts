/**
 * Retention validation constants — Sprint 10F.
 */

export const RETENTION_VALIDATION_VERSION = 1 as const;
export const RETENTION_VALIDATION_FINGERPRINT_PREFIX = "rv:" as const;
export const RETENTION_THRESHOLD_REGISTRY_VERSION = "threshold-registry/1" as const;
/** Sprint 10H.2 — curiosity credits declarative / cold-open / headline openings (not question-only). */
export const RETENTION_HEURISTIC_REGISTRY_VERSION = "heuristic-registry/3" as const;

export const RETENTION_HARD_GATE_IDS = Object.freeze([
  "one_controlling_idea_object",
  "plan_candidate_fingerprint_coherent",
  "beat_ids_unique",
  "beat_budgets_finite_ordered_within_duration",
  "no_empty_segment",
  "spoken_narration_complete",
  "setup_payoff_narration_complete",
  "required_payoff_beat_present",
  "factual_risk_segments_have_eligible_claim_refs",
  "hook_terminal_approval",
  "narration_fits_hard_duration_word_policy",
  "lexical_forbidden_intro_pattern",
  "required_participant_coverage",
  "no_downstream_mutation",
] as const);

export const RETENTION_EDITORIAL_COMPONENT_IDS = Object.freeze([
  "clarity",
  "curiosity",
  "emotional_progression",
  "compression_quality",
  "novelty",
  "escalation",
  "payoff_strength",
  "visual_potential",
  "repetition_penalty",
  "controlling_idea_adherence",
  "generic_introduction_quality",
] as const);
