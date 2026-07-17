/**
 * Ephemeral Retention terminal Hook authority types — Sprint 10F.2A.
 * Runtime-only evidence. Never persist in briefs, diagnostics, or client envelopes.
 */

import type {
  HookCandidate,
  HookPlan,
  HookValidationResult,
  NormalizedHookRequest,
} from "@/features/hook-engine/domain/hook-contract.types";

export interface RetentionTerminalHookAuthority {
  readonly request: NormalizedHookRequest;
  /** Actual active terminal Hook plan (original or compatibility fallback). */
  readonly activePlan: HookPlan;
  readonly approvedCandidate: HookCandidate;
  readonly openingClaimRefs: readonly string[];
  readonly validation: HookValidationResult;
}

/**
 * Canonical post-rewrite Hook evidence from actual Hook revalidation.
 * Must not be manufactured from Retention candidate + ledger alone.
 */
export interface RetentionPostRewriteHookEvidence {
  readonly rebuiltCandidate: HookCandidate;
  readonly validation: HookValidationResult;
}
