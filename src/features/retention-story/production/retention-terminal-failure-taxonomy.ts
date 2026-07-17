/**
 * Universal reliability — terminal failure taxonomy (Sprint 10H.4B.1).
 *
 * Can a valid Flexible request still return success:false?
 * Yes — only for safety/authority corruption or genuine infrastructure
 * impossibility after deterministic rescue — not for ordinary Hook preference,
 * research absence, editorial quality, completeness, or duration pressure.
 *
 * Invalid topic/input is not a “valid Flexible request.”
 * Write My Own and explicit Precise constraints remain creator-correctable.
 */

import type { RetentionProductionFailureCategory } from "./retention-production.types";

/**
 * Invalid creator input (empty topic, forged Hook/strategy, bad Fact Handling).
 * Not a valid Flexible request.
 */
export const RETENTION_INVALID_CREATOR_INPUT_FAILURE_CATEGORIES = Object.freeze([
  "contract_normalization_failure",
] as const satisfies readonly RetentionProductionFailureCategory[]);

/**
 * Creator-correctable exceptions: Write My Own opening hard-gates, Precise mode
 * refusing silent Hook Auto, and invalid creator input. Ordinary Flexible
 * content/structure misses must not remain here after deterministic rescue.
 */
export const RETENTION_CREATOR_CORRECTABLE_FAILURE_CATEGORIES = Object.freeze([
  "contract_normalization_failure",
  "hook_terminal_failure",
  "grounding_failure",
  "retention_hard_gate_failure",
  "length_enforcement_failure",
] as const satisfies readonly RetentionProductionFailureCategory[]);

/**
 * Valid Flexible may still fail closed here — safety / authority / commit
 * coherence corruption. Never weaken these gates for rescue.
 */
export const RETENTION_SAFETY_FAILURE_CATEGORIES = Object.freeze([
  "validation_authority_mismatch",
  "commit_gate_coherence_failure",
] as const satisfies readonly RetentionProductionFailureCategory[]);

/**
 * Valid Flexible may fail here only after deterministic rescue is exhausted
 * (genuine infra impossibility). Model planner/composer/rewrite preference
 * failures must ordinarily recover via det plan/composition/pre-rewrite keep.
 */
export const RETENTION_INFRASTRUCTURE_FAILURE_CATEGORIES = Object.freeze([
  "planner_unavailable",
  "planner_failed",
  "planner_invalid",
  "composer_unavailable",
  "composer_failed",
  "composer_invalid",
  "rewrite_failure",
  "budget_ledger_failure",
  "production_internal_failure",
] as const satisfies readonly RetentionProductionFailureCategory[]);

/**
 * Legacy category retained for mapping edges. Must not mean “quality score alone
 * blocked creation” — ordinary quality_below_target is success with adaptation.
 */
export const RETENTION_LEGACY_QUALITY_FAILURE_CATEGORY =
  "quality_failure" as const satisfies RetentionProductionFailureCategory;

/** Non-applicable path (scenes-only) — not a narration generation failure. */
export const RETENTION_NON_APPLICABLE_FAILURE_CATEGORIES = Object.freeze([
  "scenes_only_not_applicable",
] as const satisfies readonly RetentionProductionFailureCategory[]);

/** Outcomes that enhance explainability but must not yield success:false alone. */
export const RETENTION_NON_TERMINAL_EDITORIAL_ADAPTATIONS = Object.freeze([
  "quality_below_target",
  "unsupported_facts_omitted",
  "planner_fallback_used",
  "hook_style_reconciled",
  "length_rescue_used",
  "deterministic_story_fallback_used",
  "reliability_rescue_used",
  "participant_coverage_reconciled",
  "creative_premise_used",
  "beat_plan_compacted",
] as const);

/**
 * Categories a valid Flexible request may still return as success:false after
 * ordinary recoverable content/structure paths have been attempted.
 */
export const RETENTION_VALID_FLEXIBLE_REMAINING_TERMINAL_CATEGORIES =
  Object.freeze([
    ...RETENTION_SAFETY_FAILURE_CATEGORIES,
    ...RETENTION_INFRASTRUCTURE_FAILURE_CATEGORIES,
  ] as const);

export type CreationReliabilityMode = "flexible" | "precise";

export const CREATION_RELIABILITY_MODE_DEFAULT: CreationReliabilityMode =
  "flexible";
