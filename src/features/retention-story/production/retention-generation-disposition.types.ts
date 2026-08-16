/**
 * Generation disposition + adaptation explainability — Sprint 10H.3.
 * Safe for creator-facing Review and JSON/NDJSON envelopes.
 */

export type RetentionGenerationDisposition =
  | "optimal"
  | "acceptable"
  | "fallback";

export type RetentionGenerationAdaptationId =
  | "planner_fallback_used"
  | "beat_plan_compacted"
  | "hook_style_reconciled"
  | "length_rescue_used"
  | "quality_below_target"
  | "unsupported_facts_omitted"
  | "creative_premise_used"
  | "deterministic_story_fallback_used"
  | "reliability_rescue_used"
  | "participant_coverage_reconciled";

export type RetentionFactHandlingMode =
  | "verified_facts_only"
  | "creative_premise";

export interface RetentionGenerationDispositionSummary {
  readonly disposition: RetentionGenerationDisposition;
  readonly adaptations: readonly RetentionGenerationAdaptationId[];
  readonly factHandlingMode: RetentionFactHandlingMode;
  readonly qualityBelowTarget: boolean;
  readonly approximateWordCount: number;
  readonly targetWordBudget: number;
  readonly resolvedBeatCount: number;
  readonly creatorFacingNotes: readonly string[];
  /** Safe acceptance/rejection provenance (enums/counts only). */
  readonly acceptanceTrace?: import("./retention-generation-acceptance-trace.types").RetentionGenerationAcceptanceTrace;
}

export function freezeDispositionSummary(
  summary: RetentionGenerationDispositionSummary,
): RetentionGenerationDispositionSummary {
  return Object.freeze({
    ...summary,
    adaptations: Object.freeze([...summary.adaptations]),
    creatorFacingNotes: Object.freeze([...summary.creatorFacingNotes]),
    ...(summary.acceptanceTrace
      ? { acceptanceTrace: summary.acceptanceTrace }
      : {}),
  });
}
