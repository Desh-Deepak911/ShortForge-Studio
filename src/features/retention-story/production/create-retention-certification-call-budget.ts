/**
 * Certification-only provider-call budget — story-quality Prompt 8.
 * Counts planner, composer, rewrite, and retry attempts before invocation.
 * Does not change normal production ledger ceilings.
 */

export const RETENTION_CERTIFICATION_CALL_BUDGET_VERSION =
  "certification-call-budget/1" as const;

export type RetentionCertificationCallKind =
  | "planner"
  | "composer"
  | "rewrite"
  | "retry";

export interface RetentionCertificationCallBudgetSnapshot {
  readonly version: typeof RETENTION_CERTIFICATION_CALL_BUDGET_VERSION;
  readonly maxInvocations: number;
  readonly used: number;
  readonly remaining: number;
  readonly counts: Readonly<Record<RetentionCertificationCallKind, number>>;
}

export interface RetentionCertificationCallBudget {
  readonly maxInvocations: number;
  beforeInvoke(
    kind: RetentionCertificationCallKind,
    options?: { readonly allowOverrun?: boolean },
  ): void;
  canStartOptionalCase(expectedCalls: number): boolean;
  snapshot(): RetentionCertificationCallBudgetSnapshot;
}

export const RETENTION_EXPECTED_PROVIDER_CALLS = Object.freeze({
  cheapInitial: 1,
  cheapWithTextualRepair: 2,
  balancedInitial: 2,
  balancedWithTextualRepair: 3,
  bestInitial: 2,
  bestWithTextualRepair: 3,
});

let boundCertificationBudget: RetentionCertificationCallBudget | null = null;

export function bindRetentionCertificationCallBudget(
  budget: RetentionCertificationCallBudget | null,
): void {
  boundCertificationBudget = budget;
}

export function mapRetentionProductionKindToCertificationCall(
  kind: string,
): RetentionCertificationCallKind {
  if (kind === "planner") return "planner";
  if (kind === "studio_rewrite" || kind === "retention_body_rewrite") {
    return "rewrite";
  }
  if (
    kind === "hook_repair" ||
    kind === "length_compression" ||
    kind === "hook_fallback"
  ) {
    return "retry";
  }
  return "composer";
}

export function noteRetentionCertificationProviderInvoke(kind: string): void {
  const budget = boundCertificationBudget;
  if (!budget) return;
  budget.beforeInvoke(mapRetentionProductionKindToCertificationCall(kind), {
    allowOverrun: true,
  });
}

export function createRetentionCertificationCallBudget(
  maxInvocations: number,
): RetentionCertificationCallBudget {
  const max = Math.max(0, Math.floor(maxInvocations));
  const counts: Record<RetentionCertificationCallKind, number> = {
    planner: 0,
    composer: 0,
    rewrite: 0,
    retry: 0,
  };
  let used = 0;

  return {
    maxInvocations: max,
    beforeInvoke(kind, options) {
      if (used >= max && options?.allowOverrun !== true) {
        throw new Error("certification_provider_budget_exhausted");
      }
      used += 1;
      counts[kind] += 1;
    },
    canStartOptionalCase(expectedCalls) {
      return used + Math.max(0, expectedCalls) <= max;
    },
    snapshot() {
      return Object.freeze({
        version: RETENTION_CERTIFICATION_CALL_BUDGET_VERSION,
        maxInvocations: max,
        used,
        remaining: Math.max(0, max - used),
        counts: Object.freeze({ ...counts }),
      });
    },
  };
}
