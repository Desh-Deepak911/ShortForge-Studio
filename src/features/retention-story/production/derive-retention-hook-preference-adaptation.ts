/**
 * Canonical Hook preference disposition — Sprint 10H.5B.
 *
 * Derives hook_style_reconciled from final committed HookPlanSnapshot authority
 * vs the creator-requested authority captured before the first Hook bridge call.
 * Orchestration branch markers are not final authority.
 */

import type { HookStrategySource } from "@/features/hook-engine/domain/hook-contract.types";
import type { HookStyleSelection } from "@/features/hook-engine/presentation/hook-style-selection";
import { HOOK_USER_DIRECTED_STRATEGY_ID } from "@/features/hook-engine/domain/hook-contract.constants";

import type { CreationReliabilityMode } from "./retention-terminal-failure-taxonomy";

export const HOOK_STYLE_RECONCILED_CREATOR_NOTE =
  "Hook style was adjusted to a compatible opening." as const;

export type RetentionRequestedHookAuthority = {
  readonly selectedHookStyle: HookStyleSelection;
  readonly reliabilityMode: CreationReliabilityMode;
  readonly strategyId: string;
  readonly strategySource: HookStrategySource;
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
};

export type RetentionHookPlanAuthorityRef = {
  readonly strategyId: string;
  readonly strategySource: string;
  readonly requestFingerprint?: string;
  readonly planFingerprint?: string;
};

export type DeriveRetentionHookPreferenceAdaptationResult =
  | {
      readonly status: "ok";
      readonly adaptation: "hook_style_reconciled" | null;
    }
  | {
      readonly status: "fail";
      readonly safeReasonId:
        | "precise_mode_no_silent_hook_auto"
        | "user_authored_hook_authority_mismatch"
        | "hook_preference_authority_incoherent"
        | "hook_preference_disposition_incoherent";
    };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUserAuthoredAuthority(plan: RetentionHookPlanAuthorityRef): boolean {
  return (
    plan.strategyId === HOOK_USER_DIRECTED_STRATEGY_ID &&
    plan.strategySource === "user_authored"
  );
}

/**
 * Capture creator-requested Hook authority from the initial Hook context
 * before the first bridge call. Do not reconstruct from final diagnostics.
 */
export function captureRetentionRequestedHookAuthority(input: {
  readonly selectedHookStyle: HookStyleSelection | undefined;
  readonly reliabilityMode: CreationReliabilityMode;
  readonly initialHookContext: {
    readonly snapshot: {
      readonly strategyId: string;
      readonly strategySource: HookStrategySource;
      readonly requestFingerprint: string;
      readonly planFingerprint: string;
    };
  };
}): RetentionRequestedHookAuthority {
  const snap = input.initialHookContext.snapshot;
  return Object.freeze({
    selectedHookStyle: input.selectedHookStyle ?? "auto",
    reliabilityMode: input.reliabilityMode,
    strategyId: snap.strategyId,
    strategySource: snap.strategySource,
    requestFingerprint: snap.requestFingerprint,
    planFingerprint: snap.planFingerprint,
  });
}

/**
 * Compare original creator-requested explicit Hook authority to the final
 * committed HookPlanSnapshot. Auto never emits reconciliation for mere resolution.
 */
export function deriveRetentionHookPreferenceAdaptation(input: {
  readonly reliabilityMode: CreationReliabilityMode;
  readonly selectedHookStyle: HookStyleSelection | undefined;
  readonly requestedHookPlan: RetentionHookPlanAuthorityRef | null | undefined;
  readonly finalHookPlan: RetentionHookPlanAuthorityRef | null | undefined;
}): DeriveRetentionHookPreferenceAdaptationResult {
  const style = input.selectedHookStyle ?? "auto";
  const finalPlan = input.finalHookPlan;
  const requested = input.requestedHookPlan;

  if (
    finalPlan == null ||
    !isNonEmptyString(finalPlan.strategyId) ||
    !isNonEmptyString(finalPlan.strategySource)
  ) {
    return Object.freeze({
      status: "fail" as const,
      safeReasonId: "hook_preference_authority_incoherent",
    });
  }

  // Auto is not an explicit preference — never emit for mere Auto resolution.
  if (style === "auto") {
    return Object.freeze({ status: "ok" as const, adaptation: null });
  }

  if (
    requested == null ||
    !isNonEmptyString(requested.strategyId) ||
    !isNonEmptyString(requested.strategySource)
  ) {
    return Object.freeze({
      status: "fail" as const,
      safeReasonId: "hook_preference_authority_incoherent",
    });
  }

  const exact =
    requested.strategyId === finalPlan.strategyId &&
    requested.strategySource === finalPlan.strategySource;

  if (style === "user_written") {
    if (!isUserAuthoredAuthority(requested) || !isUserAuthoredAuthority(finalPlan) || !exact) {
      return Object.freeze({
        status: "fail" as const,
        safeReasonId: "user_authored_hook_authority_mismatch",
      });
    }
    return Object.freeze({ status: "ok" as const, adaptation: null });
  }

  // Explicit selectable Hook style
  if (input.reliabilityMode === "precise") {
    if (!exact) {
      return Object.freeze({
        status: "fail" as const,
        safeReasonId: "precise_mode_no_silent_hook_auto",
      });
    }
    return Object.freeze({ status: "ok" as const, adaptation: null });
  }

  // Flexible explicit: mismatch → reconcile; exact → silent success (no adaptation)
  if (exact) {
    return Object.freeze({ status: "ok" as const, adaptation: null });
  }
  return Object.freeze({
    status: "ok" as const,
    adaptation: "hook_style_reconciled",
  });
}

/**
 * Fail closed when disposition adaptations/notes disagree with canonical derive.
 */
export function assertRetentionHookPreferenceDispositionCoherence(input: {
  readonly derive: Extract<
    DeriveRetentionHookPreferenceAdaptationResult,
    { status: "ok" }
  >;
  readonly adaptations: readonly string[];
  readonly creatorFacingNotes?: readonly string[];
}): DeriveRetentionHookPreferenceAdaptationResult {
  const reconcileCount = input.adaptations.filter(
    (id) => id === "hook_style_reconciled",
  ).length;
  if (reconcileCount > 1) {
    return Object.freeze({
      status: "fail" as const,
      safeReasonId: "hook_preference_disposition_incoherent",
    });
  }
  const has = reconcileCount === 1;
  if (input.derive.adaptation === "hook_style_reconciled") {
    if (!has) {
      return Object.freeze({
        status: "fail" as const,
        safeReasonId: "hook_preference_disposition_incoherent",
      });
    }
    const notes = input.creatorFacingNotes ?? [];
    if (!notes.includes(HOOK_STYLE_RECONCILED_CREATOR_NOTE)) {
      return Object.freeze({
        status: "fail" as const,
        safeReasonId: "hook_preference_disposition_incoherent",
      });
    }
  } else if (has) {
    return Object.freeze({
      status: "fail" as const,
      safeReasonId: "hook_preference_disposition_incoherent",
    });
  }
  return input.derive;
}
