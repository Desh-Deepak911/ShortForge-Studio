/**
 * Sprint 11E Phase 2E.2D.8C — safe coverage-count attribution for job-create failures.
 * Counts and classifications only — never target IDs, slot keys, locators, digests.
 */

import type { HeadlessProvisionalStoredJobRecord } from "@/features/headless-renderer/control-plane";
import type { HeadlessStoreVersionDeltaClass } from "@/features/headless-renderer/control-plane/services/promotion-attribution";
import {
  stagingTargetsPresent,
} from "@/features/headless-renderer/control-plane/services/provisional-verification-targets";

export const COVERAGE_RECONCILE_RESULT_KINDS = Object.freeze([
  "applied",
  "already_complete",
  "blocked_incomplete",
  "not_finalized",
  "reconcile_error",
  "terminal_incomplete",
  "cas_stale",
  "hostile_input",
] as const);

export type CoverageReconcileResultKind =
  (typeof COVERAGE_RECONCILE_RESULT_KINDS)[number];

export const DUPLICATE_EXTRA_TARGET_CLASSES = Object.freeze([
  "none",
  "duplicate_required",
  "extra_non_required",
] as const);

export type DuplicateExtraTargetClassification =
  (typeof DUPLICATE_EXTRA_TARGET_CLASSES)[number];

export type FlyRenderLiveCoverageAttributionSnapshot = {
  readonly requiredTargetCount: number;
  readonly stagedReferenceCount: number;
  readonly finalizedOwnedObjectCount: number;
  readonly verifiedTargetCountBefore: number;
  readonly verifiedTargetCountAfter: number;
  readonly missingTargetCount: number;
  readonly duplicateExtraClassification: DuplicateExtraTargetClassification;
  readonly reconcileResultKind: CoverageReconcileResultKind;
  readonly storeVersionDelta?: HeadlessStoreVersionDeltaClass;
  readonly finalCoverageComplete: boolean;
  readonly intermediateBlockedIncomplete: boolean;
};

const RESULT_KIND_SET = new Set<string>(COVERAGE_RECONCILE_RESULT_KINDS);
const DUPLICATE_SET = new Set<string>(DUPLICATE_EXTRA_TARGET_CLASSES);

export function classifyStoreVersionDelta(
  before: number,
  after: number,
): HeadlessStoreVersionDeltaClass {
  if (after === before) return "unchanged";
  if (after === before + 1) return "plus_one";
  return "unexpected";
}

export function classifyDuplicateExtraTargets(input: {
  readonly requiredTargetCount: number;
  readonly stagedReferenceCount: number;
  readonly stagedTargetCount: number;
}): DuplicateExtraTargetClassification {
  if (input.stagedReferenceCount > input.requiredTargetCount) {
    return "extra_non_required";
  }
  if (input.stagedTargetCount < input.stagedReferenceCount) {
    return "duplicate_required";
  }
  return "none";
}

export function buildCoverageAttributionSnapshot(input: {
  readonly provisional: HeadlessProvisionalStoredJobRecord;
  readonly finalizedOwnedObjectCount: number;
  readonly verifiedTargetCountBefore: number;
  readonly verifiedTargetCountAfter: number;
  readonly reconcileResultKind: CoverageReconcileResultKind;
  readonly storeVersionBefore?: number;
  readonly storeVersionAfter?: number;
  readonly intermediateBlockedIncomplete?: boolean;
}): FlyRenderLiveCoverageAttributionSnapshot {
  const requiredTargetCount =
    input.provisional.verificationCoverage.requiredTargets.length;
  const stagedReferenceCount = input.provisional.stagingObjectRefs.length;
  const stagedTargetCount = stagingTargetsPresent(
    input.provisional.stagingObjectRefs,
  ).size;
  const verifiedAfter = input.verifiedTargetCountAfter;
  const missingTargetCount = Math.max(0, requiredTargetCount - verifiedAfter);
  const delta =
    input.storeVersionBefore != null && input.storeVersionAfter != null
      ? classifyStoreVersionDelta(
          input.storeVersionBefore,
          input.storeVersionAfter,
        )
      : undefined;

  return Object.freeze({
    requiredTargetCount,
    stagedReferenceCount,
    finalizedOwnedObjectCount: input.finalizedOwnedObjectCount,
    verifiedTargetCountBefore: input.verifiedTargetCountBefore,
    verifiedTargetCountAfter: verifiedAfter,
    missingTargetCount,
    duplicateExtraClassification: classifyDuplicateExtraTargets({
      requiredTargetCount,
      stagedReferenceCount,
      stagedTargetCount,
    }),
    reconcileResultKind: input.reconcileResultKind,
    ...(delta != null ? { storeVersionDelta: delta } : {}),
    finalCoverageComplete: input.provisional.verificationCoverage.complete,
    intermediateBlockedIncomplete: input.intermediateBlockedIncomplete === true,
  });
}

export function sanitizeCoverageAttributionSnapshot(
  value: unknown,
): FlyRenderLiveCoverageAttributionSnapshot | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (
    typeof v.requiredTargetCount !== "number" ||
    typeof v.stagedReferenceCount !== "number" ||
    typeof v.finalizedOwnedObjectCount !== "number" ||
    typeof v.verifiedTargetCountBefore !== "number" ||
    typeof v.verifiedTargetCountAfter !== "number" ||
    typeof v.missingTargetCount !== "number" ||
    typeof v.finalCoverageComplete !== "boolean" ||
    typeof v.intermediateBlockedIncomplete !== "boolean"
  ) {
    return undefined;
  }
  if (
    !DUPLICATE_SET.has(String(v.duplicateExtraClassification)) ||
    !RESULT_KIND_SET.has(String(v.reconcileResultKind))
  ) {
    return undefined;
  }
  const delta = v.storeVersionDelta;
  if (
    delta != null &&
    delta !== "unchanged" &&
    delta !== "plus_one" &&
    delta !== "unexpected"
  ) {
    return undefined;
  }
  return Object.freeze({
    requiredTargetCount: v.requiredTargetCount,
    stagedReferenceCount: v.stagedReferenceCount,
    finalizedOwnedObjectCount: v.finalizedOwnedObjectCount,
    verifiedTargetCountBefore: v.verifiedTargetCountBefore,
    verifiedTargetCountAfter: v.verifiedTargetCountAfter,
    missingTargetCount: v.missingTargetCount,
    duplicateExtraClassification:
      v.duplicateExtraClassification as DuplicateExtraTargetClassification,
    reconcileResultKind: v.reconcileResultKind as CoverageReconcileResultKind,
    ...(delta != null
      ? { storeVersionDelta: delta as HeadlessStoreVersionDeltaClass }
      : {}),
    finalCoverageComplete: v.finalCoverageComplete,
    intermediateBlockedIncomplete: v.intermediateBlockedIncomplete,
  });
}
