/**
 * Path-global Retention model-call ledger — Sprint 10E / 10E.1.
 *
 * One ledger instance per complete generation attempt.
 * Consume before invoking a model. Failed/empty/malformed calls still consume.
 * Deterministic opening replacement costs zero and cannot close a model attempt.
 * Snapshots never include prompts, responses, or private content.
 */

import type { QualityMode } from "@/types/footiebitz";

import { RetentionStoryError } from "../domain/retention-story-errors";
import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import { resolveRetentionModelCallBudgetPolicy } from "./retention-model-call-budget.policy";
import type {
  RetentionModelCallBudgetPolicy,
  RetentionModelCallCategory,
  RetentionModelCallLedgerCounts,
  RetentionModelCallLedgerEvent,
  RetentionModelCallLedgerSnapshot,
  RetentionModelCallOutcome,
} from "./retention-model-call-budget.types";

const TERMINAL_OUTCOMES: ReadonlySet<RetentionModelCallOutcome> = new Set([
  "succeeded",
  "failed",
  "rejected",
  "empty",
  "malformed",
]);

function emptyCounts(): RetentionModelCallLedgerCounts {
  return Object.freeze({
    planner: 0,
    initial_narration: 0,
    length_compression: 0,
    hook_repair: 0,
    hook_fallback: 0,
    retention_body_rewrite: 0,
    total: 0,
  });
}

function maxForCategory(
  policy: RetentionModelCallBudgetPolicy,
  category: RetentionModelCallCategory,
): number {
  switch (category) {
    case "planner":
      return policy.maxPlanner;
    case "initial_narration":
      return policy.maxInitialNarration;
    case "length_compression":
      return policy.maxLengthCompression;
    case "hook_repair":
      return policy.maxHookRepair;
    case "hook_fallback":
      return policy.maxHookFallback;
    case "retention_body_rewrite":
      return policy.maxRetentionBodyRewrite;
    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      return 0;
    }
  }
}

function remainingCounts(
  policy: RetentionModelCallBudgetPolicy,
  counts: RetentionModelCallLedgerCounts,
): RetentionModelCallLedgerCounts {
  return Object.freeze({
    planner: Math.max(0, policy.maxPlanner - counts.planner),
    initial_narration: Math.max(
      0,
      policy.maxInitialNarration - counts.initial_narration,
    ),
    length_compression: Math.max(
      0,
      policy.maxLengthCompression - counts.length_compression,
    ),
    hook_repair: Math.max(0, policy.maxHookRepair - counts.hook_repair),
    hook_fallback: Math.max(0, policy.maxHookFallback - counts.hook_fallback),
    retention_body_rewrite: Math.max(
      0,
      policy.maxRetentionBodyRewrite - counts.retention_body_rewrite,
    ),
    total: Math.max(0, policy.totalCeiling - counts.total),
  });
}

function throwLedgerInvalid(message: string): never {
  throw new RetentionStoryError("model_call_ledger_invalid", message);
}

export interface RetentionModelCallLedger {
  readonly policy: RetentionModelCallBudgetPolicy;
  /** Consume one attempt for `category` before the model call. Throws if exhausted. */
  consume(category: RetentionModelCallCategory): void;
  /** Close the pending attempt with a terminal outcome (does not restore budget). */
  recordOutcome(
    category: RetentionModelCallCategory,
    outcome: RetentionModelCallOutcome,
  ): void;
  /** True when another consume for this category would fail. */
  canConsume(category: RetentionModelCallCategory): boolean;
  /** Deep-frozen diagnostic snapshot (counts/outcomes only). */
  snapshot(): RetentionModelCallLedgerSnapshot;
}

/**
 * Create an isolated ledger for one generation attempt.
 */
