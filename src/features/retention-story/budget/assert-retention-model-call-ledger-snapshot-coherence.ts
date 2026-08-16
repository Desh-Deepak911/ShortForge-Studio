/**
 * Canonical Retention model-call ledger snapshot coherence — Sprint 10F.1A.
 * Single owner for snapshot structure, counts, remaining, exhaustion, and events.
 */

import type { QualityMode } from "@/types/footiebitz";

import { RetentionStoryError } from "../domain/retention-story-errors";
import { retentionStableStringify } from "../domain/retention-story-fingerprint";
import { resolveRetentionModelCallBudgetPolicy } from "./retention-model-call-budget.policy";
import type {
  RetentionModelCallBudgetPolicy,
  RetentionModelCallCategory,
  RetentionModelCallLedgerCounts,
  RetentionModelCallLedgerEvent,
  RetentionModelCallLedgerSnapshot,
  RetentionModelCallOutcome,
} from "./retention-model-call-budget.types";

const SNAPSHOT_KEYS = Object.freeze([
  "version",
  "qualityMode",
  "policy",
  "counts",
  "remaining",
  "events",
  "exhausted",
] as const);

const POLICY_KEYS = Object.freeze([
  "qualityMode",
  "maxPlanner",
  "maxInitialNarration",
  "maxLengthCompression",
  "maxHookRepair",
  "maxHookFallback",
  "maxRetentionBodyRewrite",
  "totalCeiling",
] as const);

const COUNT_KEYS = Object.freeze([
  "planner",
  "initial_narration",
  "length_compression",
  "hook_repair",
  "hook_fallback",
  "retention_body_rewrite",
  "total",
] as const);

const EVENT_KEYS = Object.freeze(["category", "outcome", "sequence"] as const);

const CATEGORIES = Object.freeze([
  "planner",
  "initial_narration",
  "length_compression",
  "hook_repair",
  "hook_fallback",
  "retention_body_rewrite",
] as const satisfies readonly RetentionModelCallCategory[]);

const OUTCOMES = Object.freeze([
  "attempted",
  "succeeded",
  "failed",
  "rejected",
  "empty",
  "malformed",
  "skipped_deterministic",
] as const satisfies readonly RetentionModelCallOutcome[]);

const TERMINAL_OUTCOMES = Object.freeze([
  "succeeded",
  "failed",
  "rejected",
  "empty",
  "malformed",
] as const satisfies readonly RetentionModelCallOutcome[]);

export interface AssertRetentionModelCallLedgerSnapshotOptions {
  /** Ready terminal paths must have no pending attempt. */
  readonly requireClosed?: boolean;
  /** Ready narration path: exactly one successful initial_narration attempt. */
  readonly requireSuccessfulInitialNarration?: boolean;
  /** Pre-rewrite validation boundary: rewrite count must be zero. */
  readonly requireZeroRetentionBodyRewrite?: boolean;
  /** Post-rewrite terminal boundary: exactly one successful rewrite attempt. */
  readonly requireSuccessfulRetentionBodyRewrite?: boolean;
}

