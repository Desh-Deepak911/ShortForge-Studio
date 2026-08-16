/**
 * Retention ↔ Hook bridge result types — Sprint 10E / 10F.2A / 10F.3.
 */

import type {
  HookDiagnostics,
  HookPlanSnapshot,
} from "@/features/hook-engine";

import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionModelCallLedgerSnapshot } from "../budget/retention-model-call-budget.types";
import type { RetentionSafeProviderFailure } from "../domain/retention-provider-failure.types";
import type { RetentionStoryErrorReason } from "../domain/retention-story-errors";
import type {
  RetentionPostRewriteHookEvidence,
  RetentionTerminalHookAuthority,
} from "../rewrite/retention-terminal-hook-authority.types";

export type RetentionHookBridgeFailureReason =
  | Extract<
      RetentionStoryErrorReason,
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
      | "hook_terminal_failure"
      | "strategy_not_applicable"
      | "retention_story_plan_mismatch"
      | "strategy_seed_mismatch"
    >
  | "scenes_only"
  | "accepted_narration_mapping_failed";

/**
 * Which composition event owns the active candidate — Sprint 10H.3B.
 * `model_initial` = ordinary successful model composition.
 * `deterministic_rescue` = zero-cost deterministic narration rescue.
 */
export type RetentionCompositionAuthority =
  | "model_initial"
  | "deterministic_rescue";

export interface RetentionHookBridgeDiagnostics {
  readonly qualityMode: string;
  readonly plannerAttempts: number;
  readonly composerAttempts: number;
  readonly hookAdapterRan: boolean;
  readonly budget: RetentionModelCallLedgerSnapshot;
  readonly outcome:
    | "hook_approved"
    | "failed"
    | "skipped_scenes_only";
  readonly planFingerprint?: string;
  readonly candidateFingerprint?: string;
  /**
   * Required on ready bridges. Bind active candidate to model vs deterministic
   * composition authority (Sprint 10H.3B).
   */
  readonly compositionAuthority?: RetentionCompositionAuthority;
  /** Prompt 10 — internal bounded rewrite type. Not a top-level authority. */
  readonly boundedRewriteType?:
    | "opening_repair"
    | "ranking_payoff_repair"
    | "supported_opening_promotion"
    | "duration_compression";
}

export type RetentionHookBridgeResult =
  | {
      readonly status: "ready";
      readonly title: string;
      readonly approvedNarration: string;
      readonly candidate: RetentionNarrationCandidate;
      readonly diagnostics: RetentionHookBridgeDiagnostics;
      /** Safe Hook plan snapshot for JSON/NDJSON response compatibility. */
      readonly hookPlanSnapshot: HookPlanSnapshot;
      /** Safe Hook diagnostics for JSON/NDJSON response compatibility. */
      readonly hookDiagnostics: HookDiagnostics;
      readonly lengthWarning?: string;
      /**
       * Ephemeral runtime-only Hook terminal authority.
       * Never persist in briefs, diagnostics, or client envelopes.
       */
      readonly terminalHookAuthority: RetentionTerminalHookAuthority;
      /**
       * Present only after post-rewrite Hook revalidation.
       * Pre-rewrite ready bridges must omit this field.
       */
      readonly postRewriteHookEvidence?: RetentionPostRewriteHookEvidence;
    }
  | {
      readonly status: "skipped";
      readonly reason: "scenes_only";
      readonly diagnostics: RetentionHookBridgeDiagnostics;
    }
  | {
      readonly status: "failed";
      readonly reason: RetentionHookBridgeFailureReason;
      readonly normalizeSeam?: string;
      readonly safeProviderFailure?: RetentionSafeProviderFailure;
      readonly diagnostics: RetentionHookBridgeDiagnostics;
      readonly hookPlanSnapshot?: HookPlanSnapshot;
      readonly hookDiagnostics?: HookDiagnostics;
      /**
       * Present when model composition succeeded but Hook preference/terminal
       * approval failed — enables zero-model Auto reconciliation (10H.3B).
       */
      readonly composedCandidate?: RetentionNarrationCandidate;
      readonly composedTitle?: string;
    };