export function createRetentionModelCallLedger(
  qualityMode: QualityMode | "scenes_only",
): RetentionModelCallLedger {
  const policy = resolveRetentionModelCallBudgetPolicy(qualityMode);
  const counts: {
    planner: number;
    initial_narration: number;
    length_compression: number;
    hook_repair: number;
    hook_fallback: number;
    retention_body_rewrite: number;
    total: number;
  } = {
    planner: 0,
    initial_narration: 0,
    length_compression: 0,
    hook_repair: 0,
    hook_fallback: 0,
    retention_body_rewrite: 0,
    total: 0,
  };
  const events: RetentionModelCallLedgerEvent[] = [];
  let sequence = 0;
  let pending: {
    readonly category: RetentionModelCallCategory;
    readonly sequence: number;
  } | null = null;

  function freezeCounts(): RetentionModelCallLedgerCounts {
    return Object.freeze({ ...counts });
  }

  function canConsume(category: RetentionModelCallCategory): boolean {
    if (pending != null) return false;
    if (counts.total >= policy.totalCeiling) return false;
    return counts[category] < maxForCategory(policy, category);
  }

  function consume(category: RetentionModelCallCategory): void {
    if (pending != null) {
      throwLedgerInvalid(
        "Retention model-call ledger already has a pending attempt.",
      );
    }
    if (counts.total >= policy.totalCeiling) {
      throw new RetentionStoryError(
        "model_call_budget_exhausted",
        "Retention model-call budget is exhausted for this generation attempt.",
      );
    }
    if (counts[category] >= maxForCategory(policy, category)) {
      throw new RetentionStoryError(
        "model_call_budget_exhausted",
        "Retention model-call budget is exhausted for this generation attempt.",
      );
    }
    counts[category] += 1;
    counts.total += 1;
    sequence += 1;
    pending = Object.freeze({ category, sequence });
    events.push(
      Object.freeze({
        category,
        outcome: "attempted" as const,
        sequence,
      }),
    );
  }

  function recordOutcome(
    category: RetentionModelCallCategory,
    outcome: RetentionModelCallOutcome,
  ): void {
    if (outcome === "skipped_deterministic") {
      if (pending != null) {
        throwLedgerInvalid(
          "Deterministic opening marker cannot close a pending model attempt.",
        );
      }
      sequence += 1;
      events.push(Object.freeze({ category, outcome, sequence }));
      return;
    }

    if (outcome === "attempted") {
      throwLedgerInvalid(
        "Retention model-call ledger cannot record attempted as a terminal outcome.",
      );
    }

    if (!TERMINAL_OUTCOMES.has(outcome)) {
      throwLedgerInvalid(
        "Retention model-call ledger received an unknown outcome.",
      );
    }

    if (pending == null) {
      throwLedgerInvalid(
        "Retention model-call ledger has no pending attempt to close.",
      );
    }
    if (pending.category !== category) {
      throwLedgerInvalid(
        "Retention model-call ledger outcome category does not match the pending attempt.",
      );
    }

    pending = null;
    sequence += 1;
    events.push(Object.freeze({ category, outcome, sequence }));
  }

  function snapshot(): RetentionModelCallLedgerSnapshot {
    const frozenCounts = freezeCounts();
    const snap: RetentionModelCallLedgerSnapshot = {
      version: 1,
      qualityMode: policy.qualityMode,
      policy,
      counts: frozenCounts,
      remaining: remainingCounts(policy, frozenCounts),
      events: Object.freeze(events.map((e) => Object.freeze({ ...e }))),
      exhausted: frozenCounts.total >= policy.totalCeiling,
    };
    return deepFreezeSnapshot(snap);
  }

  return Object.freeze({
    policy,
    consume,
    recordOutcome,
    canConsume,
    snapshot,
  });
}

function deepFreezeSnapshot(
  value: RetentionModelCallLedgerSnapshot,
): RetentionModelCallLedgerSnapshot {
  Object.freeze(value.policy);
  Object.freeze(value.counts);
  Object.freeze(value.remaining);
  Object.freeze(value.events);
  for (const event of value.events) Object.freeze(event);
  return Object.freeze(value);
}

/** Zero-cost marker for deterministic compatibility opening replacement. */
export function recordDeterministicOpeningReplacement(
  ledger: RetentionModelCallLedger,
): void {
  ledger.recordOutcome("hook_fallback", "skipped_deterministic");
}

/**
 * Zero-cost marker for deterministic narration rescue — Sprint 10H.3A.
 * Does not consume model-call budget; must not close a pending model attempt.
 */
export function recordDeterministicNarrationRescue(
  ledger: RetentionModelCallLedger,
): void {
  ledger.recordOutcome("initial_narration", "skipped_deterministic");
}

export function emptyRetentionModelCallLedgerCounts(): RetentionModelCallLedgerCounts {
  return emptyCounts();
}

/**
 * Require ledger policy qualityMode to match the active contract generation path /
 * quality mode before any planning or composition work.
 */
export function assertRetentionLedgerMatchesContract(
  ledger: RetentionModelCallLedger,
  contract: NormalizedStoryContract,
): void {
  const expected: QualityMode | "scenes_only" =
    contract.generationPath === "scenes_only"
      ? "scenes_only"
      : contract.qualityMode;
  if (ledger.policy.qualityMode !== expected) {
    throw new RetentionStoryError(
      "model_call_ledger_invalid",
      "Retention model-call ledger policy does not match the active contract.",
    );
  }
}