function throwInvalid(message = "Retention model-call ledger snapshot is invalid."): never {
  throw new RetentionStoryError("model_call_ledger_invalid", message);
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function assertExactKeys(
  value: object,
  allowed: readonly string[],
): void {
  const keys = Object.keys(value);
  if (keys.length !== allowed.length) throwInvalid();
  const allowedSet = new Set(allowed);
  for (const key of keys) {
    if (!allowedSet.has(key)) throwInvalid();
  }
  for (const key of allowed) {
    if (!(key in value)) throwInvalid();
  }
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

function emptyAttemptCounts(): Record<RetentionModelCallCategory, number> {
  return {
    planner: 0,
    initial_narration: 0,
    length_compression: 0,
    hook_repair: 0,
    hook_fallback: 0,
    retention_body_rewrite: 0,
  };
}

function rebuildRemaining(
  policy: RetentionModelCallBudgetPolicy,
  counts: RetentionModelCallLedgerCounts,
): RetentionModelCallLedgerCounts {
  return Object.freeze({
    planner: policy.maxPlanner - counts.planner,
    initial_narration: policy.maxInitialNarration - counts.initial_narration,
    length_compression: policy.maxLengthCompression - counts.length_compression,
    hook_repair: policy.maxHookRepair - counts.hook_repair,
    hook_fallback: policy.maxHookFallback - counts.hook_fallback,
    retention_body_rewrite:
      policy.maxRetentionBodyRewrite - counts.retention_body_rewrite,
    total: policy.totalCeiling - counts.total,
  });
}

function deepFreezeSnapshot(
  snap: RetentionModelCallLedgerSnapshot,
): RetentionModelCallLedgerSnapshot {
  Object.freeze(snap.policy);
  Object.freeze(snap.counts);
  Object.freeze(snap.remaining);
  Object.freeze(snap.events);
  for (const event of snap.events) Object.freeze(event);
  return Object.freeze(snap);
}

/**
 * Validate exact runtime structure of a ledger snapshot and return a detached
 * deeply frozen canonical copy. Never trusts supplied remaining values.
 */
export function assertRetentionModelCallLedgerSnapshotCoherence(
  snapshot: unknown,
  expectedQualityMode: QualityMode | "scenes_only",
  options: AssertRetentionModelCallLedgerSnapshotOptions = {},
): RetentionModelCallLedgerSnapshot {
  if (snapshot == null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throwInvalid();
  }
  const record = snapshot as Record<string, unknown>;
  assertExactKeys(record, SNAPSHOT_KEYS);

  if (record.version !== 1) throwInvalid();
  if (record.qualityMode !== expectedQualityMode) throwInvalid();
  if (typeof record.exhausted !== "boolean") throwInvalid();

  if (
    record.policy == null ||
    typeof record.policy !== "object" ||
    Array.isArray(record.policy)
  ) {
    throwInvalid();
  }
  const policyRecord = record.policy as Record<string, unknown>;
  assertExactKeys(policyRecord, POLICY_KEYS);

  const expectedPolicy = resolveRetentionModelCallBudgetPolicy(expectedQualityMode);
  if (retentionStableStringify(policyRecord) !== retentionStableStringify(expectedPolicy)) {
    throwInvalid();
  }
  const policy = expectedPolicy;

  if (
    record.counts == null ||
    typeof record.counts !== "object" ||
    Array.isArray(record.counts)
  ) {
    throwInvalid();
  }
  const countsRecord = record.counts as Record<string, unknown>;
  assertExactKeys(countsRecord, COUNT_KEYS);

  if (
    record.remaining == null ||
    typeof record.remaining !== "object" ||
    Array.isArray(record.remaining)
  ) {
    throwInvalid();
  }
  const remainingRecord = record.remaining as Record<string, unknown>;
  assertExactKeys(remainingRecord, COUNT_KEYS);

  for (const key of COUNT_KEYS) {
    if (!isNonNegInt(countsRecord[key])) throwInvalid();
    if (!isNonNegInt(remainingRecord[key])) throwInvalid();
  }

  const counts: RetentionModelCallLedgerCounts = Object.freeze({
    planner: countsRecord.planner as number,
    initial_narration: countsRecord.initial_narration as number,
    length_compression: countsRecord.length_compression as number,
    hook_repair: countsRecord.hook_repair as number,
    hook_fallback: countsRecord.hook_fallback as number,
    retention_body_rewrite: countsRecord.retention_body_rewrite as number,
    total: countsRecord.total as number,
  });

  for (const category of CATEGORIES) {
    if (counts[category] > maxForCategory(policy, category)) throwInvalid();
  }

  const categorySum =
    counts.planner +
    counts.initial_narration +
    counts.length_compression +
    counts.hook_repair +
    counts.hook_fallback +
    counts.retention_body_rewrite;
  if (counts.total !== categorySum) throwInvalid();
  if (counts.total > policy.totalCeiling) throwInvalid();

  const expectedRemaining = rebuildRemaining(policy, counts);
  if (
    retentionStableStringify(remainingRecord) !==
    retentionStableStringify(expectedRemaining)
  ) {
    throwInvalid();
  }

  const expectedExhausted = counts.total >= policy.totalCeiling;
  if (record.exhausted !== expectedExhausted) throwInvalid();

  if (!Array.isArray(record.events)) throwInvalid();
  const eventsRaw = record.events as unknown[];
  const reconstructed = emptyAttemptCounts();
  let pending: RetentionModelCallCategory | null = null;
  let initialSucceeded = 0;
  let rewriteSucceeded = 0;
  const canonicalEvents: RetentionModelCallLedgerEvent[] = [];

  for (let i = 0; i < eventsRaw.length; i++) {
    const event = eventsRaw[i];
    if (event == null || typeof event !== "object" || Array.isArray(event)) {
      throwInvalid();
    }
    const eventRecord = event as Record<string, unknown>;
    assertExactKeys(eventRecord, EVENT_KEYS);

    const category = eventRecord.category;
    const outcome = eventRecord.outcome;
    const sequence = eventRecord.sequence;
    if (
      typeof category !== "string" ||
      !(CATEGORIES as readonly string[]).includes(category)
    ) {
      throwInvalid();
    }
    if (
      typeof outcome !== "string" ||
      !(OUTCOMES as readonly string[]).includes(outcome)
    ) {
      throwInvalid();
    }
    if (!isPositiveInt(sequence) || sequence !== i + 1) throwInvalid();

    if (outcome === "attempted") {
      if (pending != null) throwInvalid();
      pending = category as RetentionModelCallCategory;
      reconstructed[pending] += 1;
    } else if (outcome === "skipped_deterministic") {
      if (pending != null) throwInvalid();
      // Sprint 10H.3A — deterministic Hook opening (hook_fallback) or
      // deterministic narration rescue (initial_narration). Zero-cost.
      if (category !== "hook_fallback" && category !== "initial_narration") {
        throwInvalid();
      }
    } else if ((TERMINAL_OUTCOMES as readonly string[]).includes(outcome)) {
      if (pending == null) throwInvalid();
      if (pending !== category) throwInvalid();
      if (
        category === "initial_narration" &&
        outcome === "succeeded"
      ) {
        initialSucceeded += 1;
      }
      if (
        category === "retention_body_rewrite" &&
        outcome === "succeeded"
      ) {
        rewriteSucceeded += 1;
      }
      pending = null;
    } else {
      throwInvalid();
    }

    canonicalEvents.push(
      Object.freeze({
        category: category as RetentionModelCallCategory,
        outcome: outcome as RetentionModelCallOutcome,
        sequence,
      }),
    );
  }

  if (options.requireClosed && pending != null) throwInvalid();

  const reconstructedTotal =
    reconstructed.planner +
    reconstructed.initial_narration +
    reconstructed.length_compression +
    reconstructed.hook_repair +
    reconstructed.hook_fallback +
    reconstructed.retention_body_rewrite;

  for (const category of CATEGORIES) {
    if (counts[category] !== reconstructed[category]) throwInvalid();
  }
  if (counts.total !== reconstructedTotal) throwInvalid();

  if (options.requireZeroRetentionBodyRewrite) {
    if (counts.retention_body_rewrite !== 0) throwInvalid();
  }

  if (options.requireSuccessfulRetentionBodyRewrite) {
    if (
      reconstructed.retention_body_rewrite !== 1 ||
      rewriteSucceeded !== 1 ||
      counts.retention_body_rewrite !== 1
    ) {
      throwInvalid();
    }
  }

  if (
    options.requireZeroRetentionBodyRewrite &&
    options.requireSuccessfulRetentionBodyRewrite
  ) {
    throwInvalid();
  }

  if (options.requireSuccessfulInitialNarration) {
    // Sprint 10H.3B — at most one ordinary model success; at most one
    // deterministic narration rescue marker. Never accept two successful
    // initial model compositions (Hook preference must not recompose).
    let deterministicInitialRescueCount = 0;
    for (const event of canonicalEvents) {
      if (
        event.category === "initial_narration" &&
        event.outcome === "skipped_deterministic"
      ) {
        deterministicInitialRescueCount += 1;
      }
    }
    if (deterministicInitialRescueCount > 1) throwInvalid();
    if (initialSucceeded > 1) throwInvalid();
    let targetedRepairSuccesses = 0;
    for (const event of canonicalEvents) {
      if (
        (event.category === "hook_repair" ||
          event.category === "length_compression") &&
        event.outcome === "succeeded"
      ) {
        targetedRepairSuccesses += 1;
      }
    }
    if (deterministicInitialRescueCount === 1) {
      // Deterministic rescue owns the terminal candidate (optionally after
      // failed model attempts, or superseding one prior model success).
      if (reconstructed.initial_narration > 2) throwInvalid();
    } else if (
      (initialSucceeded !== 1 &&
        !(initialSucceeded === 0 && targetedRepairSuccesses === 1)) ||
      reconstructed.initial_narration < 1 ||
      reconstructed.initial_narration > 2
    ) {
      throwInvalid();
    }
  }

  const canonical: RetentionModelCallLedgerSnapshot = {
    version: 1,
    qualityMode: expectedQualityMode,
    policy: Object.freeze({ ...policy }),
    counts: Object.freeze({ ...counts }),
    remaining: expectedRemaining,
    events: Object.freeze(canonicalEvents),
    exhausted: expectedExhausted,
  };

  return deepFreezeSnapshot(canonical);
}
