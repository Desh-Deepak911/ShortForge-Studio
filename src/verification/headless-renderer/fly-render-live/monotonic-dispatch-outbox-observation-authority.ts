/**
 * Sprint 11E Phase 2E.2D.8D — Monotonic dispatch-outbox observation authority.
 * Intent existence may be observed in pending | claimed | dispatched when the
 * row is exactly coherent with the promoted canonical job identity.
 */

import { stableHeadlessDeliveryId } from "@/features/headless-renderer/control-plane/services/stable-delivery-id";
import {
  validateHeadlessStoredRenderDispatchOutbox,
} from "@/features/headless-renderer/control-plane/services/validate-render-dispatch-outbox";
import type {
  HeadlessRenderDispatchOutboxState,
  HeadlessStoredRenderDispatchOutbox,
} from "@/features/headless-renderer/control-plane/types/render-dispatch-outbox";
import {
  isCanonicalStoredJobRecord,
  type HeadlessCanonicalStoredJobRecord,
} from "@/features/headless-renderer/control-plane/types/stored-job-record";

export const MONOTONIC_DISPATCH_OUTBOX_INTENT_STATES = Object.freeze([
  "pending",
  "claimed",
  "dispatched",
] as const);

export type MonotonicDispatchOutboxIntentState =
  (typeof MONOTONIC_DISPATCH_OUTBOX_INTENT_STATES)[number];

export const MONOTONIC_DISPATCH_OUTBOX_TRANSITION_CLASSES = Object.freeze([
  "unchanged",
  "pending_to_claimed",
  "pending_to_dispatched",
  "claimed_to_dispatched",
] as const);

export type MonotonicDispatchOutboxTransitionClass =
  (typeof MONOTONIC_DISPATCH_OUTBOX_TRANSITION_CLASSES)[number];

export const MONOTONIC_DISPATCH_OUTBOX_OBSERVATION_FAIL_CLASSES = Object.freeze([
  "missing_row",
  "identity_incoherent",
  "forged_row",
  "rejected_state",
  "unknown_state",
  "malformed_claim_pairing",
  "timestamp_order_invalid",
  "store_version_regression",
  "state_regression",
  "hostile_input",
] as const);

export type MonotonicDispatchOutboxObservationFailClass =
  (typeof MONOTONIC_DISPATCH_OUTBOX_OBSERVATION_FAIL_CLASSES)[number];

const INTENT_STATE_SET = new Set<string>(MONOTONIC_DISPATCH_OUTBOX_INTENT_STATES);

const STATE_RANK: Readonly<Record<MonotonicDispatchOutboxIntentState, number>> =
  Object.freeze({
    pending: 0,
    claimed: 1,
    dispatched: 2,
  });

function isIntentState(
  state: HeadlessRenderDispatchOutboxState,
): state is MonotonicDispatchOutboxIntentState {
  return INTENT_STATE_SET.has(state);
}

