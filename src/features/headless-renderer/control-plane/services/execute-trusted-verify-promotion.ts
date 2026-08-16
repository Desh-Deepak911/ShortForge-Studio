/**
 * Provider-neutral trusted verify → coverage → promotion → render enqueue.
 *
 * Ordering (strict):
 *   claimed verification under existing dual-lease token
 *   → finalize owned object
 *   → reconcile provisional coverage
 *   → (if incomplete) stop — no promotion/enqueue
 *   → materialize canonical pair from finalized objects
 *   → atomic same-jobId promote to queued (+ pending dispatch outbox)
 *   → claim outbox → stable render XADD → mark dispatched
 *
 * Never enqueues from verifyAndFinalize itself.
 * Never acquires a second verification claim.
 * Broker failure after durable outbox → dispatch_pending (recoverable).
 * Post-XADD / pre-CAS uncertainty → dispatch_unconfirmed.
 */

import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessR2ObjectIOPort } from "../ports/r2-object-io.port";
import type { HeadlessStreamQueuePort } from "../ports/stream-queue.port";
import type { HeadlessStoredOwnedObject } from "../ports/owned-object-store.port";
import type { HeadlessRenderDispatchOutboxPort } from "../ports/render-dispatch-outbox.port";
import type { HeadlessWorkerWakePort } from "../ports/worker-wake.port";
import type { HeadlessQueueProviderId } from "../runtime/queue-provider";
import {
  isProvisionalStoredJobRecord,
  isCanonicalStoredJobRecord,
} from "../types/stored-job-record";
import { cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";
import { reconcileFinalizedOwnedObjectCoverage } from "./reconcile-finalized-owned-object-coverage";
import { materializeCanonicalFromFinalizedCoverage } from "./materialize-canonical-from-finalized-coverage";
import {
  verifyAndFinalizeR2OwnedObjectUnderClaim,
  type HeadlessVerifyFailureDisposition,
} from "./verify-r2-owned-object";
import { stableHeadlessDeliveryId } from "./stable-delivery-id";
import { dispatchRenderOutboxIntentOnce } from "./dispatch-render-outbox";
import { terminalizeProvisionalMaterializationRejection } from "./terminalize-provisional-materialization-rejection";

export type TrustedVerifyPromotionOutcomeKind =
  | "verified_waiting_for_coverage"
  | "promoted_and_enqueued"
  | "promoted_dispatch_pending"
  | "promoted_dispatch_unconfirmed"
  | "already_promoted_enqueued"
  | "already_promoted_dispatch_pending"
  | "already_promoted_dispatch_unconfirmed"
  | "verification_retryable"
  | "verification_terminal_rejected"
  | "verification_cleanup_pending"
  | "verification_stale"
  | "verification_unconfirmed"
  | "verification_aborted"
  | "promotion_rejected"
  | "materialization_rejected"
  | "aborted";

export type TrustedVerifyPromotionOutcome = {
  readonly kind: TrustedVerifyPromotionOutcomeKind;
  readonly jobId: string | null;
  readonly objectId: string;
  readonly attempt: number | null;
  readonly deliveryId: string | null;
  /** Bounded reason token — never secrets, locators, or provider errors. */
  readonly reasonId: string;
};

export type ExecuteTrustedVerifyPromotionInput = {
  readonly claimedObject: HeadlessStoredOwnedObject;
  readonly claimToken: string;
  readonly ownerId: string;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly io: HeadlessR2ObjectIOPort;
  /** Must support enqueueRender (TCP XADD or memory). */
  readonly streamQueue: Pick<HeadlessStreamQueuePort, "enqueueRender">;
  /** Durable render-dispatch outbox — required for promotion dispatch. */
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort;
  readonly deleteOnReject?: boolean;
  readonly queueProvider?: HeadlessQueueProviderId;
  readonly wake?: HeadlessWorkerWakePort;
};

async function dispatchAfterPromotion(input: {
  readonly alreadyPromoted: boolean;
  readonly jobId: string;
  readonly objectId: string;
  readonly ownerId: string;
  readonly attempt: number;
  readonly deliveryId: string;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
  readonly jobStore: HeadlessJobStorePort;
  readonly streamQueue: Pick<HeadlessStreamQueuePort, "enqueueRender">;
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort;
  readonly queueProvider?: HeadlessQueueProviderId;
  readonly wake?: HeadlessWorkerWakePort;
}): Promise<HeadlessControlPlaneResult<TrustedVerifyPromotionOutcome>> {
  const pendingPrefix = input.alreadyPromoted
    ? "already_promoted_dispatch_pending"
    : "promoted_dispatch_pending";
  const unconfirmedKind = input.alreadyPromoted
    ? "already_promoted_dispatch_unconfirmed"
    : "promoted_dispatch_unconfirmed";
  const successKind = input.alreadyPromoted
    ? "already_promoted_enqueued"
    : "promoted_and_enqueued";

  if (input.signal?.aborted) {
    return outcome({
      jobId: input.jobId,
      objectId: input.objectId,
      attempt: input.attempt,
      deliveryId: input.deliveryId,
      kind: pendingPrefix,
      reasonId: "signal_aborted_after_promotion",
    });
  }

  // Exact already-dispatched replay → zero XADD.
  const existing = await input.dispatchOutbox.getByJobAttemptAndOwner({
    jobId: input.jobId,
    attempt: input.attempt,
    ownerId: input.ownerId,
  });
  if (!existing.ok) {
    return outcome({
      jobId: input.jobId,
      objectId: input.objectId,
      attempt: input.attempt,
      deliveryId: input.deliveryId,
      kind: pendingPrefix,
      reasonId: "dispatch_outbox_unconfirmed",
    });
  }
  if (existing.value?.state === "dispatched") {
    return outcome({
      jobId: input.jobId,
      objectId: input.objectId,
      attempt: input.attempt,
      deliveryId: input.deliveryId,
      kind: successKind,
      reasonId: "already_dispatched",
    });
  }

  const dispatched = await dispatchRenderOutboxIntentOnce({
    outbox: input.dispatchOutbox,
    jobStore: input.jobStore,
    streamQueue: input.streamQueue,
    dispatchId: input.deliveryId,
    ownerId: input.ownerId,
    nowMs: input.nowMs,
    signal: input.signal,
    queueProvider: input.queueProvider,
    wake: input.wake,
  });
  if (!dispatched.ok) {
    return outcome({
      jobId: input.jobId,
      objectId: input.objectId,
      attempt: input.attempt,
      deliveryId: input.deliveryId,
      kind: pendingPrefix,
      reasonId: "dispatch_outbox_failed",
    });
  }

  switch (dispatched.value.kind) {
    case "dispatched":
    case "already_dispatched":
      return outcome({
        jobId: input.jobId,
        objectId: input.objectId,
        attempt: input.attempt,
        deliveryId: input.deliveryId,
        kind: successKind,
        reasonId:
          dispatched.value.kind === "already_dispatched"
            ? "already_dispatched"
            : "dispatched",
      });
    case "dispatch_unconfirmed":
    case "aborted_unconfirmed":
    case "job_reread_failed_unconfirmed":
      return outcome({
        jobId: input.jobId,
        objectId: input.objectId,
        attempt: input.attempt,
        deliveryId: input.deliveryId,
        kind: unconfirmedKind,
        reasonId: dispatched.value.kind,
      });
    case "dispatch_pending":
    case "aborted_released":
    case "job_reread_failed_released":
    case "claim_rejected":
      return outcome({
        jobId: input.jobId,
        objectId: input.objectId,
        attempt: input.attempt,
        deliveryId: input.deliveryId,
        kind: pendingPrefix,
        reasonId: dispatched.value.kind,
      });
    case "rejected":
      return outcome({
        jobId: input.jobId,
        objectId: input.objectId,
        attempt: input.attempt,
        deliveryId: input.deliveryId,
        kind: "promotion_rejected",
        reasonId: "dispatch_intent_rejected",
      });
    default:
      return outcome({
        jobId: input.jobId,
        objectId: input.objectId,
        attempt: input.attempt,
        deliveryId: input.deliveryId,
        kind: unconfirmedKind,
        reasonId: "dispatch_unconfirmed",
      });
  }
}

function outcome(
  partial: TrustedVerifyPromotionOutcome,
): HeadlessControlPlaneResult<TrustedVerifyPromotionOutcome> {
  return cpOk(Object.freeze(partial));
}

function mapVerifyDisposition(
  disposition: HeadlessVerifyFailureDisposition | undefined,
): TrustedVerifyPromotionOutcomeKind {
  switch (disposition) {
    case "retryable":
      return "verification_retryable";
    case "terminal_rejected":
      return "verification_terminal_rejected";
    case "cleanup_pending":
      return "verification_cleanup_pending";
    case "stale":
      return "verification_stale";
    case "aborted":
      return "verification_aborted";
    case "unconfirmed":
    default:
      return "verification_unconfirmed";
  }
}

function readDisposition(
  result: HeadlessControlPlaneResult<unknown>,
): HeadlessVerifyFailureDisposition | undefined {
  if (result.ok) return undefined;
  const extra = result as { disposition?: HeadlessVerifyFailureDisposition };
  return extra.disposition;
}

/**
 * Execute trusted verification under the existing dual-lease claim, then
 * promote/enqueue only when coverage is complete.
 */
export async function executeTrustedVerifyPromotion(
  input: ExecuteTrustedVerifyPromotionInput,
): Promise<HeadlessControlPlaneResult<TrustedVerifyPromotionOutcome>> {
  const objectId = input.claimedObject.record.objectId;
  const base = {
    jobId: input.claimedObject.record.jobId as string | null,
    objectId,
    attempt: null as number | null,
    deliveryId: null as string | null,
  };

  if (input.claimedObject.record.ownerId !== input.ownerId) {
    return outcome({
      ...base,
      kind: "verification_stale",
      reasonId: "owner_mismatch",
    });
  }

  if (input.signal?.aborted) {
    return outcome({
      ...base,
      kind: "aborted",
      reasonId: "signal_aborted_before_verify",
    });
  }

  // 1–2. Stream/finalize under the existing claim (reread confirms before R2).
  const verified = await verifyAndFinalizeR2OwnedObjectUnderClaim({
    objectId,
    ownerId: input.ownerId,
    claimToken: input.claimToken,
    expectedStoreVersion: input.claimedObject.storeVersion,
    nowMs: input.nowMs,
    signal: input.signal,
    store: input.ownedObjectStore,
    io: input.io,
    deleteOnReject: input.deleteOnReject,
  });

  if (!verified.ok) {
    const disposition = readDisposition(verified);
    const kind = mapVerifyDisposition(disposition);
    const code = verified.issues[0]?.code ?? "VERIFY_FAILED";
    return outcome({
      ...base,
      kind,
      reasonId: code,
    });
  }

  const jobId = verified.value.record.jobId;

  if (input.signal?.aborted) {
    // Already finalized — never un-finalize; coverage/promotion may retry.
    return outcome({
      jobId,
      objectId,
      attempt: null,
      deliveryId: null,
      kind: "aborted",
      reasonId: "signal_aborted_after_finalize",
    });
  }

  // 3. Reconcile into the same provisional job.
  const reconcile = await reconcileFinalizedOwnedObjectCoverage({
    jobStore: input.jobStore,
    ownedObjectStore: input.ownedObjectStore,
    objectId,
    ownerId: input.ownerId,
    nowMs: input.nowMs,
  });
  if (!reconcile.ok) {
    const code = reconcile.issues[0]?.code ?? "RECONCILE_FAILED";
    // Finalized object remains; incomplete coverage is recoverable.
    if (code === "JOB_STORE_COHERENCE_REJECTED") {
      // Provisional may have become terminal (cancelled/failed/expired).
      return outcome({
        jobId,
        objectId,
        attempt: null,
        deliveryId: null,
        kind: "promotion_rejected",
        reasonId: code,
      });
    }
    return outcome({
      jobId,
      objectId,
      attempt: null,
      deliveryId: null,
      kind: "verified_waiting_for_coverage",
      reasonId: "coverage_reconcile_unconfirmed",
    });
  }

  if (!reconcile.value.coverageComplete) {
    return outcome({
      jobId,
      objectId,
      attempt: null,
      deliveryId: null,
      kind: "verified_waiting_for_coverage",
      reasonId: reconcile.value.status,
    });
  }

  // 4–6. Reload provisional + materialize canonical pair from finalized objects.
  const materialize = await materializeCanonicalFromFinalizedCoverage({
    jobStore: input.jobStore,
    ownedObjectStore: input.ownedObjectStore,
    io: input.io,
    jobId,
    ownerId: input.ownerId,
    nowMs: input.nowMs,
    signal: input.signal,
  });
  if (!materialize.ok) {
    const code = materialize.issues[0]?.code ?? "MATERIALIZE_FAILED";
    if (code === "OPERATION_ABORTED") {
      return outcome({
        jobId,
        objectId,
        attempt: null,
        deliveryId: null,
        kind: "aborted",
        reasonId: code,
      });
    }
    const terminalized =
      await terminalizeProvisionalMaterializationRejection({
        jobStore: input.jobStore,
        jobId,
        ownerId: input.ownerId,
        nowMs: input.nowMs,
      });
    return outcome({
      jobId,
      objectId,
      attempt: null,
      deliveryId: null,
      kind: "materialization_rejected",
      reasonId:
        terminalized === "failed" || terminalized === "already_terminal"
          ? code
          : "materialization_terminalization_unconfirmed",
    });
  }

  const { provisional, canonicalRequest, canonicalJob } = materialize.value;

  if (input.signal?.aborted) {
    return outcome({
      jobId,
      objectId,
      attempt: null,
      deliveryId: null,
      kind: "aborted",
      reasonId: "signal_aborted_before_promotion",
    });
  }

  // 7. Atomic same-jobId promotion (does not enqueue).
  const promoted = await input.jobStore.promoteProvisionalToCanonical({
    jobId: provisional.jobId,
    ownerId: input.ownerId,
    expectedStoreVersion: provisional.storeVersion,
    expectedOperationId: provisional.operationId,
    canonicalRequest,
    canonicalJob,
  });

  if (!promoted.ok) {
    return outcome({
      jobId,
      objectId,
      attempt: null,
      deliveryId: null,
      kind: "promotion_rejected",
      reasonId: promoted.issues[0]?.code ?? "PROMOTION_FAILED",
    });
  }

  if (promoted.value.kind === "stale") {
    // Concurrent last-object verifier may have won — converge via reread.
    return convergeAfterRace({
      jobStore: input.jobStore,
      streamQueue: input.streamQueue,
      dispatchOutbox: input.dispatchOutbox,
      jobId,
      objectId,
      ownerId: input.ownerId,
      nowMs: input.nowMs,
      signal: input.signal,
      queueProvider: input.queueProvider,
      wake: input.wake,
    });
  }

  if (promoted.value.kind === "rejected") {
    return outcome({
      jobId,
      objectId,
      attempt: null,
      deliveryId: null,
      kind: "promotion_rejected",
      reasonId: "promotion_rejected",
    });
  }

  const canonical =
    promoted.value.kind === "updated" ||
    promoted.value.kind === "already_promoted"
      ? promoted.value.record
      : null;
  if (canonical == null || !isCanonicalStoredJobRecord(canonical)) {
    return outcome({
      jobId,
      objectId,
      attempt: null,
      deliveryId: null,
      kind: "promotion_rejected",
      reasonId: "promotion_unconfirmed",
    });
  }

  const alreadyPromoted = promoted.value.kind === "already_promoted";
  const attempt = canonical.canonicalJob.attempt;
  const deliveryId = stableHeadlessDeliveryId(jobId, attempt);

  return dispatchAfterPromotion({
    alreadyPromoted,
    jobId,
    objectId,
    ownerId: input.ownerId,
    attempt,
    deliveryId,
    nowMs: input.nowMs,
    signal: input.signal,
    jobStore: input.jobStore,
    streamQueue: input.streamQueue,
    dispatchOutbox: input.dispatchOutbox,
    queueProvider: input.queueProvider,
    wake: input.wake,
  });
}

/**
 * Concurrent last-object verifiers: reread and either enqueue the durable
 * queued job or report truthful rejection. Never double-promote.
 */
async function convergeAfterRace(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly streamQueue: Pick<HeadlessStreamQueuePort, "enqueueRender">;
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort;
  readonly jobId: string;
  readonly objectId: string;
  readonly ownerId: string;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
  readonly queueProvider?: HeadlessQueueProviderId;
  readonly wake?: HeadlessWorkerWakePort;
}): Promise<HeadlessControlPlaneResult<TrustedVerifyPromotionOutcome>> {
  const loaded = await input.jobStore.getByJobIdAndOwner(
    input.jobId,
    input.ownerId,
  );
  if (!loaded.ok) {
    return outcome({
      jobId: input.jobId,
      objectId: input.objectId,
      attempt: null,
      deliveryId: null,
      kind: "promotion_rejected",
      reasonId: "promotion_race_unconfirmed",
    });
  }

  if (isProvisionalStoredJobRecord(loaded.value)) {
    if (loaded.value.state !== "materializing") {
      return outcome({
        jobId: input.jobId,
        objectId: input.objectId,
        attempt: null,
        deliveryId: null,
        kind: "promotion_rejected",
        reasonId: "provisional_terminal",
      });
    }
    // Still provisional — other verifier may still be promoting.
    return outcome({
      jobId: input.jobId,
      objectId: input.objectId,
      attempt: null,
      deliveryId: null,
      kind: "verification_stale",
      reasonId: "promotion_race_stale",
    });
  }

  if (!isCanonicalStoredJobRecord(loaded.value)) {
    return outcome({
      jobId: input.jobId,
      objectId: input.objectId,
      attempt: null,
      deliveryId: null,
      kind: "promotion_rejected",
      reasonId: "promotion_race_unconfirmed",
    });
  }

  const attempt = loaded.value.canonicalJob.attempt;
  const deliveryId = stableHeadlessDeliveryId(input.jobId, attempt);

  if (loaded.value.canonicalJob.state !== "queued") {
    return outcome({
      jobId: input.jobId,
      objectId: input.objectId,
      attempt,
      deliveryId,
      kind: "already_promoted_dispatch_pending",
      reasonId: "already_promoted_non_queued",
    });
  }

  return dispatchAfterPromotion({
    alreadyPromoted: true,
    jobId: input.jobId,
    objectId: input.objectId,
    ownerId: input.ownerId,
    attempt,
    deliveryId,
    nowMs: input.nowMs,
    signal: input.signal,
    jobStore: input.jobStore,
    streamQueue: input.streamQueue,
    dispatchOutbox: input.dispatchOutbox,
    queueProvider: input.queueProvider,
    wake: input.wake,
  });
}