export function classifyDispatchOutboxIdentityCoherence(input: {
  readonly row: HeadlessStoredRenderDispatchOutbox;
  readonly job: HeadlessCanonicalStoredJobRecord;
  readonly expectedOperationId?: string | null;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly failClass: MonotonicDispatchOutboxObservationFailClass;
    } {
  try {
    const { row, job } = input;
    const expectedDeliveryId = stableHeadlessDeliveryId(
      job.jobId,
      job.canonicalJob.attempt,
    );
    if (
      row.intent.jobId !== job.jobId ||
      row.intent.ownerId !== job.ownerId ||
      row.intent.projectId !== job.projectId ||
      row.intent.attempt !== job.canonicalJob.attempt ||
      row.intent.deliveryId !== expectedDeliveryId ||
      row.intent.dispatchId !== expectedDeliveryId
    ) {
      return { ok: false, failClass: "identity_incoherent" };
    }
    if (
      input.expectedOperationId != null &&
      job.operationId !== input.expectedOperationId
    ) {
      return { ok: false, failClass: "identity_incoherent" };
    }
    return { ok: true };
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}

export function validateDispatchOutboxRecordTimestampOrder(
  row: HeadlessStoredRenderDispatchOutbox,
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly failClass: MonotonicDispatchOutboxObservationFailClass;
    } {
  try {
    const created = row.intent.createdAtMs;
    const updated = row.updatedAtMs;
    if (created > updated) {
      return { ok: false, failClass: "timestamp_order_invalid" };
    }
    if (row.state === "claimed") {
      if (
        row.claimedAtMs == null ||
        row.claimToken == null ||
        row.claimedAtMs < created ||
        row.claimedAtMs > updated
      ) {
        return { ok: false, failClass: "malformed_claim_pairing" };
      }
    }
    if (row.state === "dispatched") {
      if (
        row.dispatchedAtMs == null ||
        row.dispatchedAtMs < created ||
        row.claimToken != null ||
        row.claimedAtMs != null
      ) {
        return { ok: false, failClass: "timestamp_order_invalid" };
      }
    }
    if (row.state === "pending") {
      if (
        row.claimToken != null ||
        row.claimedAtMs != null ||
        row.dispatchedAtMs != null
      ) {
        return { ok: false, failClass: "malformed_claim_pairing" };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}

export function classifyMonotonicDispatchOutboxIntentObservation(input: {
  readonly row: HeadlessStoredRenderDispatchOutbox | null | undefined;
  readonly job: HeadlessCanonicalStoredJobRecord;
  readonly expectedOperationId?: string | null;
}):
  | {
      readonly ok: true;
      readonly observedState: MonotonicDispatchOutboxIntentState;
      readonly storeVersion: number;
    }
  | {
      readonly ok: false;
      readonly failClass: MonotonicDispatchOutboxObservationFailClass;
    } {
  try {
    if (input.row == null) {
      return { ok: false, failClass: "missing_row" };
    }
    const validated = validateHeadlessStoredRenderDispatchOutbox(input.row);
    if (!validated.ok) {
      return { ok: false, failClass: "forged_row" };
    }
    const row = validated.record;
    if (row.state === "rejected") {
      return { ok: false, failClass: "rejected_state" };
    }
    if (!isIntentState(row.state)) {
      return { ok: false, failClass: "unknown_state" };
    }
    const identity = classifyDispatchOutboxIdentityCoherence({
      row,
      job: input.job,
      expectedOperationId: input.expectedOperationId,
    });
    if (!identity.ok) return identity;
    const timestamps = validateDispatchOutboxRecordTimestampOrder(row);
    if (!timestamps.ok) return timestamps;
    return {
      ok: true,
      observedState: row.state,
      storeVersion: row.storeVersion,
    };
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}

export function classifyMonotonicDispatchOutboxTransition(input: {
  readonly firstState: MonotonicDispatchOutboxIntentState;
  readonly rereadState: MonotonicDispatchOutboxIntentState;
  readonly firstStoreVersion: number;
  readonly rereadStoreVersion: number;
}):
  | {
      readonly ok: true;
      readonly transitionClass: MonotonicDispatchOutboxTransitionClass;
    }
  | {
      readonly ok: false;
      readonly failClass: MonotonicDispatchOutboxObservationFailClass;
    } {
  try {
    const firstRank = STATE_RANK[input.firstState];
    const rereadRank = STATE_RANK[input.rereadState];
    if (rereadRank < firstRank) {
      return { ok: false, failClass: "state_regression" };
    }
    if (
      rereadRank > firstRank &&
      input.rereadStoreVersion < input.firstStoreVersion
    ) {
      return { ok: false, failClass: "store_version_regression" };
    }
    if (
      rereadRank === firstRank &&
      input.rereadStoreVersion < input.firstStoreVersion
    ) {
      return { ok: false, failClass: "store_version_regression" };
    }
    if (input.firstState === input.rereadState) {
      return { ok: true, transitionClass: "unchanged" };
    }
    if (input.firstState === "pending" && input.rereadState === "claimed") {
      return { ok: true, transitionClass: "pending_to_claimed" };
    }
    if (input.firstState === "pending" && input.rereadState === "dispatched") {
      return { ok: true, transitionClass: "pending_to_dispatched" };
    }
    if (input.firstState === "claimed" && input.rereadState === "dispatched") {
      return { ok: true, transitionClass: "claimed_to_dispatched" };
    }
    return { ok: false, failClass: "state_regression" };
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}

export function classifyMonotonicDispatchOutboxDispatchedCompletion(input: {
  readonly row: HeadlessStoredRenderDispatchOutbox | null | undefined;
  readonly job: HeadlessCanonicalStoredJobRecord;
  readonly anchorAttempt: number;
  readonly anchorFirstStoreVersion: number;
  readonly expectedOperationId?: string | null;
}):
  | { readonly ok: true; readonly storeVersion: number }
  | {
      readonly ok: false;
      readonly failClass: MonotonicDispatchOutboxObservationFailClass;
    } {
  try {
    if (input.row == null) {
      return { ok: false, failClass: "missing_row" };
    }
    const validated = validateHeadlessStoredRenderDispatchOutbox(input.row);
    if (!validated.ok) {
      return { ok: false, failClass: "forged_row" };
    }
    const row = validated.record;
    if (row.state !== "dispatched") {
      return { ok: false, failClass: "rejected_state" };
    }
    if (row.intent.attempt !== input.anchorAttempt) {
      return { ok: false, failClass: "identity_incoherent" };
    }
    if (row.storeVersion < input.anchorFirstStoreVersion) {
      return { ok: false, failClass: "store_version_regression" };
    }
    const identity = classifyDispatchOutboxIdentityCoherence({
      row,
      job: input.job,
      expectedOperationId: input.expectedOperationId,
    });
    if (!identity.ok) return identity;
    const timestamps = validateDispatchOutboxRecordTimestampOrder(row);
    if (!timestamps.ok) return timestamps;
    return { ok: true, storeVersion: row.storeVersion };
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}

export function assertCanonicalJobForDispatchOutboxObservation(
  job: unknown,
):
  | { readonly ok: true; readonly record: HeadlessCanonicalStoredJobRecord }
  | {
      readonly ok: false;
      readonly failClass: MonotonicDispatchOutboxObservationFailClass;
    } {
  try {
    if (!isCanonicalStoredJobRecord(job as never)) {
      return { ok: false, failClass: "identity_incoherent" };
    }
    return { ok: true, record: job as HeadlessCanonicalStoredJobRecord };
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}
